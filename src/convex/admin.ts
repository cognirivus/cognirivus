import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import {
	action,
	internalAction,
	internalMutation,
	internalQuery,
	query
} from './_generated/server';
import { internal } from './_generated/api';
import { deleteR2MetadataOnly, deleteR2ObjectOnly, r2 } from './lib/r2';
import type { Id } from './_generated/dataModel';
import { requireAdminUser } from './lib/adminAuth';
import { actionRetrier } from './lib/actionRetrier';
import {
	countSourceItemsForSource,
	trackPostDeleted,
	trackPostReplaced,
	trackSourceItemDeleted
} from './lib/aggregates';
import { JOB_FAILURE_CODE, toFailureMessage } from './lib/jobFailure';
import { assertDeletionJobTransition, assertR2RetryJobTransition } from './lib/jobTransitions';
import { toR2RetryJobResponse, type R2RetryJobResponse } from './lib/serializers';

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
	v.literal('youtube')
);

const sourceStatusValidator = v.union(
	v.literal('active'),
	v.literal('paused'),
	v.literal('error'),
	v.literal('deleting')
);
const UTC_DAY_MS = 24 * 60 * 60 * 1000;
const R2_ORPHAN_SWEEPER_BATCH_SIZE = 100;

const utcRunDateKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

const dashboardSourceValidator = v.object({
	_id: v.id('sources'),
	title: v.string(),
	type: sourceTypeValidator,
	status: sourceStatusValidator,
	canonicalUrl: v.string(),
	rssFeedUrl: v.optional(v.string()),
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
	r2RetryJobs24h: v.number(),
	invalidR2RetryRows: v.number()
});

const dashboardSweeperValidator = v.object({
	lastSuccessAt: v.union(v.number(), v.null())
});

const dashboardMigrationStateValidator = v.union(
	v.literal('inProgress'),
	v.literal('success'),
	v.literal('failed'),
	v.literal('canceled'),
	v.literal('unknown')
);

const dashboardAggregateBackfillValidator = v.object({
	sourceItemsState: dashboardMigrationStateValidator,
	sourceItemsProcessed: v.number(),
	postSharesState: dashboardMigrationStateValidator,
	postSharesProcessed: v.number(),
	allDone: v.boolean()
});

const dashboardDebugValidator = v.object({
	nightlyLock: dashboardLockStateValidator,
	retryBacklog: dashboardRetryBacklogValidator,
	failures24h: dashboardFailureCountsValidator,
	sweeper: dashboardSweeperValidator,
	aggregateBackfill: dashboardAggregateBackfillValidator
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

const r2RetryStageValidator = v.union(v.literal('object_delete'), v.literal('metadata_delete'));

const r2OrphanSweeperPhaseValidator = v.union(
	v.literal('source_items'),
	v.literal('posts'),
	v.literal('r2_metadata')
);

const sourceItemR2RefRowValidator = v.object({
	_id: v.id('source_items'),
	r2Key: v.optional(v.string())
});

const postR2RefRowValidator = v.object({
	_id: v.id('posts'),
	r2Key: v.optional(v.string())
});

const aggregateParitySourceRowValidator = v.object({
	sourceId: v.id('sources')
});

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
		stage: r2RetryStageValidator,
		status: r2RetryStatusValidator,
		attemptCount: v.number(),
		nextRunAt: v.number(),
		lastError: v.optional(v.string()),
		objectDeletedAt: v.optional(v.number()),
		metadataDeletedAt: v.optional(v.number()),
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
					rssFeedUrl: source.rssFeedUrl,
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
		const DASHBOARD_SCAN_CAP = 2000;
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
				.take(DASHBOARD_SCAN_CAP),
			ctx.db
				.query('r2_retry_jobs')
				.withIndex('by_status_and_nextRunAt', (q) => q.eq('status', 'running'))
				.take(DASHBOARD_SCAN_CAP),
			ctx.db
				.query('r2_retry_jobs')
				.withIndex('by_status_and_nextRunAt', (q) => q.eq('status', 'failed'))
				.take(DASHBOARD_SCAN_CAP)
		]);
		const invalidR2RetryRows = [...r2QueuedJobs, ...r2RunningJobs, ...r2FailedJobs].filter(
			(job) => job.stage !== 'object_delete' && job.stage !== 'metadata_delete'
		).length;

		const [failedSourceJobs24h, failedDeletionJobs24h, failedR2RetryJobs24h, sweeperEvents] =
			await Promise.all([
				ctx.db
					.query('source_jobs')
					.withIndex('by_status_and_updatedAt', (q) =>
						q.eq('status', 'failed').gte('updatedAt', failedSince)
					)
					.order('desc')
					.take(DASHBOARD_SCAN_CAP),
				ctx.db
					.query('deletion_jobs')
					.withIndex('by_status_and_updatedAt', (q) =>
						q.eq('status', 'failed').gte('updatedAt', failedSince)
					)
					.order('desc')
					.take(DASHBOARD_SCAN_CAP),
				ctx.db
					.query('r2_retry_jobs')
					.withIndex('by_status_and_nextRunAt', (q) =>
						q.eq('status', 'failed').gte('nextRunAt', failedSince)
					)
					.order('desc')
					.take(DASHBOARD_SCAN_CAP),
				ctx.db
					.query('security_events')
					.withIndex('by_eventType_and_createdAt', (q) =>
						q.eq('eventType', 'r2_orphan_sweeper_success')
					)
					.order('desc')
					.take(1)
			]);
		const migrationStatuses: Array<{
			name: string;
			processed: number;
			isDone: boolean;
			state: 'inProgress' | 'success' | 'failed' | 'canceled' | 'unknown';
		}> = await ctx.runQuery((internal as any).migrations.getAggregateBackfillStatus, {});
		const sourceItemsMigration = migrationStatuses.find((status) =>
			status.name.includes('backfillSourceItemCountAggregate')
		);
		const postSharesMigration = migrationStatuses.find((status) =>
			status.name.includes('backfillPostShareAggregate')
		);

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
					r2RetryJobs24h: failedR2RetryJobs24h.length,
					invalidR2RetryRows
				},
				sweeper: {
					lastSuccessAt: sweeperEvents[0]?.createdAt ?? null
				},
				aggregateBackfill: {
					sourceItemsState: sourceItemsMigration?.state ?? 'unknown',
					sourceItemsProcessed: sourceItemsMigration?.processed ?? 0,
					postSharesState: postSharesMigration?.state ?? 'unknown',
					postSharesProcessed: postSharesMigration?.processed ?? 0,
					allDone: (sourceItemsMigration?.isDone ?? false) && (postSharesMigration?.isDone ?? false)
				}
			}
		};
	}
});

export const listSourceItemR2RefsBatch = internalQuery({
	args: {
		paginationOpts: paginationOptsValidator
	},
	returns: v.object({
		page: v.array(sourceItemR2RefRowValidator),
		isDone: v.boolean(),
		continueCursor: v.union(v.string(), v.null())
	}),
	handler: async (ctx, args) => {
		const page = await (ctx.db.query('source_items') as any)
			.withIndex('by_r2Key_and_publishedAt', (q: any) => q.gte('r2Key', ''))
			.order('asc')
			.paginate(args.paginationOpts);

		return {
			page: page.page.map((row: { _id: Id<'source_items'>; r2Key?: string }) => ({
				_id: row._id,
				r2Key: row.r2Key
			})),
			isDone: page.isDone,
			continueCursor: page.continueCursor
		};
	}
});

export const listPostR2RefsBatch = internalQuery({
	args: {
		paginationOpts: paginationOptsValidator
	},
	returns: v.object({
		page: v.array(postR2RefRowValidator),
		isDone: v.boolean(),
		continueCursor: v.union(v.string(), v.null())
	}),
	handler: async (ctx, args) => {
		const page = await (ctx.db.query('posts') as any)
			.withIndex('by_r2Key_and_createdAt', (q: any) => q.gte('r2Key', ''))
			.order('asc')
			.paginate(args.paginationOpts);

		return {
			page: page.page.map((row: { _id: Id<'posts'>; r2Key?: string }) => ({
				_id: row._id,
				r2Key: row.r2Key
			})),
			isDone: page.isDone,
			continueCursor: page.continueCursor
		};
	}
});

export const quarantineMissingSourceItemR2Refs = internalMutation({
	args: {
		sourceItemIds: v.array(v.id('source_items'))
	},
	returns: v.number(),
	handler: async (ctx, args) => {
		let updated = 0;
		for (const sourceItemId of args.sourceItemIds) {
			const sourceItem = await ctx.db.get(sourceItemId);
			if (!sourceItem?.r2Key) {
				continue;
			}
			await ctx.db.patch(sourceItemId, {
				r2Key: undefined,
				body: sourceItem.body ?? sourceItem.snippet,
				updatedAt: Date.now()
			});
			updated += 1;
		}
		return updated;
	}
});

export const quarantineMissingPostR2Refs = internalMutation({
	args: {
		postIds: v.array(v.id('posts'))
	},
	returns: v.number(),
	handler: async (ctx, args) => {
		let updated = 0;
		for (const postId of args.postIds) {
			const post = await ctx.db.get(postId);
			if (!post?.r2Key) {
				continue;
			}
			const previous = post;
			await ctx.db.patch(postId, {
				r2Key: undefined,
				body: post.body ?? post.snippet,
				updatedAt: Date.now()
			});
			const next = await ctx.db.get(postId);
			if (next) {
				await trackPostReplaced(ctx, previous, next);
			}
			updated += 1;
		}
		return updated;
	}
});

export const runR2OrphanSweeper = internalAction({
	args: {
		phase: r2OrphanSweeperPhaseValidator,
		cursor: v.union(v.string(), v.null()),
		sourceItemsScanned: v.number(),
		sourceItemsMissing: v.number(),
		postsScanned: v.number(),
		postsMissing: v.number(),
		metadataScanned: v.number(),
		metadataOrphansDeleted: v.number()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		try {
			if (args.phase === 'source_items') {
				const batch: {
					page: Array<{ _id: Id<'source_items'>; r2Key?: string }>;
					isDone: boolean;
					continueCursor: string | null;
				} = await ctx.runQuery((internal as any).admin.listSourceItemR2RefsBatch, {
					paginationOpts: {
						numItems: R2_ORPHAN_SWEEPER_BATCH_SIZE,
						cursor: args.cursor
					}
				});

				const missingIds: Array<Id<'source_items'>> = [];
				for (const row of batch.page) {
					if (!row.r2Key) {
						continue;
					}
					const url = await r2.getUrl(row.r2Key);
					if (!url) {
						missingIds.push(row._id);
					}
				}
				if (missingIds.length > 0) {
					await ctx.runMutation((internal as any).admin.quarantineMissingSourceItemR2Refs, {
						sourceItemIds: missingIds
					});
				}

				const sourceItemsScanned = args.sourceItemsScanned + batch.page.length;
				const sourceItemsMissing = args.sourceItemsMissing + missingIds.length;
				if (!batch.isDone) {
					await ctx.scheduler.runAfter(0, (internal as any).admin.runR2OrphanSweeper, {
						phase: 'source_items',
						cursor: batch.continueCursor,
						sourceItemsScanned,
						sourceItemsMissing,
						postsScanned: args.postsScanned,
						postsMissing: args.postsMissing,
						metadataScanned: args.metadataScanned,
						metadataOrphansDeleted: args.metadataOrphansDeleted
					});
					return null;
				}

				await ctx.scheduler.runAfter(0, (internal as any).admin.runR2OrphanSweeper, {
					phase: 'posts',
					cursor: null,
					sourceItemsScanned,
					sourceItemsMissing,
					postsScanned: args.postsScanned,
					postsMissing: args.postsMissing,
					metadataScanned: args.metadataScanned,
					metadataOrphansDeleted: args.metadataOrphansDeleted
				});
				return null;
			}

			if (args.phase === 'posts') {
				const batch: {
					page: Array<{ _id: Id<'posts'>; r2Key?: string }>;
					isDone: boolean;
					continueCursor: string | null;
				} = await ctx.runQuery((internal as any).admin.listPostR2RefsBatch, {
					paginationOpts: {
						numItems: R2_ORPHAN_SWEEPER_BATCH_SIZE,
						cursor: args.cursor
					}
				});

				const missingIds: Array<Id<'posts'>> = [];
				for (const row of batch.page) {
					if (!row.r2Key) {
						continue;
					}
					const url = await r2.getUrl(row.r2Key);
					if (!url) {
						missingIds.push(row._id);
					}
				}
				if (missingIds.length > 0) {
					await ctx.runMutation((internal as any).admin.quarantineMissingPostR2Refs, {
						postIds: missingIds
					});
				}

				const postsScanned = args.postsScanned + batch.page.length;
				const postsMissing = args.postsMissing + missingIds.length;
				if (!batch.isDone) {
					await ctx.scheduler.runAfter(0, (internal as any).admin.runR2OrphanSweeper, {
						phase: 'posts',
						cursor: batch.continueCursor,
						sourceItemsScanned: args.sourceItemsScanned,
						sourceItemsMissing: args.sourceItemsMissing,
						postsScanned,
						postsMissing,
						metadataScanned: args.metadataScanned,
						metadataOrphansDeleted: args.metadataOrphansDeleted
					});
					return null;
				}

				await ctx.scheduler.runAfter(0, (internal as any).admin.runR2OrphanSweeper, {
					phase: 'r2_metadata',
					cursor: null,
					sourceItemsScanned: args.sourceItemsScanned,
					sourceItemsMissing: args.sourceItemsMissing,
					postsScanned,
					postsMissing,
					metadataScanned: args.metadataScanned,
					metadataOrphansDeleted: args.metadataOrphansDeleted
				});
				return null;
			}

			const metadataBatch = await r2.listMetadata(ctx, R2_ORPHAN_SWEEPER_BATCH_SIZE, args.cursor);
			let orphanDeletedDelta = 0;
			for (const metadata of metadataBatch.page) {
				const [hasSourceItemRef, hasPostRef] = await Promise.all([
					ctx.runQuery((internal as any).admin.hasSourceItemForR2Key, {
						r2Key: metadata.key
					}),
					ctx.runQuery((internal as any).admin.hasPostForR2Key, {
						r2Key: metadata.key
					})
				]);
				if (hasSourceItemRef || hasPostRef) {
					continue;
				}

				const deleted = await runRetriedR2Delete(ctx, {
					entityType: 'orphan_sweeper',
					entityId: metadata.key,
					r2Key: metadata.key
				});
				if (deleted) {
					orphanDeletedDelta += 1;
				}
			}

			const metadataScanned = args.metadataScanned + metadataBatch.page.length;
			const metadataOrphansDeleted = args.metadataOrphansDeleted + orphanDeletedDelta;
			if (!metadataBatch.isDone) {
				await ctx.scheduler.runAfter(0, (internal as any).admin.runR2OrphanSweeper, {
					phase: 'r2_metadata',
					cursor: metadataBatch.continueCursor,
					sourceItemsScanned: args.sourceItemsScanned,
					sourceItemsMissing: args.sourceItemsMissing,
					postsScanned: args.postsScanned,
					postsMissing: args.postsMissing,
					metadataScanned,
					metadataOrphansDeleted
				});
				return null;
			}

			await ctx.runMutation((internal as any).security.logEvent, {
				eventType: 'r2_orphan_sweeper_success',
				severity: 'info',
				surface: 'admin.runR2OrphanSweeper',
				message: 'R2 orphan sweeper completed.',
				metadata: stringifyDetails({
					sourceItemsScanned: args.sourceItemsScanned,
					sourceItemsMissing: args.sourceItemsMissing,
					postsScanned: args.postsScanned,
					postsMissing: args.postsMissing,
					metadataScanned,
					metadataOrphansDeleted
				})
			});
		} catch (error) {
			await ctx.runMutation((internal as any).security.logEvent, {
				eventType: 'r2_orphan_sweeper_failed',
				severity: 'error',
				surface: 'admin.runR2OrphanSweeper',
				message: toFailureMessage(
					JOB_FAILURE_CODE.R2_ORPHAN_SWEEPER_FAILED,
					error,
					'R2 orphan sweeper failed.'
				),
				metadata: stringifyDetails({
					phase: args.phase,
					cursor: args.cursor,
					sourceItemsScanned: args.sourceItemsScanned,
					sourceItemsMissing: args.sourceItemsMissing,
					postsScanned: args.postsScanned,
					postsMissing: args.postsMissing,
					metadataScanned: args.metadataScanned,
					metadataOrphansDeleted: args.metadataOrphansDeleted
				})
			});
		}

		return null;
	}
});

export const listSourcesForAggregateParity = internalQuery({
	args: {
		paginationOpts: paginationOptsValidator
	},
	returns: v.object({
		page: v.array(aggregateParitySourceRowValidator),
		isDone: v.boolean(),
		continueCursor: v.union(v.string(), v.null())
	}),
	handler: async (ctx, args) => {
		const page = await ctx.db
			.query('sources')
			.withIndex('by_status_and_updatedAt', (q) => q.eq('status', 'active'))
			.order('desc')
			.paginate(args.paginationOpts);
		return {
			page: page.page.map((row) => ({ sourceId: row._id })),
			isDone: page.isDone,
			continueCursor: page.continueCursor
		};
	}
});

export const countSourceItemsRaw = internalQuery({
	args: {
		sourceId: v.id('sources')
	},
	returns: v.number(),
	handler: async (ctx, args) => {
		const rows = await ctx.db
			.query('source_items')
			.withIndex('by_sourceId_and_publishedAt', (q) => q.eq('sourceId', args.sourceId))
			.collect();
		return rows.length;
	}
});

export const hasSourceItemForR2Key = internalQuery({
	args: {
		r2Key: v.string()
	},
	returns: v.boolean(),
	handler: async (ctx, args) => {
		const rows = await (ctx.db.query('source_items') as any)
			.withIndex('by_r2Key_and_publishedAt', (q: any) => q.eq('r2Key', args.r2Key))
			.take(1);
		return rows.length > 0;
	}
});

export const hasPostForR2Key = internalQuery({
	args: {
		r2Key: v.string()
	},
	returns: v.boolean(),
	handler: async (ctx, args) => {
		const rows = await (ctx.db.query('posts') as any)
			.withIndex('by_r2Key_and_createdAt', (q: any) => q.eq('r2Key', args.r2Key))
			.take(1);
		return rows.length > 0;
	}
});

export const runAggregateParityCheck = internalAction({
	args: {
		cursor: v.union(v.string(), v.null()),
		checked: v.number(),
		mismatches: v.number()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		try {
			const batch: {
				page: Array<{ sourceId: Id<'sources'> }>;
				isDone: boolean;
				continueCursor: string | null;
			} = await ctx.runQuery((internal as any).admin.listSourcesForAggregateParity, {
				paginationOpts: {
					numItems: 50,
					cursor: args.cursor
				}
			});

			let mismatchDelta = 0;
			for (const row of batch.page) {
				const [aggregateCount, rawCount] = await Promise.all([
					countSourceItemsForSource(ctx, row.sourceId),
					ctx.runQuery((internal as any).admin.countSourceItemsRaw, { sourceId: row.sourceId })
				]);
				if (aggregateCount !== rawCount) {
					mismatchDelta += 1;
					await ctx.runMutation((internal as any).security.logEvent, {
						eventType: 'aggregate_parity_mismatch',
						severity: 'warn',
						surface: 'admin.runAggregateParityCheck',
						message: `Aggregate mismatch for source ${row.sourceId}`,
						entityType: 'source',
						entityId: row.sourceId,
						metadata: stringifyDetails({
							aggregateCount,
							rawCount
						})
					});
				}
			}

			const checked = args.checked + batch.page.length;
			const mismatches = args.mismatches + mismatchDelta;
			if (!batch.isDone) {
				await ctx.scheduler.runAfter(0, (internal as any).admin.runAggregateParityCheck, {
					cursor: batch.continueCursor,
					checked,
					mismatches
				});
				return null;
			}

			await ctx.runMutation((internal as any).security.logEvent, {
				eventType: 'aggregate_parity_check_success',
				severity: mismatches > 0 ? 'warn' : 'info',
				surface: 'admin.runAggregateParityCheck',
				message:
					mismatches > 0
						? `Aggregate parity check finished with ${mismatches} mismatches.`
						: 'Aggregate parity check finished with no mismatches.',
				metadata: stringifyDetails({
					checked,
					mismatches
				})
			});
		} catch (error) {
			await ctx.runMutation((internal as any).security.logEvent, {
				eventType: 'aggregate_parity_check_failed',
				severity: 'error',
				surface: 'admin.runAggregateParityCheck',
				message: toFailureMessage(
					JOB_FAILURE_CODE.AGGREGATE_PARITY_CHECK_FAILED,
					error,
					'Aggregate parity check failed.'
				),
				metadata: stringifyDetails({
					cursor: args.cursor,
					checked: args.checked,
					mismatches: args.mismatches
				})
			});
		}

		return null;
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

		const r2Keys: Array<string> = [];
		let sourceItemCount = 0;
		let deliveryCount = 0;
		let unlinkedPostCount = 0;
		let subscriptionCount = 0;
		let jobCount = 0;

		while (true) {
			const sourceItemsBatch = await ctx.db
				.query('source_items')
				.withIndex('by_sourceId_and_publishedAt', (q) => q.eq('sourceId', args.sourceId))
				.take(100);
			if (sourceItemsBatch.length === 0) {
				break;
			}

			for (const sourceItem of sourceItemsBatch) {
				if (sourceItem.r2Key) {
					r2Keys.push(sourceItem.r2Key);
				}

				while (true) {
					const linkedPosts = await ctx.db
						.query('posts')
						.withIndex('by_sourceItemId_and_createdAt', (q) => q.eq('sourceItemId', sourceItem._id))
						.take(100);
					if (linkedPosts.length === 0) {
						break;
					}
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

				while (true) {
					const deliveriesBatch = await ctx.db
						.query('user_source_items')
						.withIndex('by_sourceItemId', (q) => q.eq('sourceItemId', sourceItem._id))
						.take(200);
					if (deliveriesBatch.length === 0) {
						break;
					}
					for (const delivery of deliveriesBatch) {
						await ctx.db.delete(delivery._id);
						deliveryCount += 1;
					}
				}

				await trackSourceItemDeleted(ctx, sourceItem);
				await ctx.db.delete(sourceItem._id);
				sourceItemCount += 1;
			}
		}

		while (true) {
			const remainingPosts = await (ctx.db.query('posts') as any)
				.withIndex('by_sourceId_and_createdAt', (q: any) => q.eq('sourceId', args.sourceId))
				.take(100);
			if (remainingPosts.length === 0) {
				break;
			}
			for (const post of remainingPosts) {
				const oldPost = post as any;
				await ctx.db.patch(post._id, {
					sourceId: undefined,
					sourceItemId: undefined,
					updatedAt: Date.now()
				});
				const updatedPost = await ctx.db.get(post._id);
				if (updatedPost) {
					await trackPostReplaced(ctx, oldPost, updatedPost as any);
				}
				unlinkedPostCount += 1;
			}
		}

		while (true) {
			const activeBatch = await ctx.db
				.query('source_subscriptions')
				.withIndex('by_sourceId_and_status', (q) =>
					q.eq('sourceId', args.sourceId).eq('status', 'active')
				)
				.take(200);
			if (activeBatch.length === 0) {
				break;
			}
			for (const subscription of activeBatch) {
				await ctx.db.delete(subscription._id);
				subscriptionCount += 1;
			}
		}

		while (true) {
			const pausedBatch = await ctx.db
				.query('source_subscriptions')
				.withIndex('by_sourceId_and_status', (q) =>
					q.eq('sourceId', args.sourceId).eq('status', 'paused')
				)
				.take(200);
			if (pausedBatch.length === 0) {
				break;
			}
			for (const subscription of pausedBatch) {
				await ctx.db.delete(subscription._id);
				subscriptionCount += 1;
			}
		}

		while (true) {
			const sourceJobsBatch = await ctx.db
				.query('source_jobs')
				.withIndex('by_sourceId_and_createdAt', (q) => q.eq('sourceId', args.sourceId))
				.take(200);
			if (sourceJobsBatch.length === 0) {
				break;
			}
			for (const sourceJob of sourceJobsBatch) {
				await ctx.db.delete(sourceJob._id);
				jobCount += 1;
			}
		}
		await ctx.db.delete(args.sourceId);

		return {
			deleted: true,
			sourceId: args.sourceId,
			sourceItemCount,
			deliveryCount,
			subscriptionCount,
			jobCount,
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

		let unlinkedPostCount = 0;
		while (true) {
			const linkedPosts = await ctx.db
				.query('posts')
				.withIndex('by_sourceItemId_and_createdAt', (q) => q.eq('sourceItemId', args.sourceItemId))
				.take(100);
			if (linkedPosts.length === 0) {
				break;
			}
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

		let deliveryCount = 0;
		while (true) {
			const deliveries = await ctx.db
				.query('user_source_items')
				.withIndex('by_sourceItemId', (q) => q.eq('sourceItemId', args.sourceItemId))
				.take(200);
			if (deliveries.length === 0) {
				break;
			}
			for (const delivery of deliveries) {
				await ctx.db.delete(delivery._id);
				deliveryCount += 1;
			}
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
			deliveryCount,
			unlinkedPostCount,
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

		assertDeletionJobTransition(existing.status, 'running');
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
		const job = await ctx.db.get(args.jobId);
		if (!job) {
			return null;
		}
		if (job.status === args.status) {
			return null;
		}
		if (job.status === 'done' || job.status === 'cancelled') {
			return null;
		}
		assertDeletionJobTransition(job.status, args.status);
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
				stage: 'object_delete',
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

		assertR2RetryJobTransition(existing.status, 'queued');
		await ctx.db.patch(existing._id, {
			stage: existing.stage === 'metadata_delete' ? 'metadata_delete' : 'object_delete',
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
		return toR2RetryJobResponse(job);
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
		if (job.status === 'running') {
			return null;
		}
		if (job.status === 'done') {
			return null;
		}
		assertR2RetryJobTransition(job.status, 'running');
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
		if (job.status === 'done') {
			return null;
		}
		assertR2RetryJobTransition(job.status, 'done');
		await ctx.db.patch(job._id, {
			status: 'done',
			stage: 'metadata_delete',
			lastError: undefined,
			updatedAt: now,
			metadataDeletedAt: now,
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
		if (job.status === 'failed') {
			return null;
		}
		if (job.status === 'done') {
			return null;
		}
		assertR2RetryJobTransition(job.status, 'failed');
		await ctx.db.patch(job._id, {
			status: 'failed',
			stage: job.stage === 'metadata_delete' ? 'metadata_delete' : 'object_delete',
			lastError: args.error.slice(0, 1000),
			nextRunAt: now,
			updatedAt: now,
			finishedAt: now
		});
		return null;
	}
});

export const advanceR2RetryJobToMetadataStage = internalMutation({
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
		if (job.status === 'done') {
			return null;
		}
		if (job.stage === 'metadata_delete' && job.status === 'queued') {
			return null;
		}
		assertR2RetryJobTransition(job.status, 'queued');
		await ctx.db.patch(job._id, {
			stage: 'metadata_delete',
			status: 'queued',
			objectDeletedAt: now,
			lastError: undefined,
			nextRunAt: now,
			updatedAt: now,
			finishedAt: undefined
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
		if (retryJob.stage === 'object_delete') {
			await deleteR2ObjectOnly(ctx, retryJob.r2Key);
			await ctx.runMutation((internal as any).admin.advanceR2RetryJobToMetadataStage, {
				retryJobId: args.retryJobId
			});
			return { retryJobId: args.retryJobId };
		}
		await deleteR2MetadataOnly(ctx, retryJob.r2Key);
		await ctx.runMutation((internal as any).admin.markR2RetryJobDone, {
			retryJobId: args.retryJobId
		});
		return { retryJobId: args.retryJobId };
	}
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

	for (let stageAttempt = 0; stageAttempt < 3; stageAttempt += 1) {
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
				if (result?.type !== 'success') {
					const errorMessage =
						result?.type === 'failed'
							? toFailureMessage(
									JOB_FAILURE_CODE.R2_DELETE_FAILED,
									result.error,
									'R2 deletion retrier run failed.'
								)
							: toFailureMessage(
									JOB_FAILURE_CODE.R2_DELETE_FAILED,
									null,
									'R2 deletion retrier run was canceled.'
								);
					await ctx.runMutation((internal as any).admin.markR2RetryJobFailed, {
						retryJobId: claim.jobId,
						error: errorMessage
					});
					return false;
				}

				const retryJob: R2RetryJobResponse | null = await ctx.runQuery(
					(internal as any).admin.getR2RetryJob,
					{
						retryJobId: claim.jobId
					}
				);
				if (!retryJob) {
					return false;
				}
				if (retryJob.status === 'done') {
					return true;
				}
				if (retryJob.stage === 'metadata_delete' && retryJob.status === 'queued') {
					break;
				}
				return false;
			}
		} finally {
			try {
				await actionRetrier.cleanup(ctx, runId);
			} catch (cleanupError) {
				console.error('Failed to cleanup action retrier run for R2 delete.', cleanupError);
			}
		}
	}

	await ctx.runMutation((internal as any).admin.markR2RetryJobFailed, {
		retryJobId: claim.jobId,
		error: toFailureMessage(
			JOB_FAILURE_CODE.R2_DELETE_FAILED,
			null,
			'R2 deletion stages did not converge.'
		)
	});
	return false;
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
			const failureMessage = toFailureMessage(
				JOB_FAILURE_CODE.ADMIN_DELETE_SOURCE_FAILED,
				error,
				'Source deletion failed.'
			);
			await ctx.runMutation((internal as any).admin.finishDeletionJob, {
				jobId: claim.jobId,
				status: 'failed',
				processed: 0,
				error: failureMessage
			});
			await logAdminAuditEvent(ctx, {
				actorAuthId: authUser._id,
				action: 'deleteSourcePermanently',
				targetType: 'source',
				targetId: args.sourceId,
				status: 'failed',
				details: failureMessage
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
			const failureMessage = toFailureMessage(
				JOB_FAILURE_CODE.ADMIN_DELETE_SOURCE_ITEM_FAILED,
				error,
				'Source item deletion failed.'
			);
			await ctx.runMutation((internal as any).admin.finishDeletionJob, {
				jobId: claim.jobId,
				status: 'failed',
				processed: 0,
				error: failureMessage
			});
			await logAdminAuditEvent(ctx, {
				actorAuthId: authUser._id,
				action: 'deleteSourceItemPermanently',
				targetType: 'source_item',
				targetId: args.sourceItemId,
				status: 'failed',
				details: failureMessage
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
			const failureMessage = toFailureMessage(
				JOB_FAILURE_CODE.ADMIN_DELETE_POST_FAILED,
				error,
				'Post deletion failed.'
			);
			await ctx.runMutation((internal as any).admin.finishDeletionJob, {
				jobId: claim.jobId,
				status: 'failed',
				processed: 0,
				error: failureMessage
			});
			await logAdminAuditEvent(ctx, {
				actorAuthId: authUser._id,
				action: 'deletePostPermanently',
				targetType: 'post',
				targetId: args.postId,
				status: 'failed',
				details: failureMessage
			});
			throw error;
		}
	}
});
