import { v } from 'convex/values';
import {
	internalMutation,
	action,
	mutation,
	query,
	internalQuery,
	internalAction
} from './_generated/server';
import { internal, api } from './_generated/api';
import {
	createEmbedding,
	extractMemories,
	formulateStandaloneQuery,
	judgeMemoryDuplicate,
	getGenerationStats
} from './lib/openrouter';
import { authComponent } from './auth';

/**
 * Internal mutation to store a single user memory.
 *
 * @param userId - The ID of the user the memory belongs to.
 * @param text - The text content of the memory.
 * @param category - Optional. The category of the memory (e.g., 'preference', 'fact').
 * @param embedding - The vector embedding of the memory text.
 * @param messageId - Optional. The ID of the message this memory was extracted from.
 */
export const internalAddMemory = internalMutation({
	args: {
		userId: v.string(),
		text: v.string(),
		category: v.optional(v.string()),
		embedding: v.array(v.number()),
		messageId: v.optional(v.id('messages'))
	},
	handler: async (ctx, args) => {
		await ctx.db.insert('user_memories', {
			userId: args.userId,
			text: args.text,
			category: args.category,
			embedding: args.embedding,
			messageId: args.messageId,
			createdAt: Date.now()
		});
	}
});

/**
 * Internal mutation to remove a memory by ID.
 *
 * @param id - The unique identifier of the memory to delete.
 */
export const internalRemove = internalMutation({
	args: { id: v.id('user_memories') },
	handler: async (ctx, args) => {
		await ctx.db.delete(args.id);
	}
});

/**
 * Main action to process a message and extract/store memories.
 *
 * This is designed to be "fire and forget" from the main chat flow.
 * It extracts potential memories, generates embeddings, performs vector search
 * for deduplication, and stores new or updated memories.
 *
 * @param userId - The ID of the user.
 * @param messageId - The ID of the message to process.
 * @param messageText - The text of the message.
 */
export const addMemory = internalAction({
	args: {
		userId: v.string(),
		messageId: v.id('messages'),
		messageText: v.string()
	},
	handler: async (ctx, args) => {
		// 1. Extract potential memories
		const modelConfig = await ctx.runQuery(api.tasks.getConfig, { task: 'memory_extraction' });
		const { memories: extracted, generationId } = await extractMemories(
			args.messageText,
			modelConfig?.modelId
		);

		// Log extraction usage
		const stats = await getGenerationStats(generationId);
		if (stats) {
			await ctx.runMutation(internal.usage.logUsage, {
				userId: args.userId,
				messageId: args.messageId,
				purpose: 'memory_extraction',
				model: stats.model,
				promptTokens: stats.native_tokens_prompt ?? 0,
				completionTokens: stats.native_tokens_completion ?? 0,
				totalTokens: (stats.native_tokens_prompt ?? 0) + (stats.native_tokens_completion ?? 0),
				cost: stats.usage ?? stats.total_cost ?? 0,
				raw_response: stats
			});
		}

		if (extracted.length === 0) return;

		const newlyLearned: { text: string; category: string }[] = [];

		const embedConfig = await ctx.runQuery(api.tasks.getConfig, { task: 'embeddings' });
		const judgeConfig = await ctx.runQuery(api.tasks.getConfig, { task: 'memory_judge' });

		// Process memories in parallel to avoid long sequential waits for stats
		await Promise.all(
			extracted.map(async (memory) => {
				try {
					const { embedding, generationId: embedGenId } = await createEmbedding(
						memory.text,
						embedConfig?.modelId
					);

					// Log embedding usage
					const embedStats = await getGenerationStats(embedGenId);
					if (embedStats) {
						await ctx.runMutation(internal.usage.logUsage, {
							userId: args.userId,
							messageId: args.messageId,
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

					// Stage 1: Fast Vector Search
					const matches = await ctx.vectorSearch('user_memories', 'by_embedding', {
						vector: embedding,
						limit: 1,
						filter: (q) => q.eq('userId', args.userId)
					});

					const topMatch = matches[0];
					let decision: 'duplicate' | 'update' | 'new' = 'new';
					let existingIdToReplace = null;

					if (topMatch) {
						if (topMatch._score >= 0.98) {
							decision = 'duplicate';
						} else if (topMatch._score < 0.6) {
							decision = 'new';
						} else {
							// Stage 2: AI Judge
							const [existingDoc] = await ctx.runQuery(internal.memories.internalGetGetMemories, {
								ids: [topMatch._id]
							});

							if (existingDoc) {
								const judgeResult = await judgeMemoryDuplicate(memory.text, existingDoc.text);
								decision = judgeResult.decision;

								// Log judge usage
								const judgeStats = await getGenerationStats(judgeResult.generationId);
								if (judgeStats) {
									await ctx.runMutation(internal.usage.logUsage, {
										userId: args.userId,
										messageId: args.messageId,
										purpose: 'dedupe_judge',
										model: judgeStats.model,
										promptTokens: judgeStats.native_tokens_prompt ?? 0,
										completionTokens: judgeStats.native_tokens_completion ?? 0,
										totalTokens:
											(judgeStats.native_tokens_prompt ?? 0) +
											(judgeStats.native_tokens_completion ?? 0),
										cost: judgeStats.usage ?? judgeStats.total_cost ?? 0,
										raw_response: judgeStats
									});
								}

								if (decision === 'update') existingIdToReplace = topMatch._id;
							}
						}
					}

					if (decision === 'new' || decision === 'update') {
						await ctx.runMutation(internal.memories.internalAddMemory, {
							userId: args.userId,
							text: memory.text,
							category: memory.category,
							embedding,
							messageId: args.messageId
						});
						newlyLearned.push(memory);

						if (decision === 'update' && existingIdToReplace) {
							await ctx.runMutation(internal.memories.internalRemove, { id: existingIdToReplace });
						}
					}
				} catch (e) {
					console.error(`Failed to process memory: "${memory.text}"`, e);
				}
			})
		);

		// 3. Update message metadata to notify UI
		if (args.messageId && newlyLearned.length > 0) {
			await ctx.runMutation(internal.messages.internalAppendMemories, {
				messageId: args.messageId,
				memories: newlyLearned.map((m) => ({ text: m.text, category: m.category }))
			});
		}
	}
});

/**
 * Internal action to perform a vector search for memories.
 *
 * @param userId - The ID of the user.
 * @param queryEmbedding - The vector embedding of the search query.
 * @param limit - Optional. The maximum number of results to return (default 5).
 * @returns A list of vector search results (IDs and scores).
 */
export const internalSearch = action({
	args: {
		userId: v.string(),
		queryEmbedding: v.array(v.number()),
		limit: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		// Vector search
		const results = await ctx.vectorSearch('user_memories', 'by_embedding', {
			vector: args.queryEmbedding,
			limit: args.limit || 5,
			filter: (q) => q.eq('userId', args.userId)
		});

		return results;
	}
});

/**
 * Internal action to search memories based on text.
 *
 * Generates an embedding for the text and performs a vector search.
 * Returns the full documents with their similarity scores.
 *
 * @param userId - The ID of the user.
 * @param queryText - The text to search for.
 * @param limit - Optional. The maximum number of results to return.
 * @returns A list of memories with their similarity scores.
 */
export const searchMemories = internalAction({
	args: {
		userId: v.string(),
		queryText: v.string(),
		limit: v.optional(v.number())
	},
	handler: async (ctx, args): Promise<any[]> => {
		const embedConfig = await ctx.runQuery(api.tasks.getConfig, { task: 'embeddings' });
		const { embedding, generationId } = await createEmbedding(args.queryText, embedConfig?.modelId);

		// Log embedding usage for search
		const stats = await getGenerationStats(generationId);
		if (stats) {
			await ctx.runMutation(internal.usage.logUsage, {
				userId: args.userId,
				purpose: 'embedding',
				model: stats.model,
				promptTokens: stats.native_tokens_prompt ?? 0,
				completionTokens: stats.native_tokens_completion ?? 0,
				totalTokens: (stats.native_tokens_prompt ?? 0) + (stats.native_tokens_completion ?? 0),
				cost: stats.usage ?? stats.total_cost ?? 0,
				raw_response: stats
			});
		}

		const results = await ctx.vectorSearch('user_memories', 'by_embedding', {
			vector: embedding,
			limit: args.limit || 5,
			filter: (q) => q.eq('userId', args.userId)
		});

		if (results.length === 0) return [];

		// Fetch the actual memory text
		const memoryIds = results.map((r) => r._id);
		const memories = await ctx.runQuery(internal.memories.internalGetGetMemories, {
			ids: memoryIds
		});

		// Merge scores with memories
		return memories.map((mem: any) => {
			const result = results.find((r) => r._id === mem._id);
			return {
				...mem,
				_score: result?._score ?? 0
			};
		});
	}
});

/**
 * Internal query to fetch multiple memory documents by their IDs.
 *
 * @param ids - An array of memory IDs to fetch.
 * @returns A list of memory documents.
 */
export const internalGetGetMemories = internalQuery({
	args: { ids: v.array(v.id('user_memories')) },
	handler: async (ctx, args) => {
		const docs = [];
		for (const id of args.ids) {
			const doc = await ctx.db.get(id);
			if (doc) docs.push(doc);
		}
		return docs;
	}
});

/**
 * Lists all memories for the authenticated user.
 *
 * Used for the Memory Manager UI. Returns memories sorted by creation date (newest first)
 * and omits the heavy embedding vector.
 *
 * @returns A list of user memories.
 */
export const list = query({
	args: {},
	handler: async (ctx) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return [];

		const memories = await ctx.db
			.query('user_memories')
			.withIndex('by_user', (q) => q.eq('userId', user._id))
			.collect();

		// Sort by createdAt descending and omit embedding for frontend
		return memories
			.sort((a, b) => b.createdAt - a.createdAt)
			.map((m) => ({
				_id: m._id,
				text: m.text,
				category: m.category,
				createdAt: m.createdAt
			}));
	}
});

/**
 * Removes a memory by ID for the authenticated user.
 *
 * Verifies that the user owns the memory before deletion.
 *
 * @param id - The ID of the memory to remove.
 * @throws {Error} if the user is not authenticated or the memory belongs to another user.
 */
export const remove = mutation({
	args: { id: v.id('user_memories') },
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Unauthorized');

		const memory = await ctx.db.get(args.id);
		if (!memory || memory.userId !== user._id) {
			throw new Error('Memory not found or access denied');
		}

		await ctx.db.delete(args.id);
	}
});

/**
 * Formulates a standalone search query from a conversation history.
 *
 * Used to resolve references like "it" or "that" using previous context.
 *
 * @param userId - The ID of the user.
 * @param messages - The conversation history.
 * @returns A standalone query string.
 */
export const formulateQuery = internalAction({
	args: {
		userId: v.string(),
		messages: v.array(
			v.object({
				role: v.string(),
				content: v.string()
			})
		)
	},
	handler: async (ctx, { userId, messages }): Promise<string> => {
		const queryConfig = await ctx.runQuery(api.tasks.getConfig, { task: 'standalone_query' });
		const { result, generationId } = await formulateStandaloneQuery(messages, queryConfig?.modelId);

		// Log standalone query usage
		const stats = await getGenerationStats(generationId);
		if (stats) {
			await ctx.runMutation(internal.usage.logUsage, {
				userId,
				purpose: 'standalone_query',
				model: stats.model,
				promptTokens: stats.native_tokens_prompt ?? 0,
				completionTokens: stats.native_tokens_completion ?? 0,
				totalTokens: (stats.native_tokens_prompt ?? 0) + (stats.native_tokens_completion ?? 0),
				cost: stats.usage ?? stats.total_cost ?? 0,
				raw_response: stats
			});
		}

		return result;
	}
});

/**
 * Orchestrator action to get enriched context for AI generation.
 *
 * 1. Formulates a standalone search query from history.
 * 2. Searches for relevant user memories using that query.
 * 3. Returns the formulated query, memories, and rewriter input metadata.
 *
 * @param userId - The ID of the user.
 * @param history - Recent conversation history.
 * @param limit - Optional. Maximum number of memories to retrieve.
 * @returns Enriched context including memories and the formulated query.
 */
export const getEnrichedContext = internalAction({
	args: {
		userId: v.string(),
		history: v.array(
			v.object({
				role: v.string(),
				content: v.string()
			})
		),
		limit: v.optional(v.number())
	},
	handler: async (
		ctx,
		{ userId, history, limit }
	): Promise<{
		formulatedQuery: string;
		relevantMemories: any[];
		rewriterInput: any[];
	}> => {
		// 1. Prepare Rewriter Input
		const systemMessage = {
			role: 'system',
			content: `Given the following conversation history and a follow-up user message, rephrase the follow-up message into a standalone search query that contains all necessary context from the conversation. 
The standalone query will be used for semantic search in a memory database.
Return ONLY the rephrased query text. If the message is already standalone, return it as is.`
		};
		const rewriterInput = [systemMessage, ...history];

		// 2. Formulate standalone query
		const queryConfig = await ctx.runQuery(api.tasks.getConfig, { task: 'standalone_query' });
		const { result: formulatedQuery, generationId } = await formulateStandaloneQuery(
			history,
			queryConfig?.modelId
		);

		// Log standalone query usage
		const stats = await getGenerationStats(generationId);
		if (stats) {
			await ctx.runMutation(internal.usage.logUsage, {
				userId,
				purpose: 'standalone_query',
				model: stats.model,
				promptTokens: stats.native_tokens_prompt ?? 0,
				completionTokens: stats.native_tokens_completion ?? 0,
				totalTokens: (stats.native_tokens_prompt ?? 0) + (stats.native_tokens_completion ?? 0),
				cost: stats.usage ?? stats.total_cost ?? 0,
				raw_response: stats
			});
		}

		// 3. Search memories
		const relevantMemories = await ctx.runAction(internal.memories.searchMemories, {
			userId,
			queryText: formulatedQuery,
			limit: limit || 5
		});

		return {
			formulatedQuery,
			relevantMemories,
			rewriterInput
		};
	}
});
