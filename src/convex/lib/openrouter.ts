/**
 * Generates a vector embedding for a given text using the OpenRouter API.
 *
 * @param text - The input text to embed.
 * @returns An object containing the embedding vector and the OpenRouter generation ID.
 * @throws {Error} if the embedding generation fails.
 */
export async function createEmbedding(text: string) {
	const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': 'https://cognirivus.vercel.app',
			'X-Title': 'Cognirivus Chat'
		},
		body: JSON.stringify({
			model: 'qwen/qwen3-embedding-8b',
			input: text
		})
	});

	if (!response.ok) {
		throw new Error(`Failed to generate embedding: ${response.statusText}`);
	}

	const data = await response.json();
	// Header for streaming, body.id for non-streaming
	const generationId = response.headers.get('x-openrouter-id') || data.id || null;
	return {
		embedding: data.data[0].embedding,
		generationId
	};
}

/**
 * Extracts factual information and preferences from a message.
 *
 * Calls OpenRouter with a system prompt optimized for memory extraction.
 *
 * @param text - The user message text.
 * @returns An array of extracted memories (text and category) and the generation ID.
 */
export async function extractMemories(text: string): Promise<{
	memories: { text: string; category: string }[];
	generationId: string | null;
}> {
	const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': 'https://cognirivus.vercel.app',
			'X-Title': 'Cognirivus Chat'
		},
		body: JSON.stringify({
			model: 'google/gemini-2.5-flash-lite',
			messages: [
				{
					role: 'system',
					content:
						'You are a memory extraction system. Analyze the user message and extract any factual information about the user, their preferences, or their life. For each fact, assign a category: "Personal", "Career", "Project", or "Other". Return the results as a JSON array of objects with "text" and "category" fields. If there are no useful facts, return an empty array []. Return ONLY the JSON.'
				},
				{
					role: 'user',
					content: text
				}
			],
			response_format: { type: 'json_object' }
		})
	});

	const data = await response.json();
	// Header for streaming, body.id for non-streaming
	const generationId = response.headers.get('x-openrouter-id') || data.id || null;

	if (!response.ok) {
		console.error(`Failed to extract memories: ${response.statusText}`);
		return { memories: [], generationId };
	}

	const content = data.choices[0]?.message?.content || '[]';

	let memories = [];
	try {
		const parsed = JSON.parse(content);
		if (Array.isArray(parsed)) memories = parsed;
		else if (parsed.memories && Array.isArray(parsed.memories)) memories = parsed.memories;
	} catch (e) {
		console.error('Failed to parse memories JSON:', content);
	}

	return { memories, generationId };
}

/**
 * Rephrases a follow-up message into a standalone search query based on history.
 *
 * @param history - The conversation history.
 * @returns An object containing the standalone query string and the generation ID.
 */
export async function formulateStandaloneQuery(history: { role: string; content: string }[]) {
	const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': 'https://cognirivus.vercel.app',
			'X-Title': 'Cognirivus Chat'
		},
		body: JSON.stringify({
			model: 'openai/gpt-oss-120b',
			messages: [
				{
					role: 'system',
					content: `Given the following conversation history and a follow-up user message, rephrase the follow-up message into a standalone search query that contains all necessary context from the conversation. 
The standalone query will be used for semantic search in a memory database.
Return ONLY the rephrased query text. If the message is already standalone, return it as is.`
				},
				...history.map((m) => ({ role: m.role, content: m.content }))
			]
		})
	});

	const data = await response.json();
	// Header for streaming, body.id for non-streaming
	const generationId = response.headers.get('x-openrouter-id') || data.id || null;

	if (!response.ok) {
		console.error(`Failed to formulate standalone query: ${response.statusText}`);
		return {
			result: history[history.length - 1].content,
			generationId
		};
	}

	return {
		result: data.choices[0]?.message?.content || history[history.length - 1].content,
		generationId
	};
}

/**
 * Decides if a new fact is a duplicate, an update, or new relative to an existing memory.
 *
 * Uses an AI judge to compare the semantic content of the two facts.
 *
 * @param newFact - The newly extracted fact.
 * @param existingFact - The stored memory fact.
 * @returns An object containing the decision ('duplicate', 'update', 'new') and the generation ID.
 */
export async function judgeMemoryDuplicate(
	newFact: string,
	existingFact: string
): Promise<{
	decision: 'duplicate' | 'update' | 'new';
	generationId: string | null;
}> {
	const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': 'https://cognirivus.vercel.app',
			'X-Title': 'Cognirivus Chat'
		},
		body: JSON.stringify({
			model: 'google/gemini-2.5-flash-lite',
			messages: [
				{
					role: 'system',
					content: `You are a memory deduplication judge. Compare a NEW fact with an EXISTING memory and decide how they relate.
					
Categories:
- "duplicate": The facts convey essentially the same information.
- "update": The NEW fact provides more recent, more specific, or corrected information than the EXISTING memory.
- "new": The facts are unrelated or address different topics.

Return ONLY one word: "duplicate", "update", or "new".`
				},
				{
					role: 'user',
					content: `EXISTING: "${existingFact}"\nNEW: "${newFact}"`
				}
			]
		})
	});

	const data = await response.json();
	// Header for streaming, body.id for non-streaming
	const generationId = response.headers.get('x-openrouter-id') || data.id || null;

	if (!response.ok) return { decision: 'new', generationId };

	const choice = data.choices[0]?.message?.content?.toLowerCase().trim();

	let decision: 'duplicate' | 'update' | 'new' = 'new';
	if (choice?.includes('duplicate')) decision = 'duplicate';
	else if (choice?.includes('update')) decision = 'update';

	return { decision, generationId };
}

/**
 * Fetches generation statistics (tokens, cost) from OpenRouter for a given ID.
 *
 * Includes retry logic with exponential backoff to handle data availability delays.
 *
 * @param generationId - The ID of the generation to fetch stats for.
 * @param retries - Number of times to retry the request (default 3).
 * @returns The generation statistics object or null if not found.
 */
export async function getGenerationStats(generationId: string | null, retries = 3) {
	if (!generationId) return null;

	for (let i = 0; i < retries; i++) {
		try {
			// exponential backoff starting at 1s
			const waitTime = 1000 * Math.pow(2, i);
			await new Promise((resolve) => setTimeout(resolve, waitTime));

			const response = await fetch(`https://openrouter.ai/api/v1/generation?id=${generationId}`, {
				headers: {
					Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`
				}
			});

			if (response.ok) {
				const genData = await response.json();
				if (genData.data) return genData.data;
			}
		} catch (e) {
			console.error(
				`getGenerationStats: Attempt ${i + 1} to fetch stats for ${generationId} failed:`,
				e
			);
		}
	}

	return null;
}
