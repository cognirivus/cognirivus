// Tool type definitions
import type { ActionCtx } from '../_generated/server';
import type { AgentSession, ToolResult } from '../agents/types';

// ============================================================================
// JSON Schema Types (for tool parameters)
// ============================================================================

export interface JSONSchemaProperty {
	type: 'string' | 'number' | 'boolean' | 'array' | 'object';
	description?: string;
	enum?: string[];
	items?: JSONSchemaProperty;
	properties?: Record<string, JSONSchemaProperty>;
	required?: string[];
	default?: unknown;
	[key: string]: unknown; // Allow additional properties for flexibility
}

export interface JSONSchema {
	type: 'object';
	properties: Record<string, JSONSchemaProperty>;
	required?: string[];
	additionalProperties?: boolean;
	[key: string]: unknown; // Index signature for Record compatibility
}

// ============================================================================
// Tool Definition
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ToolDefinition<TInput = any, TOutput = unknown> {
	/** Unique tool name (used in tool calls) */
	name: string;

	/** Human-readable description for the LLM */
	description: string;

	/** JSON Schema for parameters */
	parameters: JSONSchema;

	/** Tool execution handler */
	handler: (ctx: ActionCtx, args: TInput, session: AgentSession) => Promise<ToolResult<TOutput>>;

	/** Whether this tool is restricted to admin users */
	isAdminOnly: boolean;

	/** Whether this tool requires explicit user approval before execution */
	requiresApproval?: boolean;

	/** Category for grouping tools in the UI */
	category?: 'search' | 'content' | 'memory' | 'system' | 'admin';

	/** Estimated cost tier for the tool */
	costTier?: 'free' | 'low' | 'medium' | 'high';
}

// ============================================================================
// Tool Execution Types
// ============================================================================

export interface ToolCallRequest {
	name: string;
	arguments: Record<string, unknown>;
}

export interface ToolCallResult {
	success: boolean;
	result?: unknown;
	error?: string;
	executionTimeMs: number;
}

// ============================================================================
// Tool Registry Types
// ============================================================================

export interface ToolRegistryEntry {
	tool: ToolDefinition;
	registeredAt: number;
}

// ============================================================================
// Re-export ToolResult for convenience
// ============================================================================

export type { ToolResult } from '../agents/types';

// ============================================================================
// Helper function to create tool results
// ============================================================================

export function createToolResult<T>(success: boolean, data?: T, error?: string): ToolResult<T> {
	return { success, data, error };
}

export function successResult<T>(data: T): ToolResult<T> {
	return { success: true, data };
}

export function errorResult(error: string): ToolResult<never> {
	return { success: false, error };
}
