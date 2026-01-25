<script lang="ts">
	import { Highlighter, HighlighterIcon } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { highlightStore } from '$lib/stores/highlights.svelte';
</script>

<Button
	onclick={() => (highlightStore.enabled = !highlightStore.enabled)}
	variant="ghost"
	size="icon"
	class={highlightStore.enabled ? 'text-yellow-500' : 'text-muted-foreground'}
>
	<Highlighter class="h-[1.2rem] w-[1.2rem]" />
	<span class="sr-only">Toggle highlights</span>
</Button>
