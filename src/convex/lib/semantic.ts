/**
 * Interface for the response from the local highlight function.
 */
export interface HighlightResult {
	highlightedText: string;
	scores?: number[];
	allMatches?: Array<{ text: string; score: number }>;
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
	// Cap context size to prevent API timeouts/payload issues
	// 40k chars is plenty for most RAG tasks (~10k tokens)
	const MAX_HIGHLIGHT_CHARS = 40000;
	const safeContext =
		context.length > MAX_HIGHLIGHT_CHARS ? context.substring(0, MAX_HIGHLIGHT_CHARS) : context;

	console.log(
		`[Semantic Highlight] Calling API for query: "${query.substring(0, 50)}..." (${safeContext.length} chars)`
	);

	try {
		const response = await fetch('https://chiragrohit--semantic-highlighter-highlight.modal.run/', {
			method: 'POST',
			headers: {
				accept: 'application/json',
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				query,
				context: safeContext,
				// We request ALL sentences (threshold 0.0) from the API so we can filter locally
				threshold: 0.0,
				return_sentence_metrics: true
			})
		});

		if (!response.ok) {
			const errorText = await response.text().catch(() => 'Unknown error');
			console.warn(`[Semantic Highlight] API error: ${response.status} - ${errorText}`);
			return { highlightedText: '' };
		}

		let data: ModalHighlightResponse;
		try {
			data = (await response.json()) as ModalHighlightResponse;
		} catch (jsonErr) {
			console.error('[Semantic Highlight] Failed to parse API response JSON', jsonErr);
			return { highlightedText: '' };
		}

		if (data.highlighted_sentences && Array.isArray(data.highlighted_sentences)) {
			const allMatches: Array<{ text: string; score: number }> = [];
			const cleanSentences: string[] = [];
			const cleanScores: number[] = [];

			const allScores = data.sentence_probabilities || [];
			const sentences = data.highlighted_sentences;

			sentences.forEach((s: string, i: number) => {
				const score = allScores[i] ?? 0;
				const trimmed = s?.trim();
				if (!trimmed) return;

				allMatches.push({ text: trimmed, score });

				// Apply filtering for the "primary" result
				if (score >= threshold) {
					cleanSentences.push(trimmed);
					cleanScores.push(score);
				}
			});

			return {
				highlightedText: cleanSentences.join('\n'),
				scores: cleanScores,
				allMatches
			};
		}

		console.warn('[Semantic Highlight] Unexpected response format:', data);
		return { highlightedText: '' };
	} catch (e) {
		console.error('[Semantic Highlight] Function failed', e);
		return { highlightedText: '' };
	}
}
