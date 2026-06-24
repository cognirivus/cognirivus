<script lang="ts">
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Loader2, Route, Plus, Trash2, ChevronRight } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { resolve } from '$app/paths';
	import type { Id } from '$convex/_generated/dataModel';

	const client = useConvexClient();
	const pathsQuery = useQuery((api as any).knowledge.listKnowledgePaths, {});
	const paths = $derived((pathsQuery.data ?? []) as any[]);

	let showCreate = $state(false);
	let newTitle = $state('');
	let newDescription = $state('');
	let creating = $state(false);
	let deletingId = $state<string | null>(null);

	async function createPath() {
		if (!newTitle.trim()) return;
		creating = true;
		try {
			await client.mutation((api as any).knowledge.createPath, {
				title: newTitle.trim(),
				description: newDescription.trim() || undefined
			});
			toast.success('Path created');
			newTitle = '';
			newDescription = '';
			showCreate = false;
		} catch (e: any) {
			toast.error(e?.message ?? 'Failed');
		} finally {
			creating = false;
		}
	}

	async function deletePath(pathId: Id<'knowledge_paths'>) {
		deletingId = pathId;
		try {
			await client.mutation((api as any).knowledge.deletePath, { pathId });
			toast.success('Path deleted');
		} catch (e: any) {
			toast.error(e?.message ?? 'Failed');
		} finally {
			deletingId = null;
		}
	}

	const statusColors: Record<string, string> = {
		draft: 'bg-gray-100 text-gray-800',
		active: 'bg-blue-100 text-blue-800',
		completed: 'bg-green-100 text-green-800'
	};
</script>

<main class="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
	<div class="mb-6 flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Knowledge Paths</h1>
			<p class="mt-1 text-sm text-muted-foreground">
				Ordered learning sequences to master topics step by step.
			</p>
		</div>
		<Button size="sm" onclick={() => (showCreate = !showCreate)}>
			<Plus class="mr-1 size-4" />
			New Path
		</Button>
	</div>

	{#if showCreate}
		<Card class="mb-6">
			<CardHeader>
				<CardTitle class="text-base">Create Path</CardTitle>
			</CardHeader>
			<CardContent class="space-y-3">
				<input
					type="text"
					placeholder="Path title"
					bind:value={newTitle}
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
				/>
				<textarea
					placeholder="Description (optional)"
					bind:value={newDescription}
					rows="2"
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
				></textarea>
				<div class="flex justify-end gap-2">
					<Button variant="outline" size="sm" onclick={() => (showCreate = false)}>Cancel</Button>
					<Button size="sm" onclick={createPath} disabled={creating || !newTitle.trim()}>
						{#if creating}
							<Loader2 class="mr-1 size-4 animate-spin" />
						{/if}
						Create
					</Button>
				</div>
			</CardContent>
		</Card>
	{/if}

	{#if pathsQuery.isLoading}
		<div class="flex justify-center py-12">
			<Loader2 class="size-6 animate-spin text-muted-foreground" />
		</div>
	{:else if paths.length === 0}
		<Card>
			<CardContent class="py-12 text-center text-sm text-muted-foreground">
				<Route class="mx-auto mb-3 size-8" />No paths yet. Create a path to structure your learning
				journey.
			</CardContent>
		</Card>
	{:else}
		<div class="space-y-3">
			{#each paths as p (p._id)}
				<div class="rounded-md border border-border p-4 transition-colors hover:bg-muted/50">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<h3 class="font-medium">{p.title}</h3>
								<Badge class={statusColors[p.status]}>{p.status}</Badge>
							</div>
							{#if p.description}
								<p class="mt-1 text-sm text-muted-foreground">{p.description}</p>
							{/if}
							<p class="mt-2 text-xs text-muted-foreground">{p.totalSteps} steps</p>
						</div>
						<div class="flex items-center gap-1">
							<Button
								variant="ghost"
								size="icon"
								class="size-8"
								onclick={() => deletePath(p._id)}
								disabled={deletingId === p._id}
							>
								{#if deletingId === p._id}
									<Loader2 class="size-4 animate-spin" />
								{:else}
									<Trash2 class="size-4 text-muted-foreground" />
								{/if}
							</Button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</main>
