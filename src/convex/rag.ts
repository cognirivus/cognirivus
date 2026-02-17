/* eslint-disable @typescript-eslint/no-explicit-any */
import { RAG } from '@convex-dev/rag';
import { api, components } from './_generated/api';
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
	/** Namespace for MCQ similarity search */
	mcqNamespace: 'mcqs',
	/** Search configuration */
	search: {
		/** Maximum number of results to return */
		limit: 3,
		/** Minimum similarity score (0-1) to include in results */
		scoreThreshold: 0.5,
		/** Include surrounding chunks for better context */
		chunkContext: { before: 1, after: 1 },
		/** MCQ similarity defaults */
		mcq: {
			limit: 5,
			scoreThreshold: 0.55,
			chunkContext: { before: 0, after: 0 }
		}
	}
} as const;

/**
 * Create a RAG client for a specific embedding model/dimension pair.
 *
 * Note: Type cast is required because @openrouter/ai-sdk-provider uses AI SDK v5 types
 * while @convex-dev/rag expects a compatible but slightly different interface.
 * Both implement the same embedding protocol - this is a known compatibility issue.
 *
 * @see https://github.com/get-convex/rag
 */
export function createRag(modelId: string, dimension: number) {
	return new RAG(components.rag, {
		// Request target dimensions at the provider layer for models that support
		// Matryoshka / custom-sized embeddings.
		textEmbeddingModel: openrouter.textEmbeddingModel(modelId, {
			extraBody: { dimensions: dimension }
		} as any) as any,
		embeddingDimension: dimension
	});
}

/**
 * Resolve runtime RAG embedding settings from admin task config.
 *
 * Uses `task_configs.rag_embeddings` when available, falling back to defaults.
 * For now, we support optional dimension override via `maxTokens` in that task config.
 */
export async function getRagEmbeddingSettings(ctx: any): Promise<{
	modelId: string;
	dimension: number;
}> {
	const config = await ctx.runQuery(api.tasks.getConfig, { task: 'rag_embeddings' });
	const modelId = config?.modelId || RAG_CONFIG.model;
	const configuredDimension =
		typeof config?.maxTokens === 'number' && config.maxTokens > 0
			? Math.trunc(config.maxTokens)
			: RAG_CONFIG.dimension;

	return { modelId, dimension: configuredDimension };
}

/**
 * Build a runtime-configured RAG client.
 */
export async function getConfiguredRag(ctx: any) {
	const settings = await getRagEmbeddingSettings(ctx);
	return {
		...settings,
		rag: createRag(settings.modelId, settings.dimension)
	};
}

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
