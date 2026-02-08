// Agent type definitions for the multi-agent system
import type { Id } from '../_generated/dataModel';

// ============================================================================
// Agent Configuration
// ============================================================================

export interface AgentConfig {
	name: string;
	displayName: string;
	description: string;
	mode: 'primary' | 'subagent';
	model: string;
	temperature: number;
	instructions: string;
	maxSteps: number;
	isEnabled: boolean;
	isAdminOnly: boolean;
	availableTools: string[];
}

// ============================================================================
// Agent Session
// ============================================================================

export type AgentSessionStatus = 'idle' | 'running' | 'completed' | 'error';

export interface AgentSession {
	_id: string;
	threadId: string;
	parentSessionId?: string;
	agentName: string;
	userId: string;
	promptMessageId: string;
	status: AgentSessionStatus;
	depth: number;
	toolCalls?: ToolExecution[];
	startedAt: number;
	completedAt?: number;
	cost?: number;
	errorMessage?: string;
}

// ============================================================================
// LLM Call Tracing
// ============================================================================

export interface TruncatedText {
	text: string;
	originalLength: number;
	truncated: boolean;
}

export interface LLMCallTrace {
	step: number;
	startedAt: number;
	completedAt: number;
	model: string;
	temperature?: number;
	prompt: {
		messageCount: number;
		messages: Array<{ role: string; content: TruncatedText }>;
	};
	response: {
		content: TruncatedText;
		toolCalls?: Array<{ id: string; name: string; arguments: TruncatedText }>;
	};
	tokens: { prompt: number; completion: number };
	cost: number;
}

// ============================================================================
// Tool Execution
// ============================================================================

export type ToolExecutionStatus = 'running' | 'completed' | 'error';

export interface ToolExecution {
	toolName: string;
	input: Record<string, unknown>;
	output?: unknown;
	status: ToolExecutionStatus;
	startedAt: number;
	completedAt?: number;
	errorMessage?: string;
	step?: number;
}

// ============================================================================
// Tool Result (standardized response from tools)
// ============================================================================

export interface ToolResult<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
	metadata?: Record<string, unknown>;
}

// ============================================================================
// Agent Result
// ============================================================================

export interface AgentResult {
	response: string;
	toolExecutions: ToolExecution[];
	llmCalls: LLMCallTrace[];
	cost: number;
	tokens: {
		prompt: number;
		completion: number;
	};
}

// ============================================================================
// Intent Detection
// ============================================================================

export interface IntentDetectionResult {
	primaryAgent: string;
	confidence: number;
	reasoning: string;
	subagents: string[];
}

// ============================================================================
// Message Types
// ============================================================================

export interface MessageUsage {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
}

export interface AgentWorkMetadata {
	agentName: string;
	agentDisplayName: string;
	intentConfidence: number;
	intentReasoning: string;
	toolExecutions: ToolExecution[];
	llmCalls?: LLMCallTrace[];
	agentResponse: string;
	cost: number;
	isStreaming?: boolean;
}

export interface MessageMetadata {
	status?: 'agent_working' | 'generating' | 'streaming' | 'complete' | 'highlighting';
	agentWork?: AgentWorkMetadata;
	usedMemories?: Array<{ _id: string; text: string; _score?: number }>;
	ragResults?: Array<{ key: string; title: string; text: string; _score?: number }>;
	ragError?: string;
	requestPayload?: Record<string, unknown>;
	isGeneratingImage?: boolean;
	imageAspectRatio?: string;
	cancelled?: boolean;
}

export interface MessageDoc {
	_id: string;
	body: string;
	reasoning?: string;
	userId: string;
	threadId: string;
	role: 'user' | 'assistant';
	createdAt: number;
	model?: string;
	usage?: MessageUsage;
	isCancelled?: boolean;
	cost?: number;
	metadata?: MessageMetadata;
	images?: string[];
	deletedImages?: string[];
}

// ============================================================================
// LLM Types (internal to agents)
// ============================================================================

export interface ToolCall {
	id: string;
	function: {
		name: string;
		arguments: string;
	};
}

export interface LLMResponse {
	content: string;
	model: string;
	temperature?: number;
	toolCalls?: ToolCall[];
	cost: number;
	tokens: {
		prompt: number;
		completion: number;
	};
}

// ============================================================================
// Deprecated (kept for backward compatibility)
// ============================================================================

/** @deprecated Use the handler type from ToolDefinition */
export interface ToolConfig {
	name: string;
	description: string;
	handler: (ctx: unknown, args: unknown, session: AgentSession) => Promise<unknown>;
	isAdminOnly: boolean;
}
