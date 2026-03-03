import { v } from 'convex/values';
import { action, internalMutation, query } from './_generated/server';
import { internal } from './_generated/api';
import { authComponent } from './auth';
import { r2 } from './lib/r2';
import type { Id } from './_generated/dataModel';

const ADMIN_ROLE_VALUES = new Set(['admin', 'system-admin', 'superadmin', 'owner']);

const isAdminRole = (role: unknown): boolean => {
	if (typeof role === 'string') {
		return ADMIN_ROLE_VALUES.has(role.toLowerCase());
	}
	if (Array.isArray(role)) {
		return role.some((entry) => isAdminRole(entry));
	}
	if (role && typeof role === 'object') {
		const roleObject = role as { role?: unknown; name?: unknown };
		const maybeRole = roleObject.role ?? roleObject.name;
		return isAdminRole(maybeRole);
	}
	return false;
};

const requireAdmin = async (ctx: any) => {
	const authUser = await authComponent.getAuthUser(ctx);
	if (!authUser || !isAdminRole(authUser.role)) {
		throw new Error('Admin access required.');
	}
	return authUser;
};

const sourceTypeValidator = v.union(
	v.literal('website'),
	v.literal('rss'),
	v.literal('youtube'),
	v.literal('bookmarks')
);

const sourceStatusValidator = v.union(v.literal('active'), v.literal('paused'), v.literal('error'));

const dashboardSourceValidator = v.object({
	_id: v.id('sources'),
	title: v.string(),
	type: sourceTypeValidator,
	status: sourceStatusValidator,
	canonicalUrl: v.string(),
	updatedAt: v.number(),
	itemCount: v.number()
});

const dashboardSourceItemValidator = v.object({
	_id: v.id('source_items'),
	sourceId: v.id('sources'),
	sourceTitle: v.string(),
	title: v.string(),
	url: v.string(),
	publishedAt: v.number(),
	hasR2Body: v.boolean()
});

const dashboardPostValidator = v.object({
	_id: v.id('posts'),
	title: v.string(),
	authorAuthId: v.string(),
	visibility: v.union(v.literal('public'), v.literal('private')),
	createdAt: v.number(),
	hasR2Body: v.boolean(),
	url: v.optional(v.string())
});

const dashboardNightlyRunValidator = v.union(
	v.null(),
	v.object({
		_id: v.id('source_nightly_runs'),
		runDate: v.string(),
		status: v.union(v.literal('running'), v.literal('done'), v.literal('failed')),
		startedAt: v.number(),
		finishedAt: v.optional(v.number()),
		processedSources: v.number(),
		queuedJobs: v.number(),
		error: v.optional(v.string())
	})
);

const deleteSourceDbResultValidator = v.object({
	deleted: v.boolean(),
	sourceId: v.id('sources'),
	sourceItemCount: v.number(),
	deliveryCount: v.number(),
	subscriptionCount: v.number(),
	jobCount: v.number(),
	unlinkedPostCount: v.number(),
	r2Keys: v.array(v.string())
});

const deleteSourceItemDbResultValidator = v.object({
	deleted: v.boolean(),
	sourceItemId: v.id('source_items'),
	deliveryCount: v.number(),
	unlinkedPostCount: v.number(),
	r2Key: v.optional(v.string())
});

const deletePostDbResultValidator = v.object({
	deleted: v.boolean(),
	postId: v.id('posts'),
	commentCount: v.number(),
	commentVoteCount: v.number(),
	voteCount: v.number(),
	postTagCount: v.number(),
	embeddingCount: v.number(),
	summaryCount: v.number(),
	r2Key: v.optional(v.string())
});

const sourceStatuses: Array<'active' | 'paused' | 'error'> = ['active', 'paused', 'error'];

type DeleteSourceCascadeResult = {
	deleted: boolean;
	sourceId: Id<'sources'>;
	sourceItemCount: number;
	deliveryCount: number;
	subscriptionCount: number;
	jobCount: number;
	unlinkedPostCount: number;
	r2Keys: Array<string>;
};

type DeleteSourceItemCascadeResult = {
	deleted: boolean;
	sourceItemId: Id<'source_items'>;
	deliveryCount: number;
	unlinkedPostCount: number;
	r2Key?: string;
};

type DeletePostCascadeResult = {
	deleted: boolean;
	postId: Id<'posts'>;
	commentCount: number;
	commentVoteCount: number;
	voteCount: number;
	postTagCount: number;
	embeddingCount: number;
	summaryCount: number;
	r2Key?: string;
};

type DeleteSourcePermanentlyResult = {
	deleted: boolean;
	sourceId: Id<'sources'>;
	sourceItemCount: number;
	deliveryCount: number;
	subscriptionCount: number;
	jobCount: number;
	unlinkedPostCount: number;
	r2DeletedCount: number;
};

type DeleteSourceItemPermanentlyResult = {
	deleted: boolean;
	sourceItemId: Id<'source_items'>;
	deliveryCount: number;
	unlinkedPostCount: number;
	r2Deleted: boolean;
};

type DeletePostPermanentlyResult = {
	deleted: boolean;
	postId: Id<'posts'>;
	commentCount: number;
	commentVoteCount: number;
	voteCount: number;
	postTagCount: number;
	embeddingCount: number;
	summaryCount: number;
	r2Deleted: boolean;
};

export const listDashboard = query({
	args: {},
	returns: v.object({
		sources: v.array(dashboardSourceValidator),
		sourceItems: v.array(dashboardSourceItemValidator),
		posts: v.array(dashboardPostValidator),
		nightlyRun: dashboardNightlyRunValidator
	}),
	handler: async (ctx) => {
		await requireAdmin(ctx);

		const sourceBuckets = await Promise.all(
			sourceStatuses.map((status) =>
				ctx.db
					.query('sources')
					.withIndex('by_status_and_updatedAt', (q) => q.eq('status', status))
					.order('desc')
					.take(40)
			)
		);
		const recentSources = sourceBuckets
			.flat()
			.sort((a, b) => b.updatedAt - a.updatedAt)
			.slice(0, 50);

		const sources = await Promise.all(
			recentSources.map(async (source) => {
				const itemCount = (
					await ctx.db
						.query('source_items')
						.withIndex('by_sourceId_and_publishedAt', (q) => q.eq('sourceId', source._id))
						.collect()
				).length;
				return {
					_id: source._id,
					title: source.title,
					type: source.type,
					status: source.status,
					canonicalUrl: source.canonicalUrl,
					updatedAt: source.updatedAt,
					itemCount
				};
			})
		);

		const recentSourceItems = await ctx.db
			.query('source_items')
			.withIndex('by_publishedAt')
			.order('desc')
			.take(50);
		const sourceTitles = new Map<Id<'sources'>, string>();
		for (const sourceItem of recentSourceItems) {
			if (!sourceTitles.has(sourceItem.sourceId)) {
				const source = await ctx.db.get(sourceItem.sourceId);
				sourceTitles.set(sourceItem.sourceId, source?.title ?? 'Deleted source');
			}
		}
		const sourceItems = recentSourceItems.map((sourceItem) => ({
			_id: sourceItem._id,
			sourceId: sourceItem.sourceId,
			sourceTitle: sourceTitles.get(sourceItem.sourceId) ?? 'Deleted source',
			title: sourceItem.title,
			url: sourceItem.url,
			publishedAt: sourceItem.publishedAt,
			hasR2Body: !!sourceItem.r2Key
		}));

		const recentPosts = await ctx.db
			.query('posts')
			.withIndex('by_createdAt')
			.order('desc')
			.take(50);
		const posts = recentPosts.map((post) => ({
			_id: post._id,
			title: post.title,
			authorAuthId: post.authorAuthId,
			visibility: post.visibility ?? 'private',
			createdAt: post.createdAt,
			hasR2Body: !!post.r2Key,
			url: post.url
		}));

		const latestNightlyRuns = await ctx.db
			.query('source_nightly_runs')
			.withIndex('by_startedAt')
			.order('desc')
			.take(1);
		const nightlyRun =
			latestNightlyRuns[0] == null
				? null
				: {
						_id: latestNightlyRuns[0]._id,
						runDate: latestNightlyRuns[0].runDate,
						status: latestNightlyRuns[0].status,
						startedAt: latestNightlyRuns[0].startedAt,
						finishedAt: latestNightlyRuns[0].finishedAt,
						processedSources: latestNightlyRuns[0].processedSources,
						queuedJobs: latestNightlyRuns[0].queuedJobs,
						error: latestNightlyRuns[0].error
					};

		return { sources, sourceItems, posts, nightlyRun };
	}
});

export const deleteSourceCascadeFromDb = internalMutation({
	args: {
		sourceId: v.id('sources')
	},
	returns: deleteSourceDbResultValidator,
	handler: async (ctx, args) => {
		const source = await ctx.db.get(args.sourceId);
		if (!source) {
			return {
				deleted: false,
				sourceId: args.sourceId,
				sourceItemCount: 0,
				deliveryCount: 0,
				subscriptionCount: 0,
				jobCount: 0,
				unlinkedPostCount: 0,
				r2Keys: []
			};
		}

		const sourceItems = await ctx.db
			.query('source_items')
			.withIndex('by_sourceId_and_publishedAt', (q) => q.eq('sourceId', args.sourceId))
			.collect();
		const r2Keys = sourceItems.map((item) => item.r2Key).filter((key): key is string => !!key);

		let unlinkedPostCount = 0;
		for (const sourceItem of sourceItems) {
			const linkedPosts = await ctx.db
				.query('posts')
				.withIndex('by_sourceItemId_and_createdAt', (q) => q.eq('sourceItemId', sourceItem._id))
				.collect();
			for (const post of linkedPosts) {
				await ctx.db.patch(post._id, {
					sourceId: undefined,
					sourceItemId: undefined,
					updatedAt: Date.now()
				});
				unlinkedPostCount += 1;
			}
		}

		const deliveries = await ctx.db
			.query('user_source_items')
			.withIndex('by_sourceId_and_publishedAt', (q) => q.eq('sourceId', args.sourceId))
			.collect();
		for (const delivery of deliveries) {
			await ctx.db.delete(delivery._id);
		}

		const activeSubscriptions = await ctx.db
			.query('source_subscriptions')
			.withIndex('by_sourceId_and_status', (q) =>
				q.eq('sourceId', args.sourceId).eq('status', 'active')
			)
			.collect();
		const pausedSubscriptions = await ctx.db
			.query('source_subscriptions')
			.withIndex('by_sourceId_and_status', (q) =>
				q.eq('sourceId', args.sourceId).eq('status', 'paused')
			)
			.collect();
		const allSubscriptions = [...activeSubscriptions, ...pausedSubscriptions];
		for (const subscription of allSubscriptions) {
			await ctx.db.delete(subscription._id);
		}

		const sourceJobs = await ctx.db
			.query('source_jobs')
			.withIndex('by_sourceId_and_createdAt', (q) => q.eq('sourceId', args.sourceId))
			.collect();
		for (const sourceJob of sourceJobs) {
			await ctx.db.delete(sourceJob._id);
		}

		for (const sourceItem of sourceItems) {
			await ctx.db.delete(sourceItem._id);
		}
		await ctx.db.delete(args.sourceId);

		return {
			deleted: true,
			sourceId: args.sourceId,
			sourceItemCount: sourceItems.length,
			deliveryCount: deliveries.length,
			subscriptionCount: allSubscriptions.length,
			jobCount: sourceJobs.length,
			unlinkedPostCount,
			r2Keys
		};
	}
});

export const deleteSourceItemCascadeFromDb = internalMutation({
	args: {
		sourceItemId: v.id('source_items')
	},
	returns: deleteSourceItemDbResultValidator,
	handler: async (ctx, args) => {
		const sourceItem = await ctx.db.get(args.sourceItemId);
		if (!sourceItem) {
			return {
				deleted: false,
				sourceItemId: args.sourceItemId,
				deliveryCount: 0,
				unlinkedPostCount: 0
			};
		}

		const linkedPosts = await ctx.db
			.query('posts')
			.withIndex('by_sourceItemId_and_createdAt', (q) => q.eq('sourceItemId', args.sourceItemId))
			.collect();
		for (const post of linkedPosts) {
			await ctx.db.patch(post._id, {
				sourceId: undefined,
				sourceItemId: undefined,
				updatedAt: Date.now()
			});
		}

		const deliveries = await ctx.db
			.query('user_source_items')
			.withIndex('by_sourceItemId', (q) => q.eq('sourceItemId', args.sourceItemId))
			.collect();
		for (const delivery of deliveries) {
			await ctx.db.delete(delivery._id);
		}

		await ctx.db.delete(args.sourceItemId);

		const source = await ctx.db.get(sourceItem.sourceId);
		if (source) {
			await ctx.db.patch(source._id, { updatedAt: Date.now() });
		}

		return {
			deleted: true,
			sourceItemId: args.sourceItemId,
			deliveryCount: deliveries.length,
			unlinkedPostCount: linkedPosts.length,
			r2Key: sourceItem.r2Key
		};
	}
});

export const deletePostCascadeFromDb = internalMutation({
	args: {
		postId: v.id('posts')
	},
	returns: deletePostDbResultValidator,
	handler: async (ctx, args) => {
		const post = await ctx.db.get(args.postId);
		if (!post) {
			return {
				deleted: false,
				postId: args.postId,
				commentCount: 0,
				commentVoteCount: 0,
				voteCount: 0,
				postTagCount: 0,
				embeddingCount: 0,
				summaryCount: 0
			};
		}

		const votes = await ctx.db
			.query('post_votes')
			.withIndex('by_postId_and_createdAt', (q) => q.eq('postId', args.postId))
			.collect();
		for (const vote of votes) {
			await ctx.db.delete(vote._id);
		}

		const comments = await ctx.db
			.query('post_comments')
			.withIndex('by_postId_and_createdAt', (q) => q.eq('postId', args.postId))
			.collect();
		let commentVoteCount = 0;
		for (const comment of comments) {
			const commentVotes = await ctx.db
				.query('post_comment_votes')
				.withIndex('by_commentId_and_createdAt', (q) => q.eq('commentId', comment._id))
				.collect();
			for (const commentVote of commentVotes) {
				await ctx.db.delete(commentVote._id);
			}
			commentVoteCount += commentVotes.length;
			await ctx.db.delete(comment._id);
		}

		const postTags = await ctx.db
			.query('post_tags')
			.withIndex('by_postId', (q) => q.eq('postId', args.postId))
			.collect();
		for (const postTag of postTags) {
			await ctx.db.delete(postTag._id);
		}

		const embeddings = await ctx.db
			.query('post_embeddings')
			.withIndex('by_postId', (q) => q.eq('postId', args.postId))
			.collect();
		for (const embedding of embeddings) {
			await ctx.db.delete(embedding._id);
		}

		const summaries = await ctx.db
			.query('ai_summary_cache')
			.withIndex('by_entityType_and_entityId', (q) =>
				q.eq('entityType', 'post').eq('entityId', args.postId)
			)
			.collect();
		for (const summary of summaries) {
			await ctx.db.delete(summary._id);
		}

		await ctx.db.delete(args.postId);

		return {
			deleted: true,
			postId: args.postId,
			commentCount: comments.length,
			commentVoteCount,
			voteCount: votes.length,
			postTagCount: postTags.length,
			embeddingCount: embeddings.length,
			summaryCount: summaries.length,
			r2Key: post.r2Key
		};
	}
});

const deleteR2Keys = async (ctx: any, r2Keys: Array<string>) => {
	let deletedCount = 0;
	for (const r2Key of r2Keys) {
		try {
			await r2.deleteObject(ctx, r2Key);
			deletedCount += 1;
		} catch (error) {
			console.error('Admin cleanup failed to delete R2 object', r2Key, error);
		}
	}
	return deletedCount;
};

export const deleteSourcePermanently = action({
	args: {
		sourceId: v.id('sources')
	},
	returns: v.object({
		deleted: v.boolean(),
		sourceId: v.id('sources'),
		sourceItemCount: v.number(),
		deliveryCount: v.number(),
		subscriptionCount: v.number(),
		jobCount: v.number(),
		unlinkedPostCount: v.number(),
		r2DeletedCount: v.number()
	}),
	handler: async (ctx, args): Promise<DeleteSourcePermanentlyResult> => {
		await requireAdmin(ctx);
		const result: DeleteSourceCascadeResult = await ctx.runMutation(
			(internal as any).admin.deleteSourceCascadeFromDb,
			{
				sourceId: args.sourceId
			}
		);
		const r2DeletedCount = await deleteR2Keys(ctx, result.r2Keys);
		return {
			deleted: result.deleted,
			sourceId: result.sourceId,
			sourceItemCount: result.sourceItemCount,
			deliveryCount: result.deliveryCount,
			subscriptionCount: result.subscriptionCount,
			jobCount: result.jobCount,
			unlinkedPostCount: result.unlinkedPostCount,
			r2DeletedCount
		};
	}
});

export const deleteSourceItemPermanently = action({
	args: {
		sourceItemId: v.id('source_items')
	},
	returns: v.object({
		deleted: v.boolean(),
		sourceItemId: v.id('source_items'),
		deliveryCount: v.number(),
		unlinkedPostCount: v.number(),
		r2Deleted: v.boolean()
	}),
	handler: async (ctx, args): Promise<DeleteSourceItemPermanentlyResult> => {
		await requireAdmin(ctx);
		const result: DeleteSourceItemCascadeResult = await ctx.runMutation(
			(internal as any).admin.deleteSourceItemCascadeFromDb,
			{
				sourceItemId: args.sourceItemId
			}
		);
		const r2Deleted = result.r2Key ? (await deleteR2Keys(ctx, [result.r2Key])) > 0 : false;
		return {
			deleted: result.deleted,
			sourceItemId: result.sourceItemId,
			deliveryCount: result.deliveryCount,
			unlinkedPostCount: result.unlinkedPostCount,
			r2Deleted
		};
	}
});

export const deletePostPermanently = action({
	args: {
		postId: v.id('posts')
	},
	returns: v.object({
		deleted: v.boolean(),
		postId: v.id('posts'),
		commentCount: v.number(),
		commentVoteCount: v.number(),
		voteCount: v.number(),
		postTagCount: v.number(),
		embeddingCount: v.number(),
		summaryCount: v.number(),
		r2Deleted: v.boolean()
	}),
	handler: async (ctx, args): Promise<DeletePostPermanentlyResult> => {
		await requireAdmin(ctx);
		const result: DeletePostCascadeResult = await ctx.runMutation(
			(internal as any).admin.deletePostCascadeFromDb,
			{
				postId: args.postId
			}
		);
		const r2Deleted = result.r2Key ? (await deleteR2Keys(ctx, [result.r2Key])) > 0 : false;
		return {
			deleted: result.deleted,
			postId: result.postId,
			commentCount: result.commentCount,
			commentVoteCount: result.commentVoteCount,
			voteCount: result.voteCount,
			postTagCount: result.postTagCount,
			embeddingCount: result.embeddingCount,
			summaryCount: result.summaryCount,
			r2Deleted
		};
	}
});
