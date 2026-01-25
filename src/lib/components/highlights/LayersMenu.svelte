<script lang="ts">
	import { highlightStore } from '$lib/stores/highlights.svelte';
	import { Switch } from '$lib/components/ui/switch';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Layers } from '@lucide/svelte';
	import { cn } from '$lib/utils';

	type Author = {
		id: string;
		name: string;
		count: number;
	};

	let { authors = [] } = $props<{ authors: Author[] }>();
	let isOpen = $state(false);
	// Test comment
</script>

<DropdownMenu.Root bind:open={isOpen}>
	<DropdownMenu.Trigger
		class={cn(
			'ml-1 inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none',
			isOpen && 'bg-accent text-accent-foreground'
		)}
		title="Highlight Layers"
	>
		<Layers class="h-3 w-3" />
	</DropdownMenu.Trigger>
	<DropdownMenu.Content class="z-[100] w-64" align="end">
		<DropdownMenu.Label class="text-xs font-semibold text-muted-foreground uppercase"
			>Visible Layers</DropdownMenu.Label
		>
		<DropdownMenu.Separator />
		{#if authors.length === 0}
			<div class="px-2 py-2 text-center text-xs text-muted-foreground">No highlights yet.</div>
		{:else}
			{#each authors as author (author.id)}
				<div
					class="flex items-center justify-between rounded-sm px-2 py-1.5 hover:bg-accent hover:text-accent-foreground"
				>
					<div class="flex items-center gap-2 overflow-hidden">
						<Avatar.Root class="h-5 w-5">
							<Avatar.Fallback class="text-[9px]"
								>{author.name.substring(0, 2).toUpperCase()}</Avatar.Fallback
							>
						</Avatar.Root>
						<div class="flex min-w-0 flex-col">
							<span class="truncate text-xs font-medium">{author.name}</span>
							<span class="text-[10px] text-muted-foreground"
								>{author.count} highlight{author.count !== 1 ? 's' : ''}</span
							>
						</div>
					</div>
					<div
						role="button"
						tabindex="0"
						class="flex items-center"
						onclick={(e) => {
							e.stopPropagation();
							highlightStore.toggleAuthorVisibility(author.id);
						}}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.stopPropagation();
								highlightStore.toggleAuthorVisibility(author.id);
							}
						}}
					>
						<Switch
							checked={!highlightStore.hiddenAuthorIds.has(author.id)}
							class="pointer-events-none h-4 w-7"
						/>
					</div>
				</div>
			{/each}
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>
