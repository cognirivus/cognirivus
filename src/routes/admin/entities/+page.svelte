<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { api } from '../../../convex/_generated/api';
	import type { Id } from '../../../convex/_generated/dataModel';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';
	import {
		Database,
		Search,
		ChevronDown,
		ChevronRight,
		ChevronLeft,
		Link2,
		FileText,
		Archive,
		RefreshCw,
		GitMerge,
		CheckSquare,
		Square,
		Star,
		AlertTriangle,
		Plus,
		Pencil,
		Trash2,
		Save,
		X
	} from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	const client = useConvexClient();

	type EntityTypeCount = {
		type: string;
		count: number;
	};

	type EntityRow = {
		_id: Id<'entities'>;
		name: string;
		type: string;
		slug: string;
		article?: string;
		articleGeneratedAt?: number;
		segmentCount: number;
	};

	type AssociatedContent = {
		_id: Id<'content'>;
		title: string;
		topic: string;
		date?: string;
		newsDate?: string;
		subject?: {
			name?: string;
		} | null;
	};

	type EntityArchive = {
		_id: Id<'article_archive'>;
		article: string;
		createdAt: number;
	};

	type MergePreview = {
		canonical: {
			id: Id<'entities'>;
			name: string;
			type: string;
			slug: string;
			hasArticle: boolean;
		};
		sources: Array<{
			id: Id<'entities'>;
			name: string;
			type: string;
			slug: string;
			hasArticle: boolean;
		}>;
		typeMismatches: Array<{
			id: Id<'entities'>;
			name: string;
			type: string;
		}>;
		counts: {
			totalSources: number;
			contentLinksTotal: number;
			contentLinksToPatch: number;
			contentLinksToDelete: number;
			groupSharesTotal: number;
			groupSharesToPatch: number;
			groupSharesToDelete: number;
			articleArchivesToPatch: number;
			sourceCurrentArticlesToArchive: number;
		};
	};

	const PAGE_SIZE = 100;
	const MAX_CONTENT_PREVIEW = 12;
	const MAX_ARCHIVE_PREVIEW = 8;

	let currentCursor = $state<string | null>(null);
	let cursorHistory = $state<string[]>([]);
	let searchQuery = $state('');
	let selectedType = $state('');
	let showUnlinkedOnly = $state(false);

	let expandedIds = new SvelteSet<Id<'entities'>>();
	let mergeSourceIds = new SvelteSet<Id<'entities'>>();
	let entityDetails = $state<
		Record<
			string,
			{
				loading: boolean;
				error: string | null;
				content: AssociatedContent[];
				archives: EntityArchive[];
			}
		>
	>({});
	let canonicalEntityId = $state<Id<'entities'> | null>(null);
	let canonicalEntityLabel = $state('');
	let mergePreview = $state<MergePreview | null>(null);
	let mergePreviewSignature = $state('');
	let isPreviewingMerge = $state(false);
	let isMerging = $state(false);
	let allowCrossTypeMerge = $state(false);
	let createName = $state('');
	let createType = $state('');
	let createSlug = $state('');
	let isCreatingEntity = $state(false);
	let editingEntityId = $state<Id<'entities'> | null>(null);
	let editName = $state('');
	let editType = $state('');
	let editSlug = $state('');
	let isSavingEntity = $state(false);
	let deletingEntityId = $state<Id<'entities'> | null>(null);
	let selectedDeleteIds = new SvelteSet<Id<'entities'>>();
	let isBulkDeleting = $state(false);

	const entitiesQuery = useQuery(api.content.listAllEntities, () => ({
		paginationOpts: { numItems: PAGE_SIZE, cursor: currentCursor },
		type: selectedType || undefined,
		onlyGenerated: false
	}));

	const typesQuery = useQuery(api.content.listEntityTypes, {});
	const entityTypes = $derived((typesQuery.data ?? []) as EntityTypeCount[]);
	const mergeSignature = $derived.by(() => {
		const sourceIds = Array.from(mergeSourceIds).sort();
		return `${canonicalEntityId ?? ''}::${sourceIds.join(',')}`;
	});
	const canPreviewMerge = $derived(
		!isPreviewingMerge && !isMerging && !!canonicalEntityId && mergeSourceIds.size > 0
	);
	const hasTypeMismatches = $derived((mergePreview?.typeMismatches.length ?? 0) > 0);
	const typeOptionValues = $derived(entityTypes.map((t) => t.type).sort());
	const unlinkedCount = $derived(
		(((entitiesQuery.data?.page as EntityRow[] | undefined) ?? []).filter(
			(entity) => entity.segmentCount === 0
		).length ?? 0) as number
	);
	const topFilterKey = $derived(
		showUnlinkedOnly ? 'unlinked' : selectedType ? `type:${selectedType}` : 'all'
	);
	const canExecuteMerge = $derived(
		!isMerging &&
			!isPreviewingMerge &&
			!!mergePreview &&
			mergePreviewSignature === mergeSignature &&
			!!canonicalEntityId &&
			mergeSourceIds.size > 0 &&
			(!hasTypeMismatches || allowCrossTypeMerge)
	);

	const filteredEntities = $derived.by(() => {
		let page = (entitiesQuery.data?.page as EntityRow[] | undefined) ?? [];
		if (showUnlinkedOnly) {
			page = page.filter((entity) => entity.segmentCount === 0);
		}
		page = page
			.filter((entity) =>
				!searchQuery ? true : entity.name.toLowerCase().includes(searchQuery.toLowerCase())
			)
			.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
		return page;
	});
	const bulkDeleteCount = $derived(selectedDeleteIds.size);
	const areAllVisibleSelected = $derived.by(() => {
		if (filteredEntities.length === 0) return false;
		return filteredEntities.every((entity) => selectedDeleteIds.has(entity._id));
	});

	function nextPage() {
		if (entitiesQuery.data && !entitiesQuery.data.isDone) {
			cursorHistory = [...cursorHistory, currentCursor ?? ''];
			currentCursor = entitiesQuery.data.continueCursor;
			expandedIds.clear();
			clearMergeSelection();
			clearDeleteSelection();
		}
	}

	function prevPage() {
		if (cursorHistory.length > 0) {
			const prev = cursorHistory[cursorHistory.length - 1];
			cursorHistory = cursorHistory.slice(0, -1);
			currentCursor = prev === '' ? null : prev;
			expandedIds.clear();
			clearMergeSelection();
			clearDeleteSelection();
		}
	}

	function resetPagination() {
		currentCursor = null;
		cursorHistory = [];
	}

	function applyFilters() {
		resetPagination();
		expandedIds.clear();
		clearMergeSelection();
		clearDeleteSelection();
	}

	function setTopFilter(mode: 'all' | 'unlinked' | 'type', type?: string) {
		if (mode === 'all') {
			selectedType = '';
			showUnlinkedOnly = false;
		} else if (mode === 'unlinked') {
			selectedType = '';
			showUnlinkedOnly = true;
		} else {
			selectedType = type ?? '';
			showUnlinkedOnly = false;
		}
		applyFilters();
	}

	function formatDate(value: number | undefined) {
		if (!value) return 'Never';
		return new Intl.DateTimeFormat('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		}).format(value);
	}

	function formatContentDate(item: AssociatedContent) {
		if (item.newsDate) return item.newsDate;
		if (item.date) return item.date;
		return 'N/A';
	}

	function summarizeArticle(article: string | undefined) {
		if (!article) return 'No synthesized article available.';
		const cleaned = article.replace(/\s+/g, ' ').trim();
		return cleaned.length > 220 ? `${cleaned.slice(0, 220)}...` : cleaned;
	}

	function getErrorMessage(error: unknown) {
		if (error instanceof Error) return error.message;
		return 'Failed to load associated entity data';
	}

	function resetMergePreview() {
		mergePreview = null;
		mergePreviewSignature = '';
		allowCrossTypeMerge = false;
	}

	function clearMergeSelection() {
		mergeSourceIds.clear();
		canonicalEntityId = null;
		canonicalEntityLabel = '';
		resetMergePreview();
	}

	function clearDeleteSelection() {
		selectedDeleteIds.clear();
	}

	function toggleDeleteSelection(entityId: Id<'entities'>) {
		if (selectedDeleteIds.has(entityId)) {
			selectedDeleteIds.delete(entityId);
		} else {
			selectedDeleteIds.add(entityId);
		}
	}

	function toggleSelectAllVisible() {
		if (areAllVisibleSelected) {
			for (const entity of filteredEntities) {
				selectedDeleteIds.delete(entity._id);
			}
		} else {
			for (const entity of filteredEntities) {
				selectedDeleteIds.add(entity._id);
			}
		}
	}

	function toggleMergeSource(entityId: Id<'entities'>) {
		if (canonicalEntityId === entityId) return;
		if (mergeSourceIds.has(entityId)) {
			mergeSourceIds.delete(entityId);
		} else {
			mergeSourceIds.add(entityId);
		}
		resetMergePreview();
	}

	function setCanonicalEntity(entity: EntityRow) {
		canonicalEntityId = entity._id;
		canonicalEntityLabel = entity.name;
		if (mergeSourceIds.has(entity._id)) {
			mergeSourceIds.delete(entity._id);
		}
		resetMergePreview();
	}

	async function previewMerge() {
		if (!canonicalEntityId || mergeSourceIds.size === 0) {
			toast.error('Select one canonical entity and at least one source entity.');
			return;
		}

		isPreviewingMerge = true;
		try {
			const preview = await client.query((api as any).content.previewEntityMerge, {
				canonicalEntityId,
				sourceEntityIds: Array.from(mergeSourceIds)
			});
			mergePreview = preview as MergePreview;
			mergePreviewSignature = mergeSignature;
			toast.success('Merge preview ready');
		} catch (e: unknown) {
			toast.error(getErrorMessage(e));
		} finally {
			isPreviewingMerge = false;
		}
	}

	async function executeMerge() {
		if (!canonicalEntityId || mergeSourceIds.size === 0) {
			toast.error('Select one canonical entity and at least one source entity.');
			return;
		}

		if (!mergePreview || mergePreviewSignature !== mergeSignature) {
			await previewMerge();
			if (!mergePreview || mergePreviewSignature !== mergeSignature) return;
		}

		if (
			!confirm(
				`Merge ${mergeSourceIds.size} source entities into "${canonicalEntityLabel}"? ` +
					`This will relink content, archive/article history, and group shares.`
			)
		) {
			return;
		}

		isMerging = true;
		try {
			const result = await client.mutation((api as any).content.mergeEntities, {
				canonicalEntityId,
				sourceEntityIds: Array.from(mergeSourceIds),
				allowCrossType: allowCrossTypeMerge || undefined
			});
			const mergedCount = (result as any)?.mergedSourceIds?.length ?? mergeSourceIds.size;
			toast.success(`Merged ${mergedCount} entity/entities into "${canonicalEntityLabel}"`);
			clearMergeSelection();
			expandedIds.clear();
			entityDetails = {};
		} catch (e: unknown) {
			toast.error(getErrorMessage(e));
		} finally {
			isMerging = false;
		}
	}

	function startEditEntity(entity: EntityRow) {
		editingEntityId = entity._id;
		editName = entity.name;
		editType = entity.type;
		editSlug = entity.slug;
	}

	function cancelEditEntity() {
		editingEntityId = null;
		editName = '';
		editType = '';
		editSlug = '';
	}

	async function handleCreateEntity() {
		const name = createName.trim();
		const type = createType.trim();
		const slug = createSlug.trim();

		if (!name) {
			toast.error('Entity name is required');
			return;
		}
		if (!type) {
			toast.error('Entity type is required');
			return;
		}

		isCreatingEntity = true;
		try {
			await client.mutation((api as any).content.createEntity, {
				name,
				type,
				slug: slug || undefined
			});
			toast.success('Entity created');
			createName = '';
			createType = '';
			createSlug = '';
		} catch (e: unknown) {
			toast.error(getErrorMessage(e));
		} finally {
			isCreatingEntity = false;
		}
	}

	async function handleSaveEntityEdit() {
		if (!editingEntityId) return;

		const name = editName.trim();
		const type = editType.trim();
		const slug = editSlug.trim();

		if (!name) {
			toast.error('Entity name is required');
			return;
		}
		if (!type) {
			toast.error('Entity type is required');
			return;
		}

		isSavingEntity = true;
		try {
			await client.mutation((api as any).content.updateEntity, {
				id: editingEntityId,
				name,
				type,
				slug: slug || undefined
			});
			if (canonicalEntityId === editingEntityId) {
				canonicalEntityLabel = name;
			}
			toast.success('Entity updated');
			cancelEditEntity();
			resetMergePreview();
		} catch (e: unknown) {
			toast.error(getErrorMessage(e));
		} finally {
			isSavingEntity = false;
		}
	}

	async function handleDeleteEntity(entity: EntityRow) {
		if (
			!confirm(
				`Delete "${entity.name}"? This removes its links, archives, group shares, and aliases.`
			)
		) {
			return;
		}

		deletingEntityId = entity._id;
		try {
			await client.mutation((api as any).content.deleteEntity, { id: entity._id });
			if (canonicalEntityId === entity._id) {
				canonicalEntityId = null;
				canonicalEntityLabel = '';
			}
			if (mergeSourceIds.has(entity._id)) {
				mergeSourceIds.delete(entity._id);
			}
			if (expandedIds.has(entity._id)) {
				expandedIds.delete(entity._id);
			}
			const nextDetails = { ...entityDetails };
			delete nextDetails[entity._id];
			entityDetails = nextDetails;
			if (editingEntityId === entity._id) {
				cancelEditEntity();
			}
			resetMergePreview();
			toast.success('Entity deleted');
		} catch (e: unknown) {
			toast.error(getErrorMessage(e));
		} finally {
			deletingEntityId = null;
		}
	}

	async function handleBulkDeleteEntities() {
		const ids = Array.from(selectedDeleteIds);
		if (ids.length === 0) {
			toast.error('Select entities to delete');
			return;
		}

		if (
			!confirm(
				`Delete ${ids.length} selected entity/entities? ` +
					`This removes links, archives, group shares, and aliases.`
			)
		) {
			return;
		}

		isBulkDeleting = true;
		try {
			await client.mutation((api as any).content.removeEntitiesBulk, { ids });

			const deleted = new Set(ids);
			for (const id of ids) {
				if (mergeSourceIds.has(id)) mergeSourceIds.delete(id);
				if (expandedIds.has(id)) expandedIds.delete(id);
			}
			if (canonicalEntityId && deleted.has(canonicalEntityId)) {
				canonicalEntityId = null;
				canonicalEntityLabel = '';
			}
			if (editingEntityId && deleted.has(editingEntityId)) {
				cancelEditEntity();
			}

			const nextDetails = { ...entityDetails };
			for (const id of ids) {
				delete nextDetails[id];
			}
			entityDetails = nextDetails;
			resetMergePreview();
			clearDeleteSelection();
			toast.success(`Deleted ${ids.length} entity/entities`);
		} catch (e: unknown) {
			toast.error(getErrorMessage(e));
		} finally {
			isBulkDeleting = false;
		}
	}

	async function loadEntityDetails(entityId: Id<'entities'>) {
		entityDetails = {
			...entityDetails,
			[entityId]: {
				loading: true,
				error: null,
				content: [],
				archives: []
			}
		};

		try {
			const [content, archives] = await Promise.all([
				client.query(api.content.listByEntity, { entityId }),
				client.query(api.content.listArticleArchive, { entityId })
			]);

			entityDetails = {
				...entityDetails,
				[entityId]: {
					loading: false,
					error: null,
					content: (content ?? []) as AssociatedContent[],
					archives: (archives ?? []) as EntityArchive[]
				}
			};
		} catch (e: unknown) {
			entityDetails = {
				...entityDetails,
				[entityId]: {
					loading: false,
					error: getErrorMessage(e),
					content: [],
					archives: []
				}
			};
		}
	}

	function toggleExpanded(entityId: Id<'entities'>) {
		if (expandedIds.has(entityId)) {
			expandedIds.delete(entityId);
		} else {
			expandedIds.add(entityId);
			if (!entityDetails[entityId]) {
				void loadEntityDetails(entityId);
			}
		}
	}

	async function refreshDetails(entityId: Id<'entities'>) {
		await loadEntityDetails(entityId);
		toast.success('Entity details refreshed');
	}
</script>

<div class="container mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
	<div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div class="space-y-2">
			<div class="flex items-center gap-2">
				<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
					<Database class="h-4 w-4 text-primary" />
				</div>
				<h1 class="text-3xl font-semibold tracking-tight">Entity Registry</h1>
			</div>
			<p class="text-muted-foreground">
				View all entities with linked content, article status, and archive history.
			</p>
		</div>
	</div>

	<div class="flex flex-col">
		<div class="order-3 mb-8 rounded-xl border bg-card p-5 shadow-sm">
			<div class="mb-4 flex items-center gap-2 border-b pb-4">
				<Search class="h-4 w-4 text-muted-foreground" />
				<h3 class="font-semibold">Filters</h3>
			</div>
			<div class="flex flex-col gap-4">
				<div class="relative w-full">
					<label
						for="entity-search"
						class="mb-1.5 block text-xs font-medium tracking-wide text-muted-foreground uppercase"
					>
						Search Entity
					</label>
					<div class="relative">
						<Search
							class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
						/>
						<Input
							id="entity-search"
							type="text"
							placeholder="Search by entity name..."
							bind:value={searchQuery}
							class="h-10 pl-9"
						/>
					</div>
				</div>
				<div>
					<p class="mb-1.5 block text-xs font-medium tracking-wide text-muted-foreground uppercase">
						Quick Filters
					</p>
					<div class="overflow-x-auto">
						<div class="flex w-max items-center gap-2 pb-1">
							<Button
								variant={topFilterKey === 'all' ? 'secondary' : 'outline'}
								size="sm"
								class="h-8 rounded-full px-3 text-xs"
								onclick={() => setTopFilter('all')}
							>
								All ({(entitiesQuery.data?.page?.length ?? 0) as number})
							</Button>
							<Button
								variant={topFilterKey === 'unlinked' ? 'secondary' : 'outline'}
								size="sm"
								class="h-8 rounded-full px-3 text-xs"
								onclick={() => setTopFilter('unlinked')}
							>
								Unlinked ({unlinkedCount})
							</Button>
							{#each entityTypes as t (t.type)}
								<Button
									variant={topFilterKey === `type:${t.type}` ? 'secondary' : 'outline'}
									size="sm"
									class="h-8 rounded-full px-3 text-xs whitespace-nowrap"
									onclick={() => setTopFilter('type', t.type)}
								>
									{t.type} ({t.count})
								</Button>
							{/each}
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="order-1 mb-8 rounded-xl border bg-card p-5 shadow-sm">
			<div class="mb-4 flex items-center gap-2 border-b pb-4">
				<Plus class="h-4 w-4 text-muted-foreground" />
				<h3 class="font-semibold">Add Entity</h3>
			</div>
			<div class="grid gap-3 lg:grid-cols-[2fr,1.4fr,2fr,auto] lg:items-end">
				<div>
					<label
						for="create-entity-name"
						class="mb-1.5 block text-xs font-medium tracking-wide text-muted-foreground uppercase"
					>
						Name
					</label>
					<Input id="create-entity-name" bind:value={createName} placeholder="Entity name" />
				</div>
				<div>
					<label
						for="create-entity-type"
						class="mb-1.5 block text-xs font-medium tracking-wide text-muted-foreground uppercase"
					>
						Type
					</label>
					<Input
						id="create-entity-type"
						bind:value={createType}
						list="entity-type-options"
						placeholder="Type"
					/>
				</div>
				<div>
					<label
						for="create-entity-slug"
						class="mb-1.5 block text-xs font-medium tracking-wide text-muted-foreground uppercase"
					>
						Slug (Optional)
					</label>
					<Input
						id="create-entity-slug"
						bind:value={createSlug}
						placeholder="auto-derived if empty"
					/>
				</div>
				<Button
					class="h-10 gap-2"
					onclick={handleCreateEntity}
					disabled={isCreatingEntity || isMerging || isPreviewingMerge}
				>
					{#if isCreatingEntity}
						<Loader variant="circular" size="sm" />
					{:else}
						<Plus class="h-3.5 w-3.5" />
					{/if}
					Add
				</Button>
			</div>
			<datalist id="entity-type-options">
				{#each typeOptionValues as type (type)}
					<option value={type}></option>
				{/each}
			</datalist>
		</div>

		<div class="order-2 mb-8 rounded-xl border bg-card p-5 shadow-sm">
			<div class="mb-4 flex items-center gap-2 border-b pb-4">
				<GitMerge class="h-4 w-4 text-muted-foreground" />
				<h3 class="font-semibold">Quick Merge</h3>
			</div>
			<div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
				<div class="space-y-1 text-sm">
					<div class="font-medium text-foreground">
						Canonical: {canonicalEntityLabel || 'Not selected'}
					</div>
					<div class="text-muted-foreground">
						Selected sources: <span class="font-semibold text-foreground"
							>{mergeSourceIds.size}</span
						>
					</div>
					<p class="text-xs text-muted-foreground">
						Use row controls to mark one canonical entity and one or more source entities.
					</p>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						class="h-8 gap-1.5"
						onclick={previewMerge}
						disabled={!canPreviewMerge}
					>
						{#if isPreviewingMerge}
							<Loader variant="circular" size="sm" />
						{:else}
							<GitMerge class="h-3.5 w-3.5" />
						{/if}
						Preview merge
					</Button>
					<Button
						variant="default"
						size="sm"
						class="h-8 gap-1.5"
						onclick={executeMerge}
						disabled={!canExecuteMerge}
					>
						{#if isMerging}
							<Loader variant="circular" size="sm" />
						{:else}
							<GitMerge class="h-3.5 w-3.5" />
						{/if}
						Merge selected
					</Button>
					<Button
						variant="ghost"
						size="sm"
						class="h-8"
						onclick={clearMergeSelection}
						disabled={canonicalEntityId === null && mergeSourceIds.size === 0}
					>
						Clear
					</Button>
				</div>
			</div>

			{#if mergePreview}
				<div class="mt-4 rounded-lg border bg-muted/15 p-4">
					<div class="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
						<div class="rounded border bg-background p-2">
							Content links: patch {mergePreview.counts.contentLinksToPatch}, delete
							{mergePreview.counts.contentLinksToDelete}
						</div>
						<div class="rounded border bg-background p-2">
							Group shares: patch {mergePreview.counts.groupSharesToPatch}, delete
							{mergePreview.counts.groupSharesToDelete}
						</div>
						<div class="rounded border bg-background p-2">
							Archive relinks: {mergePreview.counts.articleArchivesToPatch}
						</div>
						<div class="rounded border bg-background p-2">
							Source current articles to archive: {mergePreview.counts
								.sourceCurrentArticlesToArchive}
						</div>
						<div class="rounded border bg-background p-2">
							Source entities: {mergePreview.counts.totalSources}
						</div>
						<div class="rounded border bg-background p-2">
							Canonical type: <span class="font-medium">{mergePreview.canonical.type}</span>
						</div>
					</div>

					{#if mergePreview.typeMismatches.length > 0}
						<div class="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
							<div class="mb-2 flex items-start gap-2 text-amber-700 dark:text-amber-400">
								<AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
								<div>
									<div class="font-semibold">Type mismatches detected</div>
									<div>
										{mergePreview.typeMismatches.length} source entity/entities have different types than
										the canonical entity.
									</div>
								</div>
							</div>
							<label class="inline-flex items-center gap-2">
								<input
									type="checkbox"
									bind:checked={allowCrossTypeMerge}
									class="h-3.5 w-3.5 rounded border-input"
								/>
								Allow cross-type merge
							</label>
						</div>
					{/if}

					{#if mergePreviewSignature !== mergeSignature}
						<p class="mt-3 text-xs text-amber-600 dark:text-amber-400">
							Selection changed after preview. Run preview again before merging.
						</p>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	{#if entitiesQuery.isLoading}
		<div class="grid gap-4">
			{#each { length: 6 }, i (i)}
				<Skeleton class="h-20 w-full rounded-xl" />
			{/each}
		</div>
	{:else if entitiesQuery.data}
		<div class="overflow-hidden rounded-xl border bg-card shadow-sm">
			<div class="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-4 py-3">
				<div class="text-xs text-muted-foreground">
					Bulk delete selected: <span class="font-semibold text-foreground">{bulkDeleteCount}</span>
				</div>
				<div class="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						class="h-8 gap-1.5 px-2 text-xs"
						onclick={toggleSelectAllVisible}
						disabled={filteredEntities.length === 0 || isBulkDeleting}
					>
						{#if areAllVisibleSelected}
							<Square class="h-3.5 w-3.5" />
							Clear visible
						{:else}
							<CheckSquare class="h-3.5 w-3.5" />
							Select visible
						{/if}
					</Button>
					<Button
						variant="destructive"
						size="sm"
						class="h-8 gap-1.5 px-2 text-xs"
						onclick={handleBulkDeleteEntities}
						disabled={bulkDeleteCount === 0 || isBulkDeleting || isMerging || isPreviewingMerge}
					>
						{#if isBulkDeleting}
							<Loader variant="circular" size="sm" />
						{:else}
							<Trash2 class="h-3.5 w-3.5" />
						{/if}
						Delete selected
					</Button>
				</div>
			</div>
			<div class="overflow-x-auto">
				<table class="w-full text-left text-sm">
					<thead>
						<tr class="border-b bg-muted/30">
							<th class="w-12 px-4 py-3 font-semibold text-muted-foreground">View</th>
							<th class="w-16 px-4 py-3 font-semibold text-muted-foreground">Select</th>
							<th class="w-16 px-4 py-3 font-semibold text-muted-foreground">Source</th>
							<th class="w-24 px-4 py-3 font-semibold text-muted-foreground">Canonical</th>
							<th class="px-6 py-3 font-semibold text-muted-foreground">Entity</th>
							<th class="px-6 py-3 font-semibold text-muted-foreground">Type</th>
							<th class="px-6 py-3 font-semibold text-muted-foreground">Slug</th>
							<th class="px-6 py-3 font-semibold text-muted-foreground">Linked Content</th>
							<th class="px-6 py-3 font-semibold text-muted-foreground">Article</th>
							<th class="px-6 py-3 font-semibold text-muted-foreground">Generated</th>
							<th class="px-6 py-3 font-semibold text-muted-foreground">Actions</th>
						</tr>
					</thead>
					<tbody class="divide-y">
						{#if filteredEntities.length === 0}
							<tr>
								<td colspan="11" class="px-6 py-16 text-center">
									<p class="text-sm text-muted-foreground">
										No entities found for the current filters/search.
									</p>
								</td>
							</tr>
						{:else}
							{#each filteredEntities as entity (entity._id)}
								<tr class="transition-colors hover:bg-muted/25">
									<td class="w-12 px-4 py-4 align-top">
										<Button
											variant="ghost"
											size="icon"
											class="h-8 w-8"
											onclick={() => toggleExpanded(entity._id)}
										>
											{#if expandedIds.has(entity._id)}
												<ChevronDown class="h-4 w-4" />
											{:else}
												<ChevronRight class="h-4 w-4" />
											{/if}
										</Button>
									</td>
									<td class="w-16 px-4 py-4 align-top">
										<Button
											variant={selectedDeleteIds.has(entity._id) ? 'secondary' : 'ghost'}
											size="icon"
											class="h-8 w-8"
											onclick={() => toggleDeleteSelection(entity._id)}
											disabled={isBulkDeleting}
										>
											{#if selectedDeleteIds.has(entity._id)}
												<CheckSquare class="h-4 w-4" />
											{:else}
												<Square class="h-4 w-4" />
											{/if}
										</Button>
									</td>
									<td class="w-16 px-4 py-4 align-top">
										<Button
											variant={mergeSourceIds.has(entity._id) ? 'secondary' : 'ghost'}
											size="icon"
											class="h-8 w-8"
											onclick={() => toggleMergeSource(entity._id)}
											disabled={isPreviewingMerge || isMerging || canonicalEntityId === entity._id}
										>
											{#if mergeSourceIds.has(entity._id)}
												<CheckSquare class="h-4 w-4" />
											{:else}
												<Square class="h-4 w-4" />
											{/if}
										</Button>
									</td>
									<td class="w-24 px-4 py-4 align-top">
										<Button
											variant={canonicalEntityId === entity._id ? 'secondary' : 'ghost'}
											size="sm"
											class="h-8 gap-1.5 px-2 text-xs"
											onclick={() => setCanonicalEntity(entity)}
											disabled={isPreviewingMerge || isMerging}
										>
											<Star class="h-3.5 w-3.5" />
											{canonicalEntityId === entity._id ? 'Set' : 'Pick'}
										</Button>
									</td>
									<td class="px-6 py-4 align-top">
										{#if editingEntityId === entity._id}
											<div class="space-y-2">
												<Input bind:value={editName} class="h-8" />
												<div class="font-mono text-[11px] text-muted-foreground">
													{entity._id}
												</div>
											</div>
										{:else}
											<div class="font-semibold text-foreground">{entity.name}</div>
											<div class="mt-1 font-mono text-xs text-muted-foreground">{entity._id}</div>
										{/if}
									</td>
									<td class="px-6 py-4 align-top">
										{#if editingEntityId === entity._id}
											<Input bind:value={editType} list="entity-type-options" class="h-8" />
										{:else}
											<Badge variant="secondary" class="capitalize">{entity.type}</Badge>
										{/if}
									</td>
									<td class="px-6 py-4 align-top text-muted-foreground">
										{#if editingEntityId === entity._id}
											<Input bind:value={editSlug} class="h-8 font-mono text-xs" />
										{:else}
											{entity.slug}
										{/if}
									</td>
									<td class="px-6 py-4 align-top">
										<div class="flex items-center gap-1.5 text-muted-foreground">
											<Link2 class="h-3.5 w-3.5" />
											<span class="font-medium tabular-nums">{entity.segmentCount}</span>
										</div>
									</td>
									<td class="px-6 py-4 align-top">
										{#if entity.article}
											<Badge
												variant="outline"
												class="border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
											>
												Generated
											</Badge>
										{:else}
											<Badge variant="outline" class="text-muted-foreground">Not generated</Badge>
										{/if}
									</td>
									<td class="px-6 py-4 align-top text-xs text-muted-foreground">
										{formatDate(entity.articleGeneratedAt)}
									</td>
									<td class="px-6 py-4 align-top">
										{#if editingEntityId === entity._id}
											<div class="flex items-center gap-2">
												<Button
													size="sm"
													class="h-8 gap-1.5 px-2 text-xs"
													onclick={handleSaveEntityEdit}
													disabled={isSavingEntity}
												>
													{#if isSavingEntity}
														<Loader variant="circular" size="sm" />
													{:else}
														<Save class="h-3.5 w-3.5" />
													{/if}
													Save
												</Button>
												<Button
													variant="outline"
													size="sm"
													class="h-8 gap-1.5 px-2 text-xs"
													onclick={cancelEditEntity}
													disabled={isSavingEntity}
												>
													<X class="h-3.5 w-3.5" />
													Cancel
												</Button>
											</div>
										{:else}
											<div class="flex items-center gap-2">
												<Button
													variant="outline"
													size="sm"
													class="h-8 gap-1.5 px-2 text-xs"
													onclick={() => startEditEntity(entity)}
													disabled={isMerging || isPreviewingMerge}
												>
													<Pencil class="h-3.5 w-3.5" />
													Edit
												</Button>
												<Button
													variant="destructive"
													size="sm"
													class="h-8 gap-1.5 px-2 text-xs"
													onclick={() => handleDeleteEntity(entity)}
													disabled={isMerging ||
														isPreviewingMerge ||
														deletingEntityId === entity._id ||
														isSavingEntity}
												>
													{#if deletingEntityId === entity._id}
														<Loader variant="circular" size="sm" />
													{:else}
														<Trash2 class="h-3.5 w-3.5" />
													{/if}
													Delete
												</Button>
											</div>
										{/if}
									</td>
								</tr>

								{#if expandedIds.has(entity._id)}
									{@const details = entityDetails[entity._id]}
									<tr class="bg-muted/10">
										<td colspan="11" class="px-6 py-5">
											{#if !details || details.loading}
												<div class="flex items-center gap-2 text-sm text-muted-foreground">
													<Loader variant="circular" size="sm" />
													Loading associated data...
												</div>
											{:else if details.error}
												<div class="flex flex-wrap items-center gap-3">
													<p class="text-sm text-destructive">{details.error}</p>
													<Button
														variant="outline"
														size="sm"
														class="h-8 gap-1.5"
														onclick={() => refreshDetails(entity._id)}
													>
														<RefreshCw class="h-3.5 w-3.5" />
														Retry
													</Button>
												</div>
											{:else}
												<div class="mb-4 flex justify-end">
													<Button
														variant="outline"
														size="sm"
														class="h-8 gap-1.5"
														onclick={() => refreshDetails(entity._id)}
													>
														<RefreshCw class="h-3.5 w-3.5" />
														Refresh details
													</Button>
												</div>
												<div class="grid gap-4 lg:grid-cols-2">
													<div class="rounded-lg border bg-background p-4">
														<div class="mb-3 flex items-center gap-2">
															<Link2 class="h-4 w-4 text-primary" />
															<h4 class="font-semibold">
																Associated Content ({details.content.length})
															</h4>
														</div>
														{#if details.content.length > 0}
															<div class="space-y-2">
																{#each details.content.slice(0, MAX_CONTENT_PREVIEW) as item (item._id)}
																	<div class="rounded-md border bg-muted/10 p-3">
																		<div class="text-sm font-medium text-foreground">
																			{item.title}
																		</div>
																		<div class="mt-2 flex flex-wrap gap-1.5">
																			<Badge variant="outline">{item.topic}</Badge>
																			{#if item.subject?.name}
																				<Badge variant="secondary">{item.subject.name}</Badge>
																			{/if}
																			<Badge variant="outline">{formatContentDate(item)}</Badge>
																		</div>
																	</div>
																{/each}
															</div>
															{#if details.content.length > MAX_CONTENT_PREVIEW}
																<p class="mt-3 text-xs text-muted-foreground">
																	Showing {MAX_CONTENT_PREVIEW} of {details.content.length} linked content
																	items.
																</p>
															{/if}
														{:else}
															<p class="text-sm text-muted-foreground">
																No linked content found for this entity.
															</p>
														{/if}
													</div>

													<div class="rounded-lg border bg-background p-4">
														<div class="mb-3 flex items-center gap-2">
															<FileText class="h-4 w-4 text-primary" />
															<h4 class="font-semibold">Article Data</h4>
														</div>
														<div class="mb-4 space-y-2 rounded-md border bg-muted/10 p-3 text-sm">
															<div class="flex items-center justify-between gap-3">
																<span class="text-muted-foreground">Current Article</span>
																<span class="font-medium text-foreground"
																	>{entity.article ? 'Available' : 'Missing'}</span
																>
															</div>
															<div class="flex items-center justify-between gap-3">
																<span class="text-muted-foreground">Generated At</span>
																<span class="font-medium text-foreground"
																	>{formatDate(entity.articleGeneratedAt)}</span
																>
															</div>
															<p class="text-xs leading-relaxed text-muted-foreground">
																{summarizeArticle(entity.article)}
															</p>
														</div>

														<div class="mb-2 flex items-center gap-2">
															<Archive class="h-4 w-4 text-primary" />
															<h5 class="font-medium">
																Archive History ({details.archives.length})
															</h5>
														</div>
														{#if details.archives.length > 0}
															<div class="space-y-2">
																{#each details.archives.slice(0, MAX_ARCHIVE_PREVIEW) as archive (archive._id)}
																	<div class="rounded-md border bg-muted/10 px-3 py-2 text-xs">
																		<div class="font-medium text-foreground">
																			{formatDate(archive.createdAt)}
																		</div>
																		<div class="mt-1 text-muted-foreground">
																			{summarizeArticle(archive.article)}
																		</div>
																	</div>
																{/each}
															</div>
															{#if details.archives.length > MAX_ARCHIVE_PREVIEW}
																<p class="mt-3 text-xs text-muted-foreground">
																	Showing {MAX_ARCHIVE_PREVIEW} of {details.archives.length} archived
																	versions.
																</p>
															{/if}
														{:else}
															<p class="text-sm text-muted-foreground">
																No archived versions for this entity.
															</p>
														{/if}
													</div>
												</div>
											{/if}
										</td>
									</tr>
								{/if}
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
		</div>

		<div class="mt-6 flex items-center justify-between px-2">
			<div class="text-xs font-medium text-muted-foreground">
				Page <span class="font-bold text-foreground">{cursorHistory.length + 1}</span> · {filteredEntities.length}
				items shown
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
</div>
