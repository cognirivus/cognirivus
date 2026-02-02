import { query, mutation, internalMutation } from '../_generated/server';
import { v } from 'convex/values';
import { authComponent } from '../auth';

/**
 * Create a new tool execution record.
 *
 * @param sessionId - The agent session ID this tool execution belongs to
 * @param toolName - The name of the tool being executed
 * @param input - The input arguments for the tool
 * @returns The ID of the created tool execution
 */
export const create = mutation({
	args: {
		sessionId: v.id('agent_sessions'),
		toolName: v.string(),
		input: v.any()
	},
	returns: v.id('tool_executions'),
	handler: async (ctx, { sessionId, toolName, input }) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) {
			throw new Error('Not authenticated');
		}

		const session = await ctx.db.get(sessionId);
		if (!session || session.userId !== user._id) {
			throw new Error('Session not found or unauthorized');
		}

		const executionId = await ctx.db.insert('tool_executions', {
			sessionId,
			toolName,
			input,
			status: 'running',
			startedAt: Date.now()
		});

		return executionId;
	}
});

/**
 * Mark a tool execution as completed with its output.
 *
 * @param executionId - The tool execution ID
 * @param output - The output from the tool execution
 */
export const complete = mutation({
	args: {
		executionId: v.id('tool_executions'),
		output: v.any()
	},
	returns: v.null(),
	handler: async (ctx, { executionId, output }) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) {
			throw new Error('Not authenticated');
		}

		const execution = await ctx.db.get(executionId);
		if (!execution) {
			throw new Error('Tool execution not found');
		}

		const session = await ctx.db.get(execution.sessionId);
		if (!session || session.userId !== user._id) {
			throw new Error('Session not found or unauthorized');
		}

		await ctx.db.patch(executionId, {
			status: 'completed',
			output,
			completedAt: Date.now()
		});

		return null;
	}
});

/**
 * Mark a tool execution as errored.
 *
 * @param executionId - The tool execution ID
 * @param errorMessage - The error message
 */
export const error = mutation({
	args: {
		executionId: v.id('tool_executions'),
		errorMessage: v.string()
	},
	returns: v.null(),
	handler: async (ctx, { executionId, errorMessage }) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) {
			throw new Error('Not authenticated');
		}

		const execution = await ctx.db.get(executionId);
		if (!execution) {
			throw new Error('Tool execution not found');
		}

		const session = await ctx.db.get(execution.sessionId);
		if (!session || session.userId !== user._id) {
			throw new Error('Session not found or unauthorized');
		}

		await ctx.db.patch(executionId, {
			status: 'error',
			errorMessage,
			completedAt: Date.now()
		});

		return null;
	}
});

/**
 * List all tool executions for a session.
 *
 * @param sessionId - The session ID to list executions for
 * @returns Array of tool executions
 */
export const listBySession = query({
	args: { sessionId: v.id('agent_sessions') },
	returns: v.array(
		v.object({
			_id: v.id('tool_executions'),
			sessionId: v.id('agent_sessions'),
			toolName: v.string(),
			status: v.union(v.literal('running'), v.literal('completed'), v.literal('error')),
			input: v.any(),
			output: v.optional(v.any()),
			startedAt: v.number(),
			completedAt: v.optional(v.number()),
			errorMessage: v.optional(v.string())
		})
	),
	handler: async (ctx, { sessionId }) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return [];

		const session = await ctx.db.get(sessionId);
		if (!session || session.userId !== user._id) {
			return [];
		}

		const executions = await ctx.db
			.query('tool_executions')
			.withIndex('by_session', (q) => q.eq('sessionId', sessionId))
			.collect();

		return executions;
	}
});

/**
 * Internal mutation to create a tool execution.
 *
 * @param sessionId - The session ID
 * @param toolName - The tool name
 * @param input - The tool input
 * @returns The execution ID
 */
export const internalCreate = internalMutation({
	args: {
		sessionId: v.id('agent_sessions'),
		toolName: v.string(),
		input: v.any()
	},
	returns: v.id('tool_executions'),
	handler: async (ctx, { sessionId, toolName, input }) => {
		return await ctx.db.insert('tool_executions', {
			sessionId,
			toolName,
			input,
			status: 'running',
			startedAt: Date.now()
		});
	}
});

/**
 * Internal mutation to complete a tool execution.
 *
 * @param executionId - The execution ID
 * @param output - The output
 */
export const internalComplete = internalMutation({
	args: {
		executionId: v.id('tool_executions'),
		output: v.any()
	},
	returns: v.null(),
	handler: async (ctx, { executionId, output }) => {
		await ctx.db.patch(executionId, {
			status: 'completed',
			output,
			completedAt: Date.now()
		});
		return null;
	}
});

/**
 * Internal mutation to mark a tool execution as errored.
 *
 * @param executionId - The execution ID
 * @param errorMessage - The error message
 */
export const internalSetError = internalMutation({
	args: {
		executionId: v.id('tool_executions'),
		errorMessage: v.string()
	},
	returns: v.null(),
	handler: async (ctx, { executionId, errorMessage }) => {
		await ctx.db.patch(executionId, {
			status: 'error',
			errorMessage,
			completedAt: Date.now()
		});
		return null;
	}
});
