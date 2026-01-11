import { v } from 'convex/values';
import { internalMutation, action, mutation, internalQuery } from './_generated/server';
import { internal, api } from './_generated/api';
import {
	createEmbedding,
	extractMemories,
	formulateStandaloneQuery,
	judgeMemoryDuplicate,
	getGenerationStats
} from './lib/openrouter';

// Internal mutation to store a single memory
export const internalAddMemory = internalMutation({
	args: {
		userId: v.id('users'),
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

// Action to process a message, extract memories, and store them
export const internalRemove = internalMutation({
	args: { id: v.id('user_memories') },
	handler: async (ctx, args) => {
		await ctx.db.delete(args.id);
	}
});

// This is designed to be "fire and forget" from the chat flow
export const addMemory = action({
	args: {
		userId: v.id('users'),
		messageId: v.id('messages'),
		messageText: v.string()
	},
	handler: async (ctx, args) => {
		// 1. Extract potential memories
		const { memories: extracted, generationId } = await extractMemories(args.messageText);

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

		// Process memories in parallel to avoid long sequential waits for stats
		await Promise.all(
			extracted.map(async (memory) => {
				try {
					const { embedding, generationId: embedGenId } = await createEmbedding(memory.text);

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
							const [existingDoc] = await ctx.runQuery(internal.memories.internalGetMemories, {
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

// Internal search helper to keep the action clean
export const internalSearch = action({
	args: {
		userId: v.id('users'),
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

		// Fetch valid memories
		const memories = [];
		for (const result of results) {
			// vectorSearch returns { _id, _score }, we need to fetch the doc?
			// Wait, standard vectorSearch in Convex usually requires a cleanup step to get the actual docs
			// if we are in an action we can't use db.get directly easily without another query.
			// Actually, ctx.vectorSearch returns the list of matches. We can't accessing DB in action.
			// We need a separate query/mutation to fetch the docs or pass IDs back.
			// BUT, wait. `vectorSearch` is available in ACTION? Yes.
			// But `db` is NOT available in ACTION.
			// So we return the IDs and scores, and then fetch them in the main flow or a separate query.
		}
		return results;
	}
});

// Since we can't access DB in action to get the text, we'll split this.
// `searchMemories` action will return the TEXT of relevant memories.
export const searchMemories = action({
	args: {
		userId: v.id('users'),
		queryText: v.string(),
		limit: v.optional(v.number())
	},
	handler: async (ctx, args): Promise<any[]> => {
		const { embedding, generationId } = await createEmbedding(args.queryText);

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
		const memories = await ctx.runQuery(internal.memories.internalGetMemories, { ids: memoryIds });

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

export const internalGetMemories = internalQuery({
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

import { query } from './_generated/server';

// List all memories for a user (for the Memory Manager UI)
export const list = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) return [];

		const memories = await ctx.db
			.query('user_memories')
			.withIndex('by_user', (q) => q.eq('userId', userId))
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

import { getAuthUserId } from '@convex-dev/auth/server';

// Remove a memory by ID
export const remove = mutation({
	args: { id: v.id('user_memories') },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new Error('Unauthorized');

		const memory = await ctx.db.get(args.id);
		if (!memory || memory.userId !== userId) {
			throw new Error('Memory not found or access denied');
		}

		await ctx.db.delete(args.id);
	}
});

// Step 1: Formulate a standalone query
export const formulateQuery = action({
	args: {
		userId: v.id('users'),
		messages: v.array(
			v.object({
				role: v.string(),
				content: v.string()
			})
		)
	},
	handler: async (ctx, { userId, messages }): Promise<string> => {
		const { result, generationId } = await formulateStandaloneQuery(messages);

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

// Step 3 (Orchestrator): Get formulated query + retrieved memories + rewriter metadata
export const getEnrichedContext = action({
	args: {
		userId: v.id('users'),
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
		const { result: formulatedQuery, generationId } = await formulateStandaloneQuery(history);

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
		const relevantMemories = await ctx.runAction(api.memories.searchMemories, {
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
