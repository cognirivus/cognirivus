import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { query } from './_generated/server';
import { authComponent } from './auth';
import { applyFeedRanking, paginateByCursor, windowStartFromBucket } from './lib/feedRanking';

const tabValidator = v.union(v.literal('new'), v.literal('top'), v.literal('discussed'));
const windowValidator = v.union(v.literal('24h'), v.literal('7d'), v.literal('30d'));

const getOptionalAuthUser = async (ctx: any) => {
	try {
		return await authComponent.getAuthUser(ctx);
	} catch {
		return null;
	}
};

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
	createdAt: v.number(),
	updatedAt: v.number(),
	userVote: v.union(v.null(), v.literal(1), v.literal(-1))
});

const pagedFeedValidator = v.object({
	page: v.array(feedPostValidator),
	isDone: v.boolean(),
	continueCursor: v.union(v.string(), v.null())
});

const mapFeedPosts = async (ctx: any, posts: Array<any>, viewerAuthId: string | null) => {
	return await Promise.all(
		posts.map(async (post) => {
			const [profile, community, vote] = await Promise.all([
				ctx.db
					.query('users_profile')
					.withIndex('by_authId', (q: any) => q.eq('authId', post.authorAuthId))
					.unique(),
				post.communityId ? ctx.db.get(post.communityId) : null,
				viewerAuthId
					? ctx.db
							.query('post_votes')
							.withIndex('by_postId_and_userAuthId', (q: any) =>
								q.eq('postId', post._id).eq('userAuthId', viewerAuthId)
							)
							.unique()
					: Promise.resolve(null)
			]);

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
				createdAt: post.createdAt,
				updatedAt: post.updatedAt,
				userVote: (vote?.value ?? null) as -1 | 1 | null
			};
		})
	);
};

const getWindowMetrics = async (ctx: any, postId: any, windowStart: number) => {
	const [votes, comments] = await Promise.all([
		ctx.db
			.query('post_votes')
			.withIndex('by_postId_and_createdAt', (q: any) =>
				q.eq('postId', postId).gte('createdAt', windowStart)
			)
			.collect(),
		ctx.db
			.query('post_comments')
			.withIndex('by_postId_and_createdAt', (q: any) =>
				q.eq('postId', postId).gte('createdAt', windowStart)
			)
			.collect()
	]);

	const score = votes.reduce((total: number, vote: any) => total + vote.value, 0);
	return { score, commentCount: comments.length };
};

const isVisibleToViewer = async (ctx: any, post: any, viewerAuthId: string | null) => {
	if (post.visibility === 'private') {
		return viewerAuthId === post.authorAuthId;
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
	if (!viewerAuthId) {
		return false;
	}
	const membership = await ctx.db
		.query('community_memberships')
		.withIndex('by_communityId_and_userAuthId', (q: any) =>
			q.eq('communityId', community._id).eq('userAuthId', viewerAuthId)
		)
		.unique();
	return membership?.status === 'active';
};

const materializeRanked = async (
	ctx: any,
	rawPosts: Array<any>,
	tab: 'new' | 'top' | 'discussed',
	windowStart: number,
	viewerAuthId: string | null,
	cursor: string | null,
	numItems: number
) => {
	const visible: Array<any> = [];
	for (const post of rawPosts) {
		if (await isVisibleToViewer(ctx, post, viewerAuthId)) {
			visible.push(post);
		}
	}

	const rankedCandidates =
		tab === 'new'
			? visible
					.filter((post) => post.createdAt >= windowStart)
					.map((post) => ({ ...post, score: post.score, commentCount: post.commentCount }))
			: await Promise.all(
					visible.map(async (post) => {
						const metrics = await getWindowMetrics(ctx, post._id, windowStart);
						return {
							...post,
							score: tab === 'top' ? metrics.score : post.score,
							commentCount: tab === 'discussed' ? metrics.commentCount : post.commentCount
						};
					})
				);

	const ranked = applyFeedRanking(rankedCandidates, tab);
	const rankedSourceById = new Map(visible.map((post) => [post._id, post]));
	const rankedSourcePosts = ranked
		.map((post) => rankedSourceById.get(post._id))
		.filter((post): post is any => !!post);

	const paged = paginateByCursor(rankedSourcePosts, cursor, numItems);
	const page = await mapFeedPosts(ctx, paged.page, viewerAuthId);

	return {
		page,
		isDone: paged.isDone,
		continueCursor: paged.continueCursor
	};
};

export const listGlobal = query({
	args: {
		tab: tabValidator,
		scope: v.optional(
			v.union(v.literal('all'), v.literal('public'), v.literal('community'), v.literal('you'))
		),
		window: v.optional(windowValidator),
		paginationOpts: paginationOptsValidator
	},
	returns: pagedFeedValidator,
	handler: async (ctx, args) => {
		const authUser = await getOptionalAuthUser(ctx);
		const windowStart = windowStartFromBucket(args.window ?? '24h');
		const batchSize = Math.max(args.paginationOpts.numItems * 8, 200);

		let rawPosts;
		if (args.scope === 'you') {
			if (!authUser) {
				return { page: [], isDone: true, continueCursor: null };
			}
			rawPosts = await ctx.db
				.query('posts')
				.withIndex('by_authorAuthId_and_visibility_and_createdAt', (q) =>
					q.eq('authorAuthId', authUser._id).eq('visibility', 'private')
				)
				.order('desc')
				.take(batchSize);
		} else {
			let query = ctx.db.query('posts').withIndex('by_createdAt').order('desc');

			if (args.scope === 'public') {
				query = query.filter((q) => q.eq(q.field('communityId'), undefined));
			} else if (args.scope === 'community') {
				query = query.filter((q) => q.neq(q.field('communityId'), undefined));
			}

			rawPosts = await query.filter((q) => q.neq(q.field('visibility'), 'private')).take(batchSize);
		}

		return await materializeRanked(
			ctx,
			rawPosts,
			args.tab,
			windowStart,
			authUser?._id ?? null,
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
		paginationOpts: paginationOptsValidator
	},
	returns: pagedFeedValidator,
	handler: async (ctx, args) => {
		const authUser = await getOptionalAuthUser(ctx);
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
			if (!authUser) {
				throw new Error('Private community');
			}
			const membership = await ctx.db
				.query('community_memberships')
				.withIndex('by_communityId_and_userAuthId', (q) =>
					q.eq('communityId', community._id).eq('userAuthId', authUser._id)
				)
				.unique();
			if (!membership || membership.status !== 'active') {
				throw new Error('Private community');
			}
		}

		const windowStart = windowStartFromBucket(args.window ?? '24h');
		const batchSize = Math.max(args.paginationOpts.numItems * 8, 200);
		const rawPosts = await ctx.db
			.query('posts')
			.withIndex('by_communityId_and_createdAt', (q) => q.eq('communityId', community._id))
			.filter((q) => q.neq(q.field('visibility'), 'private'))
			.order('desc')
			.take(batchSize);

		return await materializeRanked(
			ctx,
			rawPosts,
			args.tab,
			windowStart,
			authUser?._id ?? null,
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
		paginationOpts: paginationOptsValidator
	},
	returns: pagedFeedValidator,
	handler: async (ctx, args) => {
		const authUser = await getOptionalAuthUser(ctx);
		const profile = await ctx.db
			.query('users_profile')
			.withIndex('by_username', (q) => q.eq('username', args.username.trim().toLowerCase()))
			.unique();
		if (!profile) {
			return {
				page: [],
				isDone: true,
				continueCursor: null
			};
		}

		const windowStart = windowStartFromBucket(args.window ?? '24h');
		const batchSize = Math.max(args.paginationOpts.numItems * 8, 200);
		const rawPosts = await ctx.db
			.query('posts')
			.withIndex('by_authorAuthId_and_createdAt', (q) => q.eq('authorAuthId', profile.authId))
			.filter((q) => q.neq(q.field('visibility'), 'private'))
			.order('desc')
			.take(batchSize);

		return await materializeRanked(
			ctx,
			rawPosts,
			args.tab,
			windowStart,
			authUser?._id ?? null,
			args.paginationOpts.cursor,
			args.paginationOpts.numItems
		);
	}
});
