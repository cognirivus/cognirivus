<script lang="ts">
	import { Highlighter, HighlighterIcon } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { highlightsEnabled } from '$lib/stores/highlights';
</script>

<Button
	onclick={() => highlightsEnabled.update((v) => !v)}
	variant="ghost"
	size="icon"
	class={$highlightsEnabled ? 'text-yellow-500' : 'text-muted-foreground'}
>
	<Highlighter class="h-[1.2rem] w-[1.2rem]" />
	<span class="sr-only">Toggle highlights</span>
</Button>
