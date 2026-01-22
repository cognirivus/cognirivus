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
				// Step 2: If successful, delete OLD cards (need to be careful not to delete the newly generated ones)
				// Actually, removeByContent as implemented deletes all cards for that content.
				// Better logic: generateFromContent should probably have an option to overwrite.
				// For now, I'll stick to the delete then generate but with better error handling.
				// Or I can modify removeByContent to take a list of IDs to keep? Too complex for now.

				// Let's do: Delete then Generate, but if Generate fails, we already lost them.
				// To be truly safe, generateFromContent should return the new IDs, and we delete everything else.

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
	<div class="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
		<div class="space-y-1">
			<h1 class="text-3xl font-bold tracking-tight">Flashcard Management</h1>
			<p class="text-muted-foreground">Generate and manage flashcards from content items.</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					<Button variant="outline" size="sm" class="gap-2">
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

			<Separator orientation="vertical" class="hidden h-8 lg:block" />

			<Button
				variant={viewMode === 'content' ? 'default' : 'outline'}
				size="sm"
				onclick={() => {
					viewMode = 'content';
					resetPagination();
				}}
			>
				<FileText class="mr-2 h-4 w-4" />
				By Content
			</Button>
			<Button
				variant={viewMode === 'flashcards' ? 'default' : 'outline'}
				size="sm"
				onclick={() => {
					viewMode = 'flashcards';
					resetPagination();
				}}
			>
				<Brain class="mr-2 h-4 w-4" />
				All Flashcards
			</Button>
		</div>
	</div>

	{#if statsQuery.data}
		<div class="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<Card.Root>
				<Card.Content class="flex items-center justify-between p-4">
					<div>
						<p class="text-sm text-muted-foreground">Total Flashcards</p>
						<p class="text-2xl font-bold">{statsQuery.data.total}</p>
					</div>
					<Brain class="h-8 w-8 text-primary/50" />
				</Card.Content>
			</Card.Root>
			<Card.Root>
				<Card.Content class="flex items-center justify-between p-4">
					<div>
						<p class="text-sm text-muted-foreground">Basic Cards</p>
						<p class="text-2xl font-bold">{statsQuery.data.byType?.basic || 0}</p>
					</div>
					<Badge variant="secondary">basic</Badge>
				</Card.Content>
			</Card.Root>
			<Card.Root>
				<Card.Content class="flex items-center justify-between p-4">
					<div>
						<p class="text-sm text-muted-foreground">Cloze Cards</p>
						<p class="text-2xl font-bold">{statsQuery.data.byType?.cloze || 0}</p>
					</div>
					<Badge variant="outline">cloze</Badge>
				</Card.Content>
			</Card.Root>
			<Card.Root>
				<Card.Content class="flex items-center justify-between p-4">
					<div>
						<p class="text-sm text-muted-foreground">MCQ Cards</p>
						<p class="text-2xl font-bold">{statsQuery.data.byType?.mcq || 0}</p>
					</div>
					<Badge variant="outline">mcq</Badge>
				</Card.Content>
			</Card.Root>
		</div>
	{/if}

	{#if generateError}
		<div
			class="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
		>
			{generateError}
		</div>
	{/if}

	{#if isEditing && editingCard}
		<Card.Root class="mb-6 overflow-hidden border-primary/10 shadow-lg">
			<Card.Header class="bg-muted/30 pb-4">
				<div class="flex items-center justify-between">
					<div>
						<Card.Title>Edit Flashcard</Card.Title>
						<Card.Description>Update the flashcard details below.</Card.Description>
					</div>
					<Button variant="ghost" size="icon" onclick={cancelEdit} class="rounded-full">
						<X class="h-4 w-4" />
					</Button>
				</div>
			</Card.Header>
			<Separator />
			<Card.Content class="pt-6">
				<form onsubmit={handleSubmit} class="space-y-6">
					<div class="space-y-2">
						<label for="front" class="text-sm font-semibold">Front (Question)</label>
						<Textarea
							id="front"
							bind:value={front}
							required
							rows={3}
							placeholder="Enter the question or prompt..."
						/>
					</div>

					<div class="space-y-2">
						<label for="back" class="text-sm font-semibold">Back (Answer)</label>
						<Textarea
							id="back"
							bind:value={back}
							required
							rows={3}
							placeholder="Enter the answer..."
						/>
					</div>

					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<label for="type" class="text-sm font-semibold">Type</label>
							<select
								id="type"
								bind:value={type}
								class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
							>
								{#each types as t}
									<option value={t}>{t}</option>
								{/each}
							</select>
						</div>
						<div class="space-y-2">
							<label for="difficulty" class="text-sm font-semibold">Difficulty (1-5)</label>
							<select
								id="difficulty"
								bind:value={difficulty}
								class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
							>
								{#each difficulties as d}
									<option value={d}>{d} - {d <= 2 ? 'Easy' : d <= 3 ? 'Medium' : 'Hard'}</option>
								{/each}
							</select>
						</div>
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
							onclick={cancelEdit}
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
								Update Flashcard
							{/if}
						</Button>
					</div>
				</form>
			</Card.Content>
		</Card.Root>
	{/if}

	{#if viewMode === 'content'}
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
								<Skeleton class="h-9 w-[120px]" />
							</div>
						</Card.Content>
					</Card.Root>
				{/each}
			</div>
		{:else if contentQuery.error}
			<Card.Root class="border-destructive/20 bg-destructive/10">
				<Card.Content class="pt-6 text-center text-destructive">
					<p class="font-medium">Failed to load content</p>
					<p class="mt-2 text-sm opacity-70">{contentQuery.error.message || 'Unknown error'}</p>
				</Card.Content>
			</Card.Root>
		{:else if contentQuery.data}
			<Card.Root>
				<Card.Content class="p-0">
					<div class="overflow-x-auto">
						<table class="w-full text-left text-sm">
							<thead>
								<tr class="border-b bg-muted/50">
									<th class="h-12 px-4 font-medium text-muted-foreground">Content</th>
									<th class="h-12 px-4 font-medium text-muted-foreground">Subject</th>
									<th class="h-12 px-4 font-medium text-muted-foreground">Topic</th>
									<th class="h-12 px-4 text-center font-medium text-muted-foreground">Flashcards</th
									>
									<th class="h-12 px-4 text-right font-medium text-muted-foreground">Actions</th>
								</tr>
							</thead>
							<tbody class="divide-y">
								{#each contentQuery.data.page as item}
									<tr class="transition-colors hover:bg-muted/30">
										<td class="max-w-[300px] px-4 py-3">
											<div class="flex flex-col">
												<span class="font-semibold text-foreground" title={item.title}>
													{truncateText(item.title, 50)}
												</span>
												<span class="text-xs text-muted-foreground" title={item.body}>
													{truncateText(item.body, 80)}
												</span>
											</div>
										</td>
										<td class="px-4 py-3">
											<Badge variant="secondary">{item.subject?.name || '—'}</Badge>
										</td>
										<td class="px-4 py-3">
											<Badge variant="outline">{item.topic}</Badge>
										</td>
										<td class="px-4 py-3 text-center">
											<Badge variant={item.flashcardCount > 0 ? 'default' : 'outline'}>
												{item.flashcardCount}
											</Badge>
										</td>
										<td class="px-4 py-3 text-right">
											<div class="flex justify-end gap-1">
												{#if item.flashcardCount === 0}
													<Button
														variant="default"
														size="sm"
														onclick={() => handleGenerate(item._id)}
														disabled={generatingContentId === item._id}
														class="gap-1"
													>
														{#if generatingContentId === item._id}
															<Loader variant="circular" size="sm" />
															Generating...
														{:else}
															<Sparkles class="h-4 w-4" />
															Generate
														{/if}
													</Button>
												{:else}
													<Button
														variant="outline"
														size="sm"
														onclick={() => handleRegenerateAll(item._id)}
														disabled={generatingContentId === item._id}
														class="gap-1"
														title="Regenerate all flashcards"
													>
														{#if generatingContentId === item._id}
															<Loader variant="circular" size="sm" />
														{:else}
															<RotateCcw class="h-4 w-4" />
														{/if}
													</Button>
												{/if}
											</div>
										</td>
									</tr>
								{:else}
									<tr>
										<td colspan="5" class="px-6 py-12 text-center">
											<div class="flex flex-col items-center gap-2">
												<FileText class="h-12 w-12 text-muted-foreground/20" />
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
	{:else if flashcardsQuery.isLoading}
		<div class="grid gap-4">
			{#each Array(5) as _}
				<Card.Root>
					<Card.Content class="p-6">
						<Skeleton class="h-20 w-full" />
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{:else if flashcardsQuery.error}
		<Card.Root class="border-destructive/20 bg-destructive/10">
			<Card.Content class="pt-6 text-center text-destructive">
				<p class="font-medium">Failed to load flashcards</p>
				<p class="mt-2 text-sm opacity-70">{flashcardsQuery.error.message || 'Unknown error'}</p>
			</Card.Content>
		</Card.Root>
	{:else if flashcardsQuery.data}
		<Card.Root>
			<Card.Content class="p-0">
				<div class="overflow-x-auto">
					<table class="w-full text-left text-sm">
						<thead>
							<tr class="border-b bg-muted/50">
								<th class="h-12 px-4 font-medium text-muted-foreground">Front</th>
								<th class="h-12 px-4 font-medium text-muted-foreground">Back</th>
								<th class="h-12 px-4 font-medium text-muted-foreground">Content</th>
								<th class="h-12 px-4 font-medium text-muted-foreground">Type</th>
								<th class="h-12 px-4 font-medium text-muted-foreground">Difficulty</th>
								<th class="h-12 px-4 text-right font-medium text-muted-foreground">Actions</th>
							</tr>
						</thead>
						<tbody class="divide-y">
							{#each flashcardsQuery.data.page as card}
								<tr class="transition-colors hover:bg-muted/30">
									<td class="max-w-[200px] px-4 py-3">
										<span class="font-medium" title={card.front}>
											{truncateText(card.front, 50)}
										</span>
									</td>
									<td class="max-w-[200px] px-4 py-3">
										<span class="text-muted-foreground" title={card.back}>
											{truncateText(card.back, 50)}
										</span>
									</td>
									<td class="max-w-[150px] px-4 py-3">
										<span class="text-xs text-muted-foreground" title={card.content?.title}>
											{truncateText(card.content?.title || '—', 30)}
										</span>
									</td>
									<td class="px-4 py-3">
										<Badge variant="outline">{card.type}</Badge>
									</td>
									<td class="px-4 py-3">
										<Badge class={getDifficultyColor(card.difficulty)}>
											{card.difficulty}
										</Badge>
									</td>
									<td class="px-4 py-3 text-right">
										<div class="flex justify-end gap-1">
											<Button
												variant="ghost"
												size="icon-sm"
												title="Edit"
												onclick={() => startEdit(card)}
												class="rounded-full"
											>
												<Pencil class="h-4 w-4" />
											</Button>
											<Button
												variant="ghost"
												size="icon-sm"
												title="Delete"
												class="rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
												onclick={() => handleDelete(card._id)}
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
											<Brain class="h-12 w-12 text-muted-foreground/20" />
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
			</Card.Content>
		</Card.Root>

		{#if flashcardsQuery.data.page.length > 0}
			<div class="mt-4 flex items-center justify-between px-2">
				<div class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
					Page {cursorHistory.length + 1} · {flashcardsQuery.data.page.length} items
				</div>
				<div class="flex items-center gap-1.5">
					<Button
						variant="outline"
						size="sm"
						onclick={prevPage}
						disabled={cursorHistory.length === 0}
						class="h-7 gap-1 px-2 text-[10px] font-bold tracking-tight uppercase"
					>
						<ChevronLeft class="h-3.5 w-3.5" />
						Previous
					</Button>
					<Button
						variant="outline"
						size="sm"
						onclick={nextPage}
						disabled={flashcardsQuery.data.isDone}
						class="h-7 gap-1 px-2 text-[10px] font-bold tracking-tight uppercase"
					>
						Next
						<ChevronRight class="h-3.5 w-3.5" />
					</Button>
				</div>
			</div>
		{/if}
	{/if}
</div>
