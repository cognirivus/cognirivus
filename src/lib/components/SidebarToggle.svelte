<script lang="ts">
	import { PanelLeft, PanelRight } from '@lucide/svelte';
	import { cn } from '$lib/utils';

	let {
		onclick,
		isOpen,
		class: className = '',
		title = 'Toggle sidebar',
		side = 'left'
	} = $props();

	const Icon = $derived(side === 'left' ? PanelLeft : PanelRight);
</script>

{#if !isOpen}
	<div class={cn('absolute top-4 z-50', side === 'left' ? 'left-4' : 'right-4', className)}>
		<button
			{onclick}
			class="flex size-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm transition-all hover:bg-accent hover:text-foreground"
			{title}
		>
			<Icon class="size-5" />
		</button>
	</div>
{/if}
