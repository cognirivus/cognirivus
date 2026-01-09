import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';

export const list = query({
	args: { threadId: v.id('threads') },
	handler: async (ctx, { threadId }) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) return [];

		// Verify user owns this thread
		const thread = await ctx.db.get(threadId);
		if (!thread || thread.userId !== userId) return [];

		const messages = await ctx.db
			.query('messages')
			.withIndex('by_thread', (q) => q.eq('threadId', threadId))
			.collect();

		return Promise.all(
			messages.map(async (msg) => {
				const imageUrls = await Promise.all(
					(msg.images || []).map((storageId) => ctx.storage.getUrl(storageId))
				);
				return { ...msg, imageUrls: imageUrls.filter((url) => url !== null) as string[] };
			})
		);
	}
});

export const send = mutation({
	args: {
		body: v.string(),
		reasoning: v.optional(v.string()),
		threadId: v.id('threads'),
		role: v.union(v.literal('user'), v.literal('assistant'))
	},
	handler: async (ctx, { body, reasoning, threadId, role }) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) {
			throw new Error('Not authenticated');
		}

		// Verify user owns this thread
		const thread = await ctx.db.get(threadId);
		if (!thread || thread.userId !== userId) {
			throw new Error('Thread not found or unauthorized');
		}

		await ctx.db.insert('messages', {
			body,
			reasoning,
			userId,
			threadId,
			role,
			createdAt: Date.now()
		});

		await ctx.db.patch(threadId, { updatedAt: Date.now() });
	}
});

import { internalMutation } from './_generated/server';

export const internalCreate = internalMutation({
	args: {
		body: v.string(),
		reasoning: v.optional(v.string()),
		userId: v.id('users'),
		threadId: v.id('threads'),
		role: v.union(v.literal('user'), v.literal('assistant')),
		model: v.optional(v.string()),
		metadata: v.optional(v.any())
	},
	handler: async (ctx, args) => {
		const id = await ctx.db.insert('messages', {
			...args,
			createdAt: Date.now()
		});
		await ctx.db.patch(args.threadId, { updatedAt: Date.now() });
		return id;
	}
});

export const internalUpdate = internalMutation({
	args: {
		messageId: v.id('messages'),
		body: v.string(),
		usage: v.optional(
			v.object({
				promptTokens: v.number(),
				completionTokens: v.number(),
				totalTokens: v.number()
			})
		),
		cost: v.optional(v.number()),
		metadata: v.optional(v.any()),
		reasoning: v.optional(v.string()),
		isCancelled: v.optional(v.boolean()),
		images: v.optional(v.array(v.id('_storage')))
	},
	handler: async (
		ctx,
		{ messageId, body, usage, cost, metadata, reasoning, isCancelled, images }
	) => {
		const updates: any = { body };
		if (usage) updates.usage = usage;
		if (cost !== undefined) updates.cost = cost;
		if (metadata) updates.metadata = metadata;
		if (reasoning !== undefined) updates.reasoning = reasoning;
		if (isCancelled !== undefined) updates.isCancelled = isCancelled;
		if (images !== undefined) updates.images = images;
		await ctx.db.patch(messageId, updates);
	}
});

export const cancel = mutation({
	args: { messageId: v.id('messages') },
	handler: async (ctx, { messageId }) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new Error('Unauthorized');
		const message = await ctx.db.get(messageId);
		if (!message || message.userId !== userId) return;

		// Move signal to a separate table to avoid OptimisticConcurrencyControlFailure
		const existing = await ctx.db
			.query('cancellations')
			.withIndex('by_message', (q) => q.eq('messageId', messageId))
			.unique();

		if (!existing) {
			await ctx.db.insert('cancellations', { messageId });
		}
	}
});

export const checkCancelled = query({
	args: { messageId: v.id('messages') },
	handler: async (ctx, { messageId }) => {
		const cancellation = await ctx.db
			.query('cancellations')
			.withIndex('by_message', (q) => q.eq('messageId', messageId))
			.unique();
		return !!cancellation;
	}
});

export const internalCleanupCancellation = internalMutation({
	args: { messageId: v.id('messages') },
	handler: async (ctx, { messageId }) => {
		const cancellation = await ctx.db
			.query('cancellations')
			.withIndex('by_message', (q) => q.eq('messageId', messageId))
			.unique();
		if (cancellation) {
			await ctx.db.delete(cancellation._id);
		}
	}
});
