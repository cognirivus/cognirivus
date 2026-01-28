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
		Brain,
		Pencil,
		Trash2,
		Save,
		X,
		Sparkles,
		ChevronLeft,
		ChevronRight,
		FileText,
		RotateCcw,
		Filter
	} from '@lucide/svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

	const client = useConvexClient();

	const PAGE_SIZE = 50;

	type ViewMode = 'flashcards' | 'content';
	let viewMode = $state<ViewMode>('content');

	const urlCursor = $derived(page.url.searchParams.get('cursor'));
	const urlHistory = $derived(page.url.searchParams.get('history'));
	const urlSubjectId = $derived(page.url.searchParams.get('subjectId') as Id<'subjects'> | null);

	let currentCursor = $state<string | null>(null);
	let cursorHistory = $state<string[]>([]);
	let selectedSubjectId = $state<Id<'subjects'> | null>(null);

	$effect(() => {
		currentCursor = urlCursor;
	});
	$effect(() => {
		cursorHistory = urlHistory ? urlHistory.split(',').filter(Boolean) : [];
	});
	$effect(() => {
		selectedSubjectId = urlSubjectId;
	});

	const subjectsQuery = useQuery(api.subjects.list, {});

	function updateUrl() {
		const params = new URLSearchParams();
		if (currentCursor) params.set('cursor', currentCursor);
		if (cursorHistory.length > 0) params.set('history', cursorHistory.join(','));
		if (selectedSubjectId) params.set('subjectId', selectedSubjectId);
		const queryString = params.toString();
		goto(`/admin/flashcards${queryString ? '?' + queryString : ''}`, {
			replaceState: false,
			keepFocus: true
		});
	}

	const contentQuery = useQuery(api.flashcards.getContentWithFlashcardCounts, () => ({
		subjectId: selectedSubjectId ?? undefined,
		paginationOpts: { numItems: PAGE_SIZE, cursor: currentCursor }
	}));

	const flashcardsQuery = useQuery(api.flashcards.listPaginated, () => ({
		subjectId: selectedSubjectId ?? undefined,
		paginationOpts: { numItems: PAGE_SIZE, cursor: currentCursor }
	}));

	const statsQuery = useQuery(api.flashcards.getStats, {});

	function handleSubjectFilter(id: Id<'subjects'> | null) {
		selectedSubjectId = id;
		resetPagination();
	}

	function nextPage() {
		const data = viewMode === 'content' ? contentQuery.data : flashcardsQuery.data;
		if (data && !data.isDone) {
			cursorHistory = [...cursorHistory, currentCursor ?? ''];
			currentCursor = data.continueCursor;
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
		updateUrl();
	}

	let isEditing = $state(false);
	let editingCard = $state<any>(null);
	let front = $state('');
	let back = $state('');
	let type = $state('basic');
	let difficulty = $state(3);
	let error = $state('');
	let isSaving = $state(false);

	let generatingContentId = $state<Id<'content'> | null>(null);
	let generateError = $state('');

	const types = ['basic', 'cloze', 'mcq'];
	const difficulties = [1, 2, 3, 4, 5];

	function startEdit(card: any) {
		isEditing = true;
		editingCard = card;
		front = card.front;
		back = card.back;
		type = card.type;
		difficulty = card.difficulty;
		error = '';
	}

	function cancelEdit() {
		isEditing = false;
		editingCard = null;
		error = '';
	}

	async function handleSubmit(event: Event) {
		event.preventDefault();
		error = '';
		isSaving = true;

		try {
			await client.mutation(api.flashcards.update, {
				id: editingCard._id,
				front,
				back,
				type,
				difficulty
			});
			isEditing = false;
			editingCard = null;
		} catch (e: any) {
			error = e.message || 'An error occurred while saving.';
		} finally {
			isSaving = false;
		}
	}

	async function handleDelete(id: Id<'flashcards'>) {
		if (confirm('Are you sure you want to delete this flashcard?')) {
			try {
				await client.mutation(api.flashcards.remove, { id });
			} catch (e: any) {
				alert(e.message || 'Failed to delete flashcard.');
			}
		}
	}

	async function handleGenerate(contentId: Id<'content'>) {
		generatingContentId = contentId;
		generateError = '';

		try {
			const result = await client.action(api.flashcards.generateFromContent, { contentId });
			if (!result.success) {
				generateError = result.error || 'Generation failed';
			}
		} catch (e: any) {
			generateError = e.message || 'Generation failed';
		} finally {
			generatingContentId = null;
		}
	}

	async function handleRegenerateAll(contentId: Id<'content'>) {
		if (!confirm('This will delete existing flashcards and generate new ones. Continue?')) return;

		generatingContentId = contentId;
		generateError = '';

		try {
			// Step 1: Generate new cards first (safer)
			const result = await client.action(api.flashcards.generateFromContent, { contentId });
			if (result.success) {
				// Step 2: If successful, delete OLD cards
				await client.mutation(api.flashcards.removeByContent, { contentId });
				await client.action(api.flashcards.generateFromContent, { contentId });
			} else {
				generateError = result.error || 'Generation failed. Existing cards were kept.';
			}
		} catch (e: any) {
			generateError = e.message || 'Operation failed';
		} finally {
			generatingContentId = null;
		}
	}

	function truncateText(str: string, maxLen: number = 100) {
		if (str.length <= maxLen) return str;
		return str.slice(0, maxLen) + '...';
	}

	function getDifficultyColor(d: number) {
		if (d <= 2) return 'bg-green-500/10 text-green-600 border-green-500/20';
		if (d <= 3) return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20';
		return 'bg-red-500/10 text-red-600 border-red-500/20';
	}
</script>

<div class="container mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
	<!-- Header -->
	<div class="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
		<div class="space-y-2">
			<div class="flex items-center gap-2">
				<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
					<Brain class="h-4 w-4 text-primary" />
				</div>
				<h1 class="text-3xl font-semibold tracking-tight">Flashcard Management</h1>
			</div>
			<p class="text-muted-foreground">Generate and manage flashcards from content items.</p>
		</div>

		<div class="flex flex-wrap gap-2">
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					<Button variant="outline" size="sm" class="h-9 gap-2 font-medium">
						<Filter class="h-4 w-4" />
						{selectedSubjectId
							? subjectsQuery.data?.find((s) => s._id === selectedSubjectId)?.name || 'Subject'
							: 'All Subjects'}
					</Button>
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="max-h-[300px] overflow-y-auto">
					<DropdownMenu.Item onSelect={() => handleSubjectFilter(null)}>
						All Subjects
					</DropdownMenu.Item>
					{#if subjectsQuery.data}
						{#each subjectsQuery.data as subject}
							<DropdownMenu.Item onSelect={() => handleSubjectFilter(subject._id)}>
								{subject.name}
							</DropdownMenu.Item>
						{/each}
					{/if}
				</DropdownMenu.Content>
			</DropdownMenu.Root>

			<Separator orientation="vertical" class="hidden h-9 lg:block" />

			<div class="flex rounded-lg bg-muted p-1">
				<button
					class="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-all {viewMode ===
					'content'
						? 'bg-background text-foreground shadow-sm'
						: 'text-muted-foreground hover:text-foreground'}"
					onclick={() => {
						viewMode = 'content';
						resetPagination();
					}}
				>
					<FileText class="h-3.5 w-3.5" />
					By Content
				</button>
				<button
					class="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-all {viewMode ===
					'flashcards'
						? 'bg-background text-foreground shadow-sm'
						: 'text-muted-foreground hover:text-foreground'}"
					onclick={() => {
						viewMode = 'flashcards';
						resetPagination();
					}}
				>
					<Brain class="h-3.5 w-3.5" />
					All Flashcards
				</button>
			</div>
		</div>
	</div>

	<!-- Stats Overview -->
	{#if statsQuery.data}
		<div class="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<div class="rounded-xl border bg-card p-5 shadow-sm">
				<div class="flex items-center justify-between">
					<div>
						<p class="text-xs font-medium tracking-wider text-muted-foreground uppercase">
							Total Flashcards
						</p>
						<p class="mt-1 text-2xl font-bold tabular-nums">{statsQuery.data.total}</p>
					</div>
					<div
						class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"
					>
						<Brain class="h-5 w-5" />
					</div>
				</div>
			</div>

			<div class="rounded-xl border bg-card p-5 shadow-sm">
				<div class="flex items-center justify-between">
					<div>
						<p class="text-xs font-medium tracking-wider text-muted-foreground uppercase">
							Basic Cards
						</p>
						<p class="mt-1 text-2xl font-bold tabular-nums">{statsQuery.data.byType?.basic || 0}</p>
					</div>
					<Badge variant="secondary" class="h-6">basic</Badge>
				</div>
			</div>

			<div class="rounded-xl border bg-card p-5 shadow-sm">
				<div class="flex items-center justify-between">
					<div>
						<p class="text-xs font-medium tracking-wider text-muted-foreground uppercase">
							Cloze Cards
						</p>
						<p class="mt-1 text-2xl font-bold tabular-nums">{statsQuery.data.byType?.cloze || 0}</p>
					</div>
					<Badge variant="outline" class="h-6">cloze</Badge>
				</div>
			</div>

			<div class="rounded-xl border bg-card p-5 shadow-sm">
				<div class="flex items-center justify-between">
					<div>
						<p class="text-xs font-medium tracking-wider text-muted-foreground uppercase">
							MCQ Cards
						</p>
						<p class="mt-1 text-2xl font-bold tabular-nums">{statsQuery.data.byType?.mcq || 0}</p>
					</div>
					<Badge variant="outline" class="h-6">mcq</Badge>
				</div>
			</div>
		</div>
	{/if}

	{#if generateError}
		<div
			class="mb-6 flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm font-medium text-destructive"
		>
			<div class="h-2 w-2 rounded-full bg-destructive"></div>
			{generateError}
		</div>
	{/if}

	{#if isEditing && editingCard}
		<div
			class="mb-8 overflow-hidden rounded-xl border border-primary/20 bg-card shadow-sm ring-1 ring-primary/5"
		>
			<div class="flex items-center justify-between border-b bg-muted/30 px-6 py-4">
				<div>
					<h2 class="font-semibold">Edit Flashcard</h2>
					<p class="mt-0.5 text-xs text-muted-foreground">Update the flashcard details below.</p>
				</div>
				<Button variant="ghost" size="icon" onclick={cancelEdit} class="h-8 w-8 rounded-full">
					<X class="h-4 w-4" />
				</Button>
			</div>

			<div class="p-6">
				<form onsubmit={handleSubmit} class="space-y-6">
					<div class="space-y-2">
						<label for="front" class="text-sm font-medium">Front (Question)</label>
						<Textarea
							id="front"
							bind:value={front}
							required
							rows={3}
							placeholder="Enter the question or prompt..."
							class="resize-none font-medium"
						/>
					</div>

					<div class="space-y-2">
						<label for="back" class="text-sm font-medium">Back (Answer)</label>
						<Textarea
							id="back"
							bind:value={back}
							required
							rows={3}
							placeholder="Enter the answer..."
							class="resize-none"
						/>
					</div>

					<div class="grid gap-6 sm:grid-cols-2">
						<div class="space-y-2">
							<label for="type" class="text-sm font-medium">Type</label>
							<div class="relative">
								<select
									id="type"
									bind:value={type}
									class="flex h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
								>
									{#each types as t}
										<option value={t}>{t}</option>
									{/each}
								</select>
								<ChevronLeft
									class="pointer-events-none absolute top-3 right-3 h-4 w-4 rotate-270 text-muted-foreground"
								/>
							</div>
						</div>
						<div class="space-y-2">
							<label for="difficulty" class="text-sm font-medium">Difficulty (1-5)</label>
							<div class="relative">
								<select
									id="difficulty"
									bind:value={difficulty}
									class="flex h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
								>
									{#each difficulties as d}
										<option value={d}>{d} - {d <= 2 ? 'Easy' : d <= 3 ? 'Medium' : 'Hard'}</option>
									{/each}
								</select>
								<ChevronLeft
									class="pointer-events-none absolute top-3 right-3 h-4 w-4 rotate-270 text-muted-foreground"
								/>
							</div>
						</div>
					</div>

					{#if error}
						<div
							class="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
						>
							{error}
						</div>
					{/if}

					<div class="flex flex-col-reverse justify-end gap-3 border-t pt-6 sm:flex-row">
						<Button
							variant="outline"
							onclick={cancelEdit}
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
								Update Flashcard
							{/if}
						</Button>
					</div>
				</form>
			</div>
		</div>
	{/if}

	{#if viewMode === 'content'}
		{#if contentQuery.isLoading}
			<div class="grid gap-4">
				{#each Array(5) as _}
					<div class="rounded-xl border bg-card p-6">
						<div class="flex items-center justify-between">
							<div class="space-y-2">
								<Skeleton class="h-6 w-[300px]" />
								<Skeleton class="h-4 w-[200px]" />
							</div>
							<Skeleton class="h-9 w-[120px]" />
						</div>
					</div>
				{/each}
			</div>
		{:else if contentQuery.error}
			<div class="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
				<p class="font-medium text-destructive">Failed to load content</p>
				<p class="mt-1 text-sm text-muted-foreground">
					{contentQuery.error.message || 'Unknown error'}
				</p>
			</div>
		{:else if contentQuery.data}
			<div class="overflow-hidden rounded-xl border bg-card shadow-sm">
				<div class="overflow-x-auto">
					<table class="w-full text-left text-sm">
						<thead>
							<tr class="border-b bg-muted/40 transition-colors">
								<th class="h-12 px-6 font-medium text-muted-foreground">Content</th>
								<th class="h-12 px-6 font-medium text-muted-foreground">Subject</th>
								<th class="h-12 px-6 font-medium text-muted-foreground">Topic</th>
								<th class="h-12 px-6 text-center font-medium text-muted-foreground">Flashcards</th>
								<th class="h-12 px-6 text-right font-medium text-muted-foreground">Actions</th>
							</tr>
						</thead>
						<tbody class="divide-y">
							{#each contentQuery.data.page as item}
								<tr class="transition-colors hover:bg-muted/20">
									<td class="max-w-[300px] px-6 py-4">
										<div class="flex flex-col gap-1">
											<span class="truncate font-semibold text-foreground" title={item.title}>
												{truncateText(item.title, 50)}
											</span>
											<span class="truncate text-xs text-muted-foreground" title={item.body}>
												{truncateText(item.body, 80)}
											</span>
										</div>
									</td>
									<td class="px-6 py-4">
										<Badge variant="secondary" class="font-medium"
											>{item.subject?.name || '—'}</Badge
										>
									</td>
									<td class="px-6 py-4">
										<Badge variant="outline">{item.topic}</Badge>
									</td>
									<td class="px-6 py-4 text-center">
										<Badge
											variant={item.flashcardCount > 0 ? 'default' : 'outline'}
											class="h-6 min-w-[2rem] justify-center"
										>
											{item.flashcardCount}
										</Badge>
									</td>
									<td class="px-6 py-4 text-right">
										<div class="flex justify-end gap-2">
											{#if item.flashcardCount === 0}
												<Button
													variant="default"
													size="sm"
													onclick={() => handleGenerate(item._id)}
													disabled={generatingContentId === item._id}
													class="h-8 gap-1.5 px-3 text-xs font-semibold"
												>
													{#if generatingContentId === item._id}
														<Loader variant="circular" size="sm" />
														Generating...
													{:else}
														<Sparkles class="h-3.5 w-3.5" />
														Generate
													{/if}
												</Button>
											{:else}
												<Button
													variant="ghost"
													size="sm"
													onclick={() => handleRegenerateAll(item._id)}
													disabled={generatingContentId === item._id}
													class="h-8 gap-1.5 px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
													title="Regenerate all flashcards"
												>
													{#if generatingContentId === item._id}
														<Loader variant="circular" size="sm" />
													{:else}
														<RotateCcw class="h-3.5 w-3.5" />
														Regenerate
													{/if}
												</Button>
											{/if}
										</div>
									</td>
								</tr>
							{:else}
								<tr>
									<td colspan="5" class="px-6 py-16 text-center">
										<div class="flex flex-col items-center gap-3">
											<div class="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
												<FileText class="h-6 w-6 text-muted-foreground/50" />
											</div>
											<h3 class="font-semibold text-foreground">No content found</h3>
											<p class="text-sm text-muted-foreground">
												Add content items first to generate flashcards.
											</p>
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
						Page {cursorHistory.length + 1} · {contentQuery.data.page.length} items
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
	{:else if flashcardsQuery.isLoading}
		<div class="grid gap-4">
			{#each Array(5) as _}
				<div class="rounded-xl border bg-card p-6">
					<Skeleton class="h-20 w-full" />
				</div>
			{/each}
		</div>
	{:else if flashcardsQuery.error}
		<div class="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
			<p class="font-medium text-destructive">Failed to load flashcards</p>
			<p class="mt-1 text-sm text-muted-foreground">
				{flashcardsQuery.error.message || 'Unknown error'}
			</p>
		</div>
	{:else if flashcardsQuery.data}
		<div class="overflow-hidden rounded-xl border bg-card shadow-sm">
			<div class="overflow-x-auto">
				<table class="w-full text-left text-sm">
					<thead>
						<tr class="border-b bg-muted/40 transition-colors">
							<th class="h-12 px-6 font-medium text-muted-foreground">Front</th>
							<th class="h-12 px-6 font-medium text-muted-foreground">Back</th>
							<th class="h-12 px-6 font-medium text-muted-foreground">Content</th>
							<th class="h-12 px-6 font-medium text-muted-foreground">Type</th>
							<th class="h-12 px-6 font-medium text-muted-foreground">Difficulty</th>
							<th class="h-12 px-6 text-right font-medium text-muted-foreground">Actions</th>
						</tr>
					</thead>
					<tbody class="divide-y">
						{#each flashcardsQuery.data.page as card}
							<tr class="transition-colors hover:bg-muted/20">
								<td class="max-w-[200px] px-6 py-4">
									<span class="line-clamp-2 font-medium text-foreground" title={card.front}>
										{truncateText(card.front, 50)}
									</span>
								</td>
								<td class="max-w-[200px] px-6 py-4">
									<span class="line-clamp-2 text-muted-foreground" title={card.back}>
										{truncateText(card.back, 50)}
									</span>
								</td>
								<td class="max-w-[150px] px-6 py-4">
									<span
										class="text-xs font-medium text-muted-foreground"
										title={card.content?.title}
									>
										{truncateText(card.content?.title || '—', 30)}
									</span>
								</td>
								<td class="px-6 py-4">
									<Badge variant="outline" class="capitalize">{card.type}</Badge>
								</td>
								<td class="px-6 py-4">
									<Badge class={getDifficultyColor(card.difficulty)}>
										Level {card.difficulty}
									</Badge>
								</td>
								<td class="px-6 py-4 text-right">
									<div class="flex justify-end gap-1">
										<Button
											variant="ghost"
											size="icon-sm"
											title="Edit"
											onclick={() => startEdit(card)}
											class="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
										>
											<Pencil class="h-4 w-4" />
										</Button>
										<Button
											variant="ghost"
											size="icon-sm"
											title="Delete"
											class="h-8 w-8 rounded-full text-destructive/80 hover:bg-destructive/10 hover:text-destructive"
											onclick={() => handleDelete(card._id)}
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
											<Brain class="h-6 w-6 text-muted-foreground/50" />
										</div>
										<h3 class="font-semibold text-foreground">No flashcards found</h3>
										<p class="text-sm text-muted-foreground">
											Generate flashcards from content items first.
										</p>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>

		{#if flashcardsQuery.data.page.length > 0}
			<div class="mt-6 flex items-center justify-between px-2">
				<div class="text-xs font-medium text-muted-foreground">
					Page {cursorHistory.length + 1} · {flashcardsQuery.data.page.length} items
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
						disabled={flashcardsQuery.data.isDone}
						class="h-8 gap-1.5 px-3 text-xs font-semibold"
					>
						Next
						<ChevronRight class="h-3.5 w-3.5" />
					</Button>
				</div>
			</div>
		{/if}
	{/if}
</div>
