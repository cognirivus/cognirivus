<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import type { Id } from '../../../convex/_generated/dataModel';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import {
		Plus,
		Pencil,
		Trash2,
		Save,
		X,
		Newspaper,
		Calendar,
		FileText,
		ChevronDown,
		ChevronUp,
		ChevronLeft,
		ChevronRight
	} from '@lucide/svelte';

	const client = useConvexClient();

	const PAGE_SIZE = 100;

	const urlCursor = $derived(page.url.searchParams.get('cursor'));
	const urlHistory = $derived(page.url.searchParams.get('history'));

	let currentCursor = $state<string | null>(null);
	let cursorHistory = $state<string[]>([]);

	$effect(() => {
		currentCursor = urlCursor;
	});
	$effect(() => {
		cursorHistory = urlHistory ? urlHistory.split(',').filter(Boolean) : [];
	});

	function updateUrl() {
		const params = new URLSearchParams();
		if (currentCursor) params.set('cursor', currentCursor);
		if (cursorHistory.length > 0) params.set('history', cursorHistory.join(','));
		const queryString = params.toString();
		goto(`/admin/news${queryString ? '?' + queryString : ''}`, {
			replaceState: true,
			keepFocus: true
		});
	}

	const newsQuery = useQuery(api.news.listPaginated, () => ({
		paginationOpts: { numItems: PAGE_SIZE, cursor: currentCursor }
	}));

	function nextPage() {
		if (newsQuery.data && !newsQuery.data.isDone) {
			cursorHistory = [...cursorHistory, currentCursor ?? ''];
			currentCursor = newsQuery.data.continueCursor;
			updateUrl();
		}
	}

	function prevPage() {
		if (cursorHistory.length > 0) {
			const prev = cursorHistory[cursorHistory.length - 1];
			cursorHistory = cursorHistory.slice(0, -1);
			currentCursor = prev === '' ? null : prev;
			updateUrl();
		}
	}

	let isEditing = $state(false);
	let editingId = $state<Id<'news'> | null>(null);
	let date = $state('');
	let body = $state('');
	let error = $state('');
	let isSaving = $state(false);
	let expandedNewsId = $state<Id<'news'> | null>(null);

	const expandedNewsQuery = useQuery(api.news.getWithContent, () =>
		expandedNewsId ? { id: expandedNewsId } : 'skip'
	);

	function startCreate() {
		isEditing = true;
		editingId = null;
		date = new Date().toISOString().split('T')[0];
		body = '';
		error = '';
	}

	function startEdit(item: any) {
		isEditing = true;
		editingId = item._id;
		date = item.date;
		body = item.body;
		error = '';
	}

	async function handleSubmit(event: Event) {
		event.preventDefault();
		error = '';
		isSaving = true;

		try {
			if (editingId) {
				await client.mutation(api.news.update, { id: editingId, date, body });
			} else {
				await client.mutation(api.news.insert, { date, body });
			}
			isEditing = false;
		} catch (e: any) {
			error = e.message || 'An error occurred while saving.';
		} finally {
			isSaving = false;
		}
	}

	async function handleDelete(id: Id<'news'>, contentCount: number) {
		const message =
			contentCount > 0
				? `This news item has ${contentCount} linked content item(s). Deleting will unlink them. Continue?`
				: 'Are you sure you want to delete this news item?';

		if (confirm(message)) {
			try {
				await client.mutation(api.news.remove, { id });
				if (expandedNewsId === id) expandedNewsId = null;
			} catch (e: any) {
				alert(e.message || 'Failed to delete news.');
			}
		}
	}

	function toggleExpand(id: Id<'news'>) {
		expandedNewsId = expandedNewsId === id ? null : id;
	}

	function formatDate(dateStr: string) {
		return new Intl.DateTimeFormat('en-US', {
			weekday: 'short',
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		}).format(new Date(dateStr));
	}

	function truncateText(str: string, maxLen: number = 150) {
		if (str.length <= maxLen) return str;
		return str.slice(0, maxLen) + '...';
	}
</script>

<div class="container mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
	<div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div class="space-y-1">
			<h1 class="text-3xl font-bold tracking-tight">News Management</h1>
			<p class="text-muted-foreground">Manage daily news entries and view linked content.</p>
		</div>
		{#if !isEditing}
			<Button onclick={startCreate} class="gap-2 shadow-md shadow-primary/20">
				<Plus class="h-4 w-4" />
				Add News
			</Button>
		{/if}
	</div>

	{#if isEditing}
		<Card.Root class="overflow-hidden border-primary/10 shadow-lg">
			<Card.Header class="bg-muted/30 pb-4">
				<div class="flex items-center justify-between">
					<div>
						<Card.Title>{editingId ? 'Edit News' : 'Add News Entry'}</Card.Title>
						<Card.Description>
							{editingId ? 'Update the news details below.' : 'Add a new daily news entry.'}
						</Card.Description>
					</div>
					<Button
						variant="ghost"
						size="icon"
						onclick={() => (isEditing = false)}
						class="rounded-full"
					>
						<X class="h-4 w-4" />
					</Button>
				</div>
			</Card.Header>
			<Separator />
			<Card.Content class="pt-6">
				<form onsubmit={handleSubmit} class="space-y-6">
					<div class="space-y-2">
						<label for="date" class="text-sm font-semibold">Date</label>
						<Input type="date" id="date" bind:value={date} required />
					</div>

					<div class="space-y-2">
						<label for="body" class="text-sm font-semibold">News Content</label>
						<Textarea
							id="body"
							bind:value={body}
							required
							rows={15}
							placeholder="Enter the full news content for this date..."
							class="min-h-[300px] font-mono text-sm"
						/>
					</div>

					{#if error}
						<div
							class="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
						>
							{error}
						</div>
					{/if}

					<Separator />

					<div class="flex flex-col-reverse justify-end gap-3 pt-2 sm:flex-row">
						<Button
							variant="outline"
							onclick={() => (isEditing = false)}
							disabled={isSaving}
							class="w-full sm:w-auto"
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={isSaving}
							class="w-full gap-2 shadow-md shadow-primary/20 sm:w-auto"
						>
							{#if isSaving}
								<Loader variant="circular" size="sm" />
								Saving...
							{:else}
								<Save class="h-4 w-4" />
								{editingId ? 'Update News' : 'Save News'}
							{/if}
						</Button>
					</div>
				</form>
			</Card.Content>
		</Card.Root>
	{:else if newsQuery.isLoading}
		<div class="grid gap-4">
			{#each Array(5) as _}
				<Card.Root>
					<Card.Content class="p-6">
						<div class="flex items-center justify-between">
							<div class="space-y-2">
								<Skeleton class="h-6 w-[200px]" />
								<Skeleton class="h-4 w-[400px]" />
							</div>
							<div class="flex gap-2">
								<Skeleton class="h-9 w-9 rounded-md" />
								<Skeleton class="h-9 w-9 rounded-md" />
							</div>
						</div>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{:else if newsQuery.error}
		<Card.Root class="border-destructive/20 bg-destructive/10">
			<Card.Content class="pt-6 text-center text-destructive">
				<p class="font-medium">Failed to load news</p>
				<p class="mt-1 text-sm opacity-80">Please try refreshing the page.</p>
			</Card.Content>
		</Card.Root>
	{:else if newsQuery.data}
		<div class="space-y-3">
			{#each newsQuery.data.page as item}
				{@const isExpanded = expandedNewsId === item._id}
				<Card.Root class="overflow-hidden transition-shadow hover:shadow-md">
					<Card.Content class="p-0">
						<div class="flex items-center justify-between gap-4 p-4">
							<div class="min-w-0 flex-1">
								<div class="mb-1 flex items-center gap-2">
									<Calendar class="h-4 w-4 text-primary" />
									<span class="font-semibold text-foreground">{formatDate(item.date)}</span>
									{#if item.contentCount > 0}
										<Badge variant="secondary" class="gap-1">
											<FileText class="h-3 w-3" />
											{item.contentCount} item{item.contentCount !== 1 ? 's' : ''}
										</Badge>
									{/if}
								</div>
								<p class="text-sm text-muted-foreground">
									{truncateText(item.body)}
								</p>
							</div>
							<div class="flex shrink-0 items-center gap-1">
								{#if item.contentCount > 0}
									<Button
										variant="ghost"
										size="icon-sm"
										title={isExpanded ? 'Collapse' : 'Show linked content'}
										onclick={() => toggleExpand(item._id)}
										class="rounded-full"
									>
										{#if isExpanded}
											<ChevronUp class="h-4 w-4" />
										{:else}
											<ChevronDown class="h-4 w-4" />
										{/if}
									</Button>
								{/if}
								<Button
									variant="ghost"
									size="icon-sm"
									title="Edit"
									onclick={() => startEdit(item)}
									class="rounded-full"
								>
									<Pencil class="h-4 w-4" />
								</Button>
								<Button
									variant="ghost"
									size="icon-sm"
									title="Delete"
									class="rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
									onclick={() => handleDelete(item._id, item.contentCount)}
								>
									<Trash2 class="h-4 w-4" />
								</Button>
							</div>
						</div>

						{#if isExpanded}
							<Separator />
							<div class="bg-muted/30 p-4">
								<h4 class="mb-3 text-sm font-semibold text-muted-foreground">Linked Content</h4>
								{#if expandedNewsQuery.isLoading}
									<div class="space-y-2">
										<Skeleton class="h-10 w-full" />
										<Skeleton class="h-10 w-full" />
									</div>
								{:else if expandedNewsQuery.data?.content}
									<div class="space-y-2">
										{#each expandedNewsQuery.data.content as contentItem}
											<div
												class="flex items-center justify-between rounded-md border bg-background p-3"
											>
												<div class="min-w-0 flex-1">
													<div class="flex items-center gap-2">
														<span class="font-medium">{contentItem.title}</span>
														<Badge variant="outline" class="text-xs">{contentItem.topic}</Badge>
														{#if contentItem.subject}
															<Badge variant="secondary" class="text-xs"
																>{contentItem.subject.name}</Badge
															>
														{/if}
													</div>
													<p class="mt-1 text-xs text-muted-foreground">
														{truncateText(contentItem.body, 100)}
													</p>
												</div>
												<a href="/admin/content" class="ml-2 text-xs text-primary hover:underline">
													View
												</a>
											</div>
										{:else}
											<p class="text-sm text-muted-foreground">No content linked to this news.</p>
										{/each}
									</div>
								{/if}
							</div>
						{/if}
					</Card.Content>
				</Card.Root>
			{:else}
				<Card.Root>
					<Card.Content class="py-12 text-center">
						<div class="flex flex-col items-center gap-2">
							<Newspaper class="h-12 w-12 text-muted-foreground/20" />
							<h3 class="font-semibold text-foreground">No news entries yet</h3>
							<p class="text-sm text-muted-foreground">Start by adding your first news entry.</p>
							<Button variant="outline" size="sm" onclick={startCreate} class="mt-2">
								Add News
							</Button>
						</div>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>

		{#if newsQuery.data.page.length > 0}
			<div class="mt-4 flex items-center justify-between">
				<div class="text-sm text-muted-foreground">
					Page {cursorHistory.length + 1} · Showing {newsQuery.data.page.length} entries
				</div>
				<div class="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						onclick={prevPage}
						disabled={cursorHistory.length === 0}
						class="gap-1"
					>
						<ChevronLeft class="h-4 w-4" />
						Previous
					</Button>
					<Button
						variant="outline"
						size="sm"
						onclick={nextPage}
						disabled={newsQuery.data.isDone}
						class="gap-1"
					>
						Next
						<ChevronRight class="h-4 w-4" />
					</Button>
				</div>
			</div>
		{/if}
	{/if}
</div>
