import { v } from 'convex/values';
import { internalMutation, action, mutation, internalQuery } from './_generated/server';
import { internal, api } from './_generated/api';
import { createEmbedding, extractMemories, formulateStandaloneQuery } from './lib/openrouter';

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
// This is designed to be "fire and forget" from the chat flow
export const addMemory = action({
	args: {
		userId: v.id('users'),
		messageId: v.id('messages'),
		messageText: v.string()
	},
	handler: async (ctx, args) => {
		console.log('Cognirivus: addMemory action started for message:', args.messageId);
		// 1. Extract potential memories
		const memories = await extractMemories(args.messageText);
		console.log(`Cognirivus: Extracted ${memories.length} memories`);

		if (memories.length === 0) {
			return;
		}

		// 2. For each memory, generate embedding and store
		for (const memory of memories) {
			try {
				const embedding = await createEmbedding(memory.text);

				await ctx.runMutation(internal.memories.internalAddMemory, {
					userId: args.userId,
					text: memory.text,
					category: memory.category,
					embedding,
					messageId: args.messageId
				});
			} catch (e) {
				console.error(`Failed to store memory: "${memory.text}"`, e);
			}
		}
		// 3. Update message metadata to notify UI
		if (args.messageId) {
			await ctx.runMutation(internal.messages.internalAppendMemories, {
				messageId: args.messageId,
				memories: memories.map((m) => ({ text: m.text, category: m.category }))
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
		const embedding = await createEmbedding(args.queryText);

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
		messages: v.array(
			v.object({
				role: v.string(),
				content: v.string()
			})
		)
	},
	handler: async (ctx, { messages }): Promise<string> => {
		return await formulateStandaloneQuery(messages);
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
		const formulatedQuery = await formulateStandaloneQuery(history);

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
