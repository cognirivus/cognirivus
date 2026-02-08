// LLM-based intent detection and multi-agent orchestration
import type { ActionCtx } from '../_generated/server';
import { api, internal } from '../_generated/api';
import type {
	IntentDetectionResult,
	ToolExecution,
	LLMCallTrace,
	MessageDoc,
	MessageMetadata,
	AgentWorkMetadata
} from './types';
import { getAgent } from './registry';
import { checkAgentPermission } from './lib/permissions';
import { jsonChat } from '../lib/llm_client';
import type { Id } from '../_generated/dataModel';

// Default model for intent routing (can be overridden in admin/models)
const DEFAULT_INTENT_MODEL = 'openai/gpt-4o-mini';

/**
 * Detect intent from user query using LLM classification
 */
export async function detectIntent(
	ctx: ActionCtx,
	query: string,
	history: Array<{ role: string; body?: string; content?: string }>,
	userRole: string,
	userId?: string,
	threadId?: Id<'threads'>
): Promise<IntentDetectionResult> {
	// Get available agents for this user's role
	const availableAgents = await ctx.runQuery(internal.agents.queries.internalListEnabledForRole, {
		userRole
	});
	const agentDescriptions = availableAgents.map((a) => `- ${a.name}: ${a.description}`).join('\n');

	// Build classification prompt
	const systemPrompt = `You are an intent classification system for Cognirivus, an AI learning platform.
Your job is to analyze the user's message and determine which specialized agent should handle it.

Available agents:
${agentDescriptions}

Respond with a JSON object containing:
- "agent": the name of the best-suited agent (exactly as listed above)
- "confidence": a number between 0 and 1 indicating your confidence
- "reasoning": a brief explanation of why this agent was chosen

Important rules:
1. Use "chat" for general conversation, questions, and tasks that don't fit other agents
2. Use "researcher" for deep research, investigation, or comprehensive information gathering
3. Use "content-creator" for writing blogs, articles, or educational content
4. Use "flashcard-tutor" for creating study flashcards or quiz cards
5. Use "syllabus-planner" for creating study plans, curricula, or learning paths
6. Use "memory-curator" when user explicitly asks to remember, save, or note information

Respond ONLY with valid JSON, no markdown or explanation.`;

	const userPrompt = `Classify this user message and determine the best agent to handle it:

"${query}"

${
	history.length > 0
		? `Recent conversation context (last ${Math.min(3, history.length)} messages):
${history
	.slice(-3)
	.map((m) => `${m.role}: ${(m.body || m.content || '').substring(0, 100)}`)
	.join('\n')}`
		: ''
}`;

	try {
		// Get admin-configured model for intent routing
		const modelConfig = await ctx.runQuery(api.tasks.getConfig, { task: 'intent_router' });
		const model = modelConfig?.modelId || DEFAULT_INTENT_MODEL;
		const temperature = modelConfig?.temperature ?? 0.1;

		// Use the unified LLM client for intent classification
		const chatResult = await jsonChat<{
			agent?: string;
			confidence?: number;
			reasoning?: string;
		}>(model, systemPrompt, userPrompt, {
			temperature,
			maxTokens: 200
		}).catch((err) => {
			console.warn('[Router] LLM classification failed, using fallback:', err.message);
			return null;
		});

		if (!chatResult || !chatResult.data) {
			return fallbackToRuleMatch(ctx, query);
		}

		const { data: result, usage, model: actualModel } = chatResult;

		// Log intent detection usage if userId is provided
		if (userId) {
			const cost = await ctx.runQuery(internal.models.calculateCost, {
				modelId: actualModel,
				promptTokens: usage.promptTokens,
				completionTokens: usage.completionTokens
			});

			await ctx.runMutation(internal.usage.logUsage, {
				userId,
				threadId,
				purpose: 'intent_detection',
				model: actualModel,
				promptTokens: usage.promptTokens,
				completionTokens: usage.completionTokens,
				totalTokens: usage.totalTokens,
				cost
			});
		}

		// Validate agent exists and user has access
		const agentName = result.agent || 'chat';
		const validAgent = availableAgents.find((a) => a.name === agentName);

		if (!validAgent) {
			return {
				primaryAgent: 'chat',
				confidence: 0.5,
				reasoning: `Agent "${agentName}" not available, falling back to chat`,
				subagents: []
			};
		}

		return {
			primaryAgent: agentName,
			confidence: Math.min(1, Math.max(0, result.confidence || 0.8)),
			reasoning: result.reasoning || 'LLM classification',
			subagents: []
		};
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error('[Router] Intent detection error:', errorMessage);
		return fallbackToRuleMatch(ctx, query);
	}
}

/**
 * Fallback to DB-driven rule matching if LLM fails.
 * First tries intent_rules from database, then falls back to hardcoded keywords.
 */
async function fallbackToRuleMatch(ctx: ActionCtx, query: string): Promise<IntentDetectionResult> {
	const lowerQuery = query.toLowerCase();

	// First, try DB-driven rules
	try {
		const dbRules = await ctx.runQuery(internal.agents.intent_rules.getActiveRules, {});

		for (const rule of dbRules) {
			// Check if any pattern keyword matches
			const patterns = rule.pattern.toLowerCase().split('|');
			if (patterns.some((pattern) => lowerQuery.includes(pattern.trim()))) {
				return {
					primaryAgent: rule.agentName,
					confidence: rule.confidence,
					reasoning: `DB rule matched: "${rule.pattern}"`,
					subagents: []
				};
			}
		}
	} catch (e) {
		console.warn('[Router] Could not fetch intent rules from DB:', e);
	}

	// Fallback to hardcoded keywords if no DB rules match
	const intentKeywords: Record<string, string[]> = {
		researcher: ['research', 'investigate', 'learn about', 'study', 'deep dive'],
		'content-creator': ['write blog', 'create article', 'draft post', 'content for'],
		'flashcard-tutor': ['flashcard', 'study card', 'quiz me', 'memorize'],
		'syllabus-planner': ['study plan', 'syllabus', 'curriculum', 'learning path'],
		'memory-curator': ['remember', 'save this', 'note this', 'extract memory']
	};

	for (const [agent, keywords] of Object.entries(intentKeywords)) {
		if (keywords.some((kw) => lowerQuery.includes(kw.toLowerCase()))) {
			return {
				primaryAgent: agent,
				confidence: 0.75,
				reasoning: `Keyword fallback: matched "${agent}"`,
				subagents: []
			};
		}
	}

	return {
		primaryAgent: 'chat',
		confidence: 0.5,
		reasoning: 'Fallback: no keyword match, using chat agent',
		subagents: []
	};
}

/**
 * Orchestrate multi-agent execution for a user message
 * Updates message metadata in real-time for streaming UI
 */
export async function orchestrateMultiAgent(
	ctx: ActionCtx,
	threadId: string,
	userId: string,
	userMessageId: string | undefined,
	query: string,
	userRole: string,
	intent: IntentDetectionResult,
	messageId: Id<'messages'>,
	options?: {
		useMemory?: boolean;
		useRag?: boolean;
		useWebSearch?: boolean;
	}
): Promise<{ agentWork: AgentWorkResult; tokens?: { prompt: number; completion: number } }> {
	// Get message history, excluding the current generating message
	const allMessages = await ctx.runQuery(api.messages.list, {
		threadId: threadId as Id<'threads'>
	});
	const messages = allMessages.filter((m) => (m as any)._id !== messageId);

	// Check permission
	const permission = await checkAgentPermission(ctx, intent.primaryAgent, userRole);
	if (!permission.allowed) {
		throw new Error(`Agent ${intent.primaryAgent} not available: ${permission.reason}`);
	}

	// Get agent and execute
	const agent = await getAgent(ctx, intent.primaryAgent);
	if (!agent) {
		throw new Error(`Agent ${intent.primaryAgent} not found`);
	}

	// Create agent session in database
	let sessionId: Id<'agent_sessions'> | undefined;
	try {
		if (userMessageId) {
			sessionId = await ctx.runMutation(internal.agents.agent_sessions.internalCreate, {
				threadId: threadId as Id<'threads'>,
				userId,
				agentName: intent.primaryAgent,
				promptMessageId: userMessageId as Id<'messages'>,
				depth: 0,
				status: 'running',
				startedAt: Date.now()
			});
		}
	} catch (e) {
		console.warn('[Router] Failed to create agent session:', e);
	}

	// Execute the agent with real-time update callback
	let result;
	try {
		result = await agent.execute(
			ctx,
			{
				_id: sessionId || '',
				threadId,
				agentName: intent.primaryAgent,
				userId,
				promptMessageId: userMessageId || '',
				status: 'running',
				depth: 0,
				startedAt: Date.now()
			},
			messages,
			userRole,
			// Callback to update message metadata in real-time
			async (update: {
				toolExecutions?: ToolExecution[];
				llmCalls?: LLMCallTrace[];
				cost?: number;
				status?: string;
			}) => {
				const currentMsg = (await ctx.runQuery(internal.messages.get, {
					id: messageId
				})) as MessageDoc | null;
				if (!currentMsg) {
					console.warn(`[Router] Message ${messageId} not found, skipping real-time update`);
					return;
				}

				const currentAgentWork = currentMsg.metadata?.agentWork || ({} as AgentWorkMetadata);

				await ctx.runMutation(internal.messages.internalUpdate, {
					messageId,
					body: '',
					metadata: {
						...(currentMsg.metadata || {}),
						status: (update.status as any) || 'agent_working',
						agentWork: {
							...currentAgentWork,
							toolExecutions: update.toolExecutions ?? currentAgentWork.toolExecutions ?? [],
							llmCalls: update.llmCalls ?? currentAgentWork.llmCalls ?? [],
							cost: update.cost ?? currentAgentWork.cost ?? 0,
							isStreaming: update.status !== 'agent_complete'
						}
					}
				});
			},
			// Pass session ID and userId for cost tracking
			sessionId,
			userId,
			options
		);

		// Mark session as completed
		if (sessionId) {
			await ctx.runMutation(internal.agents.agent_sessions.internalComplete, {
				sessionId,
				cost: result.cost,
				completedAt: Date.now()
			});
		}
	} catch (error) {
		// Mark session as error
		if (sessionId) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			await ctx.runMutation(internal.agents.agent_sessions.internalSetError, {
				sessionId,
				errorMessage
			});
		}
		throw error;
	}

	// Final update with complete agent work
	const agentWork: AgentWorkResult = {
		agentName: intent.primaryAgent,
		agentDisplayName: agent.getConfig().displayName || intent.primaryAgent,
		intentConfidence: intent.confidence,
		intentReasoning: intent.reasoning,
		toolExecutions: result.toolExecutions,
		llmCalls: result.llmCalls,
		agentResponse: result.response,
		cost: result.cost
	};

	// Mark agent work as complete
	const checkMsg = await ctx.runQuery(internal.messages.get, { id: messageId });
	if (checkMsg) {
		await ctx.runMutation(internal.messages.internalUpdate, {
			messageId,
			body: '',
			metadata: {
				...(checkMsg.metadata || {}),
				status: 'generating',
				agentWork: { ...agentWork, isStreaming: false }
			}
		});
	}

	return {
		agentWork,
		tokens: result.tokens
			? { prompt: result.tokens.prompt, completion: result.tokens.completion }
			: undefined
	};
}

// Agent work result for UI display
export interface AgentWorkResult {
	agentName: string;
	agentDisplayName: string;
	intentConfidence: number;
	intentReasoning: string;
	toolExecutions: ToolExecution[];
	llmCalls: LLMCallTrace[];
	agentResponse: string;
	cost: number;
}

export async function getAgentDisplayName(ctx: ActionCtx, agentName: string): Promise<string> {
	const agent = await ctx.runQuery(internal.agents.queries.internalGetConfigByName, {
		name: agentName
	});
	return agent?.displayName || agentName;
}

export { orchestrateMultiAgent as default };
