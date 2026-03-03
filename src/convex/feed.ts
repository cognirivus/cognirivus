import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { query, type QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { authComponent } from './auth';
import {
	applyFeedRanking,
	paginateByCursor,
	windowStartFromBucket,
	type FeedTab
} from './lib/feedRanking';

const tabValidator = v.union(v.literal('new'), v.literal('top'), v.literal('discussed'));
const windowValidator = v.union(
	v.literal('all'),
	v.literal('24h'),
	v.literal('7d'),
	v.literal('30d')
);

const MAX_CANDIDATE_LIMIT = 2000;
const MIN_CANDIDATE_LIMIT = 300;
const CANDIDATE_MULTIPLIER = 20;
const TAG_SCAN_LIMIT = 350;
const MAX_FILTER_TAGS = 10;

type GlobalScope = 'all' | 'public' | 'community' | 'you' | 'me';
type ViewerAuthId = string | null;

const feedPostValidator = v.object({
	_id: v.id('posts'),
	title: v.string(),
	type: v.union(v.literal('text'), v.literal('link'), v.literal('media')),
	snippet: v.string(),
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
	createdAt: v.number(),
	updatedAt: v.number(),
	userVote: v.union(v.null(), v.literal(1), v.literal(-1)),
	canDelete: v.boolean()
});

const pagedFeedValidator = v.object({
	page: v.array(feedPostValidator),
	isDone: v.boolean(),
	continueCursor: v.union(v.string(), v.null())
});

const getOptionalAuthUser = async (ctx: QueryCtx) => {
	try {
		return await authComponent.getAuthUser(ctx);
	} catch {
		return null;
	}
};

const normalizeSearch = (value?: string) => {
	const normalizedValue = value?.trim().toLowerCase() ?? '';
	return normalizedValue.length > 0 ? normalizedValue : undefined;
};

const normalizeTags = (tags?: Array<string>) => {
	if (!tags || tags.length === 0) {
		return undefined;
	}
	const uniqueTags = [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
	if (uniqueTags.length === 0) {
		return undefined;
	}
	if (uniqueTags.length > MAX_FILTER_TAGS) {
		throw new Error(`At most ${MAX_FILTER_TAGS} tags can be used for feed filtering.`);
	}
	return uniqueTags;
};

const candidateLimitFor = (numItems: number) =>
	Math.min(Math.max(numItems * CANDIDATE_MULTIPLIER, MIN_CANDIDATE_LIMIT), MAX_CANDIDATE_LIMIT);

const dedupePosts = (posts: Array<Doc<'posts'>>) => {
	const seen = new Set<Id<'posts'>>();
	const deduped: Array<Doc<'posts'>> = [];
	for (const post of posts) {
		if (seen.has(post._id)) {
			continue;
		}
		seen.add(post._id);
		deduped.push(post);
	}
	return deduped;
};

const queryPostsByVisibilityScope = async (
	ctx: QueryCtx,
	visibilityScope: 'public_global' | 'public_community',
	tab: FeedTab,
	limit: number
) => {
	if (tab === 'top') {
		return await ctx.db
			.query('posts')
			.withIndex('by_visibilityScope_and_score_and_createdAt', (q) =>
				q.eq('visibilityScope', visibilityScope)
			)
			.order('desc')
			.take(limit);
	}
	if (tab === 'discussed') {
		return await ctx.db
			.query('posts')
			.withIndex('by_visibilityScope_and_commentCount_and_createdAt', (q) =>
				q.eq('visibilityScope', visibilityScope)
			)
			.order('desc')
			.take(limit);
	}
	return await ctx.db
		.query('posts')
		.withIndex('by_visibilityScope_and_createdAt', (q) => q.eq('visibilityScope', visibilityScope))
		.order('desc')
		.take(limit);
};

const queryPostsByCommunity = async (
	ctx: QueryCtx,
	communityId: Id<'communities'>,
	tab: FeedTab,
	limit: number
) => {
	if (tab === 'top') {
		return await ctx.db
			.query('posts')
			.withIndex('by_communityId_and_visibility_and_score_and_createdAt', (q) =>
				q.eq('communityId', communityId).eq('visibility', 'public')
			)
			.order('desc')
			.take(limit);
	}
	if (tab === 'discussed') {
		return await ctx.db
			.query('posts')
			.withIndex('by_communityId_and_visibility_and_commentCount_and_createdAt', (q) =>
				q.eq('communityId', communityId).eq('visibility', 'public')
			)
			.order('desc')
			.take(limit);
	}
	return await ctx.db
		.query('posts')
		.withIndex('by_communityId_and_visibility_and_createdAt', (q) =>
			q.eq('communityId', communityId).eq('visibility', 'public')
		)
		.order('desc')
		.take(limit);
};

const queryPostsByAuthor = async (
	ctx: QueryCtx,
	authorAuthId: string,
	tab: FeedTab,
	limit: number,
	visibility?: 'public' | 'private'
) => {
	if (visibility === undefined) {
		return await ctx.db
			.query('posts')
			.withIndex('by_authorAuthId_and_createdAt', (q) => q.eq('authorAuthId', authorAuthId))
			.order('desc')
			.take(limit);
	}

	if (tab === 'top') {
		return await ctx.db
			.query('posts')
			.withIndex('by_authorAuthId_and_visibility_and_score_and_createdAt', (q) =>
				q.eq('authorAuthId', authorAuthId).eq('visibility', visibility)
			)
			.order('desc')
			.take(limit);
	}
	if (tab === 'discussed') {
		return await ctx.db
			.query('posts')
			.withIndex('by_authorAuthId_and_visibility_and_commentCount_and_createdAt', (q) =>
				q.eq('authorAuthId', authorAuthId).eq('visibility', visibility)
			)
			.order('desc')
			.take(limit);
	}

	return await ctx.db
		.query('posts')
		.withIndex('by_authorAuthId_and_visibility_and_createdAt', (q) =>
			q.eq('authorAuthId', authorAuthId).eq('visibility', visibility)
		)
		.order('desc')
		.take(limit);
};

const loadTaggedCandidates = async (ctx: QueryCtx, tags: Array<string>) => {
	const tagMatches = await Promise.all(
		tags.map((tag) =>
			ctx.db
				.query('post_tags')
				.withIndex('by_tagLower_and_createdAt', (q) => q.eq('tagLower', tag))
				.order('desc')
				.take(TAG_SCAN_LIMIT)
		)
	);

	const postIds = [...new Set(tagMatches.flat().map((match) => match.postId))];
	const posts = await Promise.all(postIds.map((postId) => ctx.db.get(postId)));
	return posts.filter((post): post is Doc<'posts'> => !!post);
};

type VisibilityCache = {
	communityById: Map<Id<'communities'>, Doc<'communities'> | null>;
	membershipByCommunityId: Map<Id<'communities'>, boolean>;
};

const canViewerReadPost = async (
	ctx: QueryCtx,
	post: Doc<'posts'>,
	viewerAuthId: ViewerAuthId,
	cache: VisibilityCache
) => {
	if (viewerAuthId === post.authorAuthId) {
		return true;
	}
	if (post.visibility === 'private') {
		return false;
	}
	if (!post.communityId) {
		return true;
	}

	let community = cache.communityById.get(post.communityId);
	if (community === undefined) {
		community = await ctx.db.get(post.communityId);
		cache.communityById.set(post.communityId, community);
	}
	if (!community) {
		return false;
	}

	if (community.visibility === 'public') {
		return true;
	}
	if (!viewerAuthId) {
		return false;
	}

	let isMember = cache.membershipByCommunityId.get(post.communityId);
	if (isMember === undefined) {
		const membership = await ctx.db
			.query('community_memberships')
			.withIndex('by_communityId_and_userAuthId', (q) =>
				q.eq('communityId', post.communityId!).eq('userAuthId', viewerAuthId)
			)
			.unique();
		isMember = membership?.status === 'active';
		cache.membershipByCommunityId.set(post.communityId, isMember);
	}

	return isMember;
};

const mapFeedPosts = async (
	ctx: QueryCtx,
	posts: Array<Doc<'posts'>>,
	viewerAuthId: ViewerAuthId
) => {
	const authorAuthIds = [...new Set(posts.map((post) => post.authorAuthId))];
	const profiles = await Promise.all(
		authorAuthIds.map((authId) =>
			ctx.db
				.query('users_profile')
				.withIndex('by_authId', (q) => q.eq('authId', authId))
				.unique()
		)
	);
	const profileByAuthId = new Map(authorAuthIds.map((authId, index) => [authId, profiles[index]]));

	const communityIds = [...new Set(posts.map((post) => post.communityId).filter(Boolean))] as Array<
		Id<'communities'>
	>;
	const communities = await Promise.all(communityIds.map((communityId) => ctx.db.get(communityId)));
	const communityById = new Map(
		communityIds.map((communityId, index) => [communityId, communities[index]])
	);

	const userVotes = viewerAuthId
		? await Promise.all(
				posts.map((post) =>
					ctx.db
						.query('post_votes')
						.withIndex('by_postId_and_userAuthId', (q) =>
							q.eq('postId', post._id).eq('userAuthId', viewerAuthId)
						)
						.unique()
				)
			)
		: [];

	return posts.map((post, index) => {
		const profile = profileByAuthId.get(post.authorAuthId);
		const community = post.communityId ? communityById.get(post.communityId) : null;
		const userVote = viewerAuthId ? (userVotes[index]?.value ?? null) : null;

		return {
			_id: post._id,
			title: post.title,
			type: post.type,
			snippet: post.snippet,
			url: post.url,
			authorAuthId: post.authorAuthId,
			authorName: profile?.name ?? 'Unknown',
			authorUsername: profile?.username ?? null,
			communityId: post.communityId,
			communitySlug: community?.slug,
			communityName: community?.name,
			visibility: post.visibility,
			score: post.score,
			likes: post.likes,
			dislikes: post.dislikes,
			commentCount: post.commentCount,
			tags: post.tags,
			sourceType: post.sourceType,
			createdAt: post.createdAt,
			updatedAt: post.updatedAt,
			userVote: (userVote ?? null) as -1 | 1 | null,
			canDelete: viewerAuthId === post.authorAuthId
		};
	});
};

const rankAndPaginate = async (
	ctx: QueryCtx,
	posts: Array<Doc<'posts'>>,
	tab: FeedTab,
	windowStart: number,
	viewerAuthId: ViewerAuthId,
	search: string | undefined,
	tags: Array<string> | undefined,
	cursor: string | null,
	numItems: number
) => {
	const visibilityCache: VisibilityCache = {
		communityById: new Map(),
		membershipByCommunityId: new Map()
	};

	const filtered: Array<Doc<'posts'>> = [];
	for (const post of posts) {
		if (!(await canViewerReadPost(ctx, post, viewerAuthId, visibilityCache))) {
			continue;
		}
		if (post.createdAt < windowStart) {
			continue;
		}
		if (search) {
			const matchesSearch =
				post.title.toLowerCase().includes(search) || post.snippet.toLowerCase().includes(search);
			if (!matchesSearch) {
				continue;
			}
		}
		if (tags && tags.length > 0) {
			const postTags = post.tags ?? [];
			if (!tags.some((tag) => postTags.includes(tag))) {
				continue;
			}
		}
		filtered.push(post);
	}

	const ranked = applyFeedRanking(filtered, tab);
	const paged = paginateByCursor(ranked, cursor, numItems);
	const page = await mapFeedPosts(ctx, paged.page, viewerAuthId);

	return {
		page,
		isDone: paged.isDone,
		continueCursor: paged.continueCursor
	};
};

const loadGlobalCandidates = async (
	ctx: QueryCtx,
	scope: GlobalScope,
	tab: FeedTab,
	viewerAuthId: ViewerAuthId,
	limit: number
) => {
	if (scope === 'you') {
		if (!viewerAuthId) {
			return [];
		}
		return await queryPostsByAuthor(ctx, viewerAuthId, tab, limit, 'private');
	}
	if (scope === 'me') {
		if (!viewerAuthId) {
			return [];
		}
		return await queryPostsByAuthor(ctx, viewerAuthId, tab, limit);
	}
	if (scope === 'public') {
		return await queryPostsByVisibilityScope(ctx, 'public_global', tab, limit);
	}
	if (scope === 'community') {
		return await queryPostsByVisibilityScope(ctx, 'public_community', tab, limit);
	}

	const [globalPosts, communityPosts] = await Promise.all([
		queryPostsByVisibilityScope(ctx, 'public_global', tab, limit),
		queryPostsByVisibilityScope(ctx, 'public_community', tab, limit)
	]);

	return dedupePosts([...globalPosts, ...communityPosts]);
};

export const listGlobal = query({
	args: {
		tab: tabValidator,
		scope: v.optional(
			v.union(
				v.literal('all'),
				v.literal('public'),
				v.literal('community'),
				v.literal('you'),
				v.literal('me')
			)
		),
		window: v.optional(windowValidator),
		search: v.optional(v.string()),
		tags: v.optional(v.array(v.string())),
		paginationOpts: paginationOptsValidator
	},
	returns: pagedFeedValidator,
	handler: async (ctx, args) => {
		const authUser = await getOptionalAuthUser(ctx);
		const viewerAuthId = authUser?._id ?? null;
		const scope = (args.scope ?? (viewerAuthId ? 'all' : 'public')) as GlobalScope;
		const windowStart = scope === 'me' ? 0 : windowStartFromBucket(args.window ?? '24h');
		const search = normalizeSearch(args.search);
		const tags = normalizeTags(args.tags);
		const candidateLimit = candidateLimitFor(args.paginationOpts.numItems);

		const rawCandidates = tags
			? await loadTaggedCandidates(ctx, tags)
			: await loadGlobalCandidates(ctx, scope, args.tab, viewerAuthId, candidateLimit);

		const scopeFilteredCandidates = rawCandidates.filter((post) => {
			if (scope === 'you') {
				return (
					viewerAuthId !== null &&
					post.authorAuthId === viewerAuthId &&
					post.visibility === 'private'
				);
			}
			if (scope === 'me') {
				return viewerAuthId !== null && post.authorAuthId === viewerAuthId;
			}
			if (scope === 'public') {
				return post.visibilityScope === 'public_global';
			}
			if (scope === 'community') {
				return post.visibilityScope === 'public_community';
			}
			return true;
		});

		return await rankAndPaginate(
			ctx,
			scopeFilteredCandidates,
			args.tab,
			windowStart,
			viewerAuthId,
			search,
			tags,
			args.paginationOpts.cursor,
			args.paginationOpts.numItems
		);
	}
});

export const listCommunity = query({
	args: {
		slug: v.string(),
		tab: tabValidator,
		window: v.optional(windowValidator),
		search: v.optional(v.string()),
		tags: v.optional(v.array(v.string())),
		paginationOpts: paginationOptsValidator
	},
	returns: pagedFeedValidator,
	handler: async (ctx, args) => {
		const authUser = await getOptionalAuthUser(ctx);
		const viewerAuthId = authUser?._id ?? null;
		const community = await ctx.db
			.query('communities')
			.withIndex('by_slug', (q) => q.eq('slug', args.slug.trim().toLowerCase()))
			.unique();

		if (!community) {
			return {
				page: [],
				isDone: true,
				continueCursor: null
			};
		}

		if (community.visibility === 'private') {
			if (!viewerAuthId) {
				throw new Error('Private community');
			}
			const membership = await ctx.db
				.query('community_memberships')
				.withIndex('by_communityId_and_userAuthId', (q) =>
					q.eq('communityId', community._id).eq('userAuthId', viewerAuthId)
				)
				.unique();
			if (!membership || membership.status !== 'active') {
				throw new Error('Private community');
			}
		}

		const search = normalizeSearch(args.search);
		const tags = normalizeTags(args.tags);
		const windowStart = windowStartFromBucket(args.window ?? '24h');
		const candidateLimit = candidateLimitFor(args.paginationOpts.numItems);

		const rawCandidates = tags
			? await loadTaggedCandidates(ctx, tags)
			: await queryPostsByCommunity(ctx, community._id, args.tab, candidateLimit);
		const candidates = rawCandidates.filter(
			(post) => post.communityId === community._id && post.visibility === 'public'
		);

		return await rankAndPaginate(
			ctx,
			candidates,
			args.tab,
			windowStart,
			viewerAuthId,
			search,
			tags,
			args.paginationOpts.cursor,
			args.paginationOpts.numItems
		);
	}
});

export const listUser = query({
	args: {
		username: v.string(),
		tab: tabValidator,
		window: v.optional(windowValidator),
		search: v.optional(v.string()),
		tags: v.optional(v.array(v.string())),
		paginationOpts: paginationOptsValidator
	},
	returns: pagedFeedValidator,
	handler: async (ctx, args) => {
		const authUser = await getOptionalAuthUser(ctx);
		const viewerAuthId = authUser?._id ?? null;
		const profile = await ctx.db
			.query('users_profile')
			.withIndex('by_usernameLower', (q) =>
				q.eq('usernameLower', args.username.trim().toLowerCase())
			)
			.unique();

		if (!profile) {
			return {
				page: [],
				isDone: true,
				continueCursor: null
			};
		}

		const search = normalizeSearch(args.search);
		const tags = normalizeTags(args.tags);
		const windowStart = windowStartFromBucket(args.window ?? '24h');
		const candidateLimit = candidateLimitFor(args.paginationOpts.numItems);

		const rawCandidates = tags
			? await loadTaggedCandidates(ctx, tags)
			: await queryPostsByAuthor(ctx, profile.authId, args.tab, candidateLimit, 'public');
		const candidates = rawCandidates.filter(
			(post) => post.authorAuthId === profile.authId && post.visibility === 'public'
		);

		return await rankAndPaginate(
			ctx,
			candidates,
			args.tab,
			windowStart,
			viewerAuthId,
			search,
			tags,
			args.paginationOpts.cursor,
			args.paginationOpts.numItems
		);
	}
});
