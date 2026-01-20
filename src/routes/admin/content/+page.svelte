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
		FileText,
		Search,
		Link,
		Calendar,
		ChevronLeft,
		ChevronRight
	} from '@lucide/svelte';

	const client = useConvexClient();

	const PAGE_SIZE = 100;

	const urlCursor = $derived(page.url.searchParams.get('cursor'));
	const urlHistory = $derived(page.url.searchParams.get('history'));
	const urlTopic = $derived(page.url.searchParams.get('topic') || '');
	const urlSearch = $derived(page.url.searchParams.get('q') || '');

	let searchQuery = $state(urlSearch);
	let selectedTopic = $state(urlTopic);
	let currentCursor = $state<string | null>(urlCursor);
	let cursorHistory = $state<string[]>(urlHistory ? urlHistory.split(',').filter(Boolean) : []);

	function updateUrl() {
		const params = new URLSearchParams();
		if (currentCursor) params.set('cursor', currentCursor);
		if (cursorHistory.length > 0) params.set('history', cursorHistory.join(','));
		if (selectedTopic) params.set('topic', selectedTopic);
		if (searchQuery) params.set('q', searchQuery);
		const queryString = params.toString();
		goto(`/admin/content${queryString ? '?' + queryString : ''}`, {
			replaceState: true,
			keepFocus: true
		});
	}

	const contentQuery = useQuery(api.content.listPaginated, () => ({
		paginationOpts: { numItems: PAGE_SIZE, cursor: currentCursor },
		topic: selectedTopic || undefined,
		search: searchQuery || undefined
	}));
	const subjectsQuery = useQuery(api.subjects.list, {});

	function nextPage() {
		if (contentQuery.data && !contentQuery.data.isDone) {
			cursorHistory = [...cursorHistory, currentCursor ?? ''];
			currentCursor = contentQuery.data.continueCursor;
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

	function resetPagination() {
		currentCursor = null;
		cursorHistory = [];
	}

	function applyFilters() {
		resetPagination();
		updateUrl();
	}

	function clearSearch() {
		searchQuery = '';
		applyFilters();
	}

	let isEditing = $state(false);
	let editingId = $state<Id<'content'> | null>(null);
	let title = $state('');
	let text = $state('');
	let subjectId = $state<Id<'subjects'> | null>(null);
	let topic = $state('');
	let source = $state('');
	let date = $state('');
	let error = $state('');
	let isSaving = $state(false);

	const topics = [
		'Current Affairs',
		'Location',
		'Economy',
		'Polity',
		'Geography',
		'History',
		'Science',
		'Environment',
		'Other'
	];

	function startCreate() {
		isEditing = true;
		editingId = null;
		title = '';
		text = '';
		subjectId = subjectsQuery.data?.[0]?._id ?? null;
		topic = 'Current Affairs';
		source = '';
		date = '';
		error = '';
	}

	function startEdit(item: any) {
		isEditing = true;
		editingId = item._id;
		title = item.title;
		text = item.text;
		subjectId = item.subjectId;
		topic = item.topic;
		source = item.source || '';
		date = item.date || item.newsDate || '';
		error = '';
	}

	async function handleSubmit(event: Event) {
		event.preventDefault();
		error = '';
		isSaving = true;

		if (!subjectId) {
			error = 'Please select a subject.';
			isSaving = false;
			return;
		}

		try {
			if (editingId) {
				await client.mutation(api.content.update, {
					id: editingId,
					title,
					text,
					subjectId,
					topic,
					source: source || undefined,
					date: date || undefined
				});
			} else {
				await client.mutation(api.content.insert, {
					title,
					text,
					subjectId,
					topic,
					source: source || undefined
				});
			}
			isEditing = false;
		} catch (e: any) {
			error = e.message || 'An error occurred while saving.';
		} finally {
			isSaving = false;
		}
	}

	async function handleDelete(id: Id<'content'>) {
		if (
			confirm('Are you sure you want to delete this content? This will also remove entity links.')
		) {
			try {
				await client.mutation(api.content.remove, { id });
			} catch (e: any) {
				alert(e.message || 'Failed to delete content.');
			}
		}
	}

	function formatDate(date: string | undefined) {
		if (!date) return '—';
		return new Intl.DateTimeFormat('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		}).format(new Date(date));
	}

	function truncateText(str: string, maxLen: number = 100) {
		if (str.length <= maxLen) return str;
		return str.slice(0, maxLen) + '...';
	}
</script>

<div class="container mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
	<div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div class="space-y-1">
			<h1 class="text-3xl font-bold tracking-tight">Content Management</h1>
			<p class="text-muted-foreground">
				Manage educational content linked to subjects and entities.
			</p>
		</div>
		{#if !isEditing}
			<Button onclick={startCreate} class="gap-2 shadow-md shadow-primary/20">
				<Plus class="h-4 w-4" />
				Add Content
			</Button>
		{/if}
	</div>

	{#if isEditing}
		<Card.Root class="overflow-hidden border-primary/10 shadow-lg">
			<Card.Header class="bg-muted/30 pb-4">
				<div class="flex items-center justify-between">
					<div>
						<Card.Title>{editingId ? 'Edit Content' : 'Add New Content'}</Card.Title>
						<Card.Description>
							{editingId
								? 'Update the content details below.'
								: 'Fill in the details to create new content.'}
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
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<label for="title" class="text-sm font-semibold">Title / Entity Name</label>
							<Input
								type="text"
								id="title"
								bind:value={title}
								required
								placeholder="e.g., Paris Climate Agreement"
							/>
						</div>
						<div class="space-y-2">
							<label for="topic" class="text-sm font-semibold">Topic</label>
							<select
								id="topic"
								bind:value={topic}
								class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
							>
								{#each topics as t}
									<option value={t}>{t}</option>
								{/each}
							</select>
						</div>
					</div>

					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<label for="subject" class="text-sm font-semibold">Subject</label>
							<select
								id="subject"
								bind:value={subjectId}
								class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
							>
								{#if subjectsQuery.data}
									{#each subjectsQuery.data as subject}
										<option value={subject._id}>{subject.name} (GS{subject.gsPaper})</option>
									{/each}
								{/if}
							</select>
						</div>
						<div class="space-y-2">
							<label for="date" class="text-sm font-semibold">Date (optional)</label>
							<Input type="date" id="date" bind:value={date} />
						</div>
					</div>

					<div class="space-y-2">
						<label for="source" class="text-sm font-semibold">Source (optional)</label>
						<Input type="text" id="source" bind:value={source} placeholder="e.g., The Hindu, PIB" />
					</div>

					<div class="space-y-2">
						<label for="text" class="text-sm font-semibold">Content Text</label>
						<Textarea
							id="text"
							bind:value={text}
							required
							rows={10}
							placeholder="Enter the full content text..."
							class="min-h-[200px] font-mono text-sm"
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
								{editingId ? 'Update Content' : 'Save Content'}
							{/if}
						</Button>
					</div>
				</form>
			</Card.Content>
		</Card.Root>
	{:else}
		<Card.Root class="mb-6">
			<Card.Header class="pb-4">
				<Card.Title>Filters</Card.Title>
			</Card.Header>
			<Card.Content>
				<form
					class="flex flex-col gap-4 sm:flex-row"
					onsubmit={(e) => {
						e.preventDefault();
						applyFilters();
					}}
				>
					<div class="relative flex-1">
						<Search
							class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
						/>
						<Input
							type="text"
							placeholder="Search content..."
							bind:value={searchQuery}
							class="pl-10"
						/>
					</div>
					<select
						bind:value={selectedTopic}
						onchange={applyFilters}
						class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none sm:w-[180px]"
					>
						<option value="">All Topics</option>
						{#each topics as t}
							<option value={t}>{t}</option>
						{/each}
					</select>
					<Button type="submit" variant="secondary" size="sm">Search</Button>
				</form>

				{#if urlSearch || urlTopic}
					<div class="mt-4 flex flex-wrap gap-2">
						{#if urlSearch}
							<Badge variant="secondary" class="flex items-center gap-2 px-3 py-1.5 text-sm">
								<span>Search: <span class="font-bold text-primary">{urlSearch}</span></span>
								<button
									onclick={clearSearch}
									class="rounded-full p-0.5 transition-colors hover:bg-muted"
									aria-label="Clear search"
								>
									<X class="h-3.5 w-3.5" />
								</button>
							</Badge>
						{/if}
						{#if urlTopic}
							<Badge variant="secondary" class="flex items-center gap-2 px-3 py-1.5 text-sm">
								<span>Topic: <span class="font-bold text-primary">{urlTopic}</span></span>
								<button
									onclick={() => {
										selectedTopic = '';
										applyFilters();
									}}
									class="rounded-full p-0.5 transition-colors hover:bg-muted"
									aria-label="Clear topic"
								>
									<X class="h-3.5 w-3.5" />
								</button>
							</Badge>
						{/if}
					</div>
				{/if}
			</Card.Content>
		</Card.Root>

		{#if contentQuery.isLoading}
			<div class="grid gap-4">
				{#each Array(5) as _}
					<Card.Root>
						<Card.Content class="p-6">
							<div class="flex items-center justify-between">
								<div class="space-y-2">
									<Skeleton class="h-6 w-[300px]" />
									<Skeleton class="h-4 w-[200px]" />
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
		{:else if contentQuery.error}
			<Card.Root class="border-destructive/20 bg-destructive/10">
				<Card.Content class="pt-6 text-center text-destructive">
					<p class="font-medium">Failed to load content</p>
					<p class="mt-1 text-sm opacity-80">Please try refreshing the page.</p>
				</Card.Content>
			</Card.Root>
		{:else if contentQuery.data}
			<Card.Root>
				<Card.Content class="p-0">
					<div class="overflow-x-auto">
						<table class="w-full text-left text-sm">
							<thead>
								<tr class="border-b bg-muted/50">
									<th class="h-12 px-4 font-medium text-muted-foreground">Title</th>
									<th class="h-12 px-4 font-medium text-muted-foreground">Subject</th>
									<th class="h-12 px-4 font-medium text-muted-foreground">Topic</th>
									<th class="h-12 px-4 font-medium text-muted-foreground">Date</th>
									<th class="h-12 px-4 font-medium text-muted-foreground">Entities</th>
									<th class="h-12 px-4 text-right font-medium text-muted-foreground">Actions</th>
								</tr>
							</thead>
							<tbody class="divide-y">
								{#each contentQuery.data.page as item}
									<tr class="transition-colors hover:bg-muted/30">
										<td class="max-w-[250px] px-4 py-3">
											<div class="flex flex-col">
												<span class="font-semibold text-foreground" title={item.title}>
													{truncateText(item.title, 40)}
												</span>
												<span class="text-xs text-muted-foreground" title={item.text}>
													{truncateText(item.text, 60)}
												</span>
											</div>
										</td>
										<td class="px-4 py-3">
											<Badge variant="secondary">{item.subject?.name || '—'}</Badge>
										</td>
										<td class="px-4 py-3">
											<Badge variant="outline">{item.topic}</Badge>
										</td>
										<td class="px-4 py-3 text-muted-foreground">
											<div class="flex items-center gap-1">
												<Calendar class="h-3 w-3" />
												{formatDate(item.date || item.newsDate)}
											</div>
										</td>
										<td class="px-4 py-3">
											{#if item.entities && item.entities.length > 0}
												<div class="flex flex-wrap gap-1">
													{#each item.entities.slice(0, 2) as entity}
														<Badge variant="outline" class="gap-1 text-xs">
															<Link class="h-2.5 w-2.5" />
															{truncateText(entity.name, 15)}
														</Badge>
													{/each}
													{#if item.entities.length > 2}
														<Badge variant="outline" class="text-xs"
															>+{item.entities.length - 2}</Badge
														>
													{/if}
												</div>
											{:else}
												<span class="text-muted-foreground">—</span>
											{/if}
										</td>
										<td class="px-4 py-3 text-right">
											<div class="flex justify-end gap-1">
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
													onclick={() => handleDelete(item._id)}
												>
													<Trash2 class="h-4 w-4" />
												</Button>
											</div>
										</td>
									</tr>
								{:else}
									<tr>
										<td colspan="6" class="px-6 py-12 text-center">
											<div class="flex flex-col items-center gap-2">
												<FileText class="h-12 w-12 text-muted-foreground/20" />
												<h3 class="font-semibold text-foreground">No content found</h3>
												<p class="text-sm text-muted-foreground">
													{searchQuery || selectedTopic
														? 'Try adjusting your filters.'
														: 'Start by adding some content.'}
												</p>
												{#if !searchQuery && !selectedTopic}
													<Button variant="outline" size="sm" onclick={startCreate} class="mt-2">
														Add Content
													</Button>
												{/if}
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</Card.Content>
			</Card.Root>

			{#if contentQuery.data.page.length > 0}
				<div class="mt-4 flex items-center justify-between">
					<div class="text-sm text-muted-foreground">
						Page {cursorHistory.length + 1} · Showing {contentQuery.data.page.length} items
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
							disabled={contentQuery.data.isDone}
							class="gap-1"
						>
							Next
							<ChevronRight class="h-4 w-4" />
						</Button>
					</div>
				</div>
			{/if}
		{/if}
	{/if}
</div>
