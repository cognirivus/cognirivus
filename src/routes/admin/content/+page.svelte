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
		ChevronRight,
		ChevronDown
	} from '@lucide/svelte';

	const client = useConvexClient();

	const PAGE_SIZE = 100;

	const urlCursor = $derived(page.url.searchParams.get('cursor'));
	const urlHistory = $derived(page.url.searchParams.get('history'));
	const urlTopic = $derived(page.url.searchParams.get('topic') || '');
	const urlSearch = $derived(page.url.searchParams.get('q') || '');

	let searchQuery = $state('');
	let selectedTopic = $state('');
	let currentCursor = $state<string | null>(null);
	let cursorHistory = $state<string[]>([]);

	$effect(() => {
		searchQuery = urlSearch;
	});
	$effect(() => {
		selectedTopic = urlTopic;
	});
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
	let body = $state('');
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
		body = '';
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
		body = item.body;
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
					body,
					subjectId,
					topic,
					source: source || undefined,
					date: date || undefined
				});
			} else {
				await client.mutation(api.content.insert, {
					title,
					body,
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
	<!-- Header -->
	<div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div class="space-y-2">
			<div class="flex items-center gap-2">
				<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
					<FileText class="h-4 w-4 text-primary" />
				</div>
				<h1 class="text-3xl font-semibold tracking-tight">Content Management</h1>
			</div>
			<p class="text-muted-foreground">
				Manage educational content linked to subjects and entities.
			</p>
		</div>
		{#if !isEditing}
			<Button onclick={startCreate} class="gap-2 font-medium shadow-sm">
				<Plus class="h-4 w-4" />
				Add Content
			</Button>
		{/if}
	</div>

	{#if isEditing}
		<div class="overflow-hidden rounded-xl border bg-card shadow-sm">
			<div class="border-b bg-muted/30 px-6 py-4">
				<div class="flex items-center justify-between">
					<div>
						<h2 class="text-lg font-semibold">{editingId ? 'Edit Content' : 'Add New Content'}</h2>
						<p class="text-sm text-muted-foreground">
							{editingId
								? 'Update the content details below.'
								: 'Fill in the details to create new content.'}
						</p>
					</div>
					<Button
						variant="ghost"
						size="icon"
						onclick={() => (isEditing = false)}
						class="h-8 w-8 rounded-full"
					>
						<X class="h-4 w-4" />
					</Button>
				</div>
			</div>

			<div class="p-6">
				<form onsubmit={handleSubmit} class="space-y-6">
					<div class="grid gap-6 sm:grid-cols-2">
						<div class="space-y-2">
							<label for="title" class="text-sm font-medium">Title / Entity Name</label>
							<Input
								type="text"
								id="title"
								bind:value={title}
								required
								placeholder="e.g., Paris Climate Agreement"
								class="h-10"
							/>
						</div>
						<div class="space-y-2">
							<label for="topic" class="text-sm font-medium">Topic</label>
							<div class="relative">
								<select
									id="topic"
									bind:value={topic}
									class="flex h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
								>
									{#each topics as t}
										<option value={t}>{t}</option>
									{/each}
								</select>
								<ChevronDown
									class="pointer-events-none absolute top-3 right-3 h-4 w-4 text-muted-foreground"
								/>
							</div>
						</div>
					</div>

					<div class="grid gap-6 sm:grid-cols-2">
						<div class="space-y-2">
							<label for="subject" class="text-sm font-medium">Subject</label>
							<div class="relative">
								<select
									id="subject"
									bind:value={subjectId}
									class="flex h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
								>
									{#if subjectsQuery.data}
										{#each subjectsQuery.data as subject}
											<option value={subject._id}>{subject.name} (GS{subject.gsPaper})</option>
										{/each}
									{/if}
								</select>
								<ChevronDown
									class="pointer-events-none absolute top-3 right-3 h-4 w-4 text-muted-foreground"
								/>
							</div>
						</div>
						<div class="space-y-2">
							<label for="date" class="text-sm font-medium">Date (optional)</label>
							<Input type="date" id="date" bind:value={date} class="h-10" />
						</div>
					</div>

					<div class="space-y-2">
						<label for="source" class="text-sm font-medium">Source (optional)</label>
						<Input
							type="text"
							id="source"
							bind:value={source}
							placeholder="e.g., The Hindu, PIB"
							class="h-10"
						/>
					</div>

					<div class="space-y-2">
						<label for="body" class="text-sm font-medium">Content Text</label>
						<Textarea
							id="body"
							bind:value={body}
							required
							rows={10}
							placeholder="Enter the full content text..."
							class="min-h-[200px] p-4 font-mono text-sm leading-relaxed"
						/>
					</div>

					{#if error}
						<div
							class="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm font-medium text-destructive"
						>
							{error}
						</div>
					{/if}

					<div class="flex flex-col-reverse justify-end gap-3 border-t pt-6 sm:flex-row">
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
							class="w-full gap-2 font-medium shadow-sm sm:w-auto"
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
			</div>
		</div>
	{:else}
		<div class="mb-6 rounded-xl border bg-card p-5 shadow-sm">
			<div class="mb-4 flex items-center gap-2 border-b pb-4">
				<Search class="h-4 w-4 text-muted-foreground" />
				<h3 class="font-semibold">Filters</h3>
			</div>

			<form
				class="flex flex-col gap-4 sm:flex-row"
				onsubmit={(e) => {
					e.preventDefault();
					applyFilters();
				}}
			>
				<div class="relative flex-1">
					<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						type="text"
						placeholder="Search content..."
						bind:value={searchQuery}
						class="h-10 pl-9"
					/>
				</div>
				<div class="relative sm:w-[200px]">
					<select
						bind:value={selectedTopic}
						onchange={applyFilters}
						class="flex h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
					>
						<option value="">All Topics</option>
						{#each topics as t}
							<option value={t}>{t}</option>
						{/each}
					</select>
					<ChevronDown
						class="pointer-events-none absolute top-3 right-3 h-4 w-4 text-muted-foreground"
					/>
				</div>
				<Button type="submit" size="sm" class="h-10 px-6 font-medium">Search</Button>
			</form>

			{#if urlSearch || urlTopic}
				<div class="mt-4 flex flex-wrap gap-2 border-t border-border/50 pt-2">
					{#if urlSearch}
						<Badge variant="secondary" class="gap-1.5 px-2.5 py-1 text-xs">
							<span class="text-muted-foreground">Search:</span>
							<span class="font-medium text-primary">{urlSearch}</span>
							<button
								onclick={clearSearch}
								class="ml-1 rounded-full p-0.5 hover:bg-background/50"
								aria-label="Clear search"
							>
								<X class="h-3 w-3" />
							</button>
						</Badge>
					{/if}
					{#if urlTopic}
						<Badge variant="secondary" class="gap-1.5 px-2.5 py-1 text-xs">
							<span class="text-muted-foreground">Topic:</span>
							<span class="font-medium text-primary">{urlTopic}</span>
							<button
								onclick={() => {
									selectedTopic = '';
									applyFilters();
								}}
								class="ml-1 rounded-full p-0.5 hover:bg-background/50"
								aria-label="Clear topic"
							>
								<X class="h-3 w-3" />
							</button>
						</Badge>
					{/if}
				</div>
			{/if}
		</div>

		{#if contentQuery.isLoading}
			<div class="grid gap-4">
				{#each Array(5) as _}
					<div class="rounded-xl border bg-card p-6">
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
					</div>
				{/each}
			</div>
		{:else if contentQuery.error}
			<div class="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
				<p class="font-medium text-destructive">Failed to load content</p>
				<p class="mt-1 text-sm text-muted-foreground">Please try refreshing the page.</p>
			</div>
		{:else if contentQuery.data}
			<div class="overflow-hidden rounded-xl border bg-card shadow-sm">
				<div class="overflow-x-auto">
					<table class="w-full text-left text-sm">
						<thead>
							<tr class="border-b bg-muted/40 transition-colors">
								<th class="h-12 px-6 font-medium text-muted-foreground">Title</th>
								<th class="h-12 px-6 font-medium text-muted-foreground">Subject</th>
								<th class="h-12 px-6 font-medium text-muted-foreground">Topic</th>
								<th class="h-12 px-6 font-medium text-muted-foreground">Date</th>
								<th class="h-12 px-6 font-medium text-muted-foreground">Entities</th>
								<th class="h-12 px-6 text-right font-medium text-muted-foreground">Actions</th>
							</tr>
						</thead>
						<tbody class="divide-y">
							{#each contentQuery.data.page as item}
								<tr class="transition-colors hover:bg-muted/20">
									<td class="max-w-[280px] px-6 py-4">
										<div class="flex flex-col gap-1">
											<span class="truncate font-semibold text-foreground" title={item.title}>
												{truncateText(item.title, 45)}
											</span>
											<span class="truncate text-xs text-muted-foreground" title={item.body}>
												{truncateText(item.body, 65)}
											</span>
										</div>
									</td>
									<td class="px-6 py-4">
										<Badge variant="secondary" class="font-medium"
											>{item.subject?.name || '—'}</Badge
										>
									</td>
									<td class="px-6 py-4">
										<Badge variant="outline" class="font-medium">{item.topic}</Badge>
									</td>
									<td class="px-6 py-4 font-medium text-muted-foreground tabular-nums">
										{formatDate(item.date || item.newsDate)}
									</td>
									<td class="px-6 py-4">
										{#if item.entities && item.entities.length > 0}
											<div class="flex flex-wrap gap-1.5">
												{#each item.entities.slice(0, 2) as entity}
													<Badge
														variant="outline"
														class="gap-1 bg-muted/30 px-1.5 py-0 text-[10px] font-medium"
													>
														<Link class="h-2.5 w-2.5 opacity-70" />
														{truncateText(entity.name, 12)}
													</Badge>
												{/each}
												{#if item.entities.length > 2}
													<Badge variant="secondary" class="h-5 px-1.5 text-[10px] font-medium"
														>+{item.entities.length - 2}</Badge
													>
												{/if}
											</div>
										{:else}
											<span class="text-xs text-muted-foreground italic">—</span>
										{/if}
									</td>
									<td class="px-6 py-4 text-right">
										<div class="flex justify-end gap-1">
											<Button
												variant="ghost"
												size="icon-sm"
												title="Edit"
												onclick={() => startEdit(item)}
												class="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
											>
												<Pencil class="h-4 w-4" />
											</Button>
											<Button
												variant="ghost"
												size="icon-sm"
												title="Delete"
												class="h-8 w-8 rounded-full text-destructive/80 hover:bg-destructive/10 hover:text-destructive"
												onclick={() => handleDelete(item._id)}
											>
												<Trash2 class="h-4 w-4" />
											</Button>
										</div>
									</td>
								</tr>
							{:else}
								<tr>
									<td colspan="6" class="px-6 py-16 text-center">
										<div class="flex flex-col items-center gap-3">
											<div class="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
												<FileText class="h-6 w-6 text-muted-foreground/50" />
											</div>
											<h3 class="font-semibold text-foreground">No content found</h3>
											<p class="text-sm text-muted-foreground max-w-xs mx-auto">
												{searchQuery || selectedTopic
													? 'Try adjusting your filters to find what you are looking for.'
													: 'Start by adding content to your knowledge base.'}
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
			</div>

			{#if contentQuery.data.page.length > 0}
				<div class="mt-6 flex items-center justify-between px-2">
					<div class="text-xs font-medium text-muted-foreground">
						Page <span class="font-bold text-foreground">{cursorHistory.length + 1}</span> · Showing {contentQuery
							.data.page.length} items
					</div>
					<div class="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							onclick={prevPage}
							disabled={cursorHistory.length === 0}
							class="h-8 gap-1.5 px-3 text-xs font-semibold"
						>
							<ChevronLeft class="h-3.5 w-3.5" />
							Previous
						</Button>
						<Button
							variant="outline"
							size="sm"
							onclick={nextPage}
							disabled={contentQuery.data.isDone}
							class="h-8 gap-1.5 px-3 text-xs font-semibold"
						>
							Next
							<ChevronRight class="h-3.5 w-3.5" />
						</Button>
					</div>
				</div>
			{/if}
		{/if}
	{/if}
</div>
