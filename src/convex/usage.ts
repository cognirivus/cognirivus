import { internalMutation } from './_generated/server';
import { v } from 'convex/values';

/**
 * Internal mutation to log AI usage and cost.
 *
 * Stores a record in the `usage_logs` table for tracking tokens, models, and estimated costs.
 * Used for analytics dashboard showing costs by user, agent, purpose, etc.
 *
 * @param userId - ID of the user.
 * @param threadId - Optional. ID of the chat thread.
 * @param messageId - Optional. ID of the associated chat message.
 * @param agentSessionId - Optional. ID of the agent session for agent-related calls.
 * @param agentName - Optional. Name of the agent making the call.
 * @param purpose - The reason for the generation (e.g., 'chat', 'intent_detection', 'agent_llm').
 * @param model - The AI model used.
 * @param promptTokens - Number of input tokens.
 * @param completionTokens - Number of output tokens.
 * @param totalTokens - Total tokens consumed.
 * @param cost - Optional. Estimated cost of the generation.
 * @param raw_response - Optional. The raw response object from the provider for debugging/logging.
 */
export const logUsage = internalMutation({
	args: {
		userId: v.string(),
		threadId: v.optional(v.id('threads')),
		messageId: v.optional(v.id('messages')),
		agentSessionId: v.optional(v.id('agent_sessions')),
		agentName: v.optional(v.string()),
		purpose: v.string(),
		model: v.string(),
		promptTokens: v.number(),
		completionTokens: v.number(),
		totalTokens: v.number(),
		cost: v.optional(v.number()),
		raw_response: v.optional(v.any())
	},
	handler: async (ctx, args) => {
		await ctx.db.insert('usage_logs', {
			...args,
			createdAt: Date.now()
		});
	}
});
