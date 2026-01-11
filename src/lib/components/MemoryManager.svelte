<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '../../convex/_generated/api';
	import type { Id } from '../../convex/_generated/dataModel';
	import { Trash2, Brain, Loader2, Tag } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils';

	const memories = useQuery(api.memories.list, {});
	const client = useConvexClient();

	let deletingId = $state<Id<'user_memories'> | null>(null);
	let activeTab = $state<string>('All');

	const categories = $derived.by((): string[] => {
		if (!memories.data) return ['All'];
		const cats = new Set(memories.data.map((m) => m.category).filter((c): c is string => !!c));
		return ['All', ...Array.from(cats).sort()];
	});

	const filteredMemories = $derived.by((): NonNullable<typeof memories.data> => {
		if (!memories.data) return [];
		if (activeTab === 'All') return memories.data;
		return memories.data.filter((m) => m.category === activeTab);
	});

	async function handleDelete(id: Id<'user_memories'>) {
		deletingId = id;
		try {
			await client.mutation(api.memories.remove, { id });
		} finally {
			deletingId = null;
		}
	}

	const categoryColors: Record<string, string> = {
		Personal: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
		Career: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
		Project: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
		Other: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400'
	};
</script>

{#if memories.isLoading}
	<div class="flex items-center justify-center py-12">
		<Loader2 class="h-8 w-8 animate-spin text-primary" />
	</div>
{:else if memories.data?.length === 0}
	<div
		class="flex min-h-[200px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center"
	>
		<Brain class="mb-4 h-12 w-12 text-muted-foreground/20" />
		<h3 class="text-lg font-medium text-foreground">No memories found</h3>
		<p class="max-w-xs text-sm text-muted-foreground">
			Chat with the AI to build your memory bank! It automatically remembers important details.
		</p>
	</div>
{:else}
	<!-- Tabs -->
	<div class="scrollbar-none mb-6 flex flex-nowrap gap-2 overflow-x-auto pb-1">
		{#each categories as category}
			<button
				onclick={() => {
					activeTab = category;
				}}
				class={cn(
					'inline-flex shrink-0 items-center rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200',
					activeTab === category
						? 'bg-primary text-primary-foreground shadow-sm'
						: 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
				)}
			>
				{category}
				<span
					class={cn(
						'ml-2 rounded-full px-1.5 py-0.5 text-[10px]',
						activeTab === category ? 'bg-primary-foreground/20' : 'bg-muted-foreground/20'
					)}
				>
					{category === 'All'
						? (memories.data?.length ?? 0)
						: (memories.data?.filter((m) => m.category === category).length ?? 0)}
				</span>
			</button>
		{/each}
	</div>

	<style>
		.scrollbar-none::-webkit-scrollbar {
			display: none;
		}
		.scrollbar-none {
			-ms-overflow-style: none;
			scrollbar-width: none;
		}
	</style>

	{#if filteredMemories.length === 0}
		<div
			class="flex min-h-[200px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center"
		>
			<Tag class="mb-4 h-12 w-12 text-muted-foreground/20" />
			<h3 class="text-lg font-medium text-foreground">No memories in this category</h3>
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each filteredMemories as memory (memory._id)}
				<div
					class="group relative flex flex-col justify-between rounded-2xl border border-border bg-card p-5 transition-all duration-200 hover:border-primary/20 hover:shadow-md hover:shadow-primary/5"
				>
					<div class="mb-4 flex items-start justify-between gap-4">
						<div class="flex flex-col gap-1.5">
							<div
								class="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary"
							>
								<Brain class="h-4 w-4" />
							</div>
							{#if memory.category}
								<span
									class="inline-flex w-fit items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium {categoryColors[
										memory.category
									] || categoryColors.Other}"
								>
									{memory.category}
								</span>
							{/if}
						</div>
						<Button
							variant="ghost"
							size="icon"
							class="h-8 w-8 shrink-0 rounded-full opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
							onclick={() => handleDelete(memory._id)}
							disabled={deletingId === memory._id}
						>
							{#if deletingId === memory._id}
								<Loader2 class="h-4 w-4 animate-spin" />
							{:else}
								<Trash2 class="h-4 w-4" />
							{/if}
						</Button>
					</div>

					<div class="space-y-3">
						<p class="text-[15px] leading-relaxed text-foreground/90">
							{memory.text}
						</p>
						<div class="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
							<span class="rounded-full bg-muted px-2 py-0.5">
								{new Date(memory.createdAt).toLocaleDateString(undefined, {
									month: 'short',
									day: 'numeric',
									year: 'numeric'
								})}
							</span>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
{/if}
