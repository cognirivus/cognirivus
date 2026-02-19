import { v } from 'convex/values';
import {
	action,
	internalQuery,
	internalMutation,
	mutation,
	query,
	type MutationCtx,
	type QueryCtx
} from './_generated/server';
import { authComponent } from './auth';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { rateLimiter } from './lib/rateLimits';
import { r2 } from './lib/r2';

const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 32_768;
const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 30;
const SNIPPET_LENGTH = 500;
const TAG_ALLOWED_REGEX = /^[a-z0-9\s-]+$/;
type UserReaction = 'like' | 'dislike' | null;

const userReactionValidator = v.union(v.literal('like'), v.literal('dislike'), v.null());

const postListItemValidator = v.object({
	_id: v.id('group_posts'),
	_creationTime: v.number(),
	groupId: v.id('groups'),
	authorId: v.string(),
	title: v.string(),
	snippet: v.string(),
	tags: v.array(v.string()),
	createdAt: v.number(),
	updatedAt: v.number(),
	authorName: v.string(),
	likes: v.number(),
	dislikes: v.number(),
	commentCount: v.number(),
	userReaction: userReactionValidator,
	canDelete: v.boolean()
});

const postDetailValidator = v.object({
	_id: v.id('group_posts'),
	_creationTime: v.number(),
	groupId: v.id('groups'),
	authorId: v.string(),
	title: v.string(),
	snippet: v.string(),
	tags: v.array(v.string()),
	createdAt: v.number(),
	updatedAt: v.number(),
	authorName: v.string(),
	bodyUrl: v.optional(v.string()),
	likes: v.number(),
	dislikes: v.number(),
	commentCount: v.number(),
	userReaction: userReactionValidator,
	canDelete: v.boolean()
});

const reactionCountsValidator = v.object({
	likes: v.number(),
	dislikes: v.number(),
	commentCount: v.number(),
	userReaction: userReactionValidator
});

const postCommentValidator = v.object({
	_id: v.id('group_post_comments'),
	_creationTime: v.number(),
	groupId: v.id('groups'),
	postId: v.id('group_posts'),
	userId: v.string(),
	userName: v.optional(v.string()),
	body: v.string(),
	parentId: v.optional(v.id('group_post_comments')),
	createdAt: v.number(),
	likes: v.number(),
	dislikes: v.number(),
	userReaction: userReactionValidator
});

const tagFilterValidator = v.object({
	tag: v.string(),
	count: v.number()
});

function normalizeTitle(title: string) {
	const normalizedTitle = title.trim();
	if (!normalizedTitle) {
		throw new Error('Title is required');
	}
	if (normalizedTitle.length > MAX_TITLE_LENGTH) {
		throw new Error(`Title must be ${MAX_TITLE_LENGTH} characters or fewer`);
	}
	return normalizedTitle;
}

function normalizeBody(body: string) {
	const normalizedBody = body.trim();
	if (!normalizedBody) {
		throw new Error('Body is required');
	}
	if (normalizedBody.length > MAX_BODY_LENGTH) {
		throw new Error(`Body must be ${MAX_BODY_LENGTH} characters or fewer`);
	}
	return normalizedBody;
}

function normalizeTag(input: string) {
	const trimmedInput = input.trim().toLowerCase();
	if (!trimmedInput) return null;
	if (!TAG_ALLOWED_REGEX.test(trimmedInput)) {
		throw new Error('Tags can only include letters, numbers, spaces, and hyphens');
	}

	const normalizedTag = trimmedInput
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
	if (!normalizedTag) {
		throw new Error('Each tag must include at least one letter or number');
	}
	if (normalizedTag.length > MAX_TAG_LENGTH) {
		throw new Error(`Each tag must be ${MAX_TAG_LENGTH} characters or fewer`);
	}
	return normalizedTag;
}

function normalizeTags(tags: Array<string>) {
	const dedupedTags = new Set<string>();

	for (const tag of tags) {
		const normalizedTag = normalizeTag(tag);
		if (!normalizedTag) continue;
		if (dedupedTags.has(normalizedTag)) continue;
		if (dedupedTags.size >= MAX_TAGS) {
			throw new Error(`You can add up to ${MAX_TAGS} tags`);
		}
		dedupedTags.add(normalizedTag);
	}

	return Array.from(dedupedTags);
}

function createSnippet(body: string) {
	return body.replace(/\s+/g, ' ').trim().slice(0, SNIPPET_LENGTH);
}

async function requireActiveMembership(
	ctx: QueryCtx | MutationCtx,
	userId: string,
	groupId: Id<'groups'>
) {
	const membership = await ctx.db
		.query('group_memberships')
		.withIndex('by_user_group', (q) => q.eq('userId', userId).eq('groupId', groupId))
		.unique();

	if (!membership || membership.status !== 'active') {
		throw new Error('Not a member of this group');
	}

	return membership;
}

async function getCanModerateGroup(
	ctx: QueryCtx | MutationCtx,
	userId: string,
	groupId: Id<'groups'>
) {
	const [membership, group] = await Promise.all([
		requireActiveMembership(ctx, userId, groupId),
		ctx.db.get(groupId)
	]);

	return membership.role === 'admin' || group?.ownerId === userId;
}

async function getReactionSummary(
	ctx: QueryCtx | MutationCtx,
	postId: Id<'group_posts'>,
	userId?: string
) {
	const reactions = await ctx.db
		.query('group_post_reactions')
		.withIndex('by_post', (q) => q.eq('postId', postId))
		.collect();

	const likes = reactions.filter((reaction) => reaction.like_dislike === 1).length;
	const dislikes = reactions.filter((reaction) => reaction.like_dislike === -1).length;
	const userDoc = userId ? reactions.find((reaction) => reaction.userId === userId) : null;
	const userReaction: UserReaction = userDoc
		? userDoc.like_dislike === 1
			? 'like'
			: 'dislike'
		: null;

	return { likes, dislikes, userReaction };
}

async function getCommentCount(ctx: QueryCtx | MutationCtx, postId: Id<'group_posts'>) {
	const comments = await ctx.db
		.query('group_post_comments')
		.withIndex('by_post_created_at', (q) => q.eq('postId', postId))
		.collect();
	return comments.length;
}

async function getAuthorName(ctx: QueryCtx | MutationCtx, authorId: string) {
	const user = await authComponent.getAnyUserById(ctx, authorId);
	return user?.name || 'Unknown';
}

async function deleteCommentWithReactions(ctx: MutationCtx, commentId: Id<'group_post_comments'>) {
	const comment = await ctx.db.get(commentId);
	if (!comment) return;

	const childComments = await ctx.db
		.query('group_post_comments')
		.withIndex('by_parent', (q) => q.eq('parentId', commentId))
		.collect();
	for (const child of childComments) {
		await deleteCommentWithReactions(ctx, child._id);
	}

	const reactions = await ctx.db
		.query('group_post_comment_reactions')
		.withIndex('by_comment', (q) => q.eq('commentId', commentId))
		.collect();
	for (const reaction of reactions) {
		await ctx.db.delete(reaction._id);
	}

	await ctx.db.delete(commentId);
}

async function deletePostWithRelations(
	ctx: MutationCtx,
	post: { _id: Id<'group_posts'>; r2Key: string }
) {
	const [tags, reactions, comments] = await Promise.all([
		ctx.db
			.query('group_post_tags')
			.withIndex('by_post', (q) => q.eq('postId', post._id))
			.collect(),
		ctx.db
			.query('group_post_reactions')
			.withIndex('by_post', (q) => q.eq('postId', post._id))
			.collect(),
		ctx.db
			.query('group_post_comments')
			.withIndex('by_post_created_at', (q) => q.eq('postId', post._id))
			.collect()
	]);

	for (const tag of tags) {
		await ctx.db.delete(tag._id);
	}
	for (const reaction of reactions) {
		await ctx.db.delete(reaction._id);
	}
	for (const comment of comments) {
		await deleteCommentWithReactions(ctx, comment._id);
	}

	await r2.deleteObject(ctx, post.r2Key);
	await ctx.db.delete(post._id);
}

export const insertMetadata = internalMutation({
	args: {
		groupId: v.id('groups'),
		title: v.string(),
		snippet: v.string(),
		r2Key: v.string(),
		tags: v.array(v.string())
	},
	returns: v.id('group_posts'),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		await rateLimiter.limit(ctx, 'groupPostCreate', { key: user._id, throws: true });
		await requireActiveMembership(ctx, user._id, args.groupId);
		const normalizedTags = normalizeTags(args.tags);

		const postId = await ctx.db.insert('group_posts', {
			groupId: args.groupId,
			authorId: user._id,
			title: normalizeTitle(args.title),
			snippet: args.snippet,
			r2Key: args.r2Key,
			tags: normalizedTags,
			createdAt: Date.now(),
			updatedAt: Date.now()
		});

		for (const tag of normalizedTags) {
			await ctx.db.insert('group_post_tags', {
				groupId: args.groupId,
				postId,
				tag
			});
		}

		return postId;
	}
});

export const create = action({
	args: {
		groupId: v.id('groups'),
		title: v.string(),
		body: v.string(),
		tags: v.array(v.string())
	},
	returns: v.id('group_posts'),
	handler: async (ctx, args): Promise<Id<'group_posts'>> => {
		const title = normalizeTitle(args.title);
		const body = normalizeBody(args.body);
		const tags = normalizeTags(args.tags);
		const snippet = createSnippet(body);
		const r2Key = `group-posts/${args.groupId}/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.md`;

		await r2.store(ctx, new Blob([body], { type: 'text/markdown' }), {
			key: r2Key,
			type: 'text/markdown'
		});

		const postId: Id<'group_posts'> = await ctx.runMutation(
			(internal as any).group_posts.insertMetadata,
			{
				groupId: args.groupId,
				title,
				snippet,
				r2Key,
				tags
			}
		);
		return postId;
	}
});

export const getEditTarget = internalQuery({
	args: {
		groupId: v.id('groups'),
		postId: v.id('group_posts')
	},
	returns: v.object({
		r2Key: v.string()
	}),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		const post = await ctx.db.get(args.postId);
		if (!post || post.groupId !== args.groupId) {
			throw new Error('Post not found');
		}

		const canModerate = await getCanModerateGroup(ctx, user._id, args.groupId);
		if (!canModerate && post.authorId !== user._id) {
			throw new Error('Forbidden');
		}

		return { r2Key: post.r2Key };
	}
});

export const updateMetadata = internalMutation({
	args: {
		groupId: v.id('groups'),
		postId: v.id('group_posts'),
		title: v.string(),
		snippet: v.string(),
		tags: v.array(v.string())
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		const post = await ctx.db.get(args.postId);
		if (!post || post.groupId !== args.groupId) {
			throw new Error('Post not found');
		}

		const canModerate = await getCanModerateGroup(ctx, user._id, args.groupId);
		if (!canModerate && post.authorId !== user._id) {
			throw new Error('Forbidden');
		}

		const normalizedTags = normalizeTags(args.tags);

		await ctx.db.patch(args.postId, {
			title: normalizeTitle(args.title),
			snippet: args.snippet,
			tags: normalizedTags,
			updatedAt: Date.now()
		});

		const existingTagLinks = await ctx.db
			.query('group_post_tags')
			.withIndex('by_post', (q) => q.eq('postId', args.postId))
			.collect();
		for (const link of existingTagLinks) {
			await ctx.db.delete(link._id);
		}

		for (const tag of normalizedTags) {
			await ctx.db.insert('group_post_tags', {
				groupId: args.groupId,
				postId: args.postId,
				tag
			});
		}

		return null;
	}
});

export const update = action({
	args: {
		groupId: v.id('groups'),
		postId: v.id('group_posts'),
		title: v.string(),
		body: v.string(),
		tags: v.array(v.string())
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const title = normalizeTitle(args.title);
		const body = normalizeBody(args.body);
		const tags = normalizeTags(args.tags);
		const snippet = createSnippet(body);

		const { r2Key }: { r2Key: string } = await ctx.runQuery(
			(internal as any).group_posts.getEditTarget,
			{
				groupId: args.groupId,
				postId: args.postId
			}
		);

		const { url } = await r2.generateUploadUrl(r2Key);
		const uploadResponse = await fetch(url, {
			method: 'PUT',
			headers: {
				'Content-Type': 'text/markdown'
			},
			body
		});
		if (!uploadResponse.ok) {
			throw new Error('Failed to upload updated post body');
		}
		await r2.syncMetadata(ctx, r2Key);

		await ctx.runMutation((internal as any).group_posts.updateMetadata, {
			groupId: args.groupId,
			postId: args.postId,
			title,
			snippet,
			tags
		});

		return null;
	}
});

export const list = query({
	args: {
		groupId: v.id('groups'),
		search: v.optional(v.string()),
		authorId: v.optional(v.string()),
		tag: v.optional(v.string())
	},
	returns: v.array(postListItemValidator),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return [];

		const membership = await requireActiveMembership(ctx, user._id, args.groupId);
		const group = await ctx.db.get(args.groupId);
		const canModerate = membership.role === 'admin' || group?.ownerId === user._id;

		let posts = await ctx.db
			.query('group_posts')
			.withIndex('by_group_created_at', (q) => q.eq('groupId', args.groupId))
			.order('desc')
			.collect();

		if (args.authorId) {
			posts = posts.filter((post) => post.authorId === args.authorId);
		}

		if (args.tag) {
			const normalizedTag = normalizeTag(args.tag);
			if (normalizedTag) {
				const tagLinks = await ctx.db
					.query('group_post_tags')
					.withIndex('by_group_tag', (q) => q.eq('groupId', args.groupId).eq('tag', normalizedTag))
					.collect();
				const postIds = new Set(tagLinks.map((tagLink) => tagLink.postId));
				posts = posts.filter((post) => postIds.has(post._id));
			}
		}

		if (args.search?.trim()) {
			const normalizedSearch = args.search.trim().toLowerCase();
			posts = posts.filter((post) => {
				const haystack = `${post.title} ${post.snippet} ${post.tags.join(' ')}`.toLowerCase();
				return haystack.includes(normalizedSearch);
			});
		}

		return await Promise.all(
			posts.map(async (post) => {
				const [{ likes, dislikes, userReaction }, commentCount, authorName] = await Promise.all([
					getReactionSummary(ctx, post._id, user._id),
					getCommentCount(ctx, post._id),
					getAuthorName(ctx, post.authorId)
				]);

				return {
					_id: post._id,
					_creationTime: post._creationTime,
					groupId: post.groupId,
					authorId: post.authorId,
					title: post.title,
					snippet: post.snippet,
					tags: post.tags,
					createdAt: post.createdAt,
					updatedAt: post.updatedAt,
					authorName,
					likes,
					dislikes,
					commentCount,
					userReaction,
					canDelete: post.authorId === user._id || canModerate
				};
			})
		);
	}
});

export const listTags = query({
	args: { groupId: v.id('groups') },
	returns: v.array(tagFilterValidator),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return [];

		await requireActiveMembership(ctx, user._id, args.groupId);

		const links = await ctx.db
			.query('group_post_tags')
			.withIndex('by_group_tag', (q) => q.eq('groupId', args.groupId))
			.collect();

		const counts: Record<string, number> = {};
		for (const link of links) {
			counts[link.tag] = (counts[link.tag] ?? 0) + 1;
		}

		return Object.entries(counts)
			.map(([tag, count]) => ({ tag, count }))
			.sort((a, b) => a.tag.localeCompare(b.tag));
	}
});

export const get = query({
	args: {
		groupId: v.id('groups'),
		postId: v.id('group_posts')
	},
	returns: v.union(postDetailValidator, v.null()),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return null;

		const membership = await requireActiveMembership(ctx, user._id, args.groupId);
		const post = await ctx.db.get(args.postId);
		if (!post || post.groupId !== args.groupId) return null;

		const [group, reactionSummary, commentCount, authorName, bodyUrl] = await Promise.all([
			ctx.db.get(args.groupId),
			getReactionSummary(ctx, post._id, user._id),
			getCommentCount(ctx, post._id),
			getAuthorName(ctx, post.authorId),
			r2.getUrl(post.r2Key)
		]);

		const canModerate = membership.role === 'admin' || group?.ownerId === user._id;

		return {
			_id: post._id,
			_creationTime: post._creationTime,
			groupId: post.groupId,
			authorId: post.authorId,
			title: post.title,
			snippet: post.snippet,
			tags: post.tags,
			createdAt: post.createdAt,
			updatedAt: post.updatedAt,
			authorName,
			bodyUrl: bodyUrl ?? undefined,
			likes: reactionSummary.likes,
			dislikes: reactionSummary.dislikes,
			commentCount,
			userReaction: reactionSummary.userReaction,
			canDelete: post.authorId === user._id || canModerate
		};
	}
});

export const remove = mutation({
	args: {
		groupId: v.id('groups'),
		postId: v.id('group_posts')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		const post = await ctx.db.get(args.postId);
		if (!post || post.groupId !== args.groupId) {
			throw new Error('Post not found');
		}

		const canModerate = await getCanModerateGroup(ctx, user._id, args.groupId);
		if (!canModerate && post.authorId !== user._id) {
			throw new Error('Forbidden');
		}

		await deletePostWithRelations(ctx, { _id: post._id, r2Key: post.r2Key });

		return null;
	}
});

export const removeBulk = mutation({
	args: {
		groupId: v.id('groups'),
		postIds: v.array(v.id('group_posts'))
	},
	returns: v.object({ deletedCount: v.number() }),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');
		if (args.postIds.length > 100) {
			throw new Error('You can delete up to 100 posts at a time');
		}

		await requireActiveMembership(ctx, user._id, args.groupId);
		const canModerate = await getCanModerateGroup(ctx, user._id, args.groupId);
		const uniquePostIds = Array.from(new Set(args.postIds));
		let deletedCount = 0;

		for (const postId of uniquePostIds) {
			const post = await ctx.db.get(postId);
			if (!post || post.groupId !== args.groupId) continue;
			if (!canModerate && post.authorId !== user._id) continue;

			await deletePostWithRelations(ctx, { _id: post._id, r2Key: post.r2Key });
			deletedCount++;
		}

		return { deletedCount };
	}
});

export const getReactionCounts = query({
	args: {
		groupId: v.id('groups'),
		postId: v.id('group_posts')
	},
	returns: reactionCountsValidator,
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) {
			return { likes: 0, dislikes: 0, commentCount: 0, userReaction: null };
		}

		await requireActiveMembership(ctx, user._id, args.groupId);
		const post = await ctx.db.get(args.postId);
		if (!post || post.groupId !== args.groupId) {
			return { likes: 0, dislikes: 0, commentCount: 0, userReaction: null };
		}

		const [reactionSummary, commentCount] = await Promise.all([
			getReactionSummary(ctx, args.postId, user._id),
			getCommentCount(ctx, args.postId)
		]);

		return {
			likes: reactionSummary.likes,
			dislikes: reactionSummary.dislikes,
			commentCount,
			userReaction: reactionSummary.userReaction
		};
	}
});

export const toggleLike = mutation({
	args: {
		groupId: v.id('groups'),
		postId: v.id('group_posts')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		await rateLimiter.limit(ctx, 'groupPostReaction', { key: user._id, throws: true });
		await requireActiveMembership(ctx, user._id, args.groupId);

		const post = await ctx.db.get(args.postId);
		if (!post || post.groupId !== args.groupId) {
			throw new Error('Post not found');
		}

		const existing = await ctx.db
			.query('group_post_reactions')
			.withIndex('by_post_user', (q) => q.eq('postId', args.postId).eq('userId', user._id))
			.unique();

		if (existing) {
			await ctx.db.delete(existing._id);
			if (existing.like_dislike === 1) return null;
		}

		await ctx.db.insert('group_post_reactions', {
			groupId: args.groupId,
			postId: args.postId,
			userId: user._id,
			like_dislike: 1
		});
		return null;
	}
});

export const toggleDislike = mutation({
	args: {
		groupId: v.id('groups'),
		postId: v.id('group_posts')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		await rateLimiter.limit(ctx, 'groupPostReaction', { key: user._id, throws: true });
		await requireActiveMembership(ctx, user._id, args.groupId);

		const post = await ctx.db.get(args.postId);
		if (!post || post.groupId !== args.groupId) {
			throw new Error('Post not found');
		}

		const existing = await ctx.db
			.query('group_post_reactions')
			.withIndex('by_post_user', (q) => q.eq('postId', args.postId).eq('userId', user._id))
			.unique();

		if (existing) {
			await ctx.db.delete(existing._id);
			if (existing.like_dislike === -1) return null;
		}

		await ctx.db.insert('group_post_reactions', {
			groupId: args.groupId,
			postId: args.postId,
			userId: user._id,
			like_dislike: -1
		});
		return null;
	}
});

export const addComment = mutation({
	args: {
		groupId: v.id('groups'),
		postId: v.id('group_posts'),
		body: v.string(),
		parentId: v.optional(v.id('group_post_comments'))
	},
	returns: v.id('group_post_comments'),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		await rateLimiter.limit(ctx, 'groupPostComment', { key: user._id, throws: true });
		await requireActiveMembership(ctx, user._id, args.groupId);

		const post = await ctx.db.get(args.postId);
		if (!post || post.groupId !== args.groupId) {
			throw new Error('Post not found');
		}

		const body = args.body.trim();
		if (!body) throw new Error('Comment cannot be empty');

		return await ctx.db.insert('group_post_comments', {
			groupId: args.groupId,
			postId: args.postId,
			userId: user._id,
			userName: user.name,
			body,
			parentId: args.parentId,
			createdAt: Date.now()
		});
	}
});

export const removeComment = mutation({
	args: {
		commentId: v.id('group_post_comments')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		const comment = await ctx.db.get(args.commentId);
		if (!comment) throw new Error('Comment not found');

		const [membership, group] = await Promise.all([
			requireActiveMembership(ctx, user._id, comment.groupId),
			ctx.db.get(comment.groupId)
		]);
		const canModerate = membership.role === 'admin' || group?.ownerId === user._id;

		if (comment.userId !== user._id && !canModerate) {
			throw new Error('Forbidden');
		}

		const childComment = await ctx.db
			.query('group_post_comments')
			.withIndex('by_parent', (q) => q.eq('parentId', args.commentId))
			.first();

		if (childComment) {
			await ctx.db.patch(args.commentId, {
				userName: 'Deleted',
				body: 'This message was deleted by the user'
			});
		} else {
			await deleteCommentWithReactions(ctx, args.commentId);
		}

		return null;
	}
});

export const toggleCommentLike = mutation({
	args: { commentId: v.id('group_post_comments') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		await rateLimiter.limit(ctx, 'groupPostReaction', { key: user._id, throws: true });

		const comment = await ctx.db.get(args.commentId);
		if (!comment) throw new Error('Comment not found');
		await requireActiveMembership(ctx, user._id, comment.groupId);

		const existing = await ctx.db
			.query('group_post_comment_reactions')
			.withIndex('by_comment_user', (q) => q.eq('commentId', args.commentId).eq('userId', user._id))
			.unique();

		if (existing) {
			await ctx.db.delete(existing._id);
			if (existing.like_dislike === 1) return null;
		}

		await ctx.db.insert('group_post_comment_reactions', {
			groupId: comment.groupId,
			postId: comment.postId,
			commentId: args.commentId,
			userId: user._id,
			like_dislike: 1
		});

		return null;
	}
});

export const toggleCommentDislike = mutation({
	args: { commentId: v.id('group_post_comments') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		await rateLimiter.limit(ctx, 'groupPostReaction', { key: user._id, throws: true });

		const comment = await ctx.db.get(args.commentId);
		if (!comment) throw new Error('Comment not found');
		await requireActiveMembership(ctx, user._id, comment.groupId);

		const existing = await ctx.db
			.query('group_post_comment_reactions')
			.withIndex('by_comment_user', (q) => q.eq('commentId', args.commentId).eq('userId', user._id))
			.unique();

		if (existing) {
			await ctx.db.delete(existing._id);
			if (existing.like_dislike === -1) return null;
		}

		await ctx.db.insert('group_post_comment_reactions', {
			groupId: comment.groupId,
			postId: comment.postId,
			commentId: args.commentId,
			userId: user._id,
			like_dislike: -1
		});

		return null;
	}
});

export const getComments = query({
	args: {
		groupId: v.id('groups'),
		postId: v.id('group_posts')
	},
	returns: v.array(postCommentValidator),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return [];

		await requireActiveMembership(ctx, user._id, args.groupId);

		const post = await ctx.db.get(args.postId);
		if (!post || post.groupId !== args.groupId) return [];

		const comments = await ctx.db
			.query('group_post_comments')
			.withIndex('by_post_created_at', (q) => q.eq('postId', args.postId))
			.order('asc')
			.collect();

		return await Promise.all(
			comments.map(async (comment) => {
				const [reactions, userDoc] = await Promise.all([
					ctx.db
						.query('group_post_comment_reactions')
						.withIndex('by_comment', (q) => q.eq('commentId', comment._id))
						.collect(),
					authComponent.getAnyUserById(ctx, comment.userId)
				]);

				const likes = reactions.filter((reaction) => reaction.like_dislike === 1).length;
				const dislikes = reactions.filter((reaction) => reaction.like_dislike === -1).length;
				const mine = reactions.find((reaction) => reaction.userId === user._id);
				const userReaction: UserReaction = mine
					? mine.like_dislike === 1
						? 'like'
						: 'dislike'
					: null;

				return {
					...comment,
					userName: userDoc?.name || comment.userName || 'Anonymous',
					likes,
					dislikes,
					userReaction
				};
			})
		);
	}
});
