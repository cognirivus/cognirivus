/**
 * Type definitions for chat-related data structures
 */

import type { Id } from '../_generated/dataModel';
import type { RagEntry } from '../rag';

/**
 * Memory record returned from memory search
 */
export interface Memory {
	_id: string;
	text: string;
	category?: string;
	_score?: number;
}

/**
 * Chat message for OpenRouter API
 */
export interface OpenRouterMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
}

/**
 * Request body for OpenRouter API
 */
export interface OpenRouterRequestBody {
	model: string;
	messages: OpenRouterMessage[];
	stream: boolean;
	stream_options?: { include_usage: boolean };
	include_reasoning?: boolean;
	modalities?: string[];
	image_config?: { aspect_ratio: string };
}

/**
 * Usage stats from OpenRouter API
 */
export interface OpenRouterUsage {
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
}

/**
 * Generation stats from OpenRouter API
 */
export interface GenerationStats {
	model: string;
	native_tokens_prompt?: number;
	native_tokens_completion?: number;
	usage?: number;
	total_cost?: number;
}

/**
 * Generated image data
 */
export interface GeneratedImage {
	url: string;
	contentType: string;
}

/**
 * Message metadata stored with assistant messages
 */
export interface MessageMetadata {
	status?: 'searching' | 'generating' | 'streaming' | 'completed';
	isGeneratingImage?: boolean;
	imageAspectRatio?: string;
	usedMemories?: Memory[];
	ragResults?: RagEntry[];
	ragError?: string;
	requestPayload?: Record<string, unknown>;
	cancelled?: boolean;
}

/**
 * Context payload for debugging/display
 */
export interface ContextPayload extends OpenRouterRequestBody {
	memorySearchQuery?: string;
	memoryFormulationPayload?: OpenRouterMessage[];
	embeddingModel?: string;
	retrievedMemories?: Memory[];
	ragResults?: RagEntry[];
	ragError?: string;
}
