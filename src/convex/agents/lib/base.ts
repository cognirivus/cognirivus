// Base Agent class for all specialized agents - Simplified version
import type { ActionCtx } from '../../_generated/server';
import type {
	AgentConfig,
	AgentSession,
	ToolExecution,
	AgentResult,
	LLMResponse,
	LLMCallTrace,
	ToolCall,
	TruncatedText,
	ToolResult
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
import type { Id } from '../../_generated/dataModel';

const MAX_TRACE_MESSAGES = 24;
const MAX_SYSTEM_MESSAGE_CHARS = 500;
const MAX_CHARS_PER_MSG = 1200;
const MAX_TOOL_ARGUMENT_CHARS = 1000;
const MAX_RESPONSE_CHARS = 6000;

function safeStringify(value: unknown): string {
	if (typeof value === 'string') return value;
	if (value === null || value === undefined) return '';

	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

function truncateText(text: string, maxChars: number): TruncatedText {
	const originalLength = text.length;
	if (originalLength <= maxChars) {
		return { text, originalLength, truncated: false };
	}

	return {
		text: `${text.slice(0, maxChars)}\n...(truncated)`,
		originalLength,
		truncated: true
	};
}

function summarizeMessages(
	messages: LLMMessage[]
): Array<{ role: string; content: TruncatedText }> {
	const recentMessages = messages.slice(-MAX_TRACE_MESSAGES);

	return recentMessages.map((message) => {
		const maxChars = message.role === 'system' ? MAX_SYSTEM_MESSAGE_CHARS : MAX_CHARS_PER_MSG;
		let text = safeStringify(message.content);

		// ENHANCEMENT: Make tool calls clearer in the trace summary
		if (message.role === 'assistant' && !text && message.tool_calls) {
			text = `(Tool Call: ${message.tool_calls.map((tc) => tc.function.name).join(', ')})`;
		} else if (message.role === 'tool' && text.length > 500) {
			// Don't overwhelm the trace UI with massive tool outputs
			text = `${text.substring(0, 500)}\n...(truncated for trace)`;
		}

		return {
			role: message.role,
			content: truncateText(text, maxChars)
		};
	});
}

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
	protected buildToolDefinitions(options?: {
		useRag?: boolean;
		useWebSearch?: boolean;
	}): LLMToolDefinition[] {
		const toolDefs: LLMToolDefinition[] = [];

		for (const [name, tool] of this.tools) {
			// Skip search tools if disabled via options
			if (options?.useWebSearch === false && name === 'webSearch') continue;
			if (options?.useRag === false && name === 'searchBlogs') continue;

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
	 * @param sessionId - Optional session ID for cost tracking
	 * @param userId - Optional user ID for cost tracking
	 */
	async execute(
		ctx: ActionCtx,
		session: AgentSession,
		messages: Array<{ role: string; body?: string; content?: string }>,
		userRole: string,
		onUpdate?: (update: {
			toolExecutions?: ToolExecution[];
			llmCalls?: LLMCallTrace[];
			cost?: number;
			status?: string;
			agentResponse?: string;
		}) => Promise<void>,
		sessionId?: Id<'agent_sessions'>,
		userId?: string,
		options?: {
			useMemory?: boolean;
			useRag?: boolean;
			useWebSearch?: boolean;
		}
	): Promise<AgentResult> {
		const toolExecutions: ToolExecution[] = [];
		const llmCalls: LLMCallTrace[] = [];
		let totalCost = 0;
		let totalPromptTokens = 0;
		let totalCompletionTokens = 0;
		let step = 0;
		const toolCallCounts: Record<string, number> = {};

		// Convert DB messages to LLM format (body -> content)
		const currentMessages: LLMMessage[] = messages.map((m) => ({
			role: m.role as 'user' | 'assistant' | 'system',
			content: m.body || m.content || ''
		}));

		// Add system prompt with agent instructions
		let instructions = this.config.instructions;

		// Add dynamic instructions based on options
		if (options) {
			if (options.useWebSearch === false) {
				instructions += `\n\nCRITICAL: Web search is currently DISABLED. Do not attempt to use the webSearch tool. Rely on searchBlogs or your internal knowledge for older facts.`;
			} else if (options.useWebSearch === true) {
				instructions += `\n\nCRITICAL: Web search is ENABLED. You MUST use the webSearch tool for any query requiring real-time info, current events, or facts outside your training data. 
IMPORTANT: You are limited to EXACTLY ONE web search attempt per turn. Make your query comprehensive. If you need more info after one search, rely on your internal knowledge or inform the user.`;
			}

			if (options.useRag === false) {
				instructions += `\n\nCRITICAL: Knowledge base search is currently DISABLED. Do not attempt to use the searchBlogs tool.`;
			} else if (options.useRag === true) {
				instructions += `\n\nCRITICAL: Knowledge base search is ENABLED. Use the searchBlogs tool to look up platform-specific information.`;
			}
		}

		currentMessages.unshift({
			role: 'system',
			content: instructions
		});

		// Extract the last user query for semantic highlighting of tool results
		const lastUserQuery =
			messages
				.slice()
				.reverse()
				.find((m) => m.role === 'user')?.body ||
			messages
				.slice()
				.reverse()
				.find((m) => m.role === 'user')?.content ||
			'';

		let finalResponse = '';

		while (step < this.config.maxSteps) {
			const llmStartedAt = Date.now();

			let accumulatedContent = '';
			let lastUpdateTime = 0;
			const UPDATE_THROTTLE_MS = 250; // Throttle DB updates to 4 per second

			const response = await this.callLLM(
				ctx,
				currentMessages,
				userRole,
				sessionId,
				userId,
				options,
				async (chunk) => {
					accumulatedContent += chunk;
					const now = Date.now();

					// Throttle updates to avoid overloading the DB
					if (now - lastUpdateTime > UPDATE_THROTTLE_MS && onUpdate) {
						lastUpdateTime = now;
						await onUpdate({
							toolExecutions: [...toolExecutions],
							llmCalls: [...llmCalls],
							cost: totalCost, // Approximate cost until final
							agentResponse: accumulatedContent
						});
					}
				}
			);
			const llmCompletedAt = Date.now();

			llmCalls.push({
				step,
				startedAt: llmStartedAt,
				completedAt: llmCompletedAt,
				model: response.model,
				temperature: response.temperature,
				prompt: {
					messageCount: currentMessages.length,
					messages: summarizeMessages(currentMessages)
				},
				response: {
					content: truncateText(response.content || '', MAX_RESPONSE_CHARS),
					toolCalls: response.toolCalls?.map((toolCall) => ({
						id: toolCall.id,
						name: toolCall.function.name,
						arguments: truncateText(toolCall.function.arguments || '', MAX_TOOL_ARGUMENT_CHARS)
					}))
				},
				tokens: response.tokens,
				cost: response.cost
			});

			totalPromptTokens += response.tokens.prompt;
			totalCompletionTokens += response.tokens.completion;
			totalCost += response.cost;

			if (onUpdate) {
				await onUpdate({
					toolExecutions: [...toolExecutions],
					llmCalls: [...llmCalls],
					cost: totalCost
				});
			}

			if (response.toolCalls && response.toolCalls.length > 0) {
				// Execute each tool call
				for (const toolCall of response.toolCalls) {
					const toolName = toolCall.function.name;

					// Strict limit for expensive tools: webSearch is limited to 1 call per turn
					if (toolName === 'webSearch' && (toolCallCounts[toolName] || 0) >= 1) {
						console.warn(`[Agent] Blocking redundant ${toolName} call (limit: 1)`);

						const errorOutput = {
							success: false,
							error:
								'Web search limit reached (1 call per turn). Please use the information already gathered or your internal knowledge.'
						};

						// Add to executions for visibility
						toolExecutions.push({
							toolName,
							input: JSON.parse(toolCall.function.arguments || '{}'),
							status: 'error',
							startedAt: Date.now(),
							completedAt: Date.now(),
							errorMessage: 'Web search limit reached',
							output: errorOutput,
							step
						});

						// Add tool call and result to messages so the LLM knows
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
							content: JSON.stringify(errorOutput)
						});

						// Update UI immediately to show the error
						if (onUpdate) {
							await onUpdate({
								toolExecutions: [...toolExecutions],
								llmCalls: [...llmCalls],
								cost: totalCost
							});
						}

						continue;
					}

					toolCallCounts[toolName] = (toolCallCounts[toolName] || 0) + 1;

					// Add "running" tool to executions for real-time display
					const runningTool: ToolExecution = {
						toolName,
						input: JSON.parse(toolCall.function.arguments || '{}'),
						status: 'running',
						startedAt: Date.now(),
						step
					};
					toolExecutions.push(runningTool);

					// Update UI immediately to show tool is running
					if (onUpdate) {
						await onUpdate({
							toolExecutions: [...toolExecutions],
							llmCalls: [...llmCalls],
							cost: totalCost
						});
					}

					const toolResult = await this.executeTool(
						ctx,
						toolCall,
						session,
						userRole,
						lastUserQuery
					);

					const toolIndex = toolExecutions.length - 1;
					toolExecutions[toolIndex] = { ...toolResult, step };

					if (onUpdate) {
						await onUpdate({
							toolExecutions: [...toolExecutions],
							llmCalls: [...llmCalls],
							cost: totalCost
						});
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
			await onUpdate({ toolExecutions, llmCalls, cost: totalCost, status: 'agent_complete' });
		}

		return {
			response: finalResponse,
			toolExecutions,
			llmCalls,
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
		userRole: string,
		sessionId?: Id<'agent_sessions'>,
		userId?: string,
		options?: {
			useRag?: boolean;
			useWebSearch?: boolean;
		},
		onStream?: (chunk: string) => Promise<void>
	): Promise<LLMResponse> {
		// Map agent names to admin task config names
		// This allows agents to use the model configured in /admin/models
		const AGENT_TO_TASK_MAP: Record<string, string> = {
			chat: 'chat_primary',
			researcher: 'multi_agent',
			'content-creator': 'multi_agent',
			'flashcard-tutor': 'flashcards',
			'syllabus-planner': 'multi_agent',
			'memory-curator': 'memory_extraction'
		};

		// Get admin-configured model for this agent, fallback to agent's default
		const taskName = AGENT_TO_TASK_MAP[this.config.name] || `agent_${this.config.name}`;
		const modelConfig = await ctx.runQuery(api.tasks.getConfig, { task: taskName });
		const model = modelConfig?.modelId || this.config.model;
		const temperature = modelConfig?.temperature ?? this.config.temperature;

		// Build tools array from agent's available tools
		const tools = this.buildToolDefinitions(options);

		console.log(
			`[Agent:${this.config.name}] Calling LLM with ${tools.length} tools. WebSearch enabled: ${options?.useWebSearch !== false}`
		);

		// Use streaming if callback is provided
		let response;
		if (onStream) {
			const { streamChatCompletion, processStream } = await import('../../lib/llm_client');
			const { response: streamResponse } = await streamChatCompletion({
				model,
				messages,
				tools,
				temperature,
				toolChoice: tools.length > 0 ? 'auto' : undefined
			});

			response = await processStream(streamResponse, {
				onContent: onStream
			});
		} else {
			const { chatWithTools } = await import('../../lib/llm_client');
			response = await chatWithTools(model, messages, tools, {
				temperature,
				toolChoice: tools.length > 0 ? 'auto' : undefined
			});
		}

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

		// Log agent LLM usage if userId is provided
		if (userId) {
			await ctx.runMutation(internal.usage.logUsage, {
				userId,
				agentSessionId: sessionId,
				agentName: this.config.name,
				purpose: 'agent_llm',
				model,
				promptTokens: response.usage.promptTokens,
				completionTokens: response.usage.completionTokens,
				totalTokens: response.usage.totalTokens,
				cost
			});
		}

		return {
			content: response.content,
			model,
			temperature,
			toolCalls,
			cost,
			tokens: {
				prompt: response.usage.promptTokens,
				completion: response.usage.completionTokens
			}
		};
	}

	/**
	 * Execute a tool with middleware support and semantic highlighting
	 */
	protected async executeTool(
		ctx: ActionCtx,
		toolCall: ToolCall,
		session: AgentSession,
		userRole: string,
		userQuery?: string
	): Promise<ToolExecution> {
		const toolName = toolCall.function.name;
		const tool = this.tools.get(toolName);
		const startedAt = Date.now();
		const toolInput = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;

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
