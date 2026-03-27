import { v } from 'convex/values';
import { Migrations } from '@convex-dev/migrations';
import { components, internal } from './_generated/api';
import type { DataModel } from './_generated/dataModel';
import { action, internalAction, internalMutation, internalQuery } from './_generated/server';
import { trackPostInserted, trackSourceItemInserted } from './lib/aggregates';
import { requireAdminUser } from './lib/adminAuth';

const backfillStateValidator = v.object({
	isDone: v.boolean(),
	continueCursor: v.union(v.string(), v.null()),
	processed: v.number()
});

const migrationStatusValidator = v.object({
	name: v.string(),
	cursor: v.optional(v.union(v.string(), v.null())),
	processed: v.number(),
	isDone: v.boolean(),
	error: v.optional(v.string()),
	state: v.union(
		v.literal('inProgress'),
		v.literal('success'),
		v.literal('failed'),
		v.literal('canceled'),
		v.literal('unknown')
	),
	latestStart: v.number(),
	latestEnd: v.optional(v.number()),
	batchSize: v.optional(v.number()),
	next: v.optional(v.array(v.string()))
});

type AggregateMigrationStatus = {
	name: string;
	cursor?: string | null;
	processed: number;
	isDone: boolean;
	error?: string;
	state: 'inProgress' | 'success' | 'failed' | 'canceled' | 'unknown';
	latestStart: number;
	latestEnd?: number;
	batchSize?: number;
	next?: Array<string>;
};

const purgeTableNameValidator = v.union(
	v.literal('users_profile'),
	v.literal('communities'),
	v.literal('community_memberships'),
	v.literal('posts'),
	v.literal('sources'),
	v.literal('source_subscriptions'),
	v.literal('source_items'),
	v.literal('saved_source_suggestions'),
	v.literal('user_source_items'),
	v.literal('source_jobs'),
	v.literal('source_nightly_runs'),
	v.literal('security_events'),
	v.literal('admin_audit_logs'),
	v.literal('deletion_jobs'),
	v.literal('r2_retry_jobs'),
	v.literal('scheduler_locks'),
	v.literal('post_tags'),
	v.literal('post_votes'),
	v.literal('post_comments'),
	v.literal('post_comment_votes'),
	v.literal('follows_users'),
	v.literal('follows_communities'),
	v.literal('community_chat_messages'),
	v.literal('community_chat_reactions'),
	v.literal('post_embeddings'),
	v.literal('ai_summary_cache'),
	v.literal('similar_links_cache'),
	v.literal('similar_links_domain_exclusions'),
	v.literal('dm_conversations'),
	v.literal('dm_participants'),
	v.literal('dm_messages'),
	v.literal('dm_reactions'),
	v.literal('dm_read_cursors'),
	v.literal('user'),
	v.literal('session'),
	v.literal('account'),
	v.literal('verification'),
	v.literal('jwks')
);

const workosCutoverResetResultValidator = v.object({
	purgedTables: v.array(
		v.object({
			tableName: purgeTableNameValidator,
			deletedCount: v.number(),
			skipped: v.boolean()
		})
	),
	r2CleanupScheduled: v.boolean()
});

const CUTOVER_RESET_TABLES: Array<
	| 'users_profile'
	| 'communities'
	| 'community_memberships'
	| 'posts'
	| 'sources'
	| 'source_subscriptions'
	| 'source_items'
	| 'saved_source_suggestions'
	| 'user_source_items'
	| 'source_jobs'
	| 'source_nightly_runs'
	| 'security_events'
	| 'admin_audit_logs'
	| 'deletion_jobs'
	| 'r2_retry_jobs'
	| 'scheduler_locks'
	| 'post_tags'
	| 'post_votes'
	| 'post_comments'
	| 'post_comment_votes'
	| 'follows_users'
	| 'follows_communities'
	| 'community_chat_messages'
	| 'community_chat_reactions'
	| 'post_embeddings'
	| 'ai_summary_cache'
	| 'similar_links_cache'
	| 'similar_links_domain_exclusions'
	| 'dm_conversations'
	| 'dm_participants'
	| 'dm_messages'
	| 'dm_reactions'
	| 'dm_read_cursors'
	| 'user'
	| 'session'
	| 'account'
	| 'verification'
	| 'jwks'
> = [
	'community_chat_reactions',
	'community_chat_messages',
	'post_comment_votes',
	'post_comments',
	'post_votes',
	'post_tags',
	'post_embeddings',
	'ai_summary_cache',
	'similar_links_cache',
	'similar_links_domain_exclusions',
	'follows_users',
	'follows_communities',
	'community_memberships',
	'user_source_items',
	'saved_source_suggestions',
	'dm_reactions',
	'dm_messages',
	'dm_participants',
	'dm_read_cursors',
	'dm_conversations',
	'deletion_jobs',
	'r2_retry_jobs',
	'admin_audit_logs',
	'security_events',
	'source_jobs',
	'source_nightly_runs',
	'posts',
	'source_items',
	'source_subscriptions',
	'sources',
	'communities',
	'users_profile',
	'scheduler_locks',
	'session',
	'account',
	'verification',
	'jwks',
	'user'
];

const dataMigrations = new Migrations<DataModel>((components as any).migrations);

export const run = dataMigrations.runner();

export const backfillSourceItemCountAggregate = dataMigrations.define({
	table: 'source_items',
	batchSize: 250,
	migrateOne: async (ctx, doc) => {
		await trackSourceItemInserted(ctx, doc);
	}
});

export const backfillPostShareAggregate = dataMigrations.define({
	table: 'posts',
	batchSize: 250,
	migrateOne: async (ctx, doc) => {
		if (!doc.sourceId) {
			return;
		}
		await trackPostInserted(ctx, doc);
	}
});

const aggregateBackfillMigrations: Array<any> = [
	(internal as any).migrations.backfillSourceItemCountAggregate,
	(internal as any).migrations.backfillPostShareAggregate
];

export const runAggregateBackfill = dataMigrations.runner(aggregateBackfillMigrations);

export const purgeTableBatch = internalMutation({
	args: {
		tableName: purgeTableNameValidator,
		batchSize: v.optional(v.number())
	},
	returns: v.object({
		deletedCount: v.number(),
		skipped: v.boolean()
	}),
	handler: async (ctx, args) => {
		const batchSize = Math.min(Math.max(Math.trunc(args.batchSize ?? 200), 1), 1000);

		try {
			const page = await (ctx.db.query(args.tableName as never) as any).paginate({
				numItems: batchSize,
				cursor: null
			});

			for (const doc of page.page) {
				await ctx.db.delete(doc._id);
			}

			return {
				deletedCount: page.page.length,
				skipped: false
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (
				message.includes('Unknown table') ||
				message.includes('does not exist') ||
				message.includes('Invalid table')
			) {
				return {
					deletedCount: 0,
					skipped: true
				};
			}

			throw error;
		}
	}
});

export const getAggregateBackfillStatus = internalQuery({
	args: {},
	returns: v.array(migrationStatusValidator),
	handler: async (ctx): Promise<Array<AggregateMigrationStatus>> => {
		return await dataMigrations.getStatus(ctx, {
			migrations: aggregateBackfillMigrations
		});
	}
});

export const runWorkosCutoverReset = action({
	args: {
		confirm: v.boolean(),
		batchSize: v.optional(v.number()),
		runR2Cleanup: v.optional(v.boolean())
	},
	returns: workosCutoverResetResultValidator,
	handler: async (ctx, args) => {
		await requireAdminUser(ctx);
		if (!args.confirm) {
			throw new Error('Refusing destructive reset without confirm=true.');
		}

		const batchSize = Math.min(Math.max(Math.trunc(args.batchSize ?? 200), 1), 1000);
		const purgedTables: Array<{
			tableName: (typeof CUTOVER_RESET_TABLES)[number];
			deletedCount: number;
			skipped: boolean;
		}> = [];

		for (const tableName of CUTOVER_RESET_TABLES) {
			let deletedCount = 0;
			let skipped = false;

			while (true) {
				const batch: { deletedCount: number; skipped: boolean } = await ctx.runMutation(
					(internal as any).migrations.purgeTableBatch,
					{
						tableName,
						batchSize
					}
				);

				deletedCount += batch.deletedCount;
				skipped = skipped || batch.skipped;

				if (batch.skipped || batch.deletedCount === 0) {
					break;
				}
			}

			purgedTables.push({
				tableName,
				deletedCount,
				skipped
			});
		}

		const runR2Cleanup = args.runR2Cleanup ?? true;
		if (runR2Cleanup) {
			await ctx.scheduler.runAfter(0, (internal as any).admin.runR2OrphanSweeper, {
				phase: 'source_items',
				cursor: null,
				sourceItemsScanned: 0,
				sourceItemsMissing: 0,
				postsScanned: 0,
				postsMissing: 0,
				metadataScanned: 0,
				metadataOrphansDeleted: 0
			});
		}

		return {
			purgedTables,
			r2CleanupScheduled: runR2Cleanup
		};
	}
});

export const runBackfillBatch = internalAction({
	args: {
		batchSize: v.optional(v.number()),
		profilesCursor: v.optional(v.union(v.string(), v.null())),
		postsCursor: v.optional(v.union(v.string(), v.null())),
		dmCursor: v.optional(v.union(v.string(), v.null()))
	},
	returns: v.object({
		profiles: backfillStateValidator,
		posts: backfillStateValidator,
		dmParticipants: backfillStateValidator
	}),
	handler: async (
		ctx,
		args
	): Promise<{
		profiles: { processed: number; isDone: boolean; continueCursor: string | null };
		posts: { processed: number; isDone: boolean; continueCursor: string | null };
		dmParticipants: { processed: number; isDone: boolean; continueCursor: string | null };
	}> => {
		const batchSize = Math.min(Math.max(Math.trunc(args.batchSize ?? 200), 1), 1000);

		const profiles: {
			processedProfiles: number;
			isDone: boolean;
			continueCursor: string | null;
		} = await ctx.runMutation(internal.profiles.backfillSearchFields, {
			paginationOpts: {
				numItems: batchSize,
				cursor: args.profilesCursor ?? null
			}
		});
		const posts: {
			processedPosts: number;
			isDone: boolean;
			continueCursor: string | null;
		} = await ctx.runMutation(internal.posts.backfillDerivedPostFields, {
			paginationOpts: {
				numItems: batchSize,
				cursor: args.postsCursor ?? null
			}
		});
		const dmParticipants: {
			processedConversations: number;
			isDone: boolean;
			continueCursor: string | null;
		} = await ctx.runMutation(internal.dm.backfillParticipants, {
			paginationOpts: {
				numItems: batchSize,
				cursor: args.dmCursor ?? null
			}
		});

		return {
			profiles: {
				processed: profiles.processedProfiles,
				isDone: profiles.isDone,
				continueCursor: profiles.continueCursor
			},
			posts: {
				processed: posts.processedPosts,
				isDone: posts.isDone,
				continueCursor: posts.continueCursor
			},
			dmParticipants: {
				processed: dmParticipants.processedConversations,
				isDone: dmParticipants.isDone,
				continueCursor: dmParticipants.continueCursor
			}
		};
	}
});
