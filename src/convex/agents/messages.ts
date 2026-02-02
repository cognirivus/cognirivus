import { query, mutation, internalMutation } from '../_generated/server';
import { v } from 'convex/values';
import { authComponent } from '../auth';

/**
 * Get message history for a thread with pagination support.
 *
 * @param threadId - The thread ID to get history for
 * @param limit - Maximum number of messages to return (default 50)
 * @param before - Optional timestamp to get messages before
 * @returns Array of messages with image URLs
 */
export const getHistory = query({
	args: {
		threadId: v.id('threads'),
		limit: v.optional(v.number()),
		before: v.optional(v.number())
	},
	returns: v.array(
		v.object({
			_id: v.id('messages'),
			body: v.string(),
			reasoning: v.optional(v.string()),
			userId: v.string(),
			threadId: v.id('threads'),
			role: v.union(v.literal('user'), v.literal('assistant')),
			createdAt: v.number(),
			model: v.optional(v.string()),
			usage: v.optional(
				v.object({
					promptTokens: v.number(),
					completionTokens: v.number(),
					totalTokens: v.number()
				})
			),
			isCancelled: v.optional(v.boolean()),
			cost: v.optional(v.number()),
			metadata: v.optional(v.any()),
			imageUrls: v.array(v.string()),
			deletedImageCount: v.number()
		})
	),
	handler: async (ctx, { threadId, limit, before }) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return [];

		const thread = await ctx.db.get(threadId);
		if (!thread || thread.userId !== user._id) {
			return [];
		}

		let queryBuilder = ctx.db
			.query('messages')
			.withIndex('by_thread', (q) => q.eq('threadId', threadId));

		if (before) {
			queryBuilder = queryBuilder.filter((q) => q.lt(q.field('createdAt'), before));
		}

		const messages = await queryBuilder.order('desc').take(limit || 50);

		return Promise.all(
			messages.map(async (msg) => {
				const imageUrls = await Promise.all(
					(msg.images || []).map((storageId) => ctx.storage.getUrl(storageId))
				);
				return {
					...msg,
					imageUrls: imageUrls.filter((url) => url !== null) as string[],
					deletedImageCount: msg.deletedImages?.length || 0
				};
			})
		);
	}
});

/**
 * Save a response from an agent as a message.
 *
 * @param threadId - The thread ID
 * @param body - The response text
 * @param reasoning - Optional reasoning content
 * @param model - Optional model used
 * @param usage - Optional token usage stats
 * @param cost - Optional cost
 * @param metadata - Optional metadata
 * @returns The ID of the created message
 */
export const saveAgentResponse = mutation({
	args: {
		threadId: v.id('threads'),
		body: v.string(),
		reasoning: v.optional(v.string()),
		model: v.optional(v.string()),
		usage: v.optional(
			v.object({
				promptTokens: v.number(),
				completionTokens: v.number(),
				totalTokens: v.number()
			})
		),
		cost: v.optional(v.number()),
		metadata: v.optional(v.any())
	},
	returns: v.id('messages'),
	handler: async (ctx, { threadId, body, reasoning, model, usage, cost, metadata }) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) {
			throw new Error('Not authenticated');
		}

		const thread = await ctx.db.get(threadId);
		if (!thread || thread.userId !== user._id) {
			throw new Error('Thread not found or unauthorized');
		}

		const messageId = await ctx.db.insert('messages', {
			body,
			reasoning,
			userId: user._id,
			threadId,
			role: 'assistant',
			createdAt: Date.now(),
			model,
			usage,
			cost,
			metadata
		});

		await ctx.db.patch(threadId, { updatedAt: Date.now() });

		return messageId;
	}
});

/**
 * Internal mutation to save an agent response.
 *
 * @param threadId - The thread ID
 * @param userId - The user ID
 * @param body - The response text
 * @param reasoning - Optional reasoning content
 * @param model - Optional model used
 * @param usage - Optional token usage stats
 * @param cost - Optional cost
 * @param metadata - Optional metadata
 * @returns The ID of the created message
 */
export const internalSaveAgentResponse = internalMutation({
	args: {
		threadId: v.id('threads'),
		userId: v.string(),
		body: v.string(),
		reasoning: v.optional(v.string()),
		model: v.optional(v.string()),
		usage: v.optional(
			v.object({
				promptTokens: v.number(),
				completionTokens: v.number(),
				totalTokens: v.number()
			})
		),
		cost: v.optional(v.number()),
		metadata: v.optional(v.any())
	},
	returns: v.id('messages'),
	handler: async (ctx, { threadId, userId, body, reasoning, model, usage, cost, metadata }) => {
		const messageId = await ctx.db.insert('messages', {
			body,
			reasoning,
			userId,
			threadId,
			role: 'assistant',
			createdAt: Date.now(),
			model,
			usage,
			cost,
			metadata
		});

		await ctx.db.patch(threadId, { updatedAt: Date.now() });

		return messageId;
	}
});
