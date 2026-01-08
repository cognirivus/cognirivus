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

		return await ctx.db
			.query('messages')
			.withIndex('by_thread', (q) => q.eq('threadId', threadId))
			.collect();
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
