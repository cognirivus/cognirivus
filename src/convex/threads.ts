import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { authComponent } from './auth';

/**
 * Lists all chat threads for the authenticated user.
 *
 * Threads are returned in descending order of their last update.
 *
 * @returns A list of chat threads belonging to the user.
 */
export const list = query({
	args: {},
	handler: async (ctx) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return [];

		return await ctx.db
			.query('threads')
			.withIndex('by_user', (q) => q.eq('userId', user._id))
			.order('desc')
			.take(100);
	}
});

/**
 * Retrieves a specific chat thread by ID.
 *
 * Verifies that the authenticated user owns the thread.
 *
 * @param id - The unique identifier of the thread.
 * @returns The thread object if found and authorized, otherwise null.
 */
export const get = query({
	args: { id: v.id('threads') },
	handler: async (ctx, { id }) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return null;

		const thread = await ctx.db.get(id);
		if (!thread || thread.userId !== user._id) return null;

		return thread;
	}
});

/**
 * Creates a new chat thread for the authenticated user.
 *
 * @param title - The initial title for the thread.
 * @returns The ID of the newly created thread.
 * @throws {Error} if the user is not authenticated.
 */
export const create = mutation({
	args: { title: v.string() },
	handler: async (ctx, { title }) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		return await ctx.db.insert('threads', {
			title,
			userId: user._id,
			updatedAt: Date.now()
		});
	}
});

/**
 * Deletes a chat thread and all its associated messages.
 *
 * Verifies that the authenticated user owns the thread before deletion.
 *
 * @param id - The unique identifier of the thread to remove.
 * @throws {Error} if the user is not authenticated or the thread is not found/unauthorized.
 */
export const remove = mutation({
	args: { id: v.id('threads') },
	handler: async (ctx, { id }) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		const thread = await ctx.db.get(id);
		if (!thread || thread.userId !== user._id) {
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

/**
 * Renames an existing chat thread.
 *
 * Verifies that the authenticated user owns the thread.
 *
 * @param id - The unique identifier of the thread.
 * @param title - The new title for the thread.
 * @throws {Error} if the user is not authenticated or the thread is not found/unauthorized.
 */
export const rename = mutation({
	args: { id: v.id('threads'), title: v.string() },
	handler: async (ctx, { id, title }) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		const thread = await ctx.db.get(id);
		if (!thread || thread.userId !== user._id) {
			throw new Error('Thread not found or unauthorized');
		}

		await ctx.db.patch(id, { title });
	}
});

/**
 * Optimized query to get thread details and the first page of messages in a single request.
 * Reduces auth latency and database hits during initial chat load.
 */
export const getContext = query({
	args: { id: v.id('threads') },
	handler: async (ctx, { id }) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return null;

		const thread = await ctx.db.get(id);
		if (!thread || thread.userId !== user._id) return null;

		// Fetch last 30 messages
		const messages = await ctx.db
			.query('messages')
			.withIndex('by_thread', (q) => q.eq('threadId', id))
			.order('desc')
			.take(30);

		const messagesWithUrls = await Promise.all(
			messages.reverse().map(async (msg) => {
				const imageUrls = await Promise.all(
					(msg.images || []).map((storageId) => ctx.storage.getUrl(storageId))
				);
				return {
					...msg,
					imageUrls: imageUrls.filter((url) => url !== null) as string[]
				};
			})
		);

		return {
			thread,
			messages: messagesWithUrls
		};
	}
});

/**
 * Deletes ALL chat threads and associated messages for the authenticated user.
 *
 * This is a destructive action that wipes the user's entire conversation history.
 *
 * @throws {Error} if the user is not authenticated.
 */
export const deleteAll = mutation({
	args: {},
	handler: async (ctx) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		// 1. Delete all messages for this user (using by_user index for speed)
		const messages = await ctx.db
			.query('messages')
			.withIndex('by_user', (q) => q.eq('userId', user._id))
			.collect();

		for (const message of messages) {
			await ctx.db.delete(message._id);
		}

		// 2. Delete all threads for this user
		const threads = await ctx.db
			.query('threads')
			.withIndex('by_user', (q) => q.eq('userId', user._id))
			.collect();

		for (const thread of threads) {
			await ctx.db.delete(thread._id);
		}
	}
});
