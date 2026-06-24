<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Loader2, Users } from '@lucide/svelte';
	import type { Id } from '$convex/_generated/dataModel';

	type EntityType = 'person' | 'organization' | 'place' | 'concept' | 'event' | 'technology';

	const entitiesQuery = useQuery((api as any).knowledge.listKnowledgeEntities, { limit: 100 });
	const entities = $derived((entitiesQuery.data ?? []) as any[]);

	let filterType = $state<string>('all');
	const filtered = $derived(
		filterType === 'all' ? entities : entities.filter((e) => e.entityType === filterType)
	);

	const typeColors: Record<string, string> = {
		person: 'bg-blue-100 text-blue-800',
		organization: 'bg-green-100 text-green-800',
		place: 'bg-amber-100 text-amber-800',
		concept: 'bg-purple-100 text-purple-800',
		event: 'bg-rose-100 text-rose-800',
		technology: 'bg-cyan-100 text-cyan-800'
	};

	const types = ['all', 'person', 'organization', 'place', 'concept', 'event', 'technology'];
</script>

<main class="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
	<div class="mb-6">
		<h1 class="text-2xl font-semibold tracking-tight">Entities</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			People, organizations, concepts, and other entities extracted from sources.
		</p>
	</div>

	<div class="mb-4 flex flex-wrap gap-2">
		{#each types as type}
			<button
				class="rounded-md border px-3 py-1 text-xs font-medium transition-colors {filterType ===
				type
					? 'border-primary bg-primary text-primary-foreground'
					: 'border-border text-muted-foreground hover:bg-muted'}"
				onclick={() => (filterType = type)}
			>
				{type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)}
			</button>
		{/each}
	</div>

	{#if entitiesQuery.isLoading}
		<div class="flex justify-center py-12">
			<Loader2 class="size-6 animate-spin text-muted-foreground" />
		</div>
	{:else if entitiesQuery.error}
		<Card
			><CardContent class="py-12 text-center text-sm text-destructive">
				Failed to load entities. Please try again.
			</CardContent></Card
		>
	{:else if filtered.length === 0}
		<Card
			><CardContent class="py-12 text-center text-sm text-muted-foreground">
				<Users class="mx-auto mb-3 size-8" />{filterType === 'all'
					? 'No entities extracted yet.'
					: `No ${filterType} entities.`}
			</CardContent></Card
		>
	{:else}
		<div class="grid gap-3 md:grid-cols-2">
			{#each filtered as entity (entity._id)}
				<div class="rounded-md border border-border p-4">
					<div class="flex items-start justify-between gap-2">
						<div class="min-w-0 flex-1">
							<h3 class="truncate font-medium">{entity.name}</h3>
							{#if entity.description}
								<p class="mt-1 line-clamp-2 text-sm text-muted-foreground">{entity.description}</p>
							{/if}
						</div>
						<Badge class={typeColors[entity.entityType]}>{entity.entityType}</Badge>
					</div>
					{#if entity.aliases && entity.aliases.length > 0}
						<p class="mt-2 text-xs text-muted-foreground">
							Also known as: {entity.aliases.join(', ')}
						</p>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</main>
