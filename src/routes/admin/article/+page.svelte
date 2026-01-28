<script lang="ts">
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
		Eye,
		Save,
		X,
		Search,
		FileText,
		Sparkles,
		ChevronLeft,
		ChevronRight,
		Tag,
		ChevronDown,
		CheckSquare,
		Square,
		Loader2
	} from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { Markdown } from '$lib/components/prompt-kit/markdown/index.js';

	const client = useConvexClient();

	const PAGE_SIZE = 50;
	let currentCursor = $state<string | null>(null);
	let cursorHistory = $state<string[]>([]);
	let searchQuery = $state('');
	let selectedType = $state('');
	let onlyGenerated = $state(true);

	const entitiesQuery = useQuery((api as any).content.listAllEntities, () => ({
		paginationOpts: { numItems: PAGE_SIZE, cursor: currentCursor },
		type: selectedType || undefined,
		onlyGenerated: onlyGenerated
	}));

	const typesQuery = useQuery(api.content.listEntityTypes, {});

	function nextPage() {
		if (entitiesQuery.data && !entitiesQuery.data.isDone) {
			cursorHistory = [...cursorHistory, currentCursor ?? ''];
			currentCursor = entitiesQuery.data.continueCursor;
		}
	}

	function prevPage() {
		if (cursorHistory.length > 0) {
			const prev = cursorHistory[cursorHistory.length - 1];
			cursorHistory = cursorHistory.slice(0, -1);
			currentCursor = prev === '' ? null : prev;
		}
	}

	function resetPagination() {
		currentCursor = null;
		cursorHistory = [];
	}

	function applyFilters() {
		resetPagination();
	}

	let isEditing = $state(false);
	let editingEntity = $state<any>(null);
	let articleContent = $state('');
	let isSaving = $state(false);
	let isGenerating = $state(false);
	let showPreview = $state(false);
	let selectedIds = $state<Set<Id<'entities'>>>(new Set());
	let isDeleting = $state(false);

	function startEdit(entity: any) {
		isEditing = true;
		editingEntity = entity;
		articleContent = entity.article || '';
		showPreview = false;
	}

	async function handleSave() {
		if (!editingEntity) return;
		isSaving = true;
		try {
			await client.mutation((api as any).content.updateEntityArticle, {
				id: editingEntity._id,
				article: articleContent
			});
			toast.success('Article updated successfully');
			isEditing = false;
		} catch (e: any) {
			toast.error(e.message || 'Failed to save article');
		} finally {
			isSaving = false;
		}
	}

	async function handleGenerate() {
		if (!editingEntity) return;
		isGenerating = true;
		try {
			await client.action((api as any).synthesizer.generateArticle, {
				entityId: editingEntity._id
			});
			toast.success('Article generated successfully');
			// Refresh content
			const updated = await client.query((api as any).content.getEntity, { id: editingEntity._id });
			if (updated) {
				editingEntity = updated;
				articleContent = updated.article || '';
			}
		} catch (e: any) {
			toast.error(e.message || 'Failed to generate article');
		} finally {
			isGenerating = false;
		}
	}

	async function handleDeleteArticle(id: Id<'entities'>) {
		if (
			confirm(
				'Are you sure you want to remove this article? This will archive the current version.'
			)
		) {
			try {
				await client.mutation((api as any).content.removeEntityArticle, { id });
				toast.success('Article removed');
			} catch (e: any) {
				toast.error(e.message || 'Failed to remove article');
			}
		}
	}

	function toggleSelect(id: Id<'entities'>) {
		const next = new Set(selectedIds);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		selectedIds = next;
	}

	function toggleSelectAll() {
		if (!entitiesQuery.data) return;
		const allIds = entitiesQuery.data.page.map((entity: any) => entity._id);
		if (selectedIds.size === allIds.length) {
			selectedIds = new Set();
		} else {
			selectedIds = new Set(allIds);
		}
	}

	async function handleBulkDelete() {
		if (selectedIds.size === 0) return;
		const count = selectedIds.size;
		if (
			!confirm(
				`Are you sure you want to delete ${count} entity/entities? This will also delete all linked content associations and article archives.`
			)
		)
			return;

		isDeleting = true;
		try {
			await client.mutation((api as any).content.removeEntitiesBulk, {
				ids: Array.from(selectedIds)
			});
			selectedIds = new Set();
			toast.success(`Deleted ${count} entity/entities`);
		} catch (e: any) {
			toast.error(e.message || 'Failed to delete entities');
		} finally {
			isDeleting = false;
		}
	}

	function formatDate(date: number | undefined) {
		if (!date) return 'Never';
		return new Intl.DateTimeFormat('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		}).format(date);
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
				<h1 class="text-3xl font-semibold tracking-tight">Article Management</h1>
			</div>
			<p class="text-muted-foreground">Manage AI-synthesized articles for entities.</p>
		</div>
		{#if !isEditing && selectedIds.size > 0}
			<Button
				variant="destructive"
				size="sm"
				onclick={handleBulkDelete}
				disabled={isDeleting}
				class="gap-2 font-medium"
			>
				{#if isDeleting}
					<Loader2 class="h-4 w-4 animate-spin" />
				{:else}
					<Trash2 class="h-4 w-4" />
				{/if}
				Delete ({selectedIds.size})
			</Button>
		{/if}
	</div>

	{#if isEditing}
		<div class="space-y-6">
			<div
				class="overflow-hidden rounded-xl border border-primary/20 bg-card shadow-sm ring-1 ring-primary/5"
			>
				<div class="flex items-center justify-between border-b bg-muted/30 px-6 py-4">
					<div>
						<h2 class="flex items-center gap-2 text-lg font-semibold">
							Edit Article: {editingEntity.name}
						</h2>
						<p class="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
							<Badge variant="outline" class="h-5 px-1.5 capitalize">{editingEntity.type}</Badge>
							<span>•</span>
							<span>{editingEntity.segmentCount} segments linked</span>
						</p>
					</div>
					<div class="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							onclick={handleGenerate}
							disabled={isGenerating}
							class="h-9 gap-2 font-medium"
						>
							{#if isGenerating}
								<Loader variant="circular" size="sm" />
								Generating...
							{:else}
								<Sparkles class="h-4 w-4" />
								Regenerate with AI
							{/if}
						</Button>
						<Button
							variant="ghost"
							size="icon"
							onclick={() => (isEditing = false)}
							class="h-9 w-9 rounded-full"
						>
							<X class="h-4 w-4" />
						</Button>
					</div>
				</div>

				<div class="p-6">
					<div class="mb-6 flex w-fit items-center gap-2 rounded-lg bg-muted/20 p-1">
						<button
							class="rounded-md px-4 py-1.5 text-sm font-medium transition-all {!showPreview
								? 'bg-background text-foreground shadow-sm'
								: 'text-muted-foreground hover:text-foreground'}"
							onclick={() => (showPreview = false)}
						>
							Edit
						</button>
						<button
							class="rounded-md px-4 py-1.5 text-sm font-medium transition-all {showPreview
								? 'bg-background text-foreground shadow-sm'
								: 'text-muted-foreground hover:text-foreground'}"
							onclick={() => (showPreview = true)}
						>
							Preview
						</button>
					</div>

					{#if showPreview}
						<div
							class="prose prose-zinc dark:prose-invert min-h-[500px] max-w-none rounded-xl border bg-muted/10 p-8"
						>
							<Markdown content={articleContent} />
						</div>
					{:else}
						<Textarea
							bind:value={articleContent}
							placeholder="Article content in Markdown..."
							class="min-h-[600px] resize-y p-6 font-mono text-sm leading-relaxed"
						/>
					{/if}

					<div class="mt-6 flex justify-end gap-3 border-t pt-6">
						<Button variant="outline" onclick={() => (isEditing = false)}>Cancel</Button>
						<Button onclick={handleSave} disabled={isSaving} class="min-w-[120px] gap-2">
							{#if isSaving}
								<Loader variant="circular" size="sm" />
								Saving...
							{:else}
								<Save class="h-4 w-4" />
								Save Changes
							{/if}
						</Button>
					</div>
				</div>
			</div>
		</div>
	{:else}
		<div class="mb-8 rounded-xl border bg-card p-5 shadow-sm">
			<div class="mb-4 flex items-center gap-2 border-b pb-4">
				<Search class="h-4 w-4 text-muted-foreground" />
				<h3 class="font-semibold">Filters</h3>
			</div>

			<div class="flex flex-col items-end gap-4 sm:flex-row">
				<div class="relative w-full flex-1">
					<label
						for="search"
						class="mb-1.5 block text-xs font-medium tracking-wide text-muted-foreground uppercase"
						>Search Entity</label
					>
					<div class="relative">
						<Search
							class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
						/>
						<Input
							id="search"
							type="text"
							placeholder="Search entities (local)..."
							bind:value={searchQuery}
							class="h-10 pl-9"
						/>
					</div>
				</div>
				<div class="w-full sm:w-[240px]">
					<label
						for="type"
						class="mb-1.5 block text-xs font-medium tracking-wide text-muted-foreground uppercase"
						>Entity Type</label
					>
					<div class="relative">
						<select
							id="type"
							bind:value={selectedType}
							onchange={applyFilters}
							class="flex h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
						>
							<option value="">All Types</option>
							{#if typesQuery.data}
								{#each typesQuery.data as t}
									<option value={t.type}>{t.type}</option>
								{/each}
							{/if}
						</select>
						<ChevronDown
							class="pointer-events-none absolute top-3 right-3 h-4 w-4 text-muted-foreground"
						/>
					</div>
				</div>

				<div class="flex h-10 items-center gap-2 px-2 pb-1">
					<input
						type="checkbox"
						id="onlyGenerated"
						bind:checked={onlyGenerated}
						onchange={applyFilters}
						class="h-4 w-4 rounded border-input text-primary focus:ring-primary/20"
					/>
					<label for="onlyGenerated" class="text-sm font-medium whitespace-nowrap">
						Generated Only
					</label>
				</div>
			</div>
		</div>

		{#if entitiesQuery.isLoading}
			<div class="grid gap-4">
				{#each Array(5) as _}
					<Skeleton class="h-24 w-full rounded-xl" />
				{/each}
			</div>
		{:else if entitiesQuery.data}
			{@const filtered = entitiesQuery.data.page.filter(
				(e: any) => !searchQuery || e.name.toLowerCase().includes(searchQuery.toLowerCase())
			)}
			<div class="overflow-hidden rounded-xl border bg-card shadow-sm">
				<div class="overflow-x-auto">
					<table class="w-full text-left text-sm">
						<thead>
							<tr class="border-b bg-muted/30">
								<th class="h-12 w-12 px-4 align-middle">
									<button
										type="button"
										onclick={toggleSelectAll}
										class="flex items-center justify-center"
									>
										{#if entitiesQuery.data && selectedIds.size === entitiesQuery.data.page.length}
											<CheckSquare class="h-4 w-4 text-primary" />
										{:else if selectedIds.size > 0}
											<CheckSquare class="h-4 w-4 text-muted-foreground" />
										{:else}
											<Square class="h-4 w-4 text-muted-foreground" />
										{/if}
									</button>
								</th>
								<th class="px-6 py-4 font-semibold text-muted-foreground">Entity Name</th>
								<th class="px-6 py-4 font-semibold text-muted-foreground">Type</th>
								<th class="px-6 py-4 font-semibold text-muted-foreground">Segments</th>
								<th class="px-6 py-4 font-semibold text-muted-foreground">Status</th>
								<th class="px-6 py-4 font-semibold text-muted-foreground">Last Updated</th>
								<th class="px-6 py-4 text-right font-semibold text-muted-foreground">Actions</th>
							</tr>
						</thead>
						<tbody class="divide-y">
							{#each filtered as entity (entity._id)}
								<tr class="group transition-colors hover:bg-muted/30">
									<td class="w-12 px-4 py-4">
										<button
											type="button"
											onclick={() => toggleSelect(entity._id)}
											class="flex items-center justify-center"
										>
											{#if selectedIds.has(entity._id)}
												<CheckSquare class="h-4 w-4 text-primary" />
											{:else}
												<Square class="h-4 w-4 text-muted-foreground hover:text-foreground" />
											{/if}
										</button>
									</td>
									<td class="px-6 py-4">
										<div class="font-bold text-foreground">{entity.name}</div>
									</td>
									<td class="px-6 py-4">
										<Badge variant="secondary" class="font-medium capitalize">{entity.type}</Badge>
									</td>
									<td class="px-6 py-4">
										<div class="flex items-center gap-1.5 text-muted-foreground">
											<Tag class="h-3.5 w-3.5" />
											<span class="font-medium tabular-nums">{entity.segmentCount}</span>
										</div>
									</td>
									<td class="px-6 py-4">
										{#if entity.article}
											<Badge
												variant="outline"
												class="border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
											>
												Synthesized
											</Badge>
										{:else}
											<Badge variant="outline" class="text-muted-foreground">Draft</Badge>
										{/if}
									</td>
									<td class="px-6 py-4 text-xs text-muted-foreground tabular-nums">
										{formatDate(entity.articleUpdatedAt)}
									</td>
									<td class="px-6 py-4 text-right">
										<div
											class="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100"
										>
											<Button
												variant="ghost"
												size="icon"
												onclick={() => startEdit(entity)}
												class="h-8 w-8 rounded-full"
												title="Edit Article"
											>
												<Pencil class="h-3.5 w-3.5" />
											</Button>
											{#if entity.article}
												<Button
													variant="ghost"
													size="icon"
													onclick={() => handleDeleteArticle(entity._id)}
													class="h-8 w-8 rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
													title="Remove Article"
												>
													<Trash2 class="h-3.5 w-3.5" />
												</Button>
											{/if}
										</div>
									</td>
								</tr>
							{:else}
								<tr>
									<td colspan="7" class="px-6 py-20 text-center">
										<div class="flex flex-col items-center gap-3">
											<div class="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
												<Search class="h-6 w-6 text-muted-foreground/50" />
											</div>
											<h3 class="font-semibold text-foreground">No entities found</h3>
											<p class="text-sm text-muted-foreground max-w-xs mx-auto">
												Try adjusting your search or filters.
											</p>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>

			<div class="mt-6 flex items-center justify-between px-2">
				<div class="text-xs font-medium text-muted-foreground">
					Page <span class="font-bold text-foreground">{cursorHistory.length + 1}</span> · {entitiesQuery
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
						disabled={entitiesQuery.data.isDone}
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
