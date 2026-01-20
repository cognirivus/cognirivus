<script lang="ts">
	/**
	 * Renders cloze-style text by hiding {{c1::answer}} parts.
	 * If showAnswer is false, it shows "[...]"
	 * If showAnswer is true, it shows the answer with a highlight.
	 */
	let { text, showAnswer = false } = $props<{
		text: string;
		showAnswer?: boolean;
	}>();

	// Regex to match {{c1::answer}} or {{c2::answer}} etc.
	const clozeRegex = /\{\{c\d+::(.*?)\}\}/g;

	const parts = $derived.by(() => {
		const result = [];
		let lastIndex = 0;
		let match;

		// Reset regex index
		clozeRegex.lastIndex = 0;

		while ((match = clozeRegex.exec(text)) !== null) {
			// Add text before the match
			if (match.index > lastIndex) {
				result.push({ type: 'text', content: text.slice(lastIndex, match.index) });
			}

			// Add the cloze part
			result.push({
				type: 'cloze',
				answer: match[1],
				fullMatch: match[0]
			});

			lastIndex = clozeRegex.lastIndex;
		}

		// Add remaining text
		if (lastIndex < text.length) {
			result.push({ type: 'text', content: text.slice(lastIndex) });
		}

		return result;
	});
</script>

<span class="cloze-container leading-relaxed">
	{#each parts as part}
		{#if part.type === 'text'}
			{part.content}
		{:else if part.type === 'cloze'}
			{#if showAnswer}
				<span
					class="mx-1 rounded bg-primary/20 px-1.5 py-0.5 font-bold text-primary underline decoration-2 underline-offset-4 transition-all duration-300"
				>
					{part.answer}
				</span>
			{:else}
				<span
					class="mx-1 rounded bg-muted px-3 py-0.5 font-mono text-sm font-bold tracking-widest text-muted-foreground shadow-inner ring-1 ring-border"
				>
					[...]
				</span>
			{/if}
		{/if}
	{/each}
</span>

<style>
	.cloze-container {
		display: inline;
		word-wrap: break-word;
	}
</style>
