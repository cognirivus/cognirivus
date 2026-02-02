// LLM-based intent detection and multi-agent orchestration
import type { ActionCtx } from '../_generated/server';
import { api, internal } from '../_generated/api';
import type { IntentDetectionResult } from './types';
import { getAgent } from './registry';
import { getAvailableAgents } from './config';
import { checkAgentPermission } from './lib/permissions';
import { jsonChat } from '../lib/llm_client';

// Default model for intent routing (can be overridden in admin/models)
const DEFAULT_INTENT_MODEL = 'openai/gpt-4o-mini';

/**
 * Detect intent from user query using LLM classification
 */
export async function detectIntent(
	ctx: ActionCtx,
	query: string,
	history: Array<{ role: string; body?: string; content?: string }>,
	userRole: string
): Promise<IntentDetectionResult> {
	// Get available agents for this user's role
	const availableAgents = getAvailableAgents(userRole);
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
		const { data: result } = await jsonChat<{
			agent?: string;
			confidence?: number;
			reasoning?: string;
		}>(model, systemPrompt, userPrompt, {
			temperature,
			maxTokens: 200
		});

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
	messageId: string
): Promise<{ agentWork: AgentWorkResult }> {
	// Get message history
	const messages = await ctx.runQuery(api.messages.list, { threadId: threadId as any });

	// Check permission
	const permission = await checkAgentPermission(ctx, intent.primaryAgent, userRole);
	if (!permission.allowed) {
		throw new Error(`Agent ${intent.primaryAgent} not available: ${permission.reason}`);
	}

	// Get agent and execute
	const agent = getAgent(intent.primaryAgent);
	if (!agent) {
		throw new Error(`Agent ${intent.primaryAgent} not found`);
	}

	// Execute the agent with real-time update callback
	const result = await agent.execute(
		ctx,
		{
			_id: '',
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
		async (update: { toolExecutions?: unknown[]; cost?: number; status?: string }) => {
			const currentMsg = await ctx.runQuery(internal.messages.get, { id: messageId as any });
			const currentAgentWork = (currentMsg?.metadata as Record<string, unknown>)?.agentWork || {};

			await ctx.runMutation(internal.messages.internalUpdate, {
				messageId: messageId as any,
				body: '',
				metadata: {
					...(currentMsg?.metadata || {}),
					status: update.status || 'agent_working',
					agentWork: {
						...(currentAgentWork as Record<string, unknown>),
						toolExecutions:
							update.toolExecutions ||
							(currentAgentWork as Record<string, unknown>).toolExecutions ||
							[],
						cost: update.cost || (currentAgentWork as Record<string, unknown>).cost || 0,
						isStreaming: update.status !== 'agent_complete'
					}
				}
			});
		}
	);

	// Final update with complete agent work
	const agentWork: AgentWorkResult = {
		agentName: intent.primaryAgent,
		agentDisplayName: getAgentDisplayName(intent.primaryAgent),
		intentConfidence: intent.confidence,
		intentReasoning: intent.reasoning,
		toolExecutions: result.toolExecutions,
		agentResponse: result.response,
		cost: result.cost
	};

	// Mark agent work as complete
	await ctx.runMutation(internal.messages.internalUpdate, {
		messageId: messageId as any,
		body: '',
		metadata: {
			status: 'generating',
			agentWork: { ...agentWork, isStreaming: false }
		}
	});

	return { agentWork };
}

// Agent work result for UI display
export interface AgentWorkResult {
	agentName: string;
	agentDisplayName: string;
	intentConfidence: number;
	intentReasoning: string;
	toolExecutions: unknown[];
	agentResponse: string;
	cost: number;
}

export function getAgentDisplayName(agentName: string): string {
	const names: Record<string, string> = {
		chat: 'Chat',
		researcher: 'Researcher',
		'content-creator': 'Content Creator',
		'flashcard-tutor': 'Flashcard Tutor',
		'syllabus-planner': 'Syllabus Planner',
		'memory-curator': 'Memory Curator',
		'system-admin': 'System Admin',
		'data-curator': 'Data Curator',
		'model-tuner': 'Model Tuner'
	};
	return names[agentName] || agentName;
}

export { orchestrateMultiAgent as default };
