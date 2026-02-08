/**
 * Unified OpenRouter LLM Client
 *
 * Single source of truth for all OpenRouter API calls.
 * Provides retry logic, error handling, and consistent configuration.
 */

// ============================================================================
// Types
// ============================================================================

export interface LLMMessage {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string | null;
	tool_calls?: LLMToolCall[];
	tool_call_id?: string;
}

export interface LLMToolCall {
	id: string;
	type?: 'function';
	function: {
		name: string;
		arguments: string;
	};
}

export interface LLMToolDefinition {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
}

export interface LLMRequestOptions {
	model: string;
	messages: LLMMessage[];
	temperature?: number;
	maxTokens?: number;
	stream?: boolean;
	tools?: LLMToolDefinition[];
	toolChoice?: 'auto' | 'none' | 'required';
	responseFormat?: { type: 'json_object' | 'text' };
	includeReasoning?: boolean;
	plugins?: Array<Record<string, unknown>>;
	webSearchOptions?: { search_context_size: 'low' | 'medium' | 'high' };
}

export interface LLMResponse {
	content: string;
	reasoning?: string;
	toolCalls: LLMToolCall[];
	annotations?: Array<Record<string, unknown>>;
	usage: {
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
	};
	generationId: string | null;
	model: string;
}

export interface EmbeddingResult {
	embedding: number[];
	generationId: string | null;
}

export interface LLMError extends Error {
	status?: number;
	code?: string;
	isRetryable: boolean;
}

// ============================================================================
// Configuration
// ============================================================================

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_HEADERS = {
	'Content-Type': 'application/json',
	'HTTP-Referer': 'https://cognirivus.vercel.app',
	'X-Title': 'Cognirivus Chat'
};

const RETRY_CONFIG = {
	maxRetries: 3,
	baseDelayMs: 1000,
	maxDelayMs: 10000
};

// ============================================================================
// Helpers
// ============================================================================

function getApiKey(): string {
	const key = process.env.OPENROUTER_API_KEY;
	if (!key) {
		throw createLLMError('OPENROUTER_API_KEY not configured', 500, 'CONFIG_ERROR', false);
	}
	return key;
}

function createLLMError(
	message: string,
	status?: number,
	code?: string,
	isRetryable = false
): LLMError {
	const error = new Error(message) as LLMError;
	error.status = status;
	error.code = code;
	error.isRetryable = isRetryable;
	return error;
}

function isRetryableError(status: number): boolean {
	// Retry on rate limits (429) and server errors (5xx)
	return status === 429 || (status >= 500 && status < 600);
}

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
	url: string,
	options: RequestInit,
	config = RETRY_CONFIG
): Promise<Response> {
	let lastError: Error | null = null;

	for (let attempt = 0; attempt < config.maxRetries; attempt++) {
		try {
			const response = await fetch(url, options);

			if (response.ok) {
				return response;
			}

			// Check if error is retryable
			if (!isRetryableError(response.status)) {
				const errorBody = await response.text().catch(() => 'Unknown error');
				throw createLLMError(
					`OpenRouter API error: ${response.status} ${response.statusText} - ${errorBody}`,
					response.status,
					'API_ERROR',
					false
				);
			}

			// Retryable error - calculate backoff
			const delay = Math.min(config.baseDelayMs * Math.pow(2, attempt), config.maxDelayMs);
			console.warn(
				`[LLM Client] Request failed with ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${config.maxRetries})`
			);
			await sleep(delay);
			lastError = createLLMError(
				`OpenRouter API error: ${response.status}`,
				response.status,
				'RETRY_EXHAUSTED',
				true
			);
		} catch (error) {
			if ((error as LLMError).isRetryable === false) {
				throw error;
			}
			lastError = error as Error;
			const delay = Math.min(config.baseDelayMs * Math.pow(2, attempt), config.maxDelayMs);
			console.warn(
				`[LLM Client] Network error, retrying in ${delay}ms (attempt ${attempt + 1}/${config.maxRetries}):`,
				(error as Error).message
			);
			await sleep(delay);
		}
	}

	throw lastError || createLLMError('Request failed after retries', 500, 'RETRY_EXHAUSTED', false);
}

// ============================================================================
// Core API Functions
// ============================================================================

/**
 * Make a chat completion request to OpenRouter.
 *
 * @param options - Request configuration
 * @returns LLM response with content, tool calls, and usage
 */
export async function chatCompletion(options: LLMRequestOptions): Promise<LLMResponse> {
	const apiKey = getApiKey();

	const requestBody: Record<string, unknown> = {
		model: options.model,
		messages: options.messages,
		stream: options.stream ?? false
	};

	if (options.temperature !== undefined) {
		requestBody.temperature = options.temperature;
	}
	if (options.maxTokens !== undefined) {
		requestBody.max_tokens = options.maxTokens;
	}
	if (options.tools && options.tools.length > 0) {
		requestBody.tools = options.tools;
		requestBody.tool_choice = options.toolChoice ?? 'auto';
	}
	if (options.plugins && options.plugins.length > 0) {
		requestBody.plugins = options.plugins;
	}
	if (options.webSearchOptions) {
		requestBody.web_search_options = options.webSearchOptions;
	}
	if (options.responseFormat) {
		requestBody.response_format = options.responseFormat;
	}
	if (options.includeReasoning) {
		requestBody.include_reasoning = true;
	}

	const response = await fetchWithRetry(`${OPENROUTER_API_URL}/chat/completions`, {
		method: 'POST',
		headers: {
			...DEFAULT_HEADERS,
			Authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify(requestBody)
	});

	const data = await response.json();
	const generationId = response.headers.get('x-openrouter-id') || data.id || null;
	const choice = data.choices?.[0];

	// Extract tool calls
	const toolCalls: LLMToolCall[] = [];
	if (choice?.message?.tool_calls) {
		for (const tc of choice.message.tool_calls) {
			toolCalls.push({
				id: tc.id,
				type: 'function',
				function: {
					name: tc.function.name,
					arguments: tc.function.arguments
				}
			});
		}
	}

	const annotations: Array<Record<string, unknown>> = choice?.message?.annotations || [];

	return {
		content: choice?.message?.content || '',
		reasoning: choice?.message?.reasoning || choice?.message?.reasoning_content,
		toolCalls,
		annotations,
		usage: {
			promptTokens: data.usage?.prompt_tokens || 0,
			completionTokens: data.usage?.completion_tokens || 0,
			totalTokens: data.usage?.total_tokens || 0
		},
		generationId,
		model: data.model || options.model
	};
}

/**
 * Generate embeddings for text using OpenRouter.
 *
 * @param text - Text to embed
 * @param model - Embedding model (defaults to qwen/qwen3-embedding-8b)
 * @returns Embedding vector and generation ID
 */
export async function createEmbedding(
	text: string,
	model = 'qwen/qwen3-embedding-8b'
): Promise<EmbeddingResult> {
	const apiKey = getApiKey();

	const response = await fetchWithRetry(`${OPENROUTER_API_URL}/embeddings`, {
		method: 'POST',
		headers: {
			...DEFAULT_HEADERS,
			Authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			model,
			input: text
		})
	});

	const data = await response.json();
	const generationId = response.headers.get('x-openrouter-id') || data.id || null;

	if (!data.data?.[0]?.embedding) {
		throw createLLMError('Invalid embedding response', 500, 'INVALID_RESPONSE', false);
	}

	return {
		embedding: data.data[0].embedding,
		generationId
	};
}

/**
 * Generation statistics from OpenRouter API
 */
export interface GenerationStats {
	id: string;
	model: string;
	usage?: number;
	total_cost?: number;
	native_tokens_prompt?: number;
	native_tokens_completion?: number;
	tokens_prompt?: number;
	tokens_completion?: number;
	[key: string]: unknown;
}

/**
 * Fetch generation statistics from OpenRouter.
 * Includes retry logic with exponential backoff for data availability delays.
 *
 * @param generationId - The ID of the generation to fetch stats for
 * @param retries - Number of times to retry (default 3)
 * @returns Generation statistics or null if not found
 */
export async function getGenerationStats(
	generationId: string | null,
	retries = 3
): Promise<GenerationStats | null> {
	if (!generationId) return null;

	const apiKey = getApiKey();

	for (let i = 0; i < retries; i++) {
		try {
			// Exponential backoff starting at 1s
			const waitTime = 1000 * Math.pow(2, i);
			await sleep(waitTime);

			const response = await fetch(`${OPENROUTER_API_URL}/generation?id=${generationId}`, {
				headers: {
					Authorization: `Bearer ${apiKey}`
				}
			});

			if (response.ok) {
				const genData = await response.json();
				if (genData.data) return genData.data;
			}
		} catch (e) {
			console.error(`[LLM Client] Attempt ${i + 1} to fetch stats for ${generationId} failed:`, e);
		}
	}

	return null;
}

// ============================================================================
// Convenience Functions for Common Tasks
// ============================================================================

/**
 * Simple chat completion without tools.
 * Convenience wrapper for basic text generation.
 */
export async function simpleChat(
	model: string,
	systemPrompt: string,
	userMessage: string,
	options?: {
		temperature?: number;
		maxTokens?: number;
		responseFormat?: { type: 'json_object' | 'text' };
	}
): Promise<{ content: string; generationId: string | null }> {
	const response = await chatCompletion({
		model,
		messages: [
			{ role: 'system', content: systemPrompt },
			{ role: 'user', content: userMessage }
		],
		temperature: options?.temperature,
		maxTokens: options?.maxTokens,
		responseFormat: options?.responseFormat
	});

	return {
		content: response.content,
		generationId: response.generationId
	};
}

/**
 * JSON completion with automatic parsing.
 * Returns the parsed JSON object along with usage data for cost tracking.
 */
export async function jsonChat<T = unknown>(
	model: string,
	systemPrompt: string,
	userMessage: string,
	options?: {
		temperature?: number;
		maxTokens?: number;
	}
): Promise<{
	data: T;
	generationId: string | null;
	usage: {
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
	};
	model: string;
}> {
	const response = await chatCompletion({
		model,
		messages: [
			{ role: 'system', content: systemPrompt },
			{ role: 'user', content: userMessage }
		],
		temperature: options?.temperature,
		maxTokens: options?.maxTokens,
		responseFormat: { type: 'json_object' }
	});

	try {
		const data = JSON.parse(response.content) as T;
		return {
			data,
			generationId: response.generationId,
			usage: response.usage,
			model: response.model
		};
	} catch (e) {
		throw createLLMError(
			`Failed to parse JSON response: ${response.content.substring(0, 200)}`,
			500,
			'JSON_PARSE_ERROR',
			false
		);
	}
}

/**
 * Chat completion with tool calling.
 * Executes a single round of tool calls.
 */
export async function chatWithTools(
	model: string,
	messages: LLMMessage[],
	tools: LLMToolDefinition[],
	options?: {
		temperature?: number;
		maxTokens?: number;
		toolChoice?: 'auto' | 'none' | 'required';
	}
): Promise<LLMResponse> {
	return chatCompletion({
		model,
		messages,
		tools,
		toolChoice: options?.toolChoice,
		temperature: options?.temperature,
		maxTokens: options?.maxTokens
	});
}

// ============================================================================
// Streaming Support (for future use)
// ============================================================================

export interface StreamCallbacks {
	onContent?: (content: string) => void;
	onReasoning?: (reasoning: string) => void;
	onToolCall?: (toolCall: LLMToolCall) => void;
	onUsage?: (usage: LLMResponse['usage']) => void;
	onError?: (error: Error) => void;
}

/**
 * Stream a chat completion.
 * Returns a reader that can be used for manual stream processing,
 * or use callbacks for automatic handling.
 */
export async function streamChatCompletion(
	options: LLMRequestOptions,
	callbacks?: StreamCallbacks
): Promise<{
	response: Response;
	generationId: string | null;
}> {
	const apiKey = getApiKey();

	const requestBody: Record<string, unknown> = {
		model: options.model,
		messages: options.messages,
		stream: true,
		stream_options: { include_usage: true }
	};

	if (options.temperature !== undefined) {
		requestBody.temperature = options.temperature;
	}
	if (options.maxTokens !== undefined) {
		requestBody.max_tokens = options.maxTokens;
	}
	if (options.tools && options.tools.length > 0) {
		requestBody.tools = options.tools;
		requestBody.tool_choice = options.toolChoice ?? 'auto';
	}
	if (options.plugins && options.plugins.length > 0) {
		requestBody.plugins = options.plugins;
	}
	if (options.webSearchOptions) {
		requestBody.web_search_options = options.webSearchOptions;
	}
	if (options.includeReasoning) {
		requestBody.include_reasoning = true;
	}

	const response = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
		method: 'POST',
		headers: {
			...DEFAULT_HEADERS,
			Authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify(requestBody)
	});

	if (!response.ok) {
		const errorBody = await response.text().catch(() => 'Unknown error');
		throw createLLMError(
			`OpenRouter API error: ${response.status} - ${errorBody}`,
			response.status,
			'API_ERROR',
			isRetryableError(response.status)
		);
	}

	const generationId = response.headers.get('x-openrouter-id') || null;

	return { response, generationId };
}
