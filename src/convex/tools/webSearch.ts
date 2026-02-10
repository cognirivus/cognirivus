// Tool: webSearch - Web search via direct Exa Answer API
import type { ToolDefinition } from './types';

export const webSearchTool: ToolDefinition = {
	name: 'webSearch',
	description:
		'Search the web for current information, news, and facts. Returns an intelligent answer and referenced source documents. IMPORTANT: Limited to 1 call per session.',
	parameters: {
		type: 'object',
		properties: {
			query: {
				type: 'string',
				description: 'The search query to execute'
			},
			limit: {
				type: 'number',
				description: 'Maximum number of sources to return (default: 5)',
				default: 5
			}
		},
		required: ['query']
	},
	handler: async (_ctx, args) => {
		const EXA_API_KEY = process.env.EXA_API_KEY;
		if (!EXA_API_KEY) {
			console.error('[WebSearch] EXA_API_KEY not configured in environment');
			return {
				success: false,
				error: 'Search service not configured'
			};
		}

		console.log(`[WebSearch] Calling Exa Answer API for: "${args.query}"`);

		try {
			// Call Exa's OpenAI-compatible endpoint with streaming enabled
			const response = await fetch('https://api.exa.ai/chat/completions', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${EXA_API_KEY}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					model: 'exa',
					messages: [
						{
							role: 'user',
							content: args.query
						}
					],
					stream: true
				})
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error(`[WebSearch] Exa API error: ${response.status} - ${errorText}`);
				return {
					success: false,
					error: `Search failed: ${response.statusText}`
				};
			}

			// Handle streaming response to collect answer and citations
			const reader = response.body?.getReader();
			if (!reader) throw new Error('No response body reader available');

			const decoder = new TextDecoder();
			let answer = '';
			let citations: any[] = [];
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				const chunk = decoder.decode(value, { stream: true });
				buffer += chunk;

				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed || trimmed === 'data: [DONE]') continue;

					// Handle "data: " prefix if present (common in SSE)
					const cleanLine = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed;

					try {
						const json = JSON.parse(cleanLine);

						// Handle content deltas
						if (json.choices?.[0]?.delta?.content) {
							answer += json.choices[0].delta.content;
						}

						// Handle citations (can be in choices or top-level)
						if (json.citations) {
							citations = json.citations;
						} else if (json.choices?.[0]?.citations) {
							citations = json.choices[0].citations;
						}
					} catch (e) {
						// Ignore partial JSON in stream
					}
				}
			}

			// Process remaining buffer
			if (buffer.trim()) {
				const trimmed = buffer.trim();
				const cleanLine = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed;
				try {
					const json = JSON.parse(cleanLine);
					if (json.choices?.[0]?.delta?.content) answer += json.choices[0].delta.content;
					if (json.citations) citations = json.citations;
				} catch (e) {
					/* ignore */
				}
			}

			// Map citations to our internal results format
			let results = citations.map((cite: any) => ({
				url: cite.url || '',
				title: cite.title || 'Untitled Source',
				content: cite.snippet || cite.text || cite.content || ''
			}));

			// ENHANCEMENT: If no formal citations array but answer has markdown links,
			// extract them as results so the UI can still display referenced sources.
			if (results.length === 0 && answer.includes('](')) {
				const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
				const matches = Array.from(answer.matchAll(linkRegex));
				const uniqueUrls = new Set<string>();

				for (const match of matches) {
					const [_, title, url] = match;
					if (!uniqueUrls.has(url)) {
						uniqueUrls.add(url);
						results.push({
							url,
							title: title.length < 50 ? title : 'Source',
							content: '' // No snippet available from regex
						});
					}
					if (results.length >= (args.limit || 5)) break;
				}
			}

			console.log(
				`[WebSearch] Completed. Answer length: ${answer.length}, Sources: ${results.length}`
			);

			return {
				success: true,
				data: {
					query: args.query,
					results: results.slice(0, args.limit || 5),
					count: results.length,
					answer,
					model: 'exa-answer'
				}
			};
		} catch (error) {
			console.error('[WebSearch] Request failed:', error);
			// ENHANCEMENT: Return a graceful error message that the agent can read and explain to the user
			return {
				success: false,
				error:
					'The live web search service is currently unavailable or timed out. Please try again later or rely on your internal knowledge if appropriate, and inform the user about this limitation.'
			};
		}
	},
	isAdminOnly: false,
	costTier: 'high'
};
