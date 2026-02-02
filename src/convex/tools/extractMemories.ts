// Tool: extractMemories - Extract memories from text
import type { ToolDefinition } from './types';
import { internal, api } from '../_generated/api';
import { extractMemories, createEmbedding, getGenerationStats } from '../lib/openrouter';

export const extractMemoriesTool: ToolDefinition = {
	name: 'extractMemories',
	description:
		'Extract and store memories from text content. Identifies key facts, preferences, and important information about the user. Use this when the user asks you to remember something or save information about themselves.',
	parameters: {
		type: 'object',
		properties: {
			text: {
				type: 'string',
				description: 'The text content to extract memories from'
			}
		},
		required: ['text']
	},
	handler: async (ctx, args, session) => {
		const userId = session.userId;

		// 1. Extract memories using AI
		const modelConfig = await ctx.runQuery(api.tasks.getConfig, { task: 'memory_extraction' });
		const { memories: extracted, generationId } = await extractMemories(
			args.text,
			modelConfig?.modelId
		);

		// Log extraction usage
		const stats = await getGenerationStats(generationId);
		if (stats) {
			await ctx.runMutation(internal.usage.logUsage, {
				userId,
				purpose: 'memory_extraction',
				model: stats.model,
				promptTokens: stats.native_tokens_prompt ?? 0,
				completionTokens: stats.native_tokens_completion ?? 0,
				totalTokens: (stats.native_tokens_prompt ?? 0) + (stats.native_tokens_completion ?? 0),
				cost: stats.usage ?? stats.total_cost ?? 0,
				raw_response: stats
			});
		}

		if (extracted.length === 0) {
			return {
				success: true,
				data: {
					message: 'No memorable facts found in the provided text.',
					extractedMemories: []
				}
			};
		}

		// 2. Process and store each memory
		const embedConfig = await ctx.runQuery(api.tasks.getConfig, { task: 'embeddings' });
		const savedMemories: { text: string; category: string }[] = [];

		for (const memory of extracted) {
			try {
				// Generate embedding
				const { embedding, generationId: embedGenId } = await createEmbedding(
					memory.text,
					embedConfig?.modelId
				);

				// Log embedding usage
				const embedStats = await getGenerationStats(embedGenId);
				if (embedStats) {
					await ctx.runMutation(internal.usage.logUsage, {
						userId,
						purpose: 'embedding',
						model: embedStats.model,
						promptTokens: embedStats.native_tokens_prompt ?? 0,
						completionTokens: embedStats.native_tokens_completion ?? 0,
						totalTokens:
							(embedStats.native_tokens_prompt ?? 0) + (embedStats.native_tokens_completion ?? 0),
						cost: embedStats.usage ?? embedStats.total_cost ?? 0,
						raw_response: embedStats
					});
				}

				// Check for duplicates via vector search
				const matches = await ctx.vectorSearch('user_memories', 'by_embedding', {
					vector: embedding,
					limit: 1,
					filter: (q) => q.eq('userId', userId)
				});

				const topMatch = matches[0];
				let shouldSave = true;

				if (topMatch && topMatch._score >= 0.95) {
					// Too similar - skip as duplicate
					shouldSave = false;
				}

				if (shouldSave) {
					// Save the memory
					await ctx.runMutation(internal.memories.internalAddMemory, {
						userId,
						text: memory.text,
						category: memory.category,
						embedding
					});
					savedMemories.push(memory);
				}
			} catch (e) {
				console.error(`Failed to process memory: "${memory.text}"`, e);
			}
		}

		return {
			success: true,
			data: {
				message:
					savedMemories.length > 0
						? `Successfully saved ${savedMemories.length} memory(ies).`
						: 'All extracted facts were already known.',
				extractedMemories: savedMemories
			}
		};
	},
	isAdminOnly: false
};
