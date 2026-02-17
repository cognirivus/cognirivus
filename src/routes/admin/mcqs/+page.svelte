<script lang="ts">
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import { Label } from '$lib/components/ui/label';
	import { Progress } from '$lib/components/ui/progress';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Tabs from '$lib/components/ui/tabs';
	import { toast } from 'svelte-sonner';
	import {
		BrainCircuit,
		Database,
		RefreshCw,
		Search,
		Filter,
		Zap,
		Target,
		ListChecks,
		ChevronLeft,
		ChevronRight,
		Layers,
		GraduationCap,
		Calendar,
		X,
		Trash2
	} from '@lucide/svelte';

	const client = useConvexClient();
	const statsQuery = useQuery(api.mcqs.getVectorisationStats, {});
	const cacheStatsQuery = useQuery(api.mcqs.getSimilarityCacheStats, {});

	const MIN_THRESHOLD = 0;
	const RECOMMENDED_THRESHOLD = 0.55;
	const RESULT_LIMIT = 5;
	const DEFAULT_RAG_EMBEDDING_MODEL = 'openai/text-embedding-3-small';
	const TABLE_PAGE_SIZE_OPTIONS = [50, 100, 500] as const;
	const EMBEDDING_DIMENSION_OPTIONS = [
		{ value: 'default', label: 'Use task config', dimension: undefined },
		{ value: 'vectors_1024', label: 'vectors_1024', dimension: 1024 },
		{ value: 'vectors_128', label: 'vectors_128', dimension: 128 },
		{ value: 'vectors_1408', label: 'vectors_1408', dimension: 1408 },
		{ value: 'vectors_1536', label: 'vectors_1536', dimension: 1536 },
		{ value: 'vectors_2048', label: 'vectors_2048', dimension: 2048 },
		{ value: 'vectors_256', label: 'vectors_256', dimension: 256 },
		{ value: 'vectors_3072', label: 'vectors_3072', dimension: 3072 },
		{ value: 'vectors_4096', label: 'vectors_4096', dimension: 4096 },
		{ value: 'vectors_512', label: 'vectors_512', dimension: 512 },
		{ value: 'vectors_768', label: 'vectors_768', dimension: 768 }
	] as const;
	const BULK_DELETE_BATCH_SIZE = 25;
	const BULK_DELETE_PARALLELISM = 8;
	const BULK_CACHE_SEED_BATCH_SIZE = 20;
	const BULK_CACHE_SEED_PARALLELISM = 4;

	type SourceType = 'mcq' | 'blog' | 'content' | 'chat_message' | 'flashcard';

	type SimilarMcq = {
		_id: string;
		question: string;
		exam: string;
		year: number;
		mcq_type: string;
		correct_option: 'A' | 'B' | 'C' | 'D' | 'X';
		_score: number;
	};

	type SimilaritySearchResult = {
		modelId: string;
		dimension: number;
		limit: number;
		vectorScoreThreshold: number;
		mcqs: SimilarMcq[];
	};

	type SimilaritySourceResult = SimilaritySearchResult & {
		sourceType: SourceType;
		sourceId: string;
		queryText: string;
	};

	type BulkDeleteResult = {
		requested: number;
		succeeded: number;
		failed: number;
		failedIds: Id<'mcqs'>[];
		failedDetails: Array<{ mcqId: Id<'mcqs'>; error: string }>;
		deletedNamespaces: number;
		modelId: string;
		dimension: number;
		parallelism: number;
	};

	type BulkCacheSeedResult = {
		requested: number;
		succeeded: number;
		failed: number;
		failedIds: Id<'mcqs'>[];
		failedDetails: Array<{ mcqId: Id<'mcqs'>; error: string }>;
	};

	type TableVectorisedFilter = 'all' | 'vectorised' | 'not_vectorised';
	type TableSimilarityCacheFilter = 'all' | 'cached' | 'not_cached';

	const sourceTypeOptions: Array<{ value: SourceType; label: string }> = [
		{ value: 'mcq', label: 'MCQ' },
		{ value: 'blog', label: 'Blog' },
		{ value: 'content', label: 'Content' },
		{ value: 'chat_message', label: 'Chat Message' },
		{ value: 'flashcard', label: 'Flashcard' }
	];

	let textQuery = $state('');
	let textThresholdInput = $state(String(RECOMMENDED_THRESHOLD));
	let sourceType = $state<SourceType>('mcq');
	let sourceId = $state('');
	let sourceThresholdInput = $state(String(RECOMMENDED_THRESHOLD));
	let searchTab = $state('text');

	let isSearchingText = $state(false);
	let isSearchingSource = $state(false);
	let isBulkSyncing = $state(false);
	let isBulkSeedingCache = $state(false);
	let isBulkDeleting = $state(false);
	let isDeletingCache = $state(false);
	let stopBulkCacheSeedRequested = $state(false);
	let stopBulkDeleteRequested = $state(false);
	let isSavingEmbeddingDimension = $state(false);
	let isRebuildingStats = $state(false);
	let rowSyncingId = $state<string | null>(null);
	let rowSeedingCacheId = $state<string | null>(null);
	let hasAttemptedStatsBootstrap = $state(false);

	let tableCursorStack = $state<(string | null)[]>([null]);
	let tableCursorIndex = $state(0);
	let selectedMcqIds = $state<Set<string>>(new Set());
	let tablePageSize = $state<(typeof TABLE_PAGE_SIZE_OPTIONS)[number]>(50);
	let tableSearchInput = $state('');
	let tableSearchApplied = $state<string | undefined>(undefined);
	let tableTypeFilter = $state('all');
	let tableExamFilter = $state('all');
	let tableYearFilter = $state('all');
	let tableVectorisedFilter = $state<TableVectorisedFilter>('all');
	let tableSimilarityCacheFilter = $state<TableSimilarityCacheFilter>('all');
	let embeddingDimensionOption =
		$state<(typeof EMBEDDING_DIMENSION_OPTIONS)[number]['value']>('default');
	let hasInitialisedEmbeddingOption = $state(false);

	let bulkProgress = $state({
		total: 0,
		completed: 0,
		succeeded: 0,
		failed: 0
	});

	let textResult = $state<SimilaritySearchResult | null>(null);
	let sourceResult = $state<SimilaritySourceResult | null>(null);

	const tableTypeValue = $derived(tableTypeFilter === 'all' ? undefined : tableTypeFilter);
	const tableExamValue = $derived(tableExamFilter === 'all' ? undefined : tableExamFilter);
	const tableYearValue = $derived.by(() => {
		const parsed = Number(tableYearFilter);
		if (tableYearFilter === 'all' || !Number.isFinite(parsed)) return undefined;
		return parsed;
	});
	const tableIsVectorisedValue = $derived.by(() => {
		if (tableVectorisedFilter === 'all') return undefined;
		return tableVectorisedFilter === 'vectorised';
	});
	const tableIsSimilarityCachedValue = $derived.by(() => {
		if (tableSimilarityCacheFilter === 'all') return undefined;
		return tableSimilarityCacheFilter === 'cached';
	});

	const tableHierarchyQuery = useQuery(api.mcqs.getFilterHierarchy, () => ({
		type: tableTypeValue,
		exam: tableExamValue,
		year: tableYearValue,
		search: tableSearchApplied
	}));
	const ragEmbeddingConfigQuery = useQuery(api.tasks.getConfig, {
		task: 'rag_embeddings'
	});

	const mcqTableQuery = useQuery(api.mcqs.list, () => ({
		paginationOpts: {
			numItems: tablePageSize,
			cursor: tableCursorStack[tableCursorIndex]
		},
		exam: tableExamValue,
		year: tableYearValue,
		mcqType: tableTypeValue,
		search: tableSearchApplied,
		isVectorised: tableIsVectorisedValue,
		isSimilarityCached: tableIsSimilarityCachedValue
	}));

	const activeModelInfo = $derived(textResult?.modelId ?? sourceResult?.modelId ?? null);

	const activeDimension = $derived(textResult?.dimension ?? sourceResult?.dimension ?? null);

	const tableRows = $derived(mcqTableQuery.data?.page ?? []);
	const tableHasNext = $derived(mcqTableQuery.data?.isDone === false);
	const tableHasPrev = $derived(tableCursorIndex > 0);
	const selectedCount = $derived(selectedMcqIds.size);
	const allVisibleSelected = $derived(
		tableRows.length > 0 && tableRows.every((mcq) => selectedMcqIds.has(mcq._id))
	);
	const coveragePercent = $derived(
		statsQuery.data?.total ? (statsQuery.data.vectorised / statsQuery.data.total) * 100 : 0
	);
	const cacheCoveragePercent = $derived(
		cacheStatsQuery.data?.total
			? (cacheStatsQuery.data.cached / cacheStatsQuery.data.total) * 100
			: 0
	);
	const bulkProgressPercent = $derived(
		bulkProgress.total > 0 ? (bulkProgress.completed / bulkProgress.total) * 100 : 0
	);

	async function rebuildMcqStats(showSuccessToast = true) {
		isRebuildingStats = true;
		try {
			await client.action(api.mcqs.rebuildMcqStats, {});
			if (showSuccessToast) {
				toast.success('MCQ stats rebuilt');
			}
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : 'Failed to rebuild MCQ stats';
			toast.error(message);
		} finally {
			isRebuildingStats = false;
		}
	}

	$effect(() => {
		if (hasAttemptedStatsBootstrap) return;
		if (statsQuery.isLoading || cacheStatsQuery.isLoading) return;

		const needsBootstrap =
			statsQuery.data?.initialized === false || cacheStatsQuery.data?.initialized === false;
		if (!needsBootstrap) return;

		hasAttemptedStatsBootstrap = true;
		void rebuildMcqStats(false);
	});

	function clampThreshold(value: number) {
		if (!Number.isFinite(value)) return RECOMMENDED_THRESHOLD;
		return Math.max(MIN_THRESHOLD, Math.min(1, value));
	}

	function parseThreshold(input: string) {
		return clampThreshold(Number(input));
	}

	function formatScore(score: number) {
		return score.toFixed(3);
	}

	function getSelectedEmbeddingDimension() {
		const option = EMBEDDING_DIMENSION_OPTIONS.find(
			(item) => item.value === embeddingDimensionOption
		);
		return option?.dimension;
	}

	function getEmbeddingOptionByDimension(
		dimension?: number
	): (typeof EMBEDDING_DIMENSION_OPTIONS)[number]['value'] {
		if (typeof dimension !== 'number' || !Number.isFinite(dimension)) return 'default';
		const found = EMBEDDING_DIMENSION_OPTIONS.find(
			(option) => option.dimension === Math.trunc(dimension)
		);
		return found?.value ?? 'default';
	}

	$effect(() => {
		const config = ragEmbeddingConfigQuery.data;
		if (hasInitialisedEmbeddingOption) return;
		if (ragEmbeddingConfigQuery.isLoading) return;

		embeddingDimensionOption = getEmbeddingOptionByDimension(config?.maxTokens);
		hasInitialisedEmbeddingOption = true;
	});

	async function persistEmbeddingDimensionSelection(
		nextValue: (typeof EMBEDDING_DIMENSION_OPTIONS)[number]['value']
	) {
		const previousValue = embeddingDimensionOption;
		hasInitialisedEmbeddingOption = true;
		embeddingDimensionOption = nextValue;
		const nextDimension = getSelectedEmbeddingDimension();
		const existing = ragEmbeddingConfigQuery.data;
		const modelId = existing?.modelId || DEFAULT_RAG_EMBEDDING_MODEL;

		isSavingEmbeddingDimension = true;
		try {
			await client.mutation(api.tasks.updateConfig, {
				task: 'rag_embeddings',
				modelId,
				temperature: existing?.temperature,
				maxTokens: nextDimension
			});
			toast.success('Embedding dimension saved');
		} catch (error: unknown) {
			embeddingDimensionOption = previousValue;
			const message = error instanceof Error ? error.message : 'Failed to save embedding dimension';
			toast.error(message);
		} finally {
			isSavingEmbeddingDimension = false;
		}
	}

	function resetTableNavigationAndSelection() {
		tableCursorStack = [null];
		tableCursorIndex = 0;
		selectedMcqIds = new Set();
	}

	function applyTableSearch() {
		tableSearchApplied = tableSearchInput.trim() || undefined;
		resetTableNavigationAndSelection();
	}

	function clearTableSearch() {
		tableSearchInput = '';
		tableSearchApplied = undefined;
		resetTableNavigationAndSelection();
	}

	function handleTableTypeChange(value: string) {
		tableTypeFilter = value;
		tableExamFilter = 'all';
		tableYearFilter = 'all';
		resetTableNavigationAndSelection();
	}

	function handleTableExamChange(value: string) {
		tableExamFilter = value;
		tableYearFilter = 'all';
		resetTableNavigationAndSelection();
	}

	function handleTableYearChange(value: string) {
		tableYearFilter = value;
		resetTableNavigationAndSelection();
	}

	function handleTableVectorisedChange(value: TableVectorisedFilter) {
		tableVectorisedFilter = value;
		resetTableNavigationAndSelection();
	}

	function handleTableSimilarityCacheChange(value: TableSimilarityCacheFilter) {
		tableSimilarityCacheFilter = value;
		resetTableNavigationAndSelection();
	}

	function handleTablePageSizeChange(value: string) {
		const parsed = Number(value);
		if (!TABLE_PAGE_SIZE_OPTIONS.includes(parsed as (typeof TABLE_PAGE_SIZE_OPTIONS)[number]))
			return;
		tablePageSize = parsed as (typeof TABLE_PAGE_SIZE_OPTIONS)[number];
		resetTableNavigationAndSelection();
	}

	function resetTableFilters() {
		tableSearchInput = '';
		tableSearchApplied = undefined;
		tableTypeFilter = 'all';
		tableExamFilter = 'all';
		tableYearFilter = 'all';
		tableVectorisedFilter = 'all';
		tableSimilarityCacheFilter = 'all';
		resetTableNavigationAndSelection();
	}

	async function runTextSearch() {
		const query = textQuery.trim();
		if (!query) {
			toast.error('Please enter query text');
			return;
		}

		const threshold = parseThreshold(textThresholdInput);
		textThresholdInput = threshold.toFixed(2);

		isSearchingText = true;
		try {
			const result = await client.action(api.mcqs.findSimilarByText, {
				query,
				limit: RESULT_LIMIT,
				vectorScoreThreshold: threshold
			});
			textResult = result;
			toast.success(`Found ${result.mcqs.length} similar MCQs`);
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : 'Similarity search failed';
			toast.error(message);
		} finally {
			isSearchingText = false;
		}
	}

	async function runSourceSearch() {
		const source = sourceId.trim();
		if (!source) {
			toast.error('Please enter source ID');
			return;
		}

		const threshold = parseThreshold(sourceThresholdInput);
		sourceThresholdInput = threshold.toFixed(2);

		isSearchingSource = true;
		try {
			const result = await client.action(api.mcqs.findSimilarBySource, {
				sourceType,
				sourceId: source,
				limit: RESULT_LIMIT,
				vectorScoreThreshold: threshold
			});
			sourceResult = result;
			toast.success(`Found ${result.mcqs.length} similar MCQs`);
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : 'Source similarity search failed';
			toast.error(message);
		} finally {
			isSearchingSource = false;
		}
	}

	function toggleMcqSelection(mcqId: string) {
		const next = new Set(selectedMcqIds);
		if (next.has(mcqId)) {
			next.delete(mcqId);
		} else {
			next.add(mcqId);
		}
		selectedMcqIds = next;
	}

	function toggleSelectAllVisible() {
		const next = new Set(selectedMcqIds);
		if (allVisibleSelected) {
			for (const mcq of tableRows) {
				next.delete(mcq._id);
			}
		} else {
			for (const mcq of tableRows) {
				next.add(mcq._id);
			}
		}
		selectedMcqIds = next;
	}

	function clearSelected() {
		selectedMcqIds = new Set();
	}

	function nextTablePage() {
		if (!tableHasNext || !mcqTableQuery.data?.continueCursor) return;
		const nextCursor = mcqTableQuery.data.continueCursor;
		if (tableCursorIndex === tableCursorStack.length - 1) {
			tableCursorStack = [...tableCursorStack, nextCursor];
		}
		tableCursorIndex += 1;
	}

	function prevTablePage() {
		if (!tableHasPrev) return;
		tableCursorIndex -= 1;
	}

	async function syncSingleFromTable(mcqId: string) {
		const embeddingDimension = getSelectedEmbeddingDimension();
		rowSyncingId = mcqId;
		try {
			await client.action(api.mcqs.syncSimilarityIndexById, {
				mcqId: mcqId as Id<'mcqs'>,
				embeddingDimension
			});
			toast.success('MCQ synced');
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : 'Sync failed';
			toast.error(message);
		} finally {
			rowSyncingId = null;
		}
	}

	async function syncSelectedFromTable() {
		const ids = Array.from(selectedMcqIds);
		if (ids.length === 0) {
			toast.error('Select at least one MCQ');
			return;
		}
		const embeddingDimension = getSelectedEmbeddingDimension();

		isBulkSyncing = true;
		bulkProgress = {
			total: ids.length,
			completed: 0,
			succeeded: 0,
			failed: 0
		};

		const failed = new Set<string>();
		for (const mcqId of ids) {
			try {
				await client.action(api.mcqs.syncSimilarityIndexById, {
					mcqId: mcqId as Id<'mcqs'>,
					embeddingDimension
				});
				bulkProgress = {
					...bulkProgress,
					completed: bulkProgress.completed + 1,
					succeeded: bulkProgress.succeeded + 1
				};
			} catch {
				failed.add(mcqId);
				bulkProgress = {
					...bulkProgress,
					completed: bulkProgress.completed + 1,
					failed: bulkProgress.failed + 1
				};
			}
		}

		selectedMcqIds = failed;
		isBulkSyncing = false;

		if (bulkProgress.failed === 0) {
			toast.success(`Synced ${bulkProgress.succeeded} MCQs`);
		} else {
			toast.warning(`Synced ${bulkProgress.succeeded}, failed ${bulkProgress.failed}`);
		}
	}

	function requestStopBulkCacheSeed() {
		if (!isBulkSeedingCache) return;
		stopBulkCacheSeedRequested = true;
	}

	async function seedSingleCacheFromTable(mcqId: string) {
		rowSeedingCacheId = mcqId;
		try {
			await client.action(api.mcqs.seedSimilarityCacheById, {
				mcqId: mcqId as Id<'mcqs'>,
				limit: RESULT_LIMIT,
				vectorScoreThreshold: 0
			});
			toast.success('Similarity cache seeded');
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : 'Cache seed failed';
			toast.error(message);
		} finally {
			rowSeedingCacheId = null;
		}
	}

	async function seedSelectedCacheFromTable() {
		const ids = Array.from(selectedMcqIds);
		if (ids.length === 0) {
			toast.error('Select at least one MCQ');
			return;
		}

		isBulkSeedingCache = true;
		stopBulkCacheSeedRequested = false;
		bulkProgress = {
			total: ids.length,
			completed: 0,
			succeeded: 0,
			failed: 0
		};

		try {
			const failed = new Set<string>();
			let nextIndex = 0;

			while (nextIndex < ids.length) {
				if (stopBulkCacheSeedRequested) break;

				const batch = ids.slice(nextIndex, nextIndex + BULK_CACHE_SEED_BATCH_SIZE);
				nextIndex += batch.length;

				try {
					const result = (await client.action(api.mcqs.seedSimilarityCacheByIds, {
						mcqIds: batch as Id<'mcqs'>[],
						limit: RESULT_LIMIT,
						vectorScoreThreshold: 0,
						parallelism: BULK_CACHE_SEED_PARALLELISM
					})) as BulkCacheSeedResult;

					bulkProgress = {
						total: ids.length,
						completed: bulkProgress.completed + result.succeeded + result.failed,
						succeeded: bulkProgress.succeeded + result.succeeded,
						failed: bulkProgress.failed + result.failed
					};

					for (const failedId of result.failedIds) {
						failed.add(failedId);
					}
				} catch {
					for (const batchId of batch) {
						failed.add(batchId);
					}
					bulkProgress = {
						total: ids.length,
						completed: bulkProgress.completed + batch.length,
						succeeded: bulkProgress.succeeded,
						failed: bulkProgress.failed + batch.length
					};
				}
			}

			const remaining = ids.slice(nextIndex);
			selectedMcqIds = new Set([...failed, ...remaining]);

			if (stopBulkCacheSeedRequested) {
				toast.warning(
					`Seed stopped at ${bulkProgress.completed}/${bulkProgress.total}. Remaining items kept selected.`
				);
			} else if (bulkProgress.failed === 0) {
				toast.success(`Seeded cache for ${bulkProgress.succeeded} MCQs`);
			} else {
				toast.warning(`Seeded ${bulkProgress.succeeded}, failed ${bulkProgress.failed}`);
			}
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : 'Bulk cache seed failed';
			toast.error(message);
		} finally {
			isBulkSeedingCache = false;
			stopBulkCacheSeedRequested = false;
		}
	}

	async function deleteSelectedCacheFromTable() {
		const ids = Array.from(selectedMcqIds);
		if (ids.length === 0) {
			toast.error('Select at least one MCQ');
			return;
		}

		if (!confirm(`Delete cached similar MCQs for ${ids.length} selected item(s)?`)) {
			return;
		}

		isDeletingCache = true;
		try {
			await client.action(api.mcqs.deleteSimilarityCacheByIds, {
				mcqIds: ids as Id<'mcqs'>[]
			});
			selectedMcqIds = new Set();
			toast.success(`Deleted similarity cache for ${ids.length} MCQs`);
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : 'Delete cache failed';
			toast.error(message);
		} finally {
			isDeletingCache = false;
		}
	}

	function requestStopBulkDelete() {
		if (!isBulkDeleting) return;
		stopBulkDeleteRequested = true;
	}

	async function deleteSelectedVectorsFromTable() {
		const ids = Array.from(selectedMcqIds);
		if (ids.length === 0) {
			toast.error('Select at least one MCQ');
			return;
		}

		if (!confirm(`Delete vectors for ${ids.length} selected MCQ(s)? This cannot be undone.`)) {
			return;
		}

		isBulkDeleting = true;
		stopBulkDeleteRequested = false;
		bulkProgress = {
			total: ids.length,
			completed: 0,
			succeeded: 0,
			failed: 0
		};

		try {
			const failed = new Set<string>();
			let nextIndex = 0;

			while (nextIndex < ids.length) {
				if (stopBulkDeleteRequested) break;

				const batch = ids.slice(nextIndex, nextIndex + BULK_DELETE_BATCH_SIZE);
				nextIndex += batch.length;

				try {
					const result = (await client.action(api.mcqs.deleteSimilarityIndexByIds, {
						mcqIds: batch as Id<'mcqs'>[],
						parallelism: BULK_DELETE_PARALLELISM
					})) as BulkDeleteResult;

					bulkProgress = {
						total: ids.length,
						completed: bulkProgress.completed + result.succeeded + result.failed,
						succeeded: bulkProgress.succeeded + result.succeeded,
						failed: bulkProgress.failed + result.failed
					};

					for (const failedId of result.failedIds) {
						failed.add(failedId);
					}
				} catch {
					for (const batchId of batch) {
						failed.add(batchId);
					}
					bulkProgress = {
						total: ids.length,
						completed: bulkProgress.completed + batch.length,
						succeeded: bulkProgress.succeeded,
						failed: bulkProgress.failed + batch.length
					};
				}
			}

			const remaining = ids.slice(nextIndex);
			selectedMcqIds = new Set([...failed, ...remaining]);

			if (stopBulkDeleteRequested) {
				toast.warning(
					`Delete stopped at ${bulkProgress.completed}/${bulkProgress.total}. Remaining items kept selected.`
				);
			} else if (bulkProgress.failed === 0) {
				toast.success(`Deleted vectors for ${bulkProgress.succeeded} MCQs`);
			} else {
				toast.warning(`Deleted ${bulkProgress.succeeded}, failed ${bulkProgress.failed}`);
			}
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : 'Bulk delete failed';
			toast.error(message);
		} finally {
			isBulkDeleting = false;
			stopBulkDeleteRequested = false;
		}
	}
</script>

<div class="container mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
	<div class="mb-8 flex flex-col gap-3">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="flex items-center gap-2">
				<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
					<BrainCircuit class="h-4 w-4 text-primary" />
				</div>
				<h1 class="text-2xl font-semibold tracking-tight">MCQ Similarity Search</h1>
			</div>
			<Button
				variant="outline"
				size="sm"
				class="gap-2"
				onclick={() => rebuildMcqStats(true)}
				disabled={isRebuildingStats}
			>
				{#if isRebuildingStats}
					<RefreshCw class="h-3.5 w-3.5 animate-spin" />
					Rebuilding stats...
				{:else}
					<RefreshCw class="h-3.5 w-3.5" />
					Rebuild Stats
				{/if}
			</Button>
		</div>
		<p class="text-sm text-muted-foreground">
			Manage vector indexing and search for similar MCQs using `task_configs.rag_embeddings`.
		</p>
	</div>

	<div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
		{#if statsQuery.isLoading || cacheStatsQuery.isLoading}
			{#each Array(4) as _, i (i)}
				<Skeleton class="h-24 rounded-xl" />
			{/each}
		{:else}
			<div class="rounded-xl border bg-card p-4 shadow-sm">
				<div class="mb-2 flex items-center justify-between">
					<span class="text-xs font-medium text-muted-foreground">Total MCQs</span>
					<Database class="h-4 w-4 text-muted-foreground" />
				</div>
				<div class="text-2xl font-semibold tabular-nums">{statsQuery.data?.total ?? 0}</div>
			</div>
			<div class="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 shadow-sm">
				<div class="mb-2 flex items-center justify-between">
					<span class="text-xs font-medium text-muted-foreground">Vectorised</span>
					<Zap class="h-4 w-4 text-emerald-600" />
				</div>
				<div class="text-2xl font-semibold text-emerald-600 tabular-nums">
					{statsQuery.data?.vectorised ?? 0}
				</div>
			</div>
			<div class="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 shadow-sm">
				<div class="mb-2 flex items-center justify-between">
					<span class="text-xs font-medium text-muted-foreground">Pending</span>
					<Target class="h-4 w-4 text-amber-600" />
				</div>
				<div class="text-2xl font-semibold text-amber-600 tabular-nums">
					{statsQuery.data?.pending ?? 0}
				</div>
			</div>
			<div class="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 shadow-sm">
				<div class="mb-2 flex items-center justify-between">
					<span class="text-xs font-medium text-muted-foreground">Similarity Cached</span>
					<ListChecks class="h-4 w-4 text-blue-600" />
				</div>
				<div class="text-2xl font-semibold text-blue-600 tabular-nums">
					{cacheStatsQuery.data?.cached ?? 0}
				</div>
			</div>
		{/if}
	</div>

	<div class="mb-6 rounded-xl border bg-card p-5 shadow-sm">
		<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<div class="flex items-center gap-2">
					<ListChecks class="h-4 w-4 text-primary" />
					<h2 class="text-base font-semibold">MCQ Vectorisation Table</h2>
				</div>
				<p class="mt-1 text-xs text-muted-foreground">
					Manage vector index and precomputed similar-MCQ cache from one table.
				</p>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<Badge variant="outline">{selectedCount} selected</Badge>
				<div class="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5">
					<Label for="tableEmbeddingDimension" class="text-[11px] text-muted-foreground"
						>Embeddings</Label
					>
					<select
						id="tableEmbeddingDimension"
						class="h-7 rounded border border-input bg-background px-2 text-[11px]"
						value={embeddingDimensionOption}
						disabled={isSavingEmbeddingDimension ||
							isBulkSeedingCache ||
							isBulkSyncing ||
							isBulkDeleting ||
							isDeletingCache}
						onchange={(e) =>
							persistEmbeddingDimensionSelection(
								e.currentTarget.value as (typeof EMBEDDING_DIMENSION_OPTIONS)[number]['value']
							)}
					>
						{#each EMBEDDING_DIMENSION_OPTIONS as option (option.value)}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</div>
				<Button
					size="sm"
					class="gap-2"
					onclick={seedSelectedCacheFromTable}
					disabled={isBulkSeedingCache ||
						isBulkSyncing ||
						isBulkDeleting ||
						isDeletingCache ||
						selectedCount === 0}
				>
					{#if isBulkSeedingCache}
						<RefreshCw class="h-3.5 w-3.5 animate-spin" />
						Seeding Cache...
					{:else}
						<ListChecks class="h-3.5 w-3.5" />
						Seed Similar Cache
					{/if}
				</Button>
				<Button
					size="sm"
					variant="outline"
					class="gap-2"
					onclick={syncSelectedFromTable}
					disabled={isBulkSeedingCache ||
						isBulkSyncing ||
						isBulkDeleting ||
						isDeletingCache ||
						selectedCount === 0}
				>
					{#if isBulkSyncing}
						<RefreshCw class="h-3.5 w-3.5 animate-spin" />
						Syncing...
					{:else}
						<Zap class="h-3.5 w-3.5" />
						Sync Vectors
					{/if}
				</Button>
				<Button
					size="sm"
					variant="destructive"
					class="gap-2"
					onclick={deleteSelectedCacheFromTable}
					disabled={isBulkSeedingCache ||
						isBulkSyncing ||
						isBulkDeleting ||
						isDeletingCache ||
						selectedCount === 0}
				>
					{#if isDeletingCache}
						<RefreshCw class="h-3.5 w-3.5 animate-spin" />
						Deleting cache...
					{:else}
						<Trash2 class="h-3.5 w-3.5" />
						Delete Cache
					{/if}
				</Button>
				<Button
					size="sm"
					variant="destructive"
					class="gap-2"
					onclick={deleteSelectedVectorsFromTable}
					disabled={isBulkSeedingCache ||
						isBulkSyncing ||
						isBulkDeleting ||
						isDeletingCache ||
						selectedCount === 0}
				>
					{#if isBulkDeleting}
						<RefreshCw class="h-3.5 w-3.5 animate-spin" />
						Deleting...
					{:else}
						<Trash2 class="h-3.5 w-3.5" />
						Delete Vectors
					{/if}
				</Button>
				{#if isBulkSeedingCache}
					<Button
						size="sm"
						variant="outline"
						class="gap-2"
						onclick={requestStopBulkCacheSeed}
						disabled={stopBulkCacheSeedRequested}
					>
						{#if stopBulkCacheSeedRequested}
							<RefreshCw class="h-3.5 w-3.5 animate-spin" />
							Stopping...
						{:else}
							<X class="h-3.5 w-3.5" />
							Stop Seed
						{/if}
					</Button>
				{/if}
				{#if isBulkDeleting}
					<Button
						size="sm"
						variant="outline"
						class="gap-2"
						onclick={requestStopBulkDelete}
						disabled={stopBulkDeleteRequested}
					>
						{#if stopBulkDeleteRequested}
							<RefreshCw class="h-3.5 w-3.5 animate-spin" />
							Stopping...
						{:else}
							<X class="h-3.5 w-3.5" />
							Stop Delete
						{/if}
					</Button>
				{/if}
				<Button
					size="sm"
					variant="outline"
					onclick={clearSelected}
					disabled={isBulkSeedingCache ||
						isBulkSyncing ||
						isBulkDeleting ||
						isDeletingCache ||
						selectedCount === 0}
				>
					Clear
				</Button>
			</div>
		</div>

		<div class="mb-4 rounded-lg border bg-muted/20 p-4">
			<div class="mb-3 flex items-center justify-between gap-2">
				<div
					class="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
				>
					<Filter class="h-3.5 w-3.5" />
					Filters
				</div>
				<Button variant="ghost" size="sm" class="h-8" onclick={resetTableFilters}>Reset</Button>
			</div>
			<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
				<div class="space-y-2 xl:col-span-2">
					<Label for="tableSearchInput">Search</Label>
					<div class="flex gap-2">
						<div class="relative flex-1">
							<Search
								class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
							/>
							<Input
								id="tableSearchInput"
								class="pr-3 pl-9"
								placeholder="Search question or tags..."
								bind:value={tableSearchInput}
								onkeydown={(e) => e.key === 'Enter' && applyTableSearch()}
							/>
						</div>
						<Button variant="outline" size="sm" class="h-10" onclick={applyTableSearch}
							>Apply</Button
						>
						{#if tableSearchApplied}
							<Button
								variant="ghost"
								size="icon"
								class="h-10 w-10"
								onclick={clearTableSearch}
								aria-label="Clear search"
							>
								<X class="h-4 w-4" />
							</Button>
						{/if}
					</div>
				</div>

				<div class="space-y-2">
					<Label for="tableTypeFilter" class="flex items-center gap-1.5">
						<Layers class="h-3.5 w-3.5" />
						Type
					</Label>
					<select
						id="tableTypeFilter"
						class="flex h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 text-sm capitalize"
						value={tableTypeFilter}
						onchange={(e) => handleTableTypeChange(e.currentTarget.value)}
					>
						<option value="all">All Types</option>
						{#each tableHierarchyQuery.data?.types || [] as type (type)}
							<option value={type}>{type}</option>
						{/each}
					</select>
				</div>

				<div class="space-y-2">
					<Label for="tableExamFilter" class="flex items-center gap-1.5">
						<GraduationCap class="h-3.5 w-3.5" />
						Exam
					</Label>
					<select
						id="tableExamFilter"
						class="flex h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 text-sm uppercase"
						value={tableExamFilter}
						onchange={(e) => handleTableExamChange(e.currentTarget.value)}
					>
						<option value="all">All Exams</option>
						{#each tableHierarchyQuery.data?.exams || [] as exam (exam)}
							<option value={exam}>{exam}</option>
						{/each}
					</select>
				</div>

				<div class="space-y-2">
					<Label for="tableYearFilter" class="flex items-center gap-1.5">
						<Calendar class="h-3.5 w-3.5" />
						Year
					</Label>
					<select
						id="tableYearFilter"
						class="flex h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 text-sm"
						value={tableYearFilter}
						onchange={(e) => handleTableYearChange(e.currentTarget.value)}
					>
						<option value="all">All Years</option>
						{#each tableHierarchyQuery.data?.years || [] as year (year)}
							<option value={String(year)}>{year}</option>
						{/each}
					</select>
				</div>
			</div>
			<div class="mt-3 flex flex-wrap items-center gap-3">
				<div class="flex items-center gap-2">
					<span class="text-xs font-medium text-muted-foreground">Vectorised</span>
					<div class="inline-flex rounded-md border bg-background p-1">
						<Button
							size="sm"
							variant={tableVectorisedFilter === 'all' ? 'secondary' : 'ghost'}
							class="h-7 px-2 text-xs"
							onclick={() => handleTableVectorisedChange('all')}
						>
							All
						</Button>
						<Button
							size="sm"
							variant={tableVectorisedFilter === 'vectorised' ? 'secondary' : 'ghost'}
							class="h-7 px-2 text-xs"
							onclick={() => handleTableVectorisedChange('vectorised')}
						>
							Vectorised
						</Button>
						<Button
							size="sm"
							variant={tableVectorisedFilter === 'not_vectorised' ? 'secondary' : 'ghost'}
							class="h-7 px-2 text-xs"
							onclick={() => handleTableVectorisedChange('not_vectorised')}
						>
							No vectorised
						</Button>
					</div>
				</div>
				<div class="flex items-center gap-2">
					<span class="text-xs font-medium text-muted-foreground">Similarity Cache</span>
					<div class="inline-flex rounded-md border bg-background p-1">
						<Button
							size="sm"
							variant={tableSimilarityCacheFilter === 'all' ? 'secondary' : 'ghost'}
							class="h-7 px-2 text-xs"
							onclick={() => handleTableSimilarityCacheChange('all')}
						>
							All
						</Button>
						<Button
							size="sm"
							variant={tableSimilarityCacheFilter === 'cached' ? 'secondary' : 'ghost'}
							class="h-7 px-2 text-xs"
							onclick={() => handleTableSimilarityCacheChange('cached')}
						>
							Cached
						</Button>
						<Button
							size="sm"
							variant={tableSimilarityCacheFilter === 'not_cached' ? 'secondary' : 'ghost'}
							class="h-7 px-2 text-xs"
							onclick={() => handleTableSimilarityCacheChange('not_cached')}
						>
							No cache
						</Button>
					</div>
				</div>
				{#if tableSearchApplied}
					<Badge variant="secondary">Search: {tableSearchApplied}</Badge>
				{/if}
				{#if tableVectorisedFilter === 'vectorised'}
					<Badge variant="outline" class="border-emerald-500/20 bg-emerald-500/5 text-emerald-600">
						Vectorised
					</Badge>
				{:else if tableVectorisedFilter === 'not_vectorised'}
					<Badge variant="outline" class="border-amber-500/20 bg-amber-500/5 text-amber-700">
						No vectorised
					</Badge>
				{/if}
				{#if tableSimilarityCacheFilter === 'cached'}
					<Badge variant="outline" class="border-blue-500/20 bg-blue-500/5 text-blue-600">
						Cached
					</Badge>
				{:else if tableSimilarityCacheFilter === 'not_cached'}
					<Badge variant="outline" class="border-slate-500/20 bg-slate-500/5 text-slate-700">
						No cache
					</Badge>
				{/if}
			</div>
		</div>

		<div class="mb-4 rounded-lg border bg-muted/30 p-3">
			<div class="space-y-3">
				<div>
					<div class="mb-1 flex items-center justify-between text-xs">
						<span class="font-medium text-muted-foreground">Vectorisation Progress</span>
						<span class="text-muted-foreground tabular-nums">
							{statsQuery.data?.vectorised ?? 0}/{statsQuery.data?.total ?? 0}
						</span>
					</div>
					<Progress value={coveragePercent} class="h-2" />
				</div>
				<div>
					<div class="mb-1 flex items-center justify-between text-xs">
						<span class="font-medium text-muted-foreground">Similarity Cache Coverage</span>
						<span class="text-muted-foreground tabular-nums">
							{cacheStatsQuery.data?.cached ?? 0}/{cacheStatsQuery.data?.total ?? 0}
						</span>
					</div>
					<Progress value={cacheCoveragePercent} class="h-2" />
				</div>
			</div>
		</div>

		{#if bulkProgress.total > 0}
			<div class="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
				<div class="mb-1 flex items-center justify-between text-xs">
					<span class="font-medium">
						{isBulkSeedingCache
							? stopBulkCacheSeedRequested
								? 'Bulk Cache Seed Progress (stopping...)'
								: 'Bulk Cache Seed Progress (active)'
							: isBulkDeleting
								? stopBulkDeleteRequested
									? 'Bulk Delete Progress (stopping...)'
									: 'Bulk Delete Progress (active)'
								: isBulkSyncing
									? 'Bulk Sync Progress (active)'
									: 'Bulk Operation Progress'}
					</span>
					<span class="tabular-nums">{bulkProgress.completed}/{bulkProgress.total}</span>
				</div>
				<Progress value={bulkProgressPercent} class="h-2" />
				<div class="mt-2 text-[11px] text-muted-foreground">
					Succeeded: {bulkProgress.succeeded} | Failed: {bulkProgress.failed}
				</div>
			</div>
		{/if}

		<div class="overflow-x-auto rounded-lg border">
			<table class="w-full text-left text-sm">
				<thead>
					<tr class="border-b bg-muted/30">
						<th class="px-3 py-2">
							<input
								type="checkbox"
								class="h-4 w-4 rounded border-input"
								checked={allVisibleSelected}
								onchange={toggleSelectAllVisible}
							/>
						</th>
						<th class="px-3 py-2 text-xs font-semibold text-muted-foreground">Question</th>
						<th class="px-3 py-2 text-xs font-semibold text-muted-foreground">Exam</th>
						<th class="px-3 py-2 text-xs font-semibold text-muted-foreground">Year</th>
						<th class="px-3 py-2 text-xs font-semibold text-muted-foreground">Vector Status</th>
						<th class="px-3 py-2 text-xs font-semibold text-muted-foreground">Similarity Cache</th>
						<th class="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Action</th>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#if mcqTableQuery.isLoading}
						{#each Array(6) as _, i (i)}
							<tr>
								<td class="px-3 py-3"><Skeleton class="h-4 w-4" /></td>
								<td class="px-3 py-3"><Skeleton class="h-4 w-[280px]" /></td>
								<td class="px-3 py-3"><Skeleton class="h-4 w-20" /></td>
								<td class="px-3 py-3"><Skeleton class="h-4 w-12" /></td>
								<td class="px-3 py-3"><Skeleton class="h-5 w-20 rounded-full" /></td>
								<td class="px-3 py-3"><Skeleton class="h-5 w-24 rounded-full" /></td>
								<td class="px-3 py-3"><Skeleton class="ml-auto h-8 w-36" /></td>
							</tr>
						{/each}
					{:else if tableRows.length === 0}
						<tr>
							<td colspan="7" class="px-3 py-8 text-center text-sm text-muted-foreground">
								No MCQs found.
							</td>
						</tr>
					{:else}
						{#each tableRows as mcq (mcq._id)}
							<tr class="hover:bg-muted/20">
								<td class="px-3 py-3 align-top">
									<input
										type="checkbox"
										class="h-4 w-4 rounded border-input"
										checked={selectedMcqIds.has(mcq._id)}
										onchange={() => toggleMcqSelection(mcq._id)}
									/>
								</td>
								<td class="max-w-[420px] px-3 py-3 align-top">
									<div class="line-clamp-2 text-sm leading-relaxed">{mcq.question}</div>
								</td>
								<td class="px-3 py-3 align-top text-xs uppercase">{mcq.exam}</td>
								<td class="px-3 py-3 align-top text-xs tabular-nums">{mcq.year}</td>
								<td class="px-3 py-3 align-top">
									{#if mcq.is_vectorised}
										<Badge
											variant="outline"
											class="border-emerald-500/20 bg-emerald-500/5 text-emerald-600"
										>
											Vectorised
										</Badge>
									{:else}
										<Badge
											variant="outline"
											class="border-amber-500/20 bg-amber-500/5 text-amber-700"
										>
											Pending
										</Badge>
									{/if}
								</td>
								<td class="px-3 py-3 align-top">
									{#if mcq.is_similarity_cached}
										<div class="space-y-1">
											<Badge
												variant="outline"
												class="border-blue-500/20 bg-blue-500/5 text-blue-600"
											>
												Cached
												{#if mcq.similarity_cache_count}
													({mcq.similarity_cache_count})
												{/if}
											</Badge>
											{#if mcq.similarity_cache_updated_at}
												<div class="text-[10px] text-muted-foreground">
													{new Date(mcq.similarity_cache_updated_at).toLocaleString()}
												</div>
											{/if}
										</div>
									{:else}
										<Badge
											variant="outline"
											class="border-slate-500/20 bg-slate-500/5 text-slate-700"
										>
											No cache
										</Badge>
									{/if}
								</td>
								<td class="px-3 py-3 text-right align-top">
									<div class="flex justify-end gap-1.5">
										<Button
											size="sm"
											variant="ghost"
											class="gap-1.5"
											onclick={() => seedSingleCacheFromTable(mcq._id)}
											disabled={isBulkSeedingCache ||
												isBulkSyncing ||
												isBulkDeleting ||
												isDeletingCache ||
												rowSeedingCacheId === mcq._id}
										>
											{#if rowSeedingCacheId === mcq._id}
												<RefreshCw class="h-3.5 w-3.5 animate-spin" />
											{:else}
												<ListChecks class="h-3.5 w-3.5" />
											{/if}
											Seed
										</Button>
										<Button
											size="sm"
											variant="ghost"
											class="gap-1.5"
											onclick={() => syncSingleFromTable(mcq._id)}
											disabled={isBulkSeedingCache ||
												isBulkSyncing ||
												isBulkDeleting ||
												isDeletingCache ||
												rowSyncingId === mcq._id}
										>
											{#if rowSyncingId === mcq._id}
												<RefreshCw class="h-3.5 w-3.5 animate-spin" />
											{:else}
												<Zap class="h-3.5 w-3.5" />
											{/if}
											Sync
										</Button>
									</div>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>

		<div class="mt-3 flex items-center justify-between">
			<div class="flex items-center gap-3">
				<div class="text-[11px] text-muted-foreground">
					Page <span class="font-semibold text-foreground">{tableCursorIndex + 1}</span>
				</div>
				<div class="flex items-center gap-2">
					<Label for="tablePageSize" class="text-[11px] text-muted-foreground">Rows</Label>
					<select
						id="tablePageSize"
						class="h-8 rounded-md border border-input bg-background px-2 text-xs"
						value={String(tablePageSize)}
						onchange={(e) => handleTablePageSizeChange(e.currentTarget.value)}
					>
						{#each TABLE_PAGE_SIZE_OPTIONS as size (size)}
							<option value={String(size)}>{size}</option>
						{/each}
					</select>
				</div>
			</div>
			<div class="flex items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					class="h-8 gap-1.5"
					disabled={!tableHasPrev}
					onclick={prevTablePage}
				>
					<ChevronLeft class="h-3.5 w-3.5" />
					Prev
				</Button>
				<Button
					variant="outline"
					size="sm"
					class="h-8 gap-1.5"
					disabled={!tableHasNext}
					onclick={nextTablePage}
				>
					Next
					<ChevronRight class="h-3.5 w-3.5" />
				</Button>
			</div>
		</div>
	</div>

	<div class="mb-6 rounded-xl border bg-card p-5 shadow-sm">
		<div class="space-y-4">
			<div>
				<h2 class="text-base font-semibold">Search Settings</h2>
				<p class="mt-1 text-xs text-muted-foreground">
					Similarity is fixed to top {RESULT_LIMIT} MCQs. Recommended threshold is
					{RECOMMENDED_THRESHOLD}.
				</p>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<Badge variant="secondary">Task: rag_embeddings</Badge>
				<Badge variant="outline">Limit: {RESULT_LIMIT}</Badge>
				<Badge variant="outline">Min threshold: {MIN_THRESHOLD}</Badge>
				<Badge variant="outline">Recommended: {RECOMMENDED_THRESHOLD}</Badge>
			</div>
			<div class="rounded-lg border p-3 text-xs text-muted-foreground">
				{#if activeModelInfo}
					Model: <span class="font-medium text-foreground">{activeModelInfo}</span>
					{#if activeDimension}
						<span class="ml-2">({activeDimension} dims)</span>
					{/if}
				{:else}
					Run any indexing/search operation to view active embedding model metadata.
				{/if}
			</div>
		</div>
	</div>

	<div class="rounded-xl border bg-card p-5 shadow-sm">
		<Tabs.Root bind:value={searchTab}>
			<Tabs.List class="mb-4 grid h-9 w-full grid-cols-2">
				<Tabs.Trigger value="text" class="text-xs">Search by Text</Tabs.Trigger>
				<Tabs.Trigger value="source" class="text-xs">Search by Source</Tabs.Trigger>
			</Tabs.List>

			<Tabs.Content value="text" class="space-y-4">
				<div class="grid gap-4 lg:grid-cols-[1fr_auto]">
					<div class="space-y-2">
						<Label for="queryText">Input Text</Label>
						<Textarea
							id="queryText"
							rows={5}
							bind:value={textQuery}
							placeholder="Paste a question, blog excerpt, chat query, or flashcard text..."
						/>
					</div>
					<div class="space-y-2 lg:w-48">
						<Label for="textThreshold">Threshold</Label>
						<Input
							id="textThreshold"
							type="number"
							min={MIN_THRESHOLD}
							max="1"
							step="0.01"
							bind:value={textThresholdInput}
						/>
						<Badge variant="outline" class="w-full justify-center text-[11px]">
							Top {RESULT_LIMIT} results
						</Badge>
						<Button class="w-full gap-2" onclick={runTextSearch} disabled={isSearchingText}>
							{#if isSearchingText}
								<RefreshCw class="h-4 w-4 animate-spin" />
								Searching...
							{:else}
								<Search class="h-4 w-4" />
								Find Similar
							{/if}
						</Button>
					</div>
				</div>

				{#if textResult}
					<div class="rounded-lg border p-3">
						<div class="mb-3 flex flex-wrap items-center gap-2 text-xs">
							<Badge variant="secondary">{textResult.mcqs.length} results</Badge>
							<Badge variant="outline">Threshold {textResult.vectorScoreThreshold}</Badge>
							<Badge variant="outline">{textResult.modelId}</Badge>
						</div>
						<div class="space-y-3">
							{#each textResult.mcqs as mcq (mcq._id)}
								<div class="rounded-lg border bg-background p-3">
									<div class="mb-2 flex items-center justify-between gap-2">
										<div class="flex flex-wrap gap-2">
											<Badge variant="outline" class="text-[10px] uppercase">
												{mcq.exam}
												{mcq.year}
											</Badge>
											<Badge variant="secondary" class="text-[10px]">{mcq.mcq_type}</Badge>
											<Badge
												variant="outline"
												class="border-primary/30 bg-primary/5 text-[10px] text-primary"
											>
												Score {formatScore(mcq._score)}
											</Badge>
										</div>
										<span class="text-[10px] text-muted-foreground">{mcq._id}</span>
									</div>
									<p class="text-sm leading-relaxed">{mcq.question}</p>
								</div>
							{/each}
							{#if textResult.mcqs.length === 0}
								<div class="py-4 text-center text-sm text-muted-foreground">
									No MCQs met the threshold.
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</Tabs.Content>

			<Tabs.Content value="source" class="space-y-4">
				<div class="grid gap-4 md:grid-cols-3">
					<div class="space-y-2">
						<Label for="sourceType">Source Type</Label>
						<select
							id="sourceType"
							class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
							bind:value={sourceType}
						>
							{#each sourceTypeOptions as option (option.value)}
								<option value={option.value}>{option.label}</option>
							{/each}
						</select>
					</div>
					<div class="space-y-2">
						<Label for="sourceId">Source ID</Label>
						<Input
							id="sourceId"
							type="text"
							bind:value={sourceId}
							placeholder="MCQ/Blog/Content/Flashcard/Message ID"
						/>
					</div>
					<div class="space-y-2">
						<Label for="sourceThreshold">Threshold</Label>
						<Input
							id="sourceThreshold"
							type="number"
							min={MIN_THRESHOLD}
							max="1"
							step="0.01"
							bind:value={sourceThresholdInput}
						/>
					</div>
				</div>
				<div class="flex flex-wrap items-center gap-3">
					<Badge variant="outline">Top {RESULT_LIMIT} results</Badge>
					<Button class="gap-2" onclick={runSourceSearch} disabled={isSearchingSource}>
						{#if isSearchingSource}
							<RefreshCw class="h-4 w-4 animate-spin" />
							Searching...
						{:else}
							<Search class="h-4 w-4" />
							Find Similar
						{/if}
					</Button>
				</div>

				{#if sourceResult}
					<div class="rounded-lg border p-3">
						<div class="mb-3 flex flex-wrap items-center gap-2 text-xs">
							<Badge variant="secondary">{sourceResult.mcqs.length} results</Badge>
							<Badge variant="outline">Threshold {sourceResult.vectorScoreThreshold}</Badge>
							<Badge variant="outline">{sourceResult.modelId}</Badge>
						</div>
						<div class="mb-3 rounded-md border bg-muted/30 p-3">
							<p class="text-[11px] font-medium text-muted-foreground">
								Resolved query text preview
							</p>
							<p class="mt-1 line-clamp-4 text-xs leading-relaxed">{sourceResult.queryText}</p>
						</div>
						<div class="space-y-3">
							{#each sourceResult.mcqs as mcq (mcq._id)}
								<div class="rounded-lg border bg-background p-3">
									<div class="mb-2 flex items-center justify-between gap-2">
										<div class="flex flex-wrap gap-2">
											<Badge variant="outline" class="text-[10px] uppercase">
												{mcq.exam}
												{mcq.year}
											</Badge>
											<Badge variant="secondary" class="text-[10px]">{mcq.mcq_type}</Badge>
											<Badge
												variant="outline"
												class="border-primary/30 bg-primary/5 text-[10px] text-primary"
											>
												Score {formatScore(mcq._score)}
											</Badge>
										</div>
										<span class="text-[10px] text-muted-foreground">{mcq._id}</span>
									</div>
									<p class="text-sm leading-relaxed">{mcq.question}</p>
								</div>
							{/each}
							{#if sourceResult.mcqs.length === 0}
								<div class="py-4 text-center text-sm text-muted-foreground">
									No MCQs met the threshold.
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</Tabs.Content>
		</Tabs.Root>
	</div>
</div>
