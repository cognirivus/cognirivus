<script lang="ts">
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Loader2, NotebookText } from '@lucide/svelte';

	type NoteSummary = {
		_id: Id<'knowledge_notes'>;
		title: string;
		summary: string;
		status: 'draft' | 'review' | 'published' | 'archived';
		version: number;
		cellCount: number;
		createdAt: number;
		updatedAt: number;
	};

	const notesQuery = useQuery((api as any).knowledgeNotes.listNotes, { limit: 50 });
	const notes = $derived((notesQuery.data ?? []) as Array<NoteSummary>);

	const statusColors: Record<string, string> = {
		draft: 'bg-gray-100 text-gray-800',
		review: 'bg-amber-100 text-amber-800',
		published: 'bg-green-100 text-green-800',
		archived: 'bg-red-100 text-red-800'
	};

	let filterStatus = $state<string>('all');

	const filteredNotes = $derived(
		filterStatus === 'all' ? notes : notes.filter((n) => n.status === filterStatus)
	);
</script>

<main class="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
	<div class="mb-6">
		<h1 class="text-2xl font-semibold tracking-tight">Notes</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			Synthesized documents built from knowledge cells.
		</p>
	</div>

	<div class="mb-4 flex gap-2">
		{#each ['all', 'draft', 'review', 'published', 'archived'] as status}
			<button
				class="rounded-md border px-3 py-1 text-xs font-medium transition-colors {filterStatus ===
				status
					? 'border-primary bg-primary text-primary-foreground'
					: 'border-border text-muted-foreground hover:bg-muted'}"
				onclick={() => (filterStatus = status)}
			>
				{status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
			</button>
		{/each}
	</div>

	{#if notesQuery.isLoading}
		<div class="flex items-center justify-center py-12">
			<Loader2 class="size-6 animate-spin text-muted-foreground" />
		</div>
	{:else if filteredNotes.length === 0}
		<Card>
			<CardContent class="py-12 text-center">
				<NotebookText class="mx-auto size-8 text-muted-foreground" />
				<p class="mt-3 text-sm text-muted-foreground">
					{filterStatus === 'all'
						? 'No notes yet. Approve cell suggestions to create your first note.'
						: `No ${filterStatus} notes.`}
				</p>
			</CardContent>
		</Card>
	{:else}
		<div class="grid gap-3 md:grid-cols-2">
			{#each filteredNotes as note (note._id)}
				<a
					href="/knowledge/notes/{note._id}"
					class="block rounded-md border border-border p-4 transition-colors hover:bg-muted/50"
				>
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0 flex-1">
							<h3 class="truncate font-medium">{note.title}</h3>
							<p class="mt-1 line-clamp-2 text-sm text-muted-foreground">{note.summary}</p>
						</div>
						<Badge variant="outline">v{note.version}</Badge>
					</div>
					<div class="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
						<Badge variant={note.status === 'published' ? 'default' : 'secondary'}>
							{note.status}
						</Badge>
						<span>{note.cellCount} cells</span>
						<span>{new Date(note.updatedAt).toLocaleDateString()}</span>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</main>
