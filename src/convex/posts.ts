import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { action, internalAction, internalMutation, mutation, query } from './_generated/server';
import { getAuthUser } from './auth';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { deleteR2MetadataOnly, deleteR2ObjectOnly, r2 } from './lib/r2';
import { rateLimiter } from './lib/rateLimits';
import { trackPostDeleted, trackPostInserted } from './lib/aggregates';
import { requireUserWithUsername } from './lib/usernameGate';

const POST_BODY_INLINE_LIMIT = 1000;
const POST_SNIPPET_LIMIT = 500;
const MAX_TAGS_PER_POST = 10;
const MAX_TAG_LENGTH = 32;

const postTypeValidator = v.union(v.literal('text'), v.literal('link'), v.literal('media'));
const voteValueValidator = v.union(v.literal(1), v.literal(-1));

const userVoteValidator = v.union(v.null(), v.literal(1), v.literal(-1));

const postDetailsValidator = v.object({
	_id: v.id('posts'),
	title: v.string(),
	type: postTypeValidator,
	snippet: v.string(),
	body: v.optional(v.string()),
	bodyUrl: v.optional(v.string()),
	url: v.optional(v.string()),
	authorAuthId: v.string(),
	authorName: v.string(),
	authorUsername: v.union(v.null(), v.string()),
	communityId: v.optional(v.id('communities')),
	communitySlug: v.optional(v.string()),
	communityName: v.optional(v.string()),
	visibility: v.optional(v.union(v.literal('public'), v.literal('private'))),
	score: v.number(),
	likes: v.number(),
	dislikes: v.number(),
	commentCount: v.number(),
	tags: v.optional(v.array(v.string())),
	sourceType: v.optional(v.string()),
	sourceId: v.optional(v.id('sources')),
	sourceItemId: v.optional(v.id('source_items')),
	sourceTypeSnapshot: v.optional(v.string()),
	sourceTitleSnapshot: v.optional(v.string()),
	sourceUrlSnapshot: v.optional(v.string()),
	createdAt: v.number(),
	updatedAt: v.number(),
	userVote: userVoteValidator,
	canDelete: v.boolean()
});

const commentValidator = v.object({
	_id: v.id('post_comments'),
	postId: v.id('posts'),
	parentId: v.optional(v.id('post_comments')),
	authorAuthId: v.string(),
	authorName: v.string(),
	authorUsername: v.union(v.null(), v.string()),
	body: v.string(),
	score: v.number(),
	likes: v.number(),
	dislikes: v.number(),
	createdAt: v.number(),
	updatedAt: v.number(),
	userVote: userVoteValidator
});

const getOptionalAuthUser = async (ctx: any) => {
	try {
		return await getAuthUser(ctx);
	} catch {
		return null;
	}
};

const normalizeTitle = (title: string) => title.trim();
const normalizeBody = (body: string) => body.trim();
const createSnippet = (input: string) => input.trim().slice(0, POST_SNIPPET_LIMIT);
const normalizeTag = (tag: string) => tag.trim().toLowerCase();

const normalizeTags = (tags?: Array<string>) => {
	if (!tags || tags.length === 0) {
		return [];
	}

	const uniqueTags = new Set<string>();
	for (const rawTag of tags) {
		const normalizedTag = normalizeTag(rawTag);
		if (!normalizedTag) {
			continue;
		}
		if (normalizedTag.length > MAX_TAG_LENGTH) {
			throw new Error(`Tag "${normalizedTag.slice(0, 20)}" exceeds ${MAX_TAG_LENGTH} characters.`);
		}
		uniqueTags.add(normalizedTag);
		if (uniqueTags.size > MAX_TAGS_PER_POST) {
			throw new Error(`A post can have at most ${MAX_TAGS_PER_POST} tags.`);
		}
	}

	return [...uniqueTags];
};

const deriveScope = (
	communityId: Id<'communities'> | undefined,
	visibility: 'public' | 'private'
): {
	scopeType: 'global' | 'community';
	visibilityScope: 'public_global' | 'public_community' | 'private';
} => {
	const scopeType = communityId ? ('community' as const) : ('global' as const);
	if (visibility === 'private') {
		return { scopeType, visibilityScope: 'private' };
	}
	return {
		scopeType,
		visibilityScope: communityId ? 'public_community' : 'public_global'
	};
};

const normalizeTagsForBackfill = (tags?: Array<string>) =>
	[
		...new Set(
			(tags ?? []).map((tag) => normalizeTag(tag).slice(0, MAX_TAG_LENGTH)).filter(Boolean)
		)
	].slice(0, MAX_TAGS_PER_POST);

const canAccessPost = async (ctx: any, post: any, authUserId: string | null) => {
	if (authUserId === post.authorAuthId) {
		return true;
	}
	if (post.visibility === 'private') {
		return false;
	}
	if (!post.communityId) {
		return true;
	}
	const community = await ctx.db.get(post.communityId);
	if (!community) {
		return false;
	}
	if (community.visibility === 'public') {
		return true;
	}
	if (!authUserId) {
		return false;
	}
	const membership = await ctx.db
		.query('community_memberships')
		.withIndex('by_communityId_and_userAuthId', (q: any) =>
			q.eq('communityId', community._id).eq('userAuthId', authUserId)
		)
		.unique();
	return membership?.status === 'active';
};

const canAccessCommunityPost = canAccessPost;

const requirePostWriteAccess = async (ctx: any, post: any, authUserId: string) => {
	if (!post.communityId) {
		return;
	}
	const community = await ctx.db.get(post.communityId);
	if (!community) {
		throw new Error('Community not found.');
	}
	if (community.visibility === 'public') {
		return;
	}

	const membership = await ctx.db
		.query('community_memberships')
		.withIndex('by_communityId_and_userAuthId', (q: any) =>
			q.eq('communityId', post.communityId).eq('userAuthId', authUserId)
		)
		.unique();
	if (!membership || membership.status !== 'active') {
		throw new Error('Active community membership required.');
	}
};

const patchPostVoteCounters = async (
	ctx: any,
	post: any,
	from: -1 | 1 | null,
	to: -1 | 1 | null
) => {
	let likes = post.likes;
	let dislikes = post.dislikes;
	let score = post.score;

	if (from === 1) likes -= 1;
	if (from === -1) dislikes -= 1;
	if (to === 1) likes += 1;
	if (to === -1) dislikes += 1;

	score += (to ?? 0) - (from ?? 0);

	await ctx.db.patch(post._id, {
		likes,
		dislikes,
		score,
		updatedAt: Date.now()
	});

	return { likes, dislikes, score };
};

const patchCommentVoteCounters = async (
	ctx: any,
	comment: any,
	from: -1 | 1 | null,
	to: -1 | 1 | null
) => {
	let likes = comment.likes;
	let dislikes = comment.dislikes;
	let score = comment.score;

	if (from === 1) likes -= 1;
	if (from === -1) dislikes -= 1;
	if (to === 1) likes += 1;
	if (to === -1) dislikes += 1;

	score += (to ?? 0) - (from ?? 0);

	await ctx.db.patch(comment._id, {
		likes,
		dislikes,
		score,
		updatedAt: Date.now()
	});

	return { likes, dislikes, score };
};

export const createStored = internalMutation({
	args: {
		authorAuthId: v.string(),
		communityId: v.optional(v.id('communities')),
		visibility: v.optional(v.union(v.literal('public'), v.literal('private'))),
		type: postTypeValidator,
		title: v.string(),
		snippet: v.string(),
		body: v.optional(v.string()),
		r2Key: v.optional(v.string()),
		url: v.optional(v.string()),
		tags: v.optional(v.array(v.string())),
		sourceType: v.optional(v.string()),
		sourceId: v.optional(v.id('sources')),
		sourceItemId: v.optional(v.id('source_items')),
		sourceTypeSnapshot: v.optional(v.string()),
		sourceTitleSnapshot: v.optional(v.string()),
		sourceUrlSnapshot: v.optional(v.string()),
		createdAt: v.optional(v.number())
	},
	returns: v.id('posts'),
	handler: async (ctx, args) => {
		const visibility = args.visibility ?? 'private';
		const tags = normalizeTags(args.tags);
		const { scopeType, visibilityScope } = deriveScope(args.communityId, visibility);

		if (args.communityId) {
			const community = await ctx.db.get(args.communityId);
			if (!community) {
				throw new Error('Community not found.');
			}

			if (community.visibility === 'private') {
				const membership = await ctx.db
					.query('community_memberships')
					.withIndex('by_communityId_and_userAuthId', (q) =>
						q.eq('communityId', args.communityId!).eq('userAuthId', args.authorAuthId)
					)
					.unique();
				if (!membership || membership.status !== 'active') {
					throw new Error('Active community membership required to submit in a private community.');
				}
			}
		}

		const now = Date.now();
		const postId = await ctx.db.insert('posts', {
			authorAuthId: args.authorAuthId,
			communityId: args.communityId,
			scopeType,
			visibility,
			visibilityScope,
			type: args.type,
			title: args.title,
			snippet: args.snippet,
			body: args.body,
			r2Key: args.r2Key,
			url: args.url,
			tags: tags.length > 0 ? tags : undefined,
			sourceType: args.sourceType,
			sourceId: args.sourceId,
			sourceItemId: args.sourceItemId,
			sourceTypeSnapshot: args.sourceTypeSnapshot,
			sourceTitleSnapshot: args.sourceTitleSnapshot,
			sourceUrlSnapshot: args.sourceUrlSnapshot,
			score: 0,
			likes: 0,
			dislikes: 0,
			commentCount: 0,
			createdAt: args.createdAt ?? now,
			updatedAt: now
		});

		for (const tagLower of tags) {
			await ctx.db.insert('post_tags', {
				postId,
				tagLower,
				createdAt: args.createdAt ?? now
			});
		}
		const insertedPost = await ctx.db.get(postId);
		if (insertedPost) {
			await trackPostInserted(ctx, insertedPost);
		}

		return postId;
	}
});

export const create = action({
	args: {
		communityId: v.optional(v.id('communities')),
		visibility: v.optional(v.union(v.literal('public'), v.literal('private'))),
		type: postTypeValidator,
		title: v.string(),
		body: v.optional(v.string()),
		url: v.optional(v.string())
	},
	returns: v.id('posts'),
	handler: async (ctx, args): Promise<Id<'posts'>> => {
		const authUser = await requireUserWithUsername(ctx);

		const title = normalizeTitle(args.title);
		if (title.length < 4 || title.length > 220) {
			throw new Error('Post title must be 4-220 characters.');
		}

		if (args.type === 'link') {
			if (!args.url || !args.url.trim()) {
				throw new Error('Link posts require a URL.');
			}
		} else if (!args.body || !args.body.trim()) {
			throw new Error('Text/media posts require a body.');
		}

		const normalizedBody = args.body ? normalizeBody(args.body) : undefined;
		const snippetSource = normalizedBody || args.url || title;
		const snippet = createSnippet(snippetSource);

		let body = normalizedBody;
		let r2Key: string | undefined;
		if (normalizedBody && normalizedBody.length > POST_BODY_INLINE_LIMIT) {
			r2Key = `posts/${authUser._id}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.txt`;
			await r2.store(ctx, new Blob([normalizedBody], { type: 'text/plain' }), {
				key: r2Key
			});
			body = undefined;
		}

		await rateLimiter.limit(ctx, 'createPost', { key: authUser._id, throws: true });

		return await ctx.runMutation(internal.posts.createStored, {
			authorAuthId: authUser._id,
			communityId: args.communityId,
			visibility: args.visibility ?? 'private',
			type: args.type,
			title,
			snippet,
			body,
			r2Key,
			url: args.url?.trim()
		});
	}
});

export const shareSourceItemAsPost = action({
	args: {
		sourceItemId: v.id('source_items'),
		communityId: v.optional(v.id('communities')),
		visibility: v.optional(v.union(v.literal('public'), v.literal('private')))
	},
	returns: v.id('posts'),
	handler: async (ctx, args): Promise<Id<'posts'>> => {
		const authUser = await requireUserWithUsername(ctx);
		await rateLimiter.limit(ctx, 'createPost', { key: authUser._id, throws: true });

		const sourceItem: {
			sourceItemId: Id<'source_items'>;
			sourceId: Id<'sources'>;
			sourceType: 'website' | 'rss' | 'youtube';
			url: string;
			title: string;
			snippet: string;
		} | null = await ctx.runQuery((internal as any).sources.getSourceItemForSharing, {
			sourceItemId: args.sourceItemId,
			userAuthId: authUser._id
		});

		if (!sourceItem) {
			throw new Error('Source item not found.');
		}

		return await ctx.runMutation((internal as any).posts.createStored, {
			authorAuthId: authUser._id,
			communityId: args.communityId,
			visibility: args.visibility ?? 'private',
			type: 'link',
			title: sourceItem.title,
			snippet: sourceItem.snippet,
			url: sourceItem.url,
			sourceType: `source_${sourceItem.sourceType}`,
			sourceId: sourceItem.sourceId,
			sourceItemId: sourceItem.sourceItemId,
			sourceTypeSnapshot: sourceItem.sourceType,
			sourceTitleSnapshot: sourceItem.title,
			sourceUrlSnapshot: sourceItem.url
		});
	}
});

export const get = query({
	args: {
		postId: v.id('posts')
	},
	returns: v.union(v.null(), postDetailsValidator),
	handler: async (ctx, args) => {
		const post = await ctx.db.get(args.postId);
		if (!post) {
			return null;
		}

		const authUser = await getOptionalAuthUser(ctx);
		const canRead = await canAccessCommunityPost(ctx, post, authUser?._id ?? null);
		if (!canRead) {
			throw new Error('This post belongs to a private community.');
		}

		const [authorProfile, community, userVoteDoc, bodyUrl] = await Promise.all([
			ctx.db
				.query('users_profile')
				.withIndex('by_authId', (q) => q.eq('authId', post.authorAuthId))
				.unique(),
			post.communityId ? ctx.db.get(post.communityId) : null,
			authUser
				? ctx.db
						.query('post_votes')
						.withIndex('by_postId_and_userAuthId', (q) =>
							q.eq('postId', post._id).eq('userAuthId', authUser._id)
						)
						.unique()
				: Promise.resolve(null),
			post.r2Key ? r2.getUrl(post.r2Key) : Promise.resolve(null)
		]);

		let canDelete = false;
		if (authUser) {
			canDelete = authUser._id === post.authorAuthId;
			if (!canDelete && post.communityId) {
				const membership = await ctx.db
					.query('community_memberships')
					.withIndex('by_communityId_and_userAuthId', (q) =>
						q.eq('communityId', post.communityId!).eq('userAuthId', authUser._id)
					)
					.unique();
				canDelete =
					!!membership &&
					membership.status === 'active' &&
					(membership.role === 'owner' || membership.role === 'admin');
			}
		}

		return {
			_id: post._id,
			title: post.title,
			type: post.type,
			snippet: post.snippet,
			body: post.body,
			bodyUrl: bodyUrl ?? undefined,
			url: post.url,
			authorAuthId: post.authorAuthId,
			authorName: authorProfile?.name ?? 'Unknown',
			authorUsername: authorProfile?.username ?? null,
			communityId: post.communityId,
			communitySlug: community?.slug,
			communityName: community?.name,
			visibility: post.visibility ?? 'public',
			score: post.score,
			likes: post.likes,
			dislikes: post.dislikes,
			commentCount: post.commentCount,
			tags: post.tags,
			sourceType: post.sourceType,
			sourceId: post.sourceId,
			sourceItemId: post.sourceItemId,
			sourceTypeSnapshot: post.sourceTypeSnapshot,
			sourceTitleSnapshot: post.sourceTitleSnapshot,
			sourceUrlSnapshot: post.sourceUrlSnapshot,
			createdAt: post.createdAt,
			updatedAt: post.updatedAt,
			userVote: (userVoteDoc?.value ?? null) as -1 | 1 | null,
			canDelete
		};
	}
});

export const listComments = query({
	args: {
		postId: v.id('posts')
	},
	returns: v.array(commentValidator),
	handler: async (ctx, args) => {
		const post = await ctx.db.get(args.postId);
		if (!post) {
			return [];
		}

		const authUser = await getOptionalAuthUser(ctx);
		const canRead = await canAccessCommunityPost(ctx, post, authUser?._id ?? null);
		if (!canRead) {
			throw new Error('This post belongs to a private community.');
		}

		const comments = await ctx.db
			.query('post_comments')
			.withIndex('by_postId_and_createdAt', (q) => q.eq('postId', args.postId))
			.order('asc')
			.collect();

		return await Promise.all(
			comments.map(async (comment) => {
				const [authorProfile, vote] = await Promise.all([
					ctx.db
						.query('users_profile')
						.withIndex('by_authId', (q) => q.eq('authId', comment.authorAuthId))
						.unique(),
					authUser
						? ctx.db
								.query('post_comment_votes')
								.withIndex('by_commentId_and_userAuthId', (q) =>
									q.eq('commentId', comment._id).eq('userAuthId', authUser._id)
								)
								.unique()
						: Promise.resolve(null)
				]);

				return {
					_id: comment._id,
					postId: comment.postId,
					parentId: comment.parentId,
					authorAuthId: comment.authorAuthId,
					authorName: authorProfile?.name ?? 'Unknown',
					authorUsername: authorProfile?.username ?? null,
					body: comment.body,
					score: comment.score,
					likes: comment.likes,
					dislikes: comment.dislikes,
					createdAt: comment.createdAt,
					updatedAt: comment.updatedAt,
					userVote: (vote?.value ?? null) as -1 | 1 | null
				};
			})
		);
	}
});

export const addComment = mutation({
	args: {
		postId: v.id('posts'),
		parentId: v.optional(v.id('post_comments')),
		body: v.string()
	},
	returns: v.id('post_comments'),
	handler: async (ctx, args) => {
		const authUser = await requireUserWithUsername(ctx);
		await rateLimiter.limit(ctx, 'createComment', { key: authUser._id, throws: true });

		const post = await ctx.db.get(args.postId);
		if (!post) {
			throw new Error('Post not found.');
		}

		await requirePostWriteAccess(ctx, post, authUser._id);

		const body = normalizeBody(args.body);
		if (body.length < 1 || body.length > 5000) {
			throw new Error('Comment body must be 1-5000 characters.');
		}

		if (args.parentId) {
			const parent = await ctx.db.get(args.parentId);
			if (!parent || parent.postId !== args.postId) {
				throw new Error('Invalid parent comment.');
			}
		}

		const now = Date.now();
		const commentId = await ctx.db.insert('post_comments', {
			postId: args.postId,
			authorAuthId: authUser._id,
			parentId: args.parentId,
			body,
			score: 0,
			likes: 0,
			dislikes: 0,
			createdAt: now,
			updatedAt: now
		});

		await ctx.db.patch(post._id, {
			commentCount: post.commentCount + 1,
			updatedAt: now
		});

		return commentId;
	}
});

export const vote = mutation({
	args: {
		postId: v.id('posts'),
		value: voteValueValidator
	},
	returns: v.object({
		score: v.number(),
		likes: v.number(),
		dislikes: v.number(),
		userVote: userVoteValidator
	}),
	handler: async (ctx, args) => {
		const authUser = await requireUserWithUsername(ctx);
		await rateLimiter.limit(ctx, 'votePost', { key: authUser._id, throws: true });

		const post = await ctx.db.get(args.postId);
		if (!post) {
			throw new Error('Post not found.');
		}
		await requirePostWriteAccess(ctx, post, authUser._id);

		const existing = await ctx.db
			.query('post_votes')
			.withIndex('by_postId_and_userAuthId', (q) =>
				q.eq('postId', args.postId).eq('userAuthId', authUser._id)
			)
			.unique();

		let nextUserVote: -1 | 1 | null = args.value;
		let from: -1 | 1 | null = null;
		let to: -1 | 1 | null = args.value;

		if (existing) {
			from = existing.value as -1 | 1;
			if (existing.value === args.value) {
				await ctx.db.delete(existing._id);
				nextUserVote = null;
				to = null;
			} else {
				await ctx.db.patch(existing._id, {
					value: args.value,
					createdAt: Date.now()
				});
			}
		} else {
			await ctx.db.insert('post_votes', {
				postId: args.postId,
				userAuthId: authUser._id,
				value: args.value,
				createdAt: Date.now()
			});
		}

		const counters = await patchPostVoteCounters(ctx, post, from, to);
		return {
			score: counters.score,
			likes: counters.likes,
			dislikes: counters.dislikes,
			userVote: nextUserVote
		};
	}
});

export const voteComment = mutation({
	args: {
		commentId: v.id('post_comments'),
		value: voteValueValidator
	},
	returns: v.object({
		score: v.number(),
		likes: v.number(),
		dislikes: v.number(),
		userVote: userVoteValidator
	}),
	handler: async (ctx, args) => {
		const authUser = await requireUserWithUsername(ctx);
		await rateLimiter.limit(ctx, 'voteComment', { key: authUser._id, throws: true });

		const comment = await ctx.db.get(args.commentId);
		if (!comment) {
			throw new Error('Comment not found.');
		}
		const post = await ctx.db.get(comment.postId);
		if (!post) {
			throw new Error('Post not found.');
		}
		await requirePostWriteAccess(ctx, post, authUser._id);

		const existing = await ctx.db
			.query('post_comment_votes')
			.withIndex('by_commentId_and_userAuthId', (q) =>
				q.eq('commentId', args.commentId).eq('userAuthId', authUser._id)
			)
			.unique();

		let nextUserVote: -1 | 1 | null = args.value;
		let from: -1 | 1 | null = null;
		let to: -1 | 1 | null = args.value;

		if (existing) {
			from = existing.value as -1 | 1;
			if (existing.value === args.value) {
				await ctx.db.delete(existing._id);
				nextUserVote = null;
				to = null;
			} else {
				await ctx.db.patch(existing._id, {
					value: args.value,
					createdAt: Date.now()
				});
			}
		} else {
			await ctx.db.insert('post_comment_votes', {
				commentId: args.commentId,
				userAuthId: authUser._id,
				value: args.value,
				createdAt: Date.now()
			});
		}

		const counters = await patchCommentVoteCounters(ctx, comment, from, to);
		return {
			score: counters.score,
			likes: counters.likes,
			dislikes: counters.dislikes,
			userVote: nextUserVote
		};
	}
});

export const setVisibility = mutation({
	args: {
		postId: v.id('posts'),
		visibility: v.union(v.literal('public'), v.literal('private')),
		communityId: v.optional(v.id('communities'))
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const authUser = await requireUserWithUsername(ctx);
		await rateLimiter.limit(ctx, 'createPost', { key: authUser._id, throws: true });

		const post = await ctx.db.get(args.postId);
		if (!post) {
			throw new Error('Post not found.');
		}
		if (post.authorAuthId !== authUser._id) {
			throw new Error('Only the post author can change visibility.');
		}

		if (args.visibility === 'private' && args.communityId) {
			throw new Error('Private posts cannot belong to a community.');
		}

		const nextCommunityId = args.visibility === 'public' ? args.communityId : undefined;
		if (nextCommunityId) {
			const community = await ctx.db.get(nextCommunityId);
			if (!community) {
				throw new Error('Community not found.');
			}
			if (community.visibility === 'private') {
				const membership = await ctx.db
					.query('community_memberships')
					.withIndex('by_communityId_and_userAuthId', (q) =>
						q.eq('communityId', nextCommunityId).eq('userAuthId', authUser._id)
					)
					.unique();
				if (!membership || membership.status !== 'active') {
					throw new Error('Active community membership required.');
				}
			}
		}

		const { scopeType, visibilityScope } = deriveScope(nextCommunityId, args.visibility);
		await ctx.db.patch(post._id, {
			communityId: nextCommunityId,
			visibility: args.visibility,
			scopeType,
			visibilityScope,
			updatedAt: Date.now()
		});

		return null;
	}
});

export const deletePost = mutation({
	args: {
		postId: v.id('posts')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const authUser = await requireUserWithUsername(ctx);
		await rateLimiter.limit(ctx, 'deletePost', { key: authUser._id, throws: true });

		const post = await ctx.db.get(args.postId);
		if (!post) {
			return null;
		}

		let canDelete = authUser._id === post.authorAuthId;
		if (!canDelete && post.communityId) {
			const membership = await ctx.db
				.query('community_memberships')
				.withIndex('by_communityId_and_userAuthId', (q) =>
					q.eq('communityId', post.communityId!).eq('userAuthId', authUser._id)
				)
				.unique();
			canDelete =
				!!membership &&
				membership.status === 'active' &&
				(membership.role === 'owner' || membership.role === 'admin');
		}
		if (!canDelete) {
			throw new Error('Not authorized to delete this post.');
		}

		const votes = await ctx.db
			.query('post_votes')
			.withIndex('by_postId_and_createdAt', (q) => q.eq('postId', args.postId))
			.collect();
		for (const voteDoc of votes) {
			await ctx.db.delete(voteDoc._id);
		}

		const comments = await ctx.db
			.query('post_comments')
			.withIndex('by_postId_and_createdAt', (q) => q.eq('postId', args.postId))
			.collect();
		for (const comment of comments) {
			const commentVotes = await ctx.db
				.query('post_comment_votes')
				.withIndex('by_commentId_and_createdAt', (q) => q.eq('commentId', comment._id))
				.collect();
			for (const commentVote of commentVotes) {
				await ctx.db.delete(commentVote._id);
			}
			await ctx.db.delete(comment._id);
		}

		const postTags = await ctx.db
			.query('post_tags')
			.withIndex('by_postId', (q) => q.eq('postId', args.postId))
			.collect();
		for (const postTag of postTags) {
			await ctx.db.delete(postTag._id);
		}

		await trackPostDeleted(ctx, post);
		await ctx.db.delete(post._id);
		if (post.r2Key) {
			await ctx.scheduler.runAfter(0, internal.posts.deleteStoredBody, {
				r2Key: post.r2Key
			});
		}

		return null;
	}
});

export { deletePost as delete };

export const deleteStoredBody = internalAction({
	args: {
		r2Key: v.string()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		try {
			await deleteR2ObjectOnly(ctx, args.r2Key);
			await deleteR2MetadataOnly(ctx, args.r2Key);
		} catch (error) {
			console.error('Failed to delete R2 object', args.r2Key, error);
		}
		return null;
	}
});

export const backfillDerivedPostFields = internalMutation({
	args: {
		paginationOpts: paginationOptsValidator
	},
	returns: v.object({
		processedPosts: v.number(),
		isDone: v.boolean(),
		continueCursor: v.union(v.string(), v.null())
	}),
	handler: async (ctx, args) => {
		const result = await ctx.db.query('posts').paginate(args.paginationOpts);
		let processedPosts = 0;

		for (const post of result.page) {
			const visibility = (post.visibility ?? 'private') as 'public' | 'private';
			const normalizedTags = normalizeTagsForBackfill(post.tags);
			const { scopeType, visibilityScope } = deriveScope(post.communityId, visibility);

			const shouldPatchPost =
				post.visibility !== visibility ||
				post.scopeType !== scopeType ||
				post.visibilityScope !== visibilityScope ||
				JSON.stringify(post.tags ?? []) !== JSON.stringify(normalizedTags);

			if (shouldPatchPost) {
				await ctx.db.patch(post._id, {
					visibility,
					scopeType,
					visibilityScope,
					tags: normalizedTags.length > 0 ? normalizedTags : undefined,
					updatedAt: Date.now()
				});
			}

			const existingPostTags = await ctx.db
				.query('post_tags')
				.withIndex('by_postId', (q) => q.eq('postId', post._id))
				.collect();
			const existingTagSet = new Set(existingPostTags.map((row) => row.tagLower));
			const normalizedTagSet = new Set(normalizedTags);

			for (const existingRow of existingPostTags) {
				if (!normalizedTagSet.has(existingRow.tagLower)) {
					await ctx.db.delete(existingRow._id);
				}
			}
			for (const tagLower of normalizedTags) {
				if (!existingTagSet.has(tagLower)) {
					await ctx.db.insert('post_tags', {
						postId: post._id,
						tagLower,
						createdAt: post.createdAt
					});
				}
			}

			processedPosts += 1;
		}

		return {
			processedPosts,
			isDone: result.isDone,
			continueCursor: result.continueCursor
		};
	}
});
