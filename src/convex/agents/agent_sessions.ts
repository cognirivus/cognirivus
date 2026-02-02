import { query, mutation, internalQuery, internalMutation } from '../_generated/server';
import { v } from 'convex/values';
import { authComponent } from '../auth';

/**
 * Create a new agent session.
 *
 * @param threadId - The thread ID this session belongs to
 * @param agentName - The name of the agent running this session
 * @param promptMessageId - The message ID that triggered this session
 * @param parentSessionId - Optional parent session ID for nested sessions
 * @param depth - The depth level in the session hierarchy
 * @returns The ID of the created session
 */
export const create = mutation({
	args: {
		threadId: v.id('threads'),
		agentName: v.string(),
		promptMessageId: v.id('messages'),
		parentSessionId: v.optional(v.id('agent_sessions')),
		depth: v.number()
	},
	returns: v.id('agent_sessions'),
	handler: async (ctx, { threadId, agentName, promptMessageId, parentSessionId, depth }) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) {
			throw new Error('Not authenticated');
		}

		const thread = await ctx.db.get(threadId);
		if (!thread || thread.userId !== user._id) {
			throw new Error('Thread not found or unauthorized');
		}

		const sessionId = await ctx.db.insert('agent_sessions', {
			threadId,
			agentName,
			userId: user._id,
			promptMessageId,
			parentSessionId,
			depth,
			status: 'running',
			startedAt: Date.now()
		});

		return sessionId;
	}
});

/**
 * Mark an agent session as completed.
 *
 * @param sessionId - The session ID to complete
 * @param cost - Optional total cost of the session
 * @param toolCalls - Optional array of tool calls made during the session
 */
export const complete = mutation({
	args: {
		sessionId: v.id('agent_sessions'),
		cost: v.optional(v.number()),
		toolCalls: v.optional(v.array(v.any()))
	},
	returns: v.null(),
	handler: async (ctx, { sessionId, cost, toolCalls }) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) {
			throw new Error('Not authenticated');
		}

		const session = await ctx.db.get(sessionId);
		if (!session || session.userId !== user._id) {
			throw new Error('Session not found or unauthorized');
		}

		const updates: any = {
			status: 'completed',
			completedAt: Date.now()
		};
		if (cost !== undefined) updates.cost = cost;
		if (toolCalls !== undefined) updates.toolCalls = toolCalls;

		await ctx.db.patch(sessionId, updates);
		return null;
	}
});

/**
 * Get the depth of a session.
 *
 * @param sessionId - The session ID to check
 * @returns The depth of the session, or null if not found
 */
export const getDepth = query({
	args: { sessionId: v.id('agent_sessions') },
	returns: v.union(v.number(), v.null()),
	handler: async (ctx, { sessionId }) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return null;

		const session = await ctx.db.get(sessionId);
		if (!session || session.userId !== user._id) {
			return null;
		}

		return session.depth;
	}
});

/**
 * List all sessions for a specific message (the prompt that triggered them).
 *
 * @param promptMessageId - The message ID that triggered the sessions
 * @returns Array of agent sessions
 */
export const listByMessage = query({
	args: { promptMessageId: v.id('messages') },
	returns: v.array(
		v.object({
			_id: v.id('agent_sessions'),
			threadId: v.id('threads'),
			parentSessionId: v.optional(v.id('agent_sessions')),
			agentName: v.string(),
			userId: v.string(),
			promptMessageId: v.id('messages'),
			status: v.union(
				v.literal('idle'),
				v.literal('running'),
				v.literal('completed'),
				v.literal('error')
			),
			depth: v.number(),
			toolCalls: v.optional(v.array(v.any())),
			startedAt: v.number(),
			completedAt: v.optional(v.number()),
			cost: v.optional(v.number()),
			errorMessage: v.optional(v.string())
		})
	),
	handler: async (ctx, { promptMessageId }) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return [];

		const sessions = await ctx.db
			.query('agent_sessions')
			.withIndex('by_prompt_message', (q) => q.eq('promptMessageId', promptMessageId))
			.filter((q) => q.eq(q.field('userId'), user._id))
			.collect();

		return sessions;
	}
});

/**
 * List all sessions for a thread.
 *
 * @param threadId - The thread ID to list sessions for
 * @returns Array of agent sessions
 */
export const listByThread = query({
	args: { threadId: v.id('threads') },
	returns: v.array(
		v.object({
			_id: v.id('agent_sessions'),
			threadId: v.id('threads'),
			parentSessionId: v.optional(v.id('agent_sessions')),
			agentName: v.string(),
			userId: v.string(),
			promptMessageId: v.id('messages'),
			status: v.union(
				v.literal('idle'),
				v.literal('running'),
				v.literal('completed'),
				v.literal('error')
			),
			depth: v.number(),
			toolCalls: v.optional(v.array(v.any())),
			startedAt: v.number(),
			completedAt: v.optional(v.number()),
			cost: v.optional(v.number()),
			errorMessage: v.optional(v.string())
		})
	),
	handler: async (ctx, { threadId }) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return [];

		const thread = await ctx.db.get(threadId);
		if (!thread || thread.userId !== user._id) {
			return [];
		}

		const sessions = await ctx.db
			.query('agent_sessions')
			.withIndex('by_thread', (q) => q.eq('threadId', threadId))
			.collect();

		return sessions;
	}
});

/**
 * Internal mutation to create a new agent session (for backend use).
 *
 * @param threadId - The thread ID
 * @param userId - The user ID
 * @param agentName - The agent name
 * @param promptMessageId - The message ID that triggered this session
 * @param parentSessionId - Optional parent session ID
 * @param depth - The depth level
 * @param status - Initial status
 * @param startedAt - Start timestamp
 * @returns The ID of the created session
 */
export const internalCreate = internalMutation({
	args: {
		threadId: v.id('threads'),
		userId: v.string(),
		agentName: v.string(),
		promptMessageId: v.id('messages'),
		parentSessionId: v.optional(v.id('agent_sessions')),
		depth: v.number(),
		status: v.union(
			v.literal('idle'),
			v.literal('running'),
			v.literal('completed'),
			v.literal('error')
		),
		startedAt: v.number()
	},
	returns: v.id('agent_sessions'),
	handler: async (ctx, args) => {
		const sessionId = await ctx.db.insert('agent_sessions', args);
		return sessionId;
	}
});

/**
 * Internal mutation to mark a session as completed (for backend use).
 *
 * @param sessionId - The session ID to complete
 * @param cost - Optional total cost
 * @param completedAt - Completion timestamp
 */
export const internalComplete = internalMutation({
	args: {
		sessionId: v.id('agent_sessions'),
		cost: v.optional(v.number()),
		completedAt: v.number()
	},
	returns: v.null(),
	handler: async (ctx, { sessionId, cost, completedAt }) => {
		const updates: any = { status: 'completed', completedAt };
		if (cost !== undefined) updates.cost = cost;
		await ctx.db.patch(sessionId, updates);
		return null;
	}
});

/**
 * Internal mutation to mark a session as error.
 *
 * @param sessionId - The session ID
 * @param errorMessage - The error message
 */
export const internalSetError = internalMutation({
	args: {
		sessionId: v.id('agent_sessions'),
		errorMessage: v.string()
	},
	returns: v.null(),
	handler: async (ctx, { sessionId, errorMessage }) => {
		await ctx.db.patch(sessionId, {
			status: 'error',
			errorMessage,
			completedAt: Date.now()
		});
		return null;
	}
});

/**
 * Internal query to get a session by ID.
 *
 * @param sessionId - The session ID
 * @returns The session document or null
 */
export const internalGet = internalQuery({
	args: { sessionId: v.id('agent_sessions') },
	returns: v.union(
		v.object({
			_id: v.id('agent_sessions'),
			threadId: v.id('threads'),
			parentSessionId: v.optional(v.id('agent_sessions')),
			agentName: v.string(),
			userId: v.string(),
			promptMessageId: v.id('messages'),
			status: v.union(
				v.literal('idle'),
				v.literal('running'),
				v.literal('completed'),
				v.literal('error')
			),
			depth: v.number(),
			toolCalls: v.optional(v.array(v.any())),
			startedAt: v.number(),
			completedAt: v.optional(v.number()),
			cost: v.optional(v.number()),
			errorMessage: v.optional(v.string())
		}),
		v.null()
	),
	handler: async (ctx, { sessionId }) => {
		return await ctx.db.get(sessionId);
	}
});
