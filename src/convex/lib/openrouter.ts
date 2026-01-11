export async function createEmbedding(text: string) {
	const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': 'https://cognirivus-chat.vercel.app', // Optional
			'X-Title': 'Cognirivus Chat' // Optional
		},
		body: JSON.stringify({
			// model: 'qwen/qwen-2.5-coder-32b-instruct', // Using this for extraction, but wait, this function is for embeddings.
			// The plan said createEmbedding and extractMemories.
			// Let me fix this to be generic or specific.
			// START OF CORRECT IMPLEMENTATION

			model: 'qwen/qwen3-embedding-8b', // User requested this model
			input: text
		})
	});

	if (!response.ok) {
		throw new Error(`Failed to generate embedding: ${response.statusText}`);
	}

	const data = await response.json();
	return data.data[0].embedding;
}

export async function extractMemories(text: string): Promise<{ text: string; category: string }[]> {
	const model = 'google/gemini-2.5-flash-lite';
	console.log(`Cognirivus: Calling OpenRouter for extraction with model ${model}`);
	const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': 'https://cognirivus-chat.vercel.app',
			'X-Title': 'Cognirivus Chat'
		},
		body: JSON.stringify({
			model: model,
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

	if (!response.ok) {
		console.error(`Failed to extract memories: ${response.statusText}`);
		const errorText = await response.text();
		console.error('OpenRouter Error details:', errorText);
		return [];
	}

	const data = await response.json();
	console.log('Cognirivus: Received extraction response');
	const content = data.choices[0]?.message?.content || '[]';
	console.log('Cognirivus: Extraction content:', content);

	try {
		const parsed = JSON.parse(content);
		// If the model returns { "memories": [...] }
		if (Array.isArray(parsed)) return parsed;
		if (parsed.memories && Array.isArray(parsed.memories)) return parsed.memories;
		return [];
	} catch (e) {
		console.error('Failed to parse memories JSON:', content);
		return [];
	}
}

export async function formulateStandaloneQuery(history: { role: string; content: string }[]) {
	const model = 'openai/gpt-oss-120b';

	const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': 'https://cognirivus-chat.vercel.app',
			'X-Title': 'Cognirivus Chat'
		},
		body: JSON.stringify({
			model: model,
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

	if (!response.ok) {
		console.error(`Failed to formulate standalone query: ${response.statusText}`);
		return history[history.length - 1].content;
	}

	const data = await response.json();
	return data.choices[0]?.message?.content || history[history.length - 1].content;
}

export async function judgeMemoryDuplicate(
	newFact: string,
	existingFact: string
): Promise<'duplicate' | 'update' | 'new'> {
	const model = 'google/gemini-2.5-flash-lite';

	const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': 'https://cognirivus-chat.vercel.app',
			'X-Title': 'Cognirivus Chat'
		},
		body: JSON.stringify({
			model: model,
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

	if (!response.ok) return 'new';

	const data = await response.json();
	const choice = data.choices[0]?.message?.content?.toLowerCase().trim();

	if (choice?.includes('duplicate')) return 'duplicate';
	if (choice?.includes('update')) return 'update';
	return 'new';
}
