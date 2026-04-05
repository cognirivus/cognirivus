import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { query, type QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { api } from './_generated/api';
import { getAuthUser } from './auth';
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
const sourceFilterValidator = v.union(
	v.literal('all'),
	v.literal('posts'),
	v.literal('source_updates'),
	v.literal('website'),
	v.literal('rss'),
	v.literal('youtube')
);
const visibilityFilterValidator = v.union(
	v.literal('all'),
	v.literal('private'),
	v.literal('public'),
	v.literal('community')
);

const MAX_CANDIDATE_LIMIT = 2000;
const MIN_CANDIDATE_LIMIT = 300;
const CANDIDATE_MULTIPLIER = 20;
const TAG_SCAN_LIMIT = 350;
const MAX_FILTER_TAGS = 10;

type GlobalScope = 'all' | 'public' | 'community' | 'you' | 'me';
type FeedSourceFilter = 'all' | 'posts' | 'source_updates' | 'website' | 'rss' | 'youtube';
type FeedVisibilityFilter = 'all' | 'private' | 'public' | 'community';
type SourceType = 'website' | 'rss' | 'youtube';
type ViewerAuthId = string | null;
type SourceDiscoveryReason =
	| 'direct_follow'
	| 'followed_collection'
	| 'community_collection'
	| 'followed_user_collection';

const postFeedItemValidator = v.object({
	kind: v.literal('post'),
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
	sourceId: v.optional(v.id('sources')),
	sourceItemId: v.optional(v.id('source_items')),
	sourceTypeSnapshot: v.optional(v.string()),
	sourceTitleSnapshot: v.optional(v.string()),
	sourceUrlSnapshot: v.optional(v.string()),
	createdAt: v.number(),
	updatedAt: v.number(),
	userVote: v.union(v.null(), v.literal(1), v.literal(-1)),
	canDelete: v.boolean()
});

const sourceCommunityShareValidator = v.object({
	communityId: v.id('communities'),
	postId: v.id('posts')
});

const sourceProvenanceValidator = v.object({
	kind: v.union(
		v.literal('direct_follow'),
		v.literal('followed_collection'),
		v.literal('community_collection'),
		v.literal('followed_user_collection')
	),
	label: v.string(),
	collectionId: v.optional(v.id('source_collections')),
	collectionSlug: v.optional(v.string()),
	collectionTitle: v.optional(v.string()),
	communityId: v.optional(v.id('communities')),
	communitySlug: v.optional(v.string()),
	communityName: v.optional(v.string()),
	userAuthId: v.optional(v.string()),
	username: v.optional(v.string()),
	userName: v.optional(v.string())
});

const sourceFeedItemValidator = v.object({
	kind: v.literal('source_item'),
	_id: v.id('source_items'),
	sourceId: v.id('sources'),
	sourceType: v.union(v.literal('website'), v.literal('rss'), v.literal('youtube')),
	sourceTitle: v.string(),
	title: v.string(),
	snippet: v.string(),
	url: v.string(),
	publishedAt: v.number(),
	createdAt: v.number(),
	updatedAt: v.number(),
	shareCount: v.number(),
	publicPostId: v.optional(v.id('posts')),
	communityShares: v.array(sourceCommunityShareValidator),
	provenance: sourceProvenanceValidator
});

const pagedFeedValidator = v.object({
	page: v.array(v.union(postFeedItemValidator, sourceFeedItemValidator)),
	isDone: v.boolean(),
	continueCursor: v.union(v.string(), v.null())
});

const getOptionalAuthUser = async (ctx: QueryCtx) => {
	try {
		return await getAuthUser(ctx);
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

const isSourceType = (value: string): value is SourceType =>
	value === 'website' || value === 'rss' || value === 'youtube';

const getPostSourceType = (
	post: Pick<Doc<'posts'>, 'sourceType' | 'sourceTypeSnapshot'>
): SourceType | null => {
	const normalized =
		post.sourceTypeSnapshot?.trim().toLowerCase() ??
		post.sourceType
			?.trim()
			.toLowerCase()
			.replace(/^source_/, '');
	return normalized && isSourceType(normalized) ? normalized : null;
};

const matchesPostSourceFilter = (
	post: Pick<Doc<'posts'>, 'sourceType' | 'sourceTypeSnapshot'>,
	source: FeedSourceFilter
) => {
	if (source === 'all' || source === 'posts') {
		return true;
	}
	if (source === 'source_updates') {
		return false;
	}
	return getPostSourceType(post) === source;
};

const matchesSourceItemSourceFilter = (
	item: { sourceType: SourceType },
	source: FeedSourceFilter
) => {
	if (source === 'all' || source === 'source_updates') {
		return true;
	}
	if (source === 'posts') {
		return false;
	}
	return item.sourceType === source;
};

const buildSourceProvenance = (entry: {
	reason: SourceDiscoveryReason;
	collectionId?: Id<'source_collections'>;
	collectionSlug?: string;
	collectionTitle?: string;
	communityId?: Id<'communities'>;
	communitySlug?: string;
	communityName?: string;
	userAuthId?: string;
	username?: string;
	userName?: string;
}) => {
	if (entry.reason === 'direct_follow') {
		return {
			kind: 'direct_follow' as const,
			label: 'From a source you follow'
		};
	}
	if (entry.reason === 'community_collection') {
		return {
			kind: 'community_collection' as const,
			label: entry.communityName
				? `Suggested by community ${entry.communityName}`
				: 'Suggested by a community',
			collectionId: entry.collectionId,
			collectionSlug: entry.collectionSlug,
			collectionTitle: entry.collectionTitle,
			communityId: entry.communityId,
			communitySlug: entry.communitySlug,
			communityName: entry.communityName
		};
	}
	if (entry.reason === 'followed_user_collection') {
		const personLabel = entry.username
			? `u/${entry.username}`
			: (entry.userName ?? 'someone you follow');
		return {
			kind: 'followed_user_collection' as const,
			label: `Curated by ${personLabel}`,
			collectionId: entry.collectionId,
			collectionSlug: entry.collectionSlug,
			collectionTitle: entry.collectionTitle,
			userAuthId: entry.userAuthId,
			username: entry.username,
			userName: entry.userName
		};
	}
	return {
		kind: 'followed_collection' as const,
		label: entry.collectionTitle ? `From collection ${entry.collectionTitle}` : 'From a collection',
		collectionId: entry.collectionId,
		collectionSlug: entry.collectionSlug,
		collectionTitle: entry.collectionTitle
	};
};

const matchesYouSourceVisibilityFilter = (
	item: { provenance: { kind: SourceDiscoveryReason } },
	visibility: FeedVisibilityFilter
) => {
	if (visibility === 'all') {
		return true;
	}
	if (visibility === 'private') {
		return item.provenance.kind === 'direct_follow';
	}
	if (visibility === 'community') {
		return item.provenance.kind === 'community_collection';
	}
	return (
		item.provenance.kind === 'followed_collection' ||
		item.provenance.kind === 'followed_user_collection'
	);
};

const matchesPostVisibilityFilter = (
	post: Pick<Doc<'posts'>, 'visibility' | 'communityId' | 'visibilityScope'>,
	visibility: FeedVisibilityFilter,
	scope: GlobalScope
) => {
	if (visibility === 'all') {
		return true;
	}

	if (scope === 'you') {
		if (visibility === 'private') {
			return (post.visibility ?? 'private') === 'private';
		}
		if (visibility === 'community') {
			return (post.visibility ?? 'private') === 'public' && !!post.communityId;
		}
		return (post.visibility ?? 'private') === 'public' && !post.communityId;
	}

	if (visibility === 'community') {
		return post.visibilityScope === 'public_community';
	}
	if (visibility === 'public') {
		return post.visibilityScope === 'public_global';
	}
	return false;
};

const matchesSelectedSourceId = (
	item: Pick<Doc<'posts'>, 'sourceId'> | Pick<Doc<'source_items'>, 'sourceId'>,
	sourceId: Id<'sources'> | undefined
) => {
	if (!sourceId) {
		return true;
	}
	return item.sourceId === sourceId;
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
			kind: 'post' as const,
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
			sourceId: post.sourceId,
			sourceItemId: post.sourceItemId,
			sourceTypeSnapshot: post.sourceTypeSnapshot,
			sourceTitleSnapshot: post.sourceTitleSnapshot,
			sourceUrlSnapshot: post.sourceUrlSnapshot,
			createdAt: post.createdAt,
			updatedAt: post.updatedAt,
			userVote: (userVote ?? null) as -1 | 1 | null,
			canDelete: viewerAuthId === post.authorAuthId
		};
	});
};

const loadUserSourceFeedItems = async (
	ctx: QueryCtx,
	userAuthId: string,
	limit: number,
	windowStart: number,
	search: string | undefined
) => {
	const deliveredRows = await ctx.db
		.query('user_source_items')
		.withIndex('by_userAuthId_and_publishedAt', (q) => q.eq('userAuthId', userAuthId))
		.order('desc')
		.take(limit);

	const sourceItems = await Promise.all(deliveredRows.map((row) => ctx.db.get(row.sourceItemId)));
	const uniqueSourceIds = [
		...new Set(
			sourceItems.filter((item): item is Doc<'source_items'> => !!item).map((item) => item.sourceId)
		)
	];
	const sourceDocs = await Promise.all(uniqueSourceIds.map((sourceId) => ctx.db.get(sourceId)));
	const sourceById = new Map(
		uniqueSourceIds.map((sourceId, index) => [sourceId, sourceDocs[index]])
	);

	const mapped = sourceItems
		.map((sourceItem) => {
			if (!sourceItem) {
				return null;
			}
			const source = sourceById.get(sourceItem.sourceId);
			if (!source) {
				return null;
			}
			const searchable =
				`${sourceItem.title} ${sourceItem.snippet} ${sourceItem.url}`.toLowerCase();
			if (search && !searchable.includes(search)) {
				return null;
			}
			if (sourceItem.publishedAt < windowStart) {
				return null;
			}
			return {
				kind: 'source_item' as const,
				_id: sourceItem._id,
				sourceId: source._id,
				sourceType: source.type,
				sourceTitle: source.title,
				title: sourceItem.title,
				snippet: sourceItem.snippet,
				url: sourceItem.url,
				publishedAt: sourceItem.publishedAt,
				createdAt: sourceItem.publishedAt,
				updatedAt: sourceItem.updatedAt,
				shareCount: 0,
				publicPostId: undefined,
				communityShares: [],
				provenance: buildSourceProvenance({
					reason: 'direct_follow'
				})
			};
		})
		.filter((item): item is NonNullable<typeof item> => !!item);

	return mapped;
};

const loadTrustedCollectionFeedItems = async (
	ctx: QueryCtx,
	userAuthId: string,
	limit: number,
	windowStart: number,
	search: string | undefined
) => {
	const trustedSources: Array<{
		sourceId: Id<'sources'>;
		sourceItemId?: Id<'source_items'>;
		reason: SourceDiscoveryReason;
		collectionId?: Id<'source_collections'>;
		collectionSlug?: string;
		collectionTitle?: string;
		communityId?: Id<'communities'>;
		communitySlug?: string;
		communityName?: string;
		userAuthId?: string;
		username?: string;
		userName?: string;
		priority: number;
	}> = await ctx.runQuery((api as any).collections.listTrustedSourceIds, {
		userAuthId
	});

	const discoverySources = trustedSources.filter((entry) => entry.reason !== 'direct_follow');
	if (discoverySources.length === 0) {
		return [];
	}

	const uniqueSourceIds = [...new Set(discoverySources.map((entry) => entry.sourceId))];
	const sourceDocs = await Promise.all(uniqueSourceIds.map((sourceId) => ctx.db.get(sourceId)));
	const sourceById = new Map(
		uniqueSourceIds.map((sourceId, index) => [sourceId, sourceDocs[index]])
	);
	type TrustedSourceItemCandidate = {
		kind: 'source_item';
		_id: Id<'source_items'>;
		sourceId: Id<'sources'>;
		sourceType: SourceType;
		sourceTitle: string;
		title: string;
		snippet: string;
		url: string;
		publishedAt: number;
		createdAt: number;
		updatedAt: number;
		shareCount: number;
		publicPostId?: Id<'posts'>;
		communityShares: Array<{
			communityId: Id<'communities'>;
			postId: Id<'posts'>;
		}>;
		provenance: ReturnType<typeof buildSourceProvenance>;
		priority: number;
	};

	const perSourceItems: Array<Array<TrustedSourceItemCandidate>> = await Promise.all(
		discoverySources.map(async (entry) => {
			const source = sourceById.get(entry.sourceId);
			if (!source) {
				return [];
			}
			if (entry.sourceItemId) {
				const sourceItem = await ctx.db.get(entry.sourceItemId);
				if (!sourceItem) {
					return [];
				}
				const searchable =
					`${sourceItem.title} ${sourceItem.snippet} ${sourceItem.url}`.toLowerCase();
				if (search && !searchable.includes(search)) {
					return [];
				}
				if (sourceItem.publishedAt < windowStart) {
					return [];
				}
				return [
					{
						kind: 'source_item' as const,
						_id: sourceItem._id,
						sourceId: source._id,
						sourceType: source.type,
						sourceTitle: source.title,
						title: sourceItem.title,
						snippet: sourceItem.snippet,
						url: sourceItem.url,
						publishedAt: sourceItem.publishedAt,
						createdAt: sourceItem.publishedAt,
						updatedAt: sourceItem.updatedAt,
						shareCount: 0,
						publicPostId: undefined,
						communityShares: [],
						provenance: buildSourceProvenance(entry),
						priority: entry.priority
					}
				];
			}
			const items = await ctx.db
				.query('source_items')
				.withIndex('by_sourceId_and_publishedAt', (q) => q.eq('sourceId', entry.sourceId))
				.order('desc')
				.take(8);
			return items
				.map((sourceItem) => {
					const searchable =
						`${sourceItem.title} ${sourceItem.snippet} ${sourceItem.url}`.toLowerCase();
					if (search && !searchable.includes(search)) {
						return null;
					}
					if (sourceItem.publishedAt < windowStart) {
						return null;
					}
					return {
						kind: 'source_item' as const,
						_id: sourceItem._id,
						sourceId: source._id,
						sourceType: source.type,
						sourceTitle: source.title,
						title: sourceItem.title,
						snippet: sourceItem.snippet,
						url: sourceItem.url,
						publishedAt: sourceItem.publishedAt,
						createdAt: sourceItem.publishedAt,
						updatedAt: sourceItem.updatedAt,
						shareCount: 0,
						publicPostId: undefined,
						communityShares: [],
						provenance: buildSourceProvenance(entry),
						priority: entry.priority
					};
				})
				.filter((item): item is NonNullable<typeof item> => !!item);
		})
	);

	const deduped = new Map<Id<'source_items'>, TrustedSourceItemCandidate>();
	for (const item of perSourceItems.flat()) {
		const existing = deduped.get(item._id);
		if (!existing || item.priority < existing.priority) {
			deduped.set(item._id, item);
		}
	}

	return Array.from(deduped.values())
		.sort((a, b) => {
			if (a.priority !== b.priority) {
				return a.priority - b.priority;
			}
			return b.publishedAt - a.publishedAt;
		})
		.map((item) => {
			const { priority, ...rest } = item;
			void priority;
			return rest;
		})
		.slice(0, limit);
};

const enrichSourceItemsWithShareCount = async (
	ctx: QueryCtx,
	userAuthId: string,
	items: Array<
		| {
				kind: 'post';
				_id: Id<'posts'>;
		  }
		| {
				kind: 'source_item';
				_id: Id<'source_items'>;
				sourceId: Id<'sources'>;
				sourceType: 'website' | 'rss' | 'youtube';
				sourceTitle: string;
				title: string;
				snippet: string;
				url: string;
				publishedAt: number;
				createdAt: number;
				updatedAt: number;
				shareCount: number;
				publicPostId?: Id<'posts'>;
				communityShares: Array<{
					communityId: Id<'communities'>;
					postId: Id<'posts'>;
				}>;
				provenance: ReturnType<typeof buildSourceProvenance>;
		  }
	>
) => {
	const enriched: Array<(typeof items)[number]> = [];
	for (const item of items) {
		if (item.kind !== 'source_item') {
			enriched.push(item);
			continue;
		}
		const shares = await ctx.db
			.query('posts')
			.withIndex('by_authorAuthId_and_sourceItemId_and_createdAt', (q) =>
				q.eq('authorAuthId', userAuthId).eq('sourceItemId', item._id)
			)
			.collect();
		const publicShare = shares.find(
			(share) => (share.visibility ?? 'private') === 'public' && !share.communityId
		);
		const communityShareById = new Map<Id<'communities'>, Id<'posts'>>();
		for (const share of shares) {
			if ((share.visibility ?? 'private') !== 'public' || !share.communityId) {
				continue;
			}
			if (!communityShareById.has(share.communityId)) {
				communityShareById.set(share.communityId, share._id);
			}
		}
		enriched.push({
			...item,
			shareCount: (publicShare ? 1 : 0) + communityShareById.size,
			publicPostId: publicShare?._id,
			communityShares: Array.from(communityShareById.entries()).map(([communityId, postId]) => ({
				communityId,
				postId
			}))
		});
	}
	return enriched;
};

const rankAndPaginate = async (
	ctx: QueryCtx,
	posts: Array<Doc<'posts'>>,
	tab: FeedTab,
	windowStart: number,
	viewerAuthId: ViewerAuthId,
	scope: GlobalScope,
	search: string | undefined,
	tags: Array<string> | undefined,
	source: FeedSourceFilter,
	visibility: FeedVisibilityFilter,
	selectedSourceId: Id<'sources'> | undefined,
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
		if (!matchesPostSourceFilter(post, source)) {
			continue;
		}
		if (!matchesPostVisibilityFilter(post, visibility, scope)) {
			continue;
		}
		if (!matchesSelectedSourceId(post, selectedSourceId)) {
			continue;
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

const listYouFeed = async (
	ctx: QueryCtx,
	viewerAuthId: string,
	tab: FeedTab,
	windowStart: number,
	search: string | undefined,
	tags: Array<string> | undefined,
	source: FeedSourceFilter,
	visibility: FeedVisibilityFilter,
	selectedSourceId: Id<'sources'> | undefined,
	cursor: string | null,
	numItems: number,
	candidateLimit: number
) => {
	const authorPosts = await queryPostsByAuthor(ctx, viewerAuthId, tab, candidateLimit);
	const scopedPosts = authorPosts.filter((post) => {
		if (post.createdAt < windowStart) {
			return false;
		}
		if (search) {
			const matchesSearch =
				post.title.toLowerCase().includes(search) || post.snippet.toLowerCase().includes(search);
			if (!matchesSearch) {
				return false;
			}
		}
		if (tags && tags.length > 0) {
			const postTags = post.tags ?? [];
			if (!tags.some((tag) => postTags.includes(tag))) {
				return false;
			}
		}
		if (!matchesPostSourceFilter(post, source)) {
			return false;
		}
		if (!matchesPostVisibilityFilter(post, visibility, 'you')) {
			return false;
		}
		if (!matchesSelectedSourceId(post, selectedSourceId)) {
			return false;
		}
		return true;
	});
	const mappedPosts = await mapFeedPosts(ctx, scopedPosts, viewerAuthId);
	const directSourceItems =
		tags && tags.length > 0
			? []
			: await loadUserSourceFeedItems(ctx, viewerAuthId, candidateLimit, windowStart, search);
	const trustedCollectionItems =
		tags && tags.length > 0
			? []
			: await loadTrustedCollectionFeedItems(
					ctx,
					viewerAuthId,
					candidateLimit,
					windowStart,
					search
				);
	const dedupedSourceItems = [
		...directSourceItems,
		...trustedCollectionItems.filter(
			(item) => !directSourceItems.some((directItem) => directItem._id === item._id)
		)
	];
	const sourceItems = dedupedSourceItems.filter((item) => {
		if (!matchesSourceItemSourceFilter(item, source)) {
			return false;
		}
		if (!matchesSelectedSourceId(item, selectedSourceId)) {
			return false;
		}
		return matchesYouSourceVisibilityFilter(item, visibility);
	});

	const merged = [...mappedPosts, ...sourceItems].sort((a, b) => b.createdAt - a.createdAt);
	const paged = paginateByCursor(merged, cursor, numItems);
	const enrichedPage = await enrichSourceItemsWithShareCount(ctx, viewerAuthId, paged.page as any);
	return {
		page: enrichedPage as any,
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
		source: v.optional(sourceFilterValidator),
		sourceId: v.optional(v.id('sources')),
		visibility: v.optional(visibilityFilterValidator),
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
		const source = args.source ?? 'all';
		const selectedSourceId = args.sourceId;
		const visibility = args.visibility ?? (scope === 'you' ? 'private' : 'all');
		const candidateLimit = candidateLimitFor(args.paginationOpts.numItems);

		if (scope === 'you') {
			if (!viewerAuthId) {
				return {
					page: [],
					isDone: true,
					continueCursor: null
				};
			}
			return await listYouFeed(
				ctx,
				viewerAuthId,
				args.tab,
				windowStart,
				search,
				tags,
				source,
				visibility,
				selectedSourceId,
				args.paginationOpts.cursor,
				args.paginationOpts.numItems,
				candidateLimit
			);
		}

		const rawCandidates = tags
			? await loadTaggedCandidates(ctx, tags)
			: await loadGlobalCandidates(ctx, scope, args.tab, viewerAuthId, candidateLimit);

		const scopeFilteredCandidates = rawCandidates.filter((post) => {
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
			scope,
			search,
			tags,
			source,
			visibility,
			selectedSourceId,
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
			'community',
			search,
			tags,
			'all',
			'all',
			undefined,
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
			'public',
			search,
			tags,
			'all',
			'all',
			undefined,
			args.paginationOpts.cursor,
			args.paginationOpts.numItems
		);
	}
});
