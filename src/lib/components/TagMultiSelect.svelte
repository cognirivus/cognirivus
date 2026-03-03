<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Popover from '$lib/components/ui/popover';
	import { ChevronDown, Tag, X, Check } from '@lucide/svelte';
	import { cn } from '$lib/utils';

	let {
		availableTags = [] as string[],
		selectedTags = [] as string[],
		onSelect = (() => {}) as (tags: string[]) => void
	} = $props<{
		availableTags?: string[];
		selectedTags?: string[];
		onSelect?: (tags: string[]) => void;
	}>();

	function toggleTag(tag: string) {
		if (selectedTags.includes(tag)) {
			onSelect(selectedTags.filter((selectedTag: string) => selectedTag !== tag));
		} else {
			onSelect([...selectedTags, tag]);
		}
	}

	function clearTags() {
		onSelect([]);
	}
</script>

<div class="flex flex-col gap-2">
	<div class="flex flex-wrap items-center gap-2">
		<Popover.Root>
			<Popover.Trigger>
				<div
					class={cn(
						'inline-flex h-9 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium whitespace-nowrap shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50'
					)}
				>
					<Tag class="size-4 text-muted-foreground" />
					<span class="text-xs">
						{#if selectedTags.length === 0}
							Filter by Tags
						{:else}
							{selectedTags.length} selected
						{/if}
					</span>
					<ChevronDown class="size-4 text-muted-foreground" />
				</div>
			</Popover.Trigger>
			<Popover.Content class="w-[240px] p-0" align="start">
				<div class="flex flex-col">
					<div class="flex items-center justify-between border-b px-3 py-2">
						<span class="text-xs font-semibold">Tags</span>
						{#if selectedTags.length > 0}
							<button
								class="text-[10px] font-medium text-primary hover:underline"
								onclick={clearTags}
							>
								Clear all
							</button>
						{/if}
					</div>
					<div class="max-h-[300px] overflow-y-auto p-1">
						{#if availableTags.length === 0}
							<div class="px-2 py-4 text-center text-xs text-muted-foreground">
								No tags available
							</div>
						{:else}
							{#each availableTags as tag (tag)}
								{@const isSelected = selectedTags.includes(tag)}
								<button
									class={cn(
										'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors outline-none hover:bg-accent focus:bg-accent',
										isSelected && 'bg-accent/50'
									)}
									onclick={() => toggleTag(tag)}
								>
									<Checkbox checked={isSelected} />
									<span class="flex-1 truncate">{tag}</span>
									{#if isSelected}
										<Check class="size-3 text-primary" />
									{/if}
								</button>
							{/each}
						{/if}
					</div>
				</div>
			</Popover.Content>
		</Popover.Root>

		{#if selectedTags.length > 0}
			<div class="flex animate-in flex-wrap gap-1.5 fade-in slide-in-from-left-2">
				{#each selectedTags as tag (tag)}
					<Badge
						variant="secondary"
						class="h-7 gap-1 bg-primary px-2 text-[10px] text-primary-foreground hover:bg-primary/90"
					>
						{tag}
						<button
							class="rounded-full outline-none focus-visible:ring-1 focus-visible:ring-ring"
							onclick={() => toggleTag(tag)}
						>
							<X class="size-3" />
						</button>
					</Badge>
				{/each}
			</div>
		{/if}
	</div>
</div>
