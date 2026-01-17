import { RAG } from '@convex-dev/rag';
import { components } from './_generated/api';
import { openrouter } from '@openrouter/ai-sdk-provider';

/**
 * Centralized RAG Configuration
 * All RAG-related settings in one place for easy maintenance
 */
export const RAG_CONFIG = {
	/** Embedding model used for vectorization */
	model: 'openai/text-embedding-3-small',
	/** Embedding vector dimensions (must match model output) */
	dimension: 1536,
	/** Default namespace for blog content */
	namespace: 'blogs',
	/** Search configuration */
	search: {
		/** Maximum number of results to return */
		limit: 3,
		/** Minimum similarity score (0-1) to include in results */
		scoreThreshold: 0.5,
		/** Include surrounding chunks for better context */
		chunkContext: { before: 1, after: 1 }
	}
} as const;

/**
 * RAG instance configured with OpenRouter embeddings.
 *
 * Note: Type cast is required because @openrouter/ai-sdk-provider uses AI SDK v5 types
 * while @convex-dev/rag expects a compatible but slightly different interface.
 * Both implement the same embedding protocol - this is a known compatibility issue.
 *
 * @see https://github.com/get-convex/rag
 */
export const rag = new RAG(components.rag, {
	textEmbeddingModel: openrouter.textEmbeddingModel(RAG_CONFIG.model) as any,
	embeddingDimension: RAG_CONFIG.dimension
});

/**
 * Type definitions for RAG results used in chat
 */
export interface RagEntry {
	key: string;
	title?: string;
	text: string;
	_score: number;
}

export interface RagUsage {
	tokens: number;
}
