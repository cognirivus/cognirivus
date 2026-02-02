/**
 * Tool Middleware System
 *
 * Provides hooks for tool execution lifecycle:
 * - beforeExecute: Run before tool execution (validation, rate limiting, logging)
 * - afterExecute: Run after tool execution (logging, metrics, cleanup)
 * - onError: Run when tool execution fails
 *
 * Middleware can be composed and run in order.
 */

import type { ActionCtx } from '../_generated/server';
import type { AgentSession } from '../agents/types';
import type { ToolDefinition, ToolResult } from './types';

// ============================================================================
// Middleware Types
// ============================================================================

export interface ToolMiddlewareContext {
	ctx: ActionCtx;
	tool: ToolDefinition;
	args: Record<string, unknown>;
	session: AgentSession;
	startedAt: number;
	metadata: Record<string, unknown>;
}

export interface ToolMiddlewareResult {
	/** Whether to continue execution (false = abort) */
	continue: boolean;
	/** Modified args (if any) */
	args?: Record<string, unknown>;
	/** Error message if aborting */
	error?: string;
	/** Additional metadata to pass through */
	metadata?: Record<string, unknown>;
}

export interface AfterExecuteContext extends ToolMiddlewareContext {
	result: ToolResult<unknown>;
	executionTimeMs: number;
}

export interface OnErrorContext extends ToolMiddlewareContext {
	error: Error;
	executionTimeMs: number;
}

export type BeforeExecuteMiddleware = (
	context: ToolMiddlewareContext
) => Promise<ToolMiddlewareResult>;

export type AfterExecuteMiddleware = (context: AfterExecuteContext) => Promise<void>;

export type OnErrorMiddleware = (context: OnErrorContext) => Promise<void>;

export interface ToolMiddleware {
	name: string;
	beforeExecute?: BeforeExecuteMiddleware;
	afterExecute?: AfterExecuteMiddleware;
	onError?: OnErrorMiddleware;
}

// ============================================================================
// Middleware Registry
// ============================================================================

const middlewareRegistry: ToolMiddleware[] = [];

/**
 * Register a middleware
 */
export function registerMiddleware(middleware: ToolMiddleware): void {
	middlewareRegistry.push(middleware);
}

/**
 * Get all registered middleware
 */
export function getMiddleware(): ToolMiddleware[] {
	return [...middlewareRegistry];
}

/**
 * Clear all middleware (useful for testing)
 */
export function clearMiddleware(): void {
	middlewareRegistry.length = 0;
}

// ============================================================================
// Middleware Runner
// ============================================================================

/**
 * Run all beforeExecute middleware in order
 * Returns the final result (abort if any middleware returns continue: false)
 */
export async function runBeforeMiddleware(
	context: ToolMiddlewareContext
): Promise<ToolMiddlewareResult> {
	let currentArgs = context.args;
	let currentMetadata = context.metadata;

	for (const middleware of middlewareRegistry) {
		if (!middleware.beforeExecute) continue;

		const result = await middleware.beforeExecute({
			...context,
			args: currentArgs,
			metadata: currentMetadata
		});

		if (!result.continue) {
			return result;
		}

		// Update args and metadata for next middleware
		if (result.args) {
			currentArgs = result.args;
		}
		if (result.metadata) {
			currentMetadata = { ...currentMetadata, ...result.metadata };
		}
	}

	return { continue: true, args: currentArgs, metadata: currentMetadata };
}

/**
 * Run all afterExecute middleware in order
 */
export async function runAfterMiddleware(context: AfterExecuteContext): Promise<void> {
	for (const middleware of middlewareRegistry) {
		if (!middleware.afterExecute) continue;
		await middleware.afterExecute(context);
	}
}

/**
 * Run all onError middleware in order
 */
export async function runErrorMiddleware(context: OnErrorContext): Promise<void> {
	for (const middleware of middlewareRegistry) {
		if (!middleware.onError) continue;
		await middleware.onError(context);
	}
}

// ============================================================================
// Built-in Middleware
// ============================================================================

/**
 * Logging middleware - logs tool execution details
 */
export const loggingMiddleware: ToolMiddleware = {
	name: 'logging',
	beforeExecute: async (context) => {
		console.log(`[Tool] Starting: ${context.tool.name}`, {
			args: context.args,
			agent: context.session.agentName,
			userId: context.session.userId
		});
		return { continue: true };
	},
	afterExecute: async (context) => {
		console.log(`[Tool] Completed: ${context.tool.name}`, {
			success: context.result.success,
			executionTimeMs: context.executionTimeMs,
			agent: context.session.agentName
		});
	},
	onError: async (context) => {
		console.error(`[Tool] Error: ${context.tool.name}`, {
			error: context.error.message,
			executionTimeMs: context.executionTimeMs,
			agent: context.session.agentName
		});
	}
};

/**
 * Validation middleware - validates tool arguments against schema
 */
export const validationMiddleware: ToolMiddleware = {
	name: 'validation',
	beforeExecute: async (context) => {
		const { tool, args } = context;
		const schema = tool.parameters;

		// Check required fields
		if (schema.required) {
			for (const field of schema.required) {
				if (!(field in args) || args[field] === undefined || args[field] === null) {
					return {
						continue: false,
						error: `Missing required field: ${field}`
					};
				}
			}
		}

		// Type validation for each property
		for (const [key, value] of Object.entries(args)) {
			const propSchema = schema.properties[key];
			if (!propSchema) {
				// Skip unknown properties if additionalProperties is not explicitly false
				if (schema.additionalProperties === false) {
					return {
						continue: false,
						error: `Unknown property: ${key}`
					};
				}
				continue;
			}

			// Basic type checking
			const actualType = Array.isArray(value) ? 'array' : typeof value;
			if (propSchema.type !== actualType && value !== null && value !== undefined) {
				return {
					continue: false,
					error: `Invalid type for ${key}: expected ${propSchema.type}, got ${actualType}`
				};
			}

			// Enum validation
			if (propSchema.enum && !propSchema.enum.includes(value as string)) {
				return {
					continue: false,
					error: `Invalid value for ${key}: must be one of ${propSchema.enum.join(', ')}`
				};
			}
		}

		return { continue: true };
	}
};

/**
 * Cost tier middleware - logs cost tier for monitoring
 */
export const costTierMiddleware: ToolMiddleware = {
	name: 'costTier',
	beforeExecute: async (context) => {
		const costTier = context.tool.costTier || 'free';
		return {
			continue: true,
			metadata: { costTier }
		};
	},
	afterExecute: async (context) => {
		const costTier = context.metadata.costTier || 'unknown';
		if (costTier === 'high') {
			console.log(`[CostTier] High-cost tool executed: ${context.tool.name}`, {
				executionTimeMs: context.executionTimeMs,
				userId: context.session.userId
			});
		}
	}
};

/**
 * Rate limiting middleware (in-memory, per-user)
 * Note: For production, use a distributed rate limiter (Redis, etc.)
 */
const rateLimitState = new Map<string, { count: number; windowStart: number }>();

export function createRateLimitMiddleware(options: {
	maxRequests: number;
	windowMs: number;
}): ToolMiddleware {
	return {
		name: 'rateLimit',
		beforeExecute: async (context) => {
			const { maxRequests, windowMs } = options;
			const key = `${context.session.userId}:${context.tool.name}`;
			const now = Date.now();

			const state = rateLimitState.get(key);
			if (!state || now - state.windowStart > windowMs) {
				// New window
				rateLimitState.set(key, { count: 1, windowStart: now });
				return { continue: true };
			}

			if (state.count >= maxRequests) {
				const remainingMs = windowMs - (now - state.windowStart);
				return {
					continue: false,
					error: `Rate limit exceeded for ${context.tool.name}. Try again in ${Math.ceil(remainingMs / 1000)}s.`
				};
			}

			// Increment count
			state.count++;
			return { continue: true };
		}
	};
}

// ============================================================================
// Default Middleware Setup
// ============================================================================

/**
 * Initialize default middleware stack
 * Call this during application startup
 */
export function initializeDefaultMiddleware(): void {
	// Clear any existing middleware
	clearMiddleware();

	// Register default middleware in order
	registerMiddleware(loggingMiddleware);
	registerMiddleware(validationMiddleware);
	registerMiddleware(costTierMiddleware);

	// Rate limiting for high-cost tools (10 requests per minute)
	registerMiddleware(createRateLimitMiddleware({ maxRequests: 10, windowMs: 60000 }));
}
