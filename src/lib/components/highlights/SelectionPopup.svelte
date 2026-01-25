<script lang="ts">
	import { highlightStore } from '$lib/stores/highlights.svelte';
	import { Button } from '$lib/components/ui/button';
	import { MessageSquarePlus, Highlighter } from '@lucide/svelte';
	import { cn } from '$lib/utils';
	import { fade } from 'svelte/transition';

	const { onHighlight } = $props<{
		onHighlight: (color: string) => Promise<void>;
	}>();

	const colors = [
		{
			name: 'yellow',
			class: 'bg-yellow-200 hover:bg-yellow-300 dark:bg-yellow-500/50 dark:hover:bg-yellow-500/70'
		},
		{
			name: 'green',
			class: 'bg-green-200 hover:bg-green-300 dark:bg-green-500/50 dark:hover:bg-green-500/70'
		},
		{
			name: 'blue',
			class: 'bg-blue-200 hover:bg-blue-300 dark:bg-blue-500/50 dark:hover:bg-blue-500/70'
		},
		{
			name: 'pink',
			class: 'bg-pink-200 hover:bg-pink-300 dark:bg-pink-500/50 dark:hover:bg-pink-500/70'
		}
	];

	let popupEl = $state<HTMLDivElement | null>(null);

	const style = $derived.by(() => {
		if (!highlightStore.selectionContext) return 'display: none;';
		const { top, left } = highlightStore.selectionContext;
		return `top: ${top - 12}px; left: ${left}px; transform: translate(-50%, -100%);`;
	});
</script>

<div
	bind:this={popupEl}
	class="highlight-popup pointer-events-auto absolute z-[100] flex items-center gap-1 rounded-full border bg-background p-1.5 shadow-xl ring-1 ring-border/50"
	{style}
	transition:fade={{ duration: 100 }}
>
	<div class="flex items-center gap-1">
		{#each colors as color}
			<button
				type="button"
				class={cn(
					'h-6 w-6 rounded-full transition-transform hover:scale-110 active:scale-95',
					color.class
				)}
				onclick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					onHighlight(color.name);
				}}
				title={`Highlight ${color.name}`}
			></button>
		{/each}
	</div>

	<!-- Arrow -->
	<div
		class="pointer-events-none absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-r border-b bg-background"
	></div>
</div>
