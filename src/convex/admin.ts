import { v } from 'convex/values';
import {
	action,
	internalAction,
	internalMutation,
	internalQuery,
	query
} from './_generated/server';
import { internal } from './_generated/api';
import { r2 } from './lib/r2';
import type { Id } from './_generated/dataModel';
import { requireAdminUser } from './lib/adminAuth';
import { actionRetrier } from './lib/actionRetrier';
import {
	countSourceItemsForSource,
	trackPostDeleted,
	trackPostReplaced,
	trackSourceItemDeleted
} from './lib/aggregates';

const stringifyDetails = (value: unknown): string => {
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
};

const logAdminAuditEvent = async (
	ctx: any,
	args: {
		actorAuthId: string;
		action: string;
		targetType: string;
		targetId: string;
		status: 'started' | 'succeeded' | 'failed';
		details?: string;
	}
) => {
	try {
		await ctx.runMutation((internal as any).security.logAdminAuditEvent, args);
	} catch (error) {
		console.error('Failed to write admin audit log.', error);
	}
};

const sourceTypeValidator = v.union(
	v.literal('website'),
	v.literal('rss'),
	v.literal('youtube'),
	v.literal('bookmarks')
);

const sourceStatusValidator = v.union(
	v.literal('active'),
	v.literal('paused'),
	v.literal('error'),
	v.literal('deleting')
);
const UTC_DAY_MS = 24 * 60 * 60 * 1000;

const utcRunDateKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

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

const dashboardLockStateValidator = v.object({
	lockKey: v.string(),
	isLocked: v.boolean(),
	owner: v.optional(v.string()),
	leaseExpiresAt: v.optional(v.number()),
	updatedAt: v.optional(v.number())
});

const dashboardRetryBacklogValidator = v.object({
	queued: v.number(),
	running: v.number(),
	failed: v.number()
});

const dashboardFailureCountsValidator = v.object({
	sourceJobs24h: v.number(),
	deletionJobs24h: v.number(),
	r2RetryJobs24h: v.number()
});

const dashboardSweeperValidator = v.object({
	lastSuccessAt: v.union(v.number(), v.null())
});

const dashboardDebugValidator = v.object({
	nightlyLock: dashboardLockStateValidator,
	retryBacklog: dashboardRetryBacklogValidator,
	failures24h: dashboardFailureCountsValidator,
	sweeper: dashboardSweeperValidator
});

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

const deletionJobTargetTypeValidator = v.union(
	v.literal('source'),
	v.literal('source_item'),
	v.literal('post')
);

const deletionJobStatusValidator = v.union(
	v.literal('queued'),
	v.literal('running'),
	v.literal('done'),
	v.literal('failed'),
	v.literal('cancelled')
);

const deletionJobClaimValidator = v.object({
	jobId: v.id('deletion_jobs'),
	status: deletionJobStatusValidator,
	shouldRun: v.boolean(),
	result: v.optional(v.string()),
	error: v.optional(v.string())
});

const r2RetryStatusValidator = v.union(
	v.literal('queued'),
	v.literal('running'),
	v.literal('done'),
	v.literal('failed')
);

const r2RetryJobClaimValidator = v.object({
	jobId: v.id('r2_retry_jobs'),
	status: r2RetryStatusValidator,
	shouldRun: v.boolean()
});

const r2RetryJobValidator = v.union(
	v.null(),
	v.object({
		_id: v.id('r2_retry_jobs'),
		entityType: v.string(),
		entityId: v.string(),
		r2Key: v.string(),
		operation: v.literal('delete'),
		status: r2RetryStatusValidator,
		attemptCount: v.number(),
		nextRunAt: v.number(),
		lastError: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
		finishedAt: v.optional(v.number())
	})
);

const sourceStatuses: Array<'active' | 'paused' | 'error' | 'deleting'> = [
	'active',
	'paused',
	'error',
	'deleting'
];

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

type DeletionJobTargetType = 'source' | 'source_item' | 'post';

type DeletionJobClaim = {
	jobId: Id<'deletion_jobs'>;
	status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
	shouldRun: boolean;
	result?: string;
	error?: string;
};

type R2RetryJobClaim = {
	jobId: Id<'r2_retry_jobs'>;
	status: 'queued' | 'running' | 'done' | 'failed';
	shouldRun: boolean;
};

const createDeletionRequestKey = (targetType: DeletionJobTargetType, targetId: string) =>
	`v1:${targetType}:${targetId}`;

const parseStoredDeleteResult = <T>(value: string | undefined): T | null => {
	if (!value) {
		return null;
	}
	try {
		return JSON.parse(value) as T;
	} catch {
		return null;
	}
};

export const listDashboard = query({
	args: {},
	returns: v.object({
		sources: v.array(dashboardSourceValidator),
		sourceItems: v.array(dashboardSourceItemValidator),
		posts: v.array(dashboardPostValidator),
		nightlyRun: dashboardNightlyRunValidator,
		debug: dashboardDebugValidator
	}),
	handler: async (ctx) => {
		await requireAdminUser(ctx);

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
				const itemCount = await countSourceItemsForSource(ctx, source._id);
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

		const now = Date.now();
		const failedSince = now - UTC_DAY_MS;
		const nightlyLockKey = `nightly_source_refresh:${utcRunDateKey(now)}`;
		const nightlyLock = (
			await ctx.db
				.query('scheduler_locks')
				.withIndex('by_lockKey', (q) => q.eq('lockKey', nightlyLockKey))
				.take(1)
		)[0];

		const [r2QueuedJobs, r2RunningJobs, r2FailedJobs] = await Promise.all([
			ctx.db
				.query('r2_retry_jobs')
				.withIndex('by_status_and_nextRunAt', (q) => q.eq('status', 'queued'))
				.collect(),
			ctx.db
				.query('r2_retry_jobs')
				.withIndex('by_status_and_nextRunAt', (q) => q.eq('status', 'running'))
				.collect(),
			ctx.db
				.query('r2_retry_jobs')
				.withIndex('by_status_and_nextRunAt', (q) => q.eq('status', 'failed'))
				.collect()
		]);

		const [failedSourceJobs24h, failedDeletionJobs24h, failedR2RetryJobs24h, sweeperEvents] =
			await Promise.all([
				ctx.db
					.query('source_jobs')
					.withIndex('by_status_and_updatedAt', (q) =>
						q.eq('status', 'failed').gte('updatedAt', failedSince)
					)
					.collect(),
				ctx.db
					.query('deletion_jobs')
					.withIndex('by_status_and_updatedAt', (q) =>
						q.eq('status', 'failed').gte('updatedAt', failedSince)
					)
					.collect(),
				ctx.db
					.query('r2_retry_jobs')
					.withIndex('by_status_and_nextRunAt', (q) =>
						q.eq('status', 'failed').gte('nextRunAt', failedSince)
					)
					.collect(),
				ctx.db
					.query('security_events')
					.withIndex('by_eventType_and_createdAt', (q) =>
						q.eq('eventType', 'r2_orphan_sweeper_success')
					)
					.order('desc')
					.take(1)
			]);

		return {
			sources,
			sourceItems,
			posts,
			nightlyRun,
			debug: {
				nightlyLock: {
					lockKey: nightlyLockKey,
					isLocked: !!nightlyLock,
					owner: nightlyLock?.owner,
					leaseExpiresAt: nightlyLock?.leaseExpiresAt,
					updatedAt: nightlyLock?.updatedAt
				},
				retryBacklog: {
					queued: r2QueuedJobs.length,
					running: r2RunningJobs.length,
					failed: r2FailedJobs.length
				},
				failures24h: {
					sourceJobs24h: failedSourceJobs24h.length,
					deletionJobs24h: failedDeletionJobs24h.length,
					r2RetryJobs24h: failedR2RetryJobs24h.length
				},
				sweeper: {
					lastSuccessAt: sweeperEvents[0]?.createdAt ?? null
				}
			}
		};
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
				const oldPost = post;
				await ctx.db.patch(post._id, {
					sourceId: undefined,
					sourceItemId: undefined,
					updatedAt: Date.now()
				});
				const updatedPost = await ctx.db.get(post._id);
				if (updatedPost) {
					await trackPostReplaced(ctx, oldPost, updatedPost);
				}
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
			await trackSourceItemDeleted(ctx, sourceItem);
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
			const oldPost = post;
			await ctx.db.patch(post._id, {
				sourceId: undefined,
				sourceItemId: undefined,
				updatedAt: Date.now()
			});
			const updatedPost = await ctx.db.get(post._id);
			if (updatedPost) {
				await trackPostReplaced(ctx, oldPost, updatedPost);
			}
		}

		const deliveries = await ctx.db
			.query('user_source_items')
			.withIndex('by_sourceItemId', (q) => q.eq('sourceItemId', args.sourceItemId))
			.collect();
		for (const delivery of deliveries) {
			await ctx.db.delete(delivery._id);
		}

		await trackSourceItemDeleted(ctx, sourceItem);
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

		await trackPostDeleted(ctx, post);
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

export const claimDeletionJob = internalMutation({
	args: {
		requestKey: v.string(),
		requestedByAuthId: v.string(),
		targetType: deletionJobTargetTypeValidator,
		targetId: v.string()
	},
	returns: deletionJobClaimValidator,
	handler: async (ctx, args): Promise<DeletionJobClaim> => {
		const now = Date.now();
		const existing = await ctx.db
			.query('deletion_jobs')
			.withIndex('by_requestKey', (q) => q.eq('requestKey', args.requestKey))
			.unique();

		if (!existing) {
			const jobId = await ctx.db.insert('deletion_jobs', {
				requestKey: args.requestKey,
				requestedByAuthId: args.requestedByAuthId,
				targetType: args.targetType,
				targetId: args.targetId,
				status: 'running',
				processed: 0,
				createdAt: now,
				updatedAt: now
			});
			return {
				jobId,
				status: 'running',
				shouldRun: true
			};
		}

		if (
			existing.status === 'done' ||
			existing.status === 'running' ||
			existing.status === 'queued'
		) {
			return {
				jobId: existing._id,
				status: existing.status as 'queued' | 'running' | 'done',
				shouldRun: false,
				result: existing.result,
				error: existing.error
			};
		}

		await ctx.db.patch(existing._id, {
			status: 'running',
			processed: 0,
			result: undefined,
			error: undefined,
			finishedAt: undefined,
			updatedAt: now
		});
		return {
			jobId: existing._id,
			status: 'running',
			shouldRun: true
		};
	}
});

export const finishDeletionJob = internalMutation({
	args: {
		jobId: v.id('deletion_jobs'),
		status: v.union(v.literal('done'), v.literal('failed')),
		processed: v.number(),
		result: v.optional(v.string()),
		error: v.optional(v.string())
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const now = Date.now();
		await ctx.db.patch(args.jobId, {
			status: args.status,
			processed: Math.max(0, Math.trunc(args.processed)),
			result: args.result,
			error: args.error,
			updatedAt: now,
			finishedAt: now
		});
		return null;
	}
});

export const upsertR2DeleteRetryJob = internalMutation({
	args: {
		entityType: v.string(),
		entityId: v.string(),
		r2Key: v.string()
	},
	returns: r2RetryJobClaimValidator,
	handler: async (ctx, args): Promise<R2RetryJobClaim> => {
		const now = Date.now();
		const existing = await ctx.db
			.query('r2_retry_jobs')
			.withIndex('by_entityType_and_entityId_and_r2Key', (q) =>
				q.eq('entityType', args.entityType).eq('entityId', args.entityId).eq('r2Key', args.r2Key)
			)
			.unique();

		if (!existing) {
			const jobId = await ctx.db.insert('r2_retry_jobs', {
				entityType: args.entityType,
				entityId: args.entityId,
				r2Key: args.r2Key,
				operation: 'delete',
				status: 'queued',
				attemptCount: 0,
				nextRunAt: now,
				createdAt: now,
				updatedAt: now
			});
			return {
				jobId,
				status: 'queued',
				shouldRun: true
			};
		}

		if (existing.status === 'done') {
			return {
				jobId: existing._id,
				status: 'done',
				shouldRun: false
			};
		}

		if (existing.status === 'running' || existing.status === 'queued') {
			return {
				jobId: existing._id,
				status: existing.status as 'queued' | 'running',
				shouldRun: false
			};
		}

		await ctx.db.patch(existing._id, {
			status: 'queued',
			nextRunAt: now,
			lastError: undefined,
			finishedAt: undefined,
			updatedAt: now
		});
		return {
			jobId: existing._id,
			status: 'queued',
			shouldRun: true
		};
	}
});

export const getR2RetryJob = internalQuery({
	args: {
		retryJobId: v.id('r2_retry_jobs')
	},
	returns: r2RetryJobValidator,
	handler: async (ctx, args) => {
		const job = await ctx.db.get(args.retryJobId);
		if (!job || job.operation !== 'delete') {
			return null;
		}
		return job;
	}
});

export const markR2RetryJobAttempt = internalMutation({
	args: {
		retryJobId: v.id('r2_retry_jobs')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const job = await ctx.db.get(args.retryJobId);
		if (!job) {
			return null;
		}
		await ctx.db.patch(job._id, {
			status: 'running',
			attemptCount: job.attemptCount + 1,
			nextRunAt: Date.now(),
			updatedAt: Date.now()
		});
		return null;
	}
});

export const markR2RetryJobDone = internalMutation({
	args: {
		retryJobId: v.id('r2_retry_jobs')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const now = Date.now();
		const job = await ctx.db.get(args.retryJobId);
		if (!job) {
			return null;
		}
		await ctx.db.patch(job._id, {
			status: 'done',
			lastError: undefined,
			updatedAt: now,
			finishedAt: now
		});
		return null;
	}
});

export const markR2RetryJobFailed = internalMutation({
	args: {
		retryJobId: v.id('r2_retry_jobs'),
		error: v.string()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const now = Date.now();
		const job = await ctx.db.get(args.retryJobId);
		if (!job) {
			return null;
		}
		await ctx.db.patch(job._id, {
			status: 'failed',
			lastError: args.error.slice(0, 1000),
			nextRunAt: now,
			updatedAt: now,
			finishedAt: now
		});
		return null;
	}
});

export const runR2DeleteAttempt = internalAction({
	args: {
		retryJobId: v.id('r2_retry_jobs')
	},
	returns: v.object({
		retryJobId: v.id('r2_retry_jobs')
	}),
	handler: async (ctx, args) => {
		const retryJob = await ctx.runQuery((internal as any).admin.getR2RetryJob, {
			retryJobId: args.retryJobId
		});
		if (!retryJob) {
			throw new Error('R2 retry job not found.');
		}
		if (retryJob.status === 'done') {
			return { retryJobId: args.retryJobId };
		}
		await ctx.runMutation((internal as any).admin.markR2RetryJobAttempt, {
			retryJobId: args.retryJobId
		});
		await r2.deleteObject(ctx, retryJob.r2Key);
		return { retryJobId: args.retryJobId };
	}
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const retrierErrorToMessage = (value: unknown) => {
	if (typeof value === 'string') {
		return value;
	}
	if (value instanceof Error) {
		return value.message;
	}
	if (value && typeof value === 'object') {
		const maybeMessage = (value as { message?: unknown }).message;
		if (typeof maybeMessage === 'string') {
			return maybeMessage;
		}
	}
	return stringifyDetails(value);
};

const runRetriedR2Delete = async (
	ctx: any,
	args: {
		entityType: string;
		entityId: string;
		r2Key: string;
	}
) => {
	const claim: R2RetryJobClaim = await ctx.runMutation(
		(internal as any).admin.upsertR2DeleteRetryJob,
		{
			entityType: args.entityType,
			entityId: args.entityId,
			r2Key: args.r2Key
		}
	);
	if (claim.status === 'done') {
		return true;
	}
	if (!claim.shouldRun) {
		return false;
	}

	const runId = await actionRetrier.run(
		ctx,
		(internal as any).admin.runR2DeleteAttempt,
		{
			retryJobId: claim.jobId
		},
		{
			initialBackoffMs: 250,
			base: 2,
			maxFailures: 4
		}
	);

	try {
		while (true) {
			const status: any = await actionRetrier.status(ctx, runId);
			if (status?.type === 'inProgress') {
				await sleep(120);
				continue;
			}
			const result = status?.result;
			if (result?.type === 'success') {
				await ctx.runMutation((internal as any).admin.markR2RetryJobDone, {
					retryJobId: claim.jobId
				});
				return true;
			}

			const errorMessage =
				result?.type === 'failed'
					? retrierErrorToMessage(result.error)
					: 'R2 deletion retrier run was canceled.';
			await ctx.runMutation((internal as any).admin.markR2RetryJobFailed, {
				retryJobId: claim.jobId,
				error: errorMessage
			});
			return false;
		}
	} finally {
		try {
			await actionRetrier.cleanup(ctx, runId);
		} catch (cleanupError) {
			console.error('Failed to cleanup action retrier run for R2 delete.', cleanupError);
		}
	}
};

const deleteR2Keys = async (
	ctx: any,
	args: { entityType: string; entityId: string; r2Keys: Array<string> }
) => {
	const uniqueKeys = Array.from(new Set(args.r2Keys.filter((key) => key.length > 0)));
	let deletedCount = 0;
	for (const r2Key of uniqueKeys) {
		try {
			const deleted = await runRetriedR2Delete(ctx, {
				entityType: args.entityType,
				entityId: args.entityId,
				r2Key
			});
			if (deleted) {
				deletedCount += 1;
			}
		} catch (error) {
			console.error('Admin cleanup failed to delete R2 object', r2Key, error);
			await logAdminAuditEvent(ctx, {
				actorAuthId: 'system',
				action: 'r2_delete_retry_enqueue_failed',
				targetType: args.entityType,
				targetId: args.entityId,
				status: 'failed',
				details: stringifyDetails({
					r2Key,
					error: error instanceof Error ? error.message : String(error)
				})
			});
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
		const authUser = await requireAdminUser(ctx);
		const requestKey = createDeletionRequestKey('source', args.sourceId);
		const claim: DeletionJobClaim = await ctx.runMutation(
			(internal as any).admin.claimDeletionJob,
			{
				requestKey,
				requestedByAuthId: authUser._id,
				targetType: 'source',
				targetId: args.sourceId
			}
		);

		if (!claim.shouldRun) {
			const previous = parseStoredDeleteResult<DeleteSourcePermanentlyResult>(claim.result);
			if (previous) {
				return previous;
			}
			throw new Error(
				claim.status === 'running' || claim.status === 'queued'
					? 'Deletion already in progress for this source.'
					: (claim.error ?? 'Deletion was already attempted for this source.')
			);
		}

		await logAdminAuditEvent(ctx, {
			actorAuthId: authUser._id,
			action: 'deleteSourcePermanently',
			targetType: 'source',
			targetId: args.sourceId,
			status: 'started',
			details: stringifyDetails({ requestKey, deletionJobId: claim.jobId })
		});
		try {
			const result: DeleteSourceCascadeResult = await ctx.runMutation(
				(internal as any).admin.deleteSourceCascadeFromDb,
				{
					sourceId: args.sourceId
				}
			);
			const r2DeletedCount = await deleteR2Keys(ctx, {
				entityType: 'source',
				entityId: args.sourceId,
				r2Keys: result.r2Keys
			});
			const response: DeleteSourcePermanentlyResult = {
				deleted: result.deleted,
				sourceId: result.sourceId,
				sourceItemCount: result.sourceItemCount,
				deliveryCount: result.deliveryCount,
				subscriptionCount: result.subscriptionCount,
				jobCount: result.jobCount,
				unlinkedPostCount: result.unlinkedPostCount,
				r2DeletedCount
			};
			await ctx.runMutation((internal as any).admin.finishDeletionJob, {
				jobId: claim.jobId,
				status: 'done',
				processed: result.deleted ? 1 : 0,
				result: stringifyDetails(response)
			});
			await logAdminAuditEvent(ctx, {
				actorAuthId: authUser._id,
				action: 'deleteSourcePermanently',
				targetType: 'source',
				targetId: args.sourceId,
				status: 'succeeded',
				details: stringifyDetails({
					deleted: result.deleted,
					sourceItemCount: result.sourceItemCount,
					r2DeletedCount
				})
			});
			return response;
		} catch (error) {
			await ctx.runMutation((internal as any).admin.finishDeletionJob, {
				jobId: claim.jobId,
				status: 'failed',
				processed: 0,
				error: error instanceof Error ? error.message : 'Unknown error'
			});
			await logAdminAuditEvent(ctx, {
				actorAuthId: authUser._id,
				action: 'deleteSourcePermanently',
				targetType: 'source',
				targetId: args.sourceId,
				status: 'failed',
				details: error instanceof Error ? error.message : 'Unknown error'
			});
			throw error;
		}
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
		const authUser = await requireAdminUser(ctx);
		const requestKey = createDeletionRequestKey('source_item', args.sourceItemId);
		const claim: DeletionJobClaim = await ctx.runMutation(
			(internal as any).admin.claimDeletionJob,
			{
				requestKey,
				requestedByAuthId: authUser._id,
				targetType: 'source_item',
				targetId: args.sourceItemId
			}
		);

		if (!claim.shouldRun) {
			const previous = parseStoredDeleteResult<DeleteSourceItemPermanentlyResult>(claim.result);
			if (previous) {
				return previous;
			}
			throw new Error(
				claim.status === 'running' || claim.status === 'queued'
					? 'Deletion already in progress for this source item.'
					: (claim.error ?? 'Deletion was already attempted for this source item.')
			);
		}

		await logAdminAuditEvent(ctx, {
			actorAuthId: authUser._id,
			action: 'deleteSourceItemPermanently',
			targetType: 'source_item',
			targetId: args.sourceItemId,
			status: 'started',
			details: stringifyDetails({ requestKey, deletionJobId: claim.jobId })
		});
		try {
			const result: DeleteSourceItemCascadeResult = await ctx.runMutation(
				(internal as any).admin.deleteSourceItemCascadeFromDb,
				{
					sourceItemId: args.sourceItemId
				}
			);
			const r2Deleted = result.r2Key
				? (await deleteR2Keys(ctx, {
						entityType: 'source_item',
						entityId: args.sourceItemId,
						r2Keys: [result.r2Key]
					})) > 0
				: false;
			const response: DeleteSourceItemPermanentlyResult = {
				deleted: result.deleted,
				sourceItemId: result.sourceItemId,
				deliveryCount: result.deliveryCount,
				unlinkedPostCount: result.unlinkedPostCount,
				r2Deleted
			};
			await ctx.runMutation((internal as any).admin.finishDeletionJob, {
				jobId: claim.jobId,
				status: 'done',
				processed: result.deleted ? 1 : 0,
				result: stringifyDetails(response)
			});
			await logAdminAuditEvent(ctx, {
				actorAuthId: authUser._id,
				action: 'deleteSourceItemPermanently',
				targetType: 'source_item',
				targetId: args.sourceItemId,
				status: 'succeeded',
				details: stringifyDetails({
					deleted: result.deleted,
					r2Deleted
				})
			});
			return response;
		} catch (error) {
			await ctx.runMutation((internal as any).admin.finishDeletionJob, {
				jobId: claim.jobId,
				status: 'failed',
				processed: 0,
				error: error instanceof Error ? error.message : 'Unknown error'
			});
			await logAdminAuditEvent(ctx, {
				actorAuthId: authUser._id,
				action: 'deleteSourceItemPermanently',
				targetType: 'source_item',
				targetId: args.sourceItemId,
				status: 'failed',
				details: error instanceof Error ? error.message : 'Unknown error'
			});
			throw error;
		}
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
		const authUser = await requireAdminUser(ctx);
		const requestKey = createDeletionRequestKey('post', args.postId);
		const claim: DeletionJobClaim = await ctx.runMutation(
			(internal as any).admin.claimDeletionJob,
			{
				requestKey,
				requestedByAuthId: authUser._id,
				targetType: 'post',
				targetId: args.postId
			}
		);

		if (!claim.shouldRun) {
			const previous = parseStoredDeleteResult<DeletePostPermanentlyResult>(claim.result);
			if (previous) {
				return previous;
			}
			throw new Error(
				claim.status === 'running' || claim.status === 'queued'
					? 'Deletion already in progress for this post.'
					: (claim.error ?? 'Deletion was already attempted for this post.')
			);
		}

		await logAdminAuditEvent(ctx, {
			actorAuthId: authUser._id,
			action: 'deletePostPermanently',
			targetType: 'post',
			targetId: args.postId,
			status: 'started',
			details: stringifyDetails({ requestKey, deletionJobId: claim.jobId })
		});
		try {
			const result: DeletePostCascadeResult = await ctx.runMutation(
				(internal as any).admin.deletePostCascadeFromDb,
				{
					postId: args.postId
				}
			);
			const r2Deleted = result.r2Key
				? (await deleteR2Keys(ctx, {
						entityType: 'post',
						entityId: args.postId,
						r2Keys: [result.r2Key]
					})) > 0
				: false;
			const response: DeletePostPermanentlyResult = {
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
			await ctx.runMutation((internal as any).admin.finishDeletionJob, {
				jobId: claim.jobId,
				status: 'done',
				processed: result.deleted ? 1 : 0,
				result: stringifyDetails(response)
			});
			await logAdminAuditEvent(ctx, {
				actorAuthId: authUser._id,
				action: 'deletePostPermanently',
				targetType: 'post',
				targetId: args.postId,
				status: 'succeeded',
				details: stringifyDetails({
					deleted: result.deleted,
					r2Deleted
				})
			});
			return response;
		} catch (error) {
			await ctx.runMutation((internal as any).admin.finishDeletionJob, {
				jobId: claim.jobId,
				status: 'failed',
				processed: 0,
				error: error instanceof Error ? error.message : 'Unknown error'
			});
			await logAdminAuditEvent(ctx, {
				actorAuthId: authUser._id,
				action: 'deletePostPermanently',
				targetType: 'post',
				targetId: args.postId,
				status: 'failed',
				details: error instanceof Error ? error.message : 'Unknown error'
			});
			throw error;
		}
	}
});
