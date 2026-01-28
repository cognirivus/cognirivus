<script lang="ts">
	import { highlightStore } from '$lib/stores/highlights.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Switch } from '$lib/components/ui/switch';
	import { Label } from '$lib/components/ui/label';
	import { RefreshCw, MessageSquare, X, Users } from '@lucide/svelte';
	import { cn } from '$lib/utils';
	import { fade, slide } from 'svelte/transition';
	import LayersMenu from './LayersMenu.svelte';
	import { toast } from 'svelte-sonner';

	const {
		authors = [],
		groupId = undefined,
		isAuthenticated = true
	} = $props<{
		authors?: { id: string; name: string; count: number }[];
		groupId?: string;
		isAuthenticated?: boolean;
	}>();

	const colors = [
		{ name: 'yellow', class: 'bg-yellow-200 dark:bg-yellow-500/50' },
		{ name: 'green', class: 'bg-green-200 dark:bg-green-500/50' },
		{ name: 'blue', class: 'bg-blue-200 dark:bg-blue-500/50' },
		{ name: 'pink', class: 'bg-pink-200 dark:bg-pink-500/50' }
	];

	function selectColor(color: string | null) {
		highlightStore.activeColor = highlightStore.activeColor === color ? null : color;
	}

	function forceRefresh() {
		window.dispatchEvent(new CustomEvent('refresh-highlights'));
		toast.info('Highlights refreshed');
	}
</script>

{#if isAuthenticated}
<div
	class={cn(
		'fixed bottom-4 left-1/2 z-[90] flex max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-2 rounded-full border bg-background/80 px-3 py-2 shadow-2xl ring-1 ring-border/50 backdrop-blur-md transition-all duration-300 sm:bottom-6 sm:max-w-none sm:gap-4 sm:px-6 sm:py-3',
		groupId && 'border-primary ring-2 ring-primary'
	)}
	transition:fade
>
	<div class="flex items-center gap-1 border-r pr-2 sm:gap-2 sm:pr-4">
		<Switch id="hl-toggle" bind:checked={highlightStore.enabled} />
		<Label
			for="hl-toggle"
			class="hidden cursor-pointer text-xs font-semibold tracking-wider text-muted-foreground uppercase sm:inline-block"
		>
			Highlights
		</Label>
		<Button
			variant="ghost"
			size="icon"
			class="h-6 w-6 sm:ml-2"
			onclick={forceRefresh}
			title="Force Refresh"
		>
			<RefreshCw class="h-3 w-3" />
		</Button>
		<LayersMenu {authors} />
	</div>

	<div class="flex items-center gap-1 sm:gap-2">
		<span
			class="mr-1 hidden text-[10px] font-bold tracking-widest text-muted-foreground/60 uppercase md:inline-block"
			>Sticky:</span
		>
		{#each colors as color}
			<button
				class={cn(
					'h-6 w-6 rounded-full border-2 transition-all hover:scale-110 active:scale-95 sm:h-7 sm:w-7',
					color.class,
					highlightStore.activeColor === color.name
						? 'scale-110 border-primary shadow-lg'
						: 'border-transparent'
				)}
				onclick={() => selectColor(color.name)}
				title={`Sticky ${color.name}`}
			>
				{#if highlightStore.activeColor === color.name}
					<div class="flex h-full items-center justify-center">
						<div class="h-1 w-1 animate-pulse rounded-full bg-primary sm:h-1.5 sm:w-1.5"></div>
					</div>
				{/if}
			</button>
		{/each}

		{#if highlightStore.activeColor}
			<Button
				variant="ghost"
				size="icon"
				class="h-6 w-6 rounded-full text-muted-foreground hover:text-destructive sm:h-7 sm:w-7"
				onclick={() => selectColor(null)}
				title="Clear Sticky Color"
			>
				<X class="h-3 w-3" />
			</Button>
		{/if}
	</div>

	{#if highlightStore.activeColor}
		<div
			class="absolute -top-12 left-1/2 -translate-x-1/2 rounded-md bg-primary px-3 py-1 text-[10px] font-bold text-primary-foreground shadow-lg"
			transition:slide={{ axis: 'y' }}
		>
			STICKY MODE ACTIVE
		</div>
	{/if}
</div>
{/if}
