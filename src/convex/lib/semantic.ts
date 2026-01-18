/**
 * Interface for the response from the local highlight function.
 */
export interface HighlightResult {
	highlightedText: string;
	scores?: number[];
}

/**
 * Interface for the raw response from the Modal API.
 */
interface ModalHighlightResponse {
	highlighted_sentences: string[];
	sentence_probabilities?: number[];
}

/**
 * Calls the Modal Semantic Highlight API to filter and retrieve relevant sentences from a context.
 *
 * @param query - The semantic search query (e.g., user question).
 * @param context - The text to search within.
 * @param threshold - The probability threshold (0.0 - 1.0) for including a sentence. Defaults to 0.5.
 * @returns An object containing the combined highlighted text and an array of corresponding scores.
 */
export async function highlightText(
	query: string,
	context: string,
	threshold: number = 0.5
): Promise<HighlightResult> {
	console.log(`[Semantic Highlight] Calling API for query: "${query.substring(0, 50)}..."`);
	try {
		const response = await fetch('https://chiragrohit--semantic-highlighter-highlight.modal.run/', {
			method: 'POST',
			headers: {
				accept: 'application/json',
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				query,
				context,
				// We request ALL sentences (threshold 0.0) from the API so we can filter locally
				// and ensure perfect alignment between sentences and scores.
				threshold: 0.0,
				return_sentence_metrics: true
			})
		});

		if (!response.ok) {
			console.warn(`[Semantic Highlight] API error: ${response.statusText}`);
			return { highlightedText: '' };
		}

		const data = (await response.json()) as ModalHighlightResponse;

		if (data.highlighted_sentences && Array.isArray(data.highlighted_sentences)) {
			const cleanSentences: string[] = [];
			const cleanScores: number[] = [];

			const allScores = data.sentence_probabilities || [];
			const sentences = data.highlighted_sentences;

			let matchCount = 0;

			sentences.forEach((s: string, i: number) => {
				const score = allScores[i] ?? 0;

				// Apply filtering: Must be non-empty AND meet the requested threshold
				if (s && s.trim().length > 0 && score >= threshold) {
					// IMPORTANT: The API returns strings with trailing newlines. Trim them.
					cleanSentences.push(s.trim());
					cleanScores.push(score);
					matchCount++;
				}
			});

			// If no sentences remain after filtering
			if (cleanSentences.length === 0) {
				console.log(`[Semantic Highlight] No matches found above threshold ${threshold}.`);
				return { highlightedText: '' };
			}

			console.log(`[Semantic Highlight] Found ${matchCount} matches above threshold ${threshold}.`);
			const highlightedText = cleanSentences.join('\n');

			return {
				highlightedText,
				scores: cleanScores.length > 0 ? cleanScores : undefined
			};
		}

		console.warn('[Semantic Highlight] Unexpected response format:', data);
		return { highlightedText: '' };
	} catch (e) {
		console.error('[Semantic Highlight] Function failed', e);
		return { highlightedText: '' };
	}
}
