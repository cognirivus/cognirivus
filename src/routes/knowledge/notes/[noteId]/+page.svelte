<script lang="ts">
	import { page } from '$app/state';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { ArrowLeft, BookOpen, Loader2, Pencil } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	const noteId = $derived(page.params.noteId as Id<'knowledge_notes'>);
	const client = useConvexClient();

	const noteQuery = useQuery((api as any).knowledgeNotes.getNote, () =>
		noteId ? { noteId } : 'skip'
	);
	const cellsQuery = useQuery((api as any).knowledgeNotes.getNoteCells, () =>
		noteId ? { noteId } : 'skip'
	);
	const blocksQuery = useQuery((api as any).knowledgeNotes.getNoteBlocks, () =>
		noteId ? { noteId } : 'skip'
	);

	const note = $derived(noteQuery.data);
	const cells = $derived((cellsQuery.data ?? []) as any[]);
	const blocks = $derived((blocksQuery.data ?? []) as any[]);

	const statusColors: Record<string, string> = {
		draft: 'bg-gray-100 text-gray-800',
		review: 'bg-amber-100 text-amber-800',
		published: 'bg-green-100 text-green-800',
		archived: 'bg-red-100 text-red-800'
	};

	let updatingStatus = $state(false);

	async function updateStatus(status: 'draft' | 'review' | 'published' | 'archived') {
		if (!noteId) return;
		updatingStatus = true;
		try {
			await client.mutation((api as any).knowledgeNotes.updateNote, {
				noteId,
				status
			});
			toast.success(`Note moved to ${status}`);
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to update status');
		} finally {
			updatingStatus = false;
		}
	}
</script>

<main class="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
	<div class="mb-4">
		<Button variant="ghost" size="sm" href="/knowledge">
			<ArrowLeft class="mr-1 size-4" />
			Back to Knowledge
		</Button>
	</div>

	{#if noteQuery.isLoading}
		<div class="flex items-center justify-center py-12">
			<Loader2 class="size-6 animate-spin text-muted-foreground" />
		</div>
	{:else if !note}
		<Card>
			<CardContent class="py-12 text-center text-sm text-muted-foreground">
				Note not found.
			</CardContent>
		</Card>
	{:else}
		<header class="mb-6">
			<div class="flex flex-wrap items-start gap-3">
				<h1 class="text-2xl font-semibold tracking-tight">{note.title}</h1>
				<Badge variant="outline" class={statusColors[note.status]}>
					{note.status}
				</Badge>
				<Badge variant="outline">v{note.version}</Badge>
			</div>
			<p class="mt-2 text-muted-foreground">{note.summary}</p>
			<div class="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
				<span>Created: {new Date(note.createdAt).toLocaleDateString()}</span>
				<span>Updated: {new Date(note.updatedAt).toLocaleDateString()}</span>
				<span>{cells.length} contributing cells</span>
			</div>
		</header>

		<div class="grid gap-6 lg:grid-cols-3">
			<div class="space-y-6 lg:col-span-2">
				{#if blocks.length > 0}
					<div class="space-y-4">
						{#each blocks as block (block._id)}
							{#if block.blockType === 'paragraph'}
								<p class="text-sm leading-relaxed">{block.content}</p>
							{:else if block.blockType === 'list'}
								<ul class="list-inside list-disc space-y-1 text-sm">
									{#each block.content.split('\n') as item}
										{#if item.trim()}
											<li>{item.trim()}</li>
										{/if}
									{/each}
								</ul>
							{:else if block.blockType === 'quote'}
								<blockquote
									class="border-l-2 border-primary pl-4 text-sm text-muted-foreground italic"
								>
									{block.content}
								</blockquote>
							{:else if block.blockType === 'question'}
								<div class="rounded-md bg-muted p-3 text-sm">
									<span class="font-medium">Q:</span>
									{block.content}
								</div>
							{:else}
								<div class="rounded-md bg-muted p-3 text-sm">
									{block.content}
								</div>
							{/if}
						{/each}
					</div>
				{:else}
					<Card>
						<CardContent class="py-8 text-center text-sm text-muted-foreground">
							<div class="prose prose-sm max-w-none dark:prose-invert">
								{note.content || note.summary}
							</div>
						</CardContent>
					</Card>
				{/if}

				{#if cells.length > 0}
					<Card>
						<CardHeader>
							<CardTitle>Contributing Cells</CardTitle>
							<CardDescription>Knowledge cells that built this note</CardDescription>
						</CardHeader>
						<CardContent class="space-y-2">
							{#each cells as cell}
								<a
									href="/knowledge/cells/{cell._id}"
									class="flex items-center justify-between rounded-md border border-border p-3 transition-colors hover:bg-muted/50"
								>
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-medium">{cell.title}</p>
										<p class="truncate text-xs text-muted-foreground">{cell.summary}</p>
									</div>
									<Badge variant="outline" class="ml-2 shrink-0 text-xs">
										{Math.round(cell.contributionWeight * 100)}%
									</Badge>
								</a>
							{/each}
						</CardContent>
					</Card>
				{/if}
			</div>

			<div class="space-y-6">
				<Card>
					<CardHeader>
						<CardTitle class="text-base">Actions</CardTitle>
					</CardHeader>
					<CardContent class="space-y-2">
						{#if note.status !== 'published'}
							<Button class="w-full" disabled={updatingStatus} onclick={() => updateStatus('published')}>
								{#if updatingStatus}<Loader2 class="mr-1 size-4 animate-spin" />{/if}Publish
							</Button>
						{/if}
						{#if note.status !== 'review'}
							<Button class="w-full" variant="outline" disabled={updatingStatus} onclick={() => updateStatus('review')}>
								{#if updatingStatus}<Loader2 class="mr-1 size-4 animate-spin" />{/if}Submit for Review
							</Button>
						{/if}
						{#if note.status !== 'archived'}
							<Button class="w-full" variant="outline" disabled={updatingStatus} onclick={() => updateStatus('archived')}>
								{#if updatingStatus}<Loader2 class="mr-1 size-4 animate-spin" />{/if}Archive
							</Button>
						{/if}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle class="text-base">Info</CardTitle>
					</CardHeader>
					<CardContent class="space-y-2 text-sm">
						<div class="flex justify-between">
							<span class="text-muted-foreground">Status</span>
							<Badge variant={note.status === 'published' ? 'default' : 'secondary'}>
								{note.status}
							</Badge>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">Version</span>
							<span>v{note.version}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">Cells</span>
							<span>{cells.length}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">Blocks</span>
							<span>{blocks.length}</span>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	{/if}
</main>
