import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalAction } from './_generated/server';

const backfillStateValidator = v.object({
	isDone: v.boolean(),
	continueCursor: v.union(v.string(), v.null()),
	processed: v.number()
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
