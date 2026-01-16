<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '../../convex/_generated/api';
	import type { Id } from '../../convex/_generated/dataModel';
	import { Trash2, Brain, Loader2, Tag } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Skeleton } from '$lib/components/ui/skeleton';
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
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each Array(6) as _}
			<Card.Root>
				<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
					<Skeleton class="h-8 w-8 rounded-full" />
					<Skeleton class="h-4 w-4 rounded-full" />
				</Card.Header>
				<Card.Content class="space-y-2">
					<Skeleton class="h-4 w-full" />
					<Skeleton class="h-4 w-[80%]" />
					<div class="pt-4">
						<Skeleton class="h-4 w-[60px] rounded-full" />
					</div>
				</Card.Content>
			</Card.Root>
		{/each}
	</div>
{:else if memories.data?.length === 0}
	<Card.Root
		class="flex min-h-[200px] flex-col items-center justify-center border-dashed bg-card/50 text-center"
	>
		<Card.Content class="flex flex-col items-center pt-6">
			<Brain class="mb-4 h-12 w-12 text-muted-foreground/20" />
			<h3 class="text-lg font-medium text-foreground">No memories found</h3>
			<p class="max-w-xs text-sm text-muted-foreground">
				Chat with the AI to build your memory bank! It automatically remembers important details.
			</p>
		</Card.Content>
	</Card.Root>
{:else}
	<!-- Tabs -->
	<div class="scrollbar-none mb-6 flex flex-nowrap gap-2 overflow-x-auto pb-1">
		{#each categories as category}
			<button
				onclick={() => {
					activeTab = category;
				}}
				class={cn(
					'inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200',
					activeTab === category
						? 'bg-primary text-primary-foreground shadow-sm'
						: 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
				)}
			>
				{category}
				<Badge
					variant={activeTab === category ? 'secondary' : 'outline'}
					class="ml-auto h-5 min-w-5 px-1 text-[10px]"
				>
					{category === 'All'
						? (memories.data?.length ?? 0)
						: (memories.data?.filter((m) => m.category === category).length ?? 0)}
				</Badge>
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
		<Card.Root
			class="flex min-h-[200px] flex-col items-center justify-center border-dashed bg-card/50 text-center"
		>
			<Card.Content class="flex flex-col items-center pt-6">
				<Tag class="mb-4 h-12 w-12 text-muted-foreground/20" />
				<h3 class="text-lg font-medium text-foreground">No memories in this category</h3>
			</Card.Content>
		</Card.Root>
	{:else}
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each filteredMemories as memory (memory._id)}
				<Card.Root
					class="group relative flex flex-col justify-between transition-all duration-200 hover:border-primary/20 hover:shadow-md hover:shadow-primary/5"
				>
					<Card.Header class="flex flex-row items-start justify-between space-y-0 pb-2">
						<div class="flex flex-col gap-2">
							<div
								class="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary"
							>
								<Brain class="h-4 w-4" />
							</div>
							{#if memory.category}
								<Badge
									variant="secondary"
									class={cn(
										'text-[10px] font-medium',
										categoryColors[memory.category] || categoryColors.Other
									)}
								>
									{memory.category}
								</Badge>
							{/if}
						</div>
						<Button
							variant="ghost"
							size="icon"
							class="h-8 w-8 shrink-0 rounded-full opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
							onclick={() => handleDelete(memory._id)}
							disabled={deletingId === memory._id}
						>
							{#if deletingId === memory._id}
								<Loader2 class="h-4 w-4 animate-spin" />
							{:else}
								<Trash2 class="h-4 w-4" />
							{/if}
						</Button>
					</Card.Header>

					<Card.Content class="pt-2">
						<p class="text-[15px] leading-relaxed text-foreground/90">
							{memory.text}
						</p>
					</Card.Content>
					<Card.Footer>
						<div class="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
							<Badge variant="outline" class="font-normal">
								{new Date(memory.createdAt).toLocaleDateString(undefined, {
									month: 'short',
									day: 'numeric',
									year: 'numeric'
								})}
							</Badge>
						</div>
					</Card.Footer>
				</Card.Root>
			{/each}
		</div>
	{/if}
{/if}
