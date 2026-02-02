// Multi-agent chat generation action
import { action } from './_generated/server';
import { api, internal } from './_generated/api';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { authComponent } from './auth';
import { orchestrateMultiAgent, detectIntent } from './agents/router';
import { getUserRole } from './agents/lib/permissions';

export const generateMultiAgent = action({
	args: {
		threadId: v.id('threads'),
		model: v.optional(v.string()),
		includeReasoning: v.optional(v.boolean()),
		generateImage: v.optional(v.boolean()),
		imageAspectRatio: v.optional(v.string()),
		useMemory: v.optional(v.boolean()),
		useRag: v.optional(v.boolean())
	},
	handler: async (ctx, args): Promise<{ success: boolean; messageId: Id<'messages'> }> => {
		console.log('[MultiAgent] generateMultiAgent called with threadId:', args.threadId);

		// Get authenticated user
		const user = await authComponent.getAuthUser(ctx);
		if (!user) {
			console.log('[MultiAgent] ERROR: User not authenticated');
			throw new Error('Unauthorized: User not authenticated');
		}

		console.log('[MultiAgent] User authenticated:', user._id);
		const userRole = getUserRole(user);
		console.log('[MultiAgent] User role:', userRole);

		// Get messages from thread
		const messages = await ctx.runQuery(api.messages.list, {
			threadId: args.threadId
		});
		console.log('[MultiAgent] Messages in thread:', messages.length);

		// Get last user message
		const lastUserMessage = [...messages].reverse().find((m: any) => m.role === 'user');
		if (!lastUserMessage) {
			console.log('[MultiAgent] ERROR: No user message found');
			throw new Error('No user message found to respond to');
		}
		console.log('[MultiAgent] Last user message:', lastUserMessage.body?.substring(0, 100));

		// Get model config
		const modelConfig = await ctx.runQuery(api.tasks.getConfig, { task: 'multi_agent' });
		const defaultMultiAgentModel = modelConfig?.modelId || 'openai/gpt-oss-120b';
		console.log('[MultiAgent] Using model:', args.model || defaultMultiAgentModel);

		// Create initial assistant message with agent status
		const assistantMessage: Id<'messages'> = await ctx.runMutation(
			internal.messages.internalCreate,
			{
				threadId: args.threadId,
				role: 'assistant',
				body: '',
				userId: user._id,
				metadata: {
					status: 'agent_orchestrating',
					model: args.model || defaultMultiAgentModel
				}
			}
		);
		console.log('[MultiAgent] Created assistant message:', assistantMessage);

		try {
			// Detect intent first
			const intent = await detectIntent(ctx, lastUserMessage.body, messages, userRole);

			// Orchestrate multi-agent execution
			await orchestrateMultiAgent(
				ctx,
				args.threadId,
				user._id,
				lastUserMessage._id,
				lastUserMessage.body,
				userRole,
				intent,
				assistantMessage // Pass message ID for real-time updates
			);

			return { success: true, messageId: assistantMessage };
		} catch (error: any) {
			console.log('[MultiAgent] ERROR in orchestrateMultiAgent:', error.message);
			// Update message with error
			await ctx.runMutation(internal.messages.internalUpdate, {
				messageId: assistantMessage,
				body: `Sorry, I encountered an error: ${error.message}`,
				metadata: {
					status: 'error',
					error: error.message
				}
			});
			throw error;
		}
	}
});
