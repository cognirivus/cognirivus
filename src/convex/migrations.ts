import { v } from 'convex/values';
import { Migrations } from '@convex-dev/migrations';
import { components, internal } from './_generated/api';
import type { DataModel } from './_generated/dataModel';
import { internalAction, internalQuery } from './_generated/server';
import { trackPostInserted, trackSourceItemInserted } from './lib/aggregates';

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

export const getAggregateBackfillStatus = internalQuery({
	args: {},
	returns: v.array(migrationStatusValidator),
	handler: async (ctx): Promise<Array<AggregateMigrationStatus>> => {
		return await dataMigrations.getStatus(ctx, {
			migrations: aggregateBackfillMigrations
		});
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
