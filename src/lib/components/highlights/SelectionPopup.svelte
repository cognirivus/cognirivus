<script lang="ts">
	import { highlightStore } from '$lib/stores/highlights.svelte';
	import { Button } from '$lib/components/ui/button';
	import { MessageSquarePlus, Highlighter } from '@lucide/svelte';
	import { cn } from '$lib/utils';
	import { fade } from 'svelte/transition';

	const { onHighlight, onAddComment } = $props<{
		onHighlight: (color: string) => Promise<void>;
		onAddComment: () => Promise<void>;
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

	$effect(() => {
		if (highlightStore.selectionContext) {
			console.log(
				'Popup visible at:',
				highlightStore.selectionContext.top,
				highlightStore.selectionContext.left
			);
		}
	});

	const style = $derived.by(() => {
		if (!highlightStore.selectionContext) return '';
		const { top, left } = highlightStore.selectionContext;
		// Subtract some extra to move it above the line
		return `top: ${top - 8}px; left: ${left}px; transform: translate(-50%, -100%);`;
	});
</script>

{#if highlightStore.selectionContext}
	<div
		bind:this={popupEl}
		class="absolute z-[100] flex items-center gap-1 rounded-full border bg-background p-1.5 shadow-xl ring-1 ring-border/50"
		{style}
		transition:fade={{ duration: 100 }}
	>
		<div class="mr-1 flex items-center gap-1 border-r pr-1">
			{#each colors as color}
				<button
					class={cn(
						'h-6 w-6 rounded-full transition-transform hover:scale-110 active:scale-95',
						color.class
					)}
					onclick={() => onHighlight(color.name)}
					title={`Highlight ${color.name}`}
				></button>
			{/each}
		</div>

		<Button
			variant="ghost"
			size="icon"
			class="h-7 w-7 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
			onclick={onAddComment}
			title="Add Comment"
		>
			<MessageSquarePlus class="h-4 w-4" />
		</Button>
	</div>
{/if}
