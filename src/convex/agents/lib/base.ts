// Base Agent class for all specialized agents - Simplified version
import type { ActionCtx } from '../../_generated/server';
import type {
	AgentConfig,
	AgentSession,
	ToolExecution,
	AgentResult,
	LLMResponse,
	ToolCall
} from '../types';
import type { ToolDefinition } from '../../tools/types';
import { checkToolPermission } from './permissions';
import { api, internal } from '../../_generated/api';
import { chatWithTools, type LLMMessage, type LLMToolDefinition } from '../../lib/llm_client';
import {
	runBeforeMiddleware,
	runAfterMiddleware,
	runErrorMiddleware,
	type ToolMiddlewareContext
} from '../../tools/middleware';

export class BaseAgent {
	protected config: AgentConfig;
	protected tools: Map<string, ToolDefinition>;

	constructor(config: AgentConfig, tools: Map<string, ToolDefinition>) {
		this.config = config;
		this.tools = tools;
	}

	/**
	 * Build OpenAI-compatible tool definitions for the LLM
	 */
	protected buildToolDefinitions(): LLMToolDefinition[] {
		const toolDefs: LLMToolDefinition[] = [];

		for (const [name, tool] of this.tools) {
			toolDefs.push({
				type: 'function',
				function: {
					name: tool.name,
					description: tool.description,
					parameters: tool.parameters
				}
			});
		}

		return toolDefs;
	}

	/**
	 * Execute the agent with a given context and session
	 * @param onUpdate - Optional callback for real-time UI updates
	 */
	async execute(
		ctx: ActionCtx,
		session: AgentSession,
		messages: Array<{ role: string; body?: string; content?: string }>,
		userRole: string,
		onUpdate?: (update: {
			toolExecutions?: ToolExecution[];
			cost?: number;
			status?: string;
		}) => Promise<void>
	): Promise<AgentResult> {
		const toolExecutions: ToolExecution[] = [];
		let totalCost = 0;
		let totalPromptTokens = 0;
		let totalCompletionTokens = 0;
		let step = 0;

		// Convert DB messages to LLM format (body → content)
		const currentMessages: LLMMessage[] = messages.map((m) => ({
			role: m.role as 'user' | 'assistant' | 'system',
			content: m.body || m.content || ''
		}));

		// Add system prompt with agent instructions
		currentMessages.unshift({
			role: 'system',
			content: this.config.instructions
		});

		let finalResponse = '';

		while (step < this.config.maxSteps) {
			// Call LLM with current context
			const response = await this.callLLM(ctx, currentMessages, userRole);

			// Accumulate tokens
			totalPromptTokens += response.tokens.prompt;
			totalCompletionTokens += response.tokens.completion;
			totalCost += response.cost;

			// Check if tool calls are needed
			if (response.toolCalls && response.toolCalls.length > 0) {
				// Execute each tool call
				for (const toolCall of response.toolCalls) {
					// Add "running" tool to executions for real-time display
					const runningTool: ToolExecution = {
						toolName: toolCall.function.name,
						input: JSON.parse(toolCall.function.arguments || '{}'),
						status: 'running',
						startedAt: Date.now()
					};
					toolExecutions.push(runningTool);

					// Update UI immediately to show tool is running
					if (onUpdate) {
						await onUpdate({ toolExecutions: [...toolExecutions], cost: totalCost });
					}

					// Execute the tool
					const toolResult = await this.executeTool(ctx, toolCall, session, userRole);

					// Update the tool execution with result
					const toolIndex = toolExecutions.length - 1;
					toolExecutions[toolIndex] = toolResult;

					// Update UI with completed tool
					if (onUpdate) {
						await onUpdate({ toolExecutions: [...toolExecutions], cost: totalCost });
					}

					// Add tool call and result to messages
					currentMessages.push({
						role: 'assistant',
						content: null,
						tool_calls: [
							{
								id: toolCall.id,
								type: 'function',
								function: {
									name: toolCall.function.name,
									arguments: toolCall.function.arguments
								}
							}
						]
					});
					currentMessages.push({
						role: 'tool',
						tool_call_id: toolCall.id,
						content: JSON.stringify(toolResult.output)
					});
				}
			} else {
				// Final response - no more tool calls
				finalResponse = response.content;
				break;
			}

			step++;
		}

		// If max steps reached, use last message content
		if (step >= this.config.maxSteps && !finalResponse) {
			const lastMessage = currentMessages[currentMessages.length - 1];
			finalResponse =
				typeof lastMessage.content === 'string'
					? lastMessage.content
					: JSON.stringify(lastMessage.content);
		}

		// Final update
		if (onUpdate) {
			await onUpdate({ toolExecutions, cost: totalCost, status: 'agent_complete' });
		}

		return {
			response: finalResponse,
			toolExecutions,
			cost: totalCost,
			tokens: { prompt: totalPromptTokens, completion: totalCompletionTokens }
		};
	}

	/**
	 * Call the LLM using the unified LLM client
	 */
	protected async callLLM(
		ctx: ActionCtx,
		messages: LLMMessage[],
		userRole: string
	): Promise<LLMResponse> {
		// Get admin-configured model for this agent, fallback to agent's default
		const taskName = `agent_${this.config.name}`;
		const modelConfig = await ctx.runQuery(api.tasks.getConfig, { task: taskName });
		const model = modelConfig?.modelId || this.config.model;
		const temperature = modelConfig?.temperature ?? this.config.temperature;

		// Build tools array from agent's available tools
		const tools = this.buildToolDefinitions();

		// Use the unified LLM client
		const response = await chatWithTools(model, messages, tools, {
			temperature,
			toolChoice: tools.length > 0 ? 'auto' : undefined
		});

		// Convert to internal ToolCall format
		const toolCalls: ToolCall[] = response.toolCalls.map((tc) => ({
			id: tc.id,
			function: {
				name: tc.function.name,
				arguments: tc.function.arguments
			}
		}));

		// Calculate cost using dynamic pricing from database
		const cost = await ctx.runQuery(internal.models.calculateCost, {
			modelId: model,
			promptTokens: response.usage.promptTokens,
			completionTokens: response.usage.completionTokens
		});

		return {
			content: response.content,
			toolCalls,
			cost,
			tokens: {
				prompt: response.usage.promptTokens,
				completion: response.usage.completionTokens
			}
		};
	}

	/**
	 * Execute a tool with middleware support
	 */
	protected async executeTool(
		ctx: ActionCtx,
		toolCall: ToolCall,
		session: AgentSession,
		userRole: string
	): Promise<ToolExecution> {
		const toolName = toolCall.function.name;
		const tool = this.tools.get(toolName);
		const startedAt = Date.now();
		const toolInput = JSON.parse(toolCall.function.arguments);

		if (!tool) {
			return {
				toolName,
				input: toolInput,
				output: null,
				status: 'error',
				startedAt,
				completedAt: Date.now(),
				errorMessage: `Unknown tool: ${toolName}`
			};
		}

		// Check tool permissions
		const permission = checkToolPermission(toolName, this.config.name, userRole);
		if (!permission.allowed) {
			return {
				toolName,
				input: toolInput,
				output: null,
				status: 'error',
				startedAt,
				completedAt: Date.now(),
				errorMessage: permission.reason
			};
		}

		// Build middleware context
		const middlewareContext: ToolMiddlewareContext = {
			ctx,
			tool,
			args: toolInput,
			session,
			startedAt,
			metadata: {}
		};

		// Run before middleware
		const beforeResult = await runBeforeMiddleware(middlewareContext);
		if (!beforeResult.continue) {
			return {
				toolName,
				input: toolInput,
				output: null,
				status: 'error',
				startedAt,
				completedAt: Date.now(),
				errorMessage: beforeResult.error || 'Middleware aborted execution'
			};
		}

		// Use potentially modified args from middleware
		const finalArgs = beforeResult.args || toolInput;

		try {
			const output = await tool.handler(ctx, finalArgs, session);
			const completedAt = Date.now();

			// Run after middleware
			await runAfterMiddleware({
				...middlewareContext,
				args: finalArgs,
				metadata: beforeResult.metadata || {},
				result: output,
				executionTimeMs: completedAt - startedAt
			});

			return {
				toolName,
				input: finalArgs,
				output,
				status: 'completed',
				startedAt,
				completedAt
			};
		} catch (error: unknown) {
			const completedAt = Date.now();
			const errorMessage = error instanceof Error ? error.message : String(error);

			// Run error middleware
			await runErrorMiddleware({
				...middlewareContext,
				args: finalArgs,
				metadata: beforeResult.metadata || {},
				error: error instanceof Error ? error : new Error(String(error)),
				executionTimeMs: completedAt - startedAt
			});

			return {
				toolName,
				input: finalArgs,
				output: null,
				status: 'error',
				startedAt,
				completedAt,
				errorMessage
			};
		}
	}

	/**
	 * Get agent name
	 */
	getName(): string {
		return this.config.name;
	}

	/**
	 * Get agent configuration
	 */
	getConfig(): AgentConfig {
		return this.config;
	}
}
