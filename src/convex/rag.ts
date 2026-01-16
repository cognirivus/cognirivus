import { RAG } from '@convex-dev/rag';
import { components } from './_generated/api';
import { openrouter } from '@openrouter/ai-sdk-provider';

export const rag = new RAG(components.rag, {
	textEmbeddingModel: openrouter.textEmbeddingModel('openai/text-embedding-3-small') as any,
	embeddingDimension: 1536
});
