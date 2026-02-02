/**
 * OpenRouter Helper Functions
 *
 * High-level functions for common LLM tasks.
 * Uses the unified LLM client for all API calls.
 */

import {
	createEmbedding as createEmbeddingBase,
	simpleChat,
	jsonChat,
	getGenerationStats as getGenerationStatsBase
} from './llm_client';

// Re-export core functions
export { createEmbedding } from './llm_client';
export { getGenerationStats } from './llm_client';

/**
 * Extracts factual information and preferences from a message.
 *
 * Calls OpenRouter with a system prompt optimized for memory extraction.
 *
 * @param text - The user message text.
 * @param model - Optional model to use (defaults to google/gemini-2.5-flash-lite)
 * @returns An array of extracted memories (text and category) and the generation ID.
 */
export async function extractMemories(
	text: string,
	model = 'google/gemini-2.5-flash-lite'
): Promise<{
	memories: { text: string; category: string }[];
	generationId: string | null;
}> {
	const systemPrompt = `You are a memory extraction system. Analyze the user message and extract any factual information about the user, their preferences, or their life. For each fact, assign a category: "Personal", "Career", "Project", or "Other". Return the results as a JSON array of objects with "text" and "category" fields. If there are no useful facts, return an empty array []. Return ONLY the JSON.`;

	try {
		const { data, generationId } = await jsonChat<
			{ text: string; category: string }[] | { memories: { text: string; category: string }[] }
		>(model, systemPrompt, text, { temperature: 0.3 });

		// Handle both array and object with memories key
		let memories: { text: string; category: string }[] = [];
		if (Array.isArray(data)) {
			memories = data;
		} else if (data && 'memories' in data && Array.isArray(data.memories)) {
			memories = data.memories;
		}

		return { memories, generationId };
	} catch (e) {
		console.error('Failed to extract memories:', e);
		return { memories: [], generationId: null };
	}
}

/**
 * Rephrases a follow-up message into a standalone search query based on history.
 *
 * @param history - The conversation history.
 * @param model - Optional model to use (defaults to openai/gpt-oss-120b)
 * @returns An object containing the standalone query string and the generation ID.
 */
export async function formulateStandaloneQuery(
	history: { role: string; content: string }[],
	model = 'openai/gpt-oss-120b'
): Promise<{
	result: string;
	generationId: string | null;
}> {
	if (history.length === 0) {
		return { result: '', generationId: null };
	}

	const lastMessage = history[history.length - 1].content;

	const systemPrompt = `Given the following conversation history and a follow-up user message, rephrase the follow-up message into a standalone search query that contains all necessary context from the conversation. 
The standalone query will be used for semantic search in a memory database.
Return ONLY the rephrased query text. If the message is already standalone, return it as is.`;

	// Build conversation context
	const userMessage = history.map((m) => `${m.role}: ${m.content}`).join('\n');

	try {
		const { content, generationId } = await simpleChat(model, systemPrompt, userMessage, {
			temperature: 0.3
		});

		return {
			result: content || lastMessage,
			generationId
		};
	} catch (e) {
		console.error('Failed to formulate standalone query:', e);
		return { result: lastMessage, generationId: null };
	}
}

/**
 * Decides if a new fact is a duplicate, an update, or new relative to an existing memory.
 *
 * Uses an AI judge to compare the semantic content of the two facts.
 *
 * @param newFact - The newly extracted fact.
 * @param existingFact - The stored memory fact.
 * @param model - Optional model to use (defaults to google/gemini-2.5-flash-lite)
 * @returns An object containing the decision ('duplicate', 'update', 'new') and the generation ID.
 */
export async function judgeMemoryDuplicate(
	newFact: string,
	existingFact: string,
	model = 'google/gemini-2.5-flash-lite'
): Promise<{
	decision: 'duplicate' | 'update' | 'new';
	generationId: string | null;
}> {
	const systemPrompt = `You are a memory deduplication judge. Compare a NEW fact with an EXISTING memory and decide how they relate.

Categories:
- "duplicate": The facts convey essentially the same information.
- "update": The NEW fact provides more recent, more specific, or corrected information than the EXISTING memory.
- "new": The facts are unrelated or address different topics.

Return ONLY one word: "duplicate", "update", or "new".`;

	const userMessage = `EXISTING: "${existingFact}"\nNEW: "${newFact}"`;

	try {
		const { content, generationId } = await simpleChat(model, systemPrompt, userMessage, {
			temperature: 0.1
		});

		const choice = content.toLowerCase().trim();
		let decision: 'duplicate' | 'update' | 'new' = 'new';

		if (choice.includes('duplicate')) decision = 'duplicate';
		else if (choice.includes('update')) decision = 'update';

		return { decision, generationId };
	} catch (e) {
		console.error('Failed to judge memory duplicate:', e);
		return { decision: 'new', generationId: null };
	}
}
