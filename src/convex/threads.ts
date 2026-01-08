import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';

export const list = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) return [];

		return await ctx.db
			.query('threads')
			.withIndex('by_user', (q) => q.eq('userId', userId))
			.order('desc')
			.collect();
	}
});

export const create = mutation({
	args: { title: v.string() },
	handler: async (ctx, { title }) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) throw new Error('Not authenticated');

		return await ctx.db.insert('threads', {
			title,
			userId,
			updatedAt: Date.now()
		});
	}
});

export const remove = mutation({
	args: { id: v.id('threads') },
	handler: async (ctx, { id }) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) throw new Error('Not authenticated');

		const thread = await ctx.db.get(id);
		if (!thread || thread.userId !== userId) {
			throw new Error('Thread not found or unauthorized');
		}

		// Delete all messages in the thread
		const messages = await ctx.db
			.query('messages')
			.withIndex('by_thread', (q) => q.eq('threadId', id))
			.collect();

		for (const message of messages) {
			await ctx.db.delete(message._id);
		}

		await ctx.db.delete(id);
	}
});

export const rename = mutation({
	args: { id: v.id('threads'), title: v.string() },
	handler: async (ctx, { id, title }) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) throw new Error('Not authenticated');

		const thread = await ctx.db.get(id);
		if (!thread || thread.userId !== userId) {
			throw new Error('Thread not found or unauthorized');
		}

		await ctx.db.patch(id, { title });
	}
});
