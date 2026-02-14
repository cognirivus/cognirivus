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
		RefreshCw
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

	const PAGE_SIZE = 100;
	const MAX_CONTENT_PREVIEW = 12;
	const MAX_ARCHIVE_PREVIEW = 8;

	let currentCursor = $state<string | null>(null);
	let cursorHistory = $state<string[]>([]);
	let searchQuery = $state('');
	let selectedType = $state('');

	let expandedIds = new SvelteSet<Id<'entities'>>();
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

	const entitiesQuery = useQuery(api.content.listAllEntities, () => ({
		paginationOpts: { numItems: PAGE_SIZE, cursor: currentCursor },
		type: selectedType || undefined,
		onlyGenerated: false
	}));

	const typesQuery = useQuery(api.content.listEntityTypes, {});
	const entityTypes = $derived((typesQuery.data ?? []) as EntityTypeCount[]);

	const filteredEntities = $derived.by(() => {
		const page = ((entitiesQuery.data?.page as EntityRow[] | undefined) ?? [])
			.filter((entity) =>
				!searchQuery ? true : entity.name.toLowerCase().includes(searchQuery.toLowerCase())
			)
			.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
		return page;
	});

	function nextPage() {
		if (entitiesQuery.data && !entitiesQuery.data.isDone) {
			cursorHistory = [...cursorHistory, currentCursor ?? ''];
			currentCursor = entitiesQuery.data.continueCursor;
			expandedIds.clear();
		}
	}

	function prevPage() {
		if (cursorHistory.length > 0) {
			const prev = cursorHistory[cursorHistory.length - 1];
			cursorHistory = cursorHistory.slice(0, -1);
			currentCursor = prev === '' ? null : prev;
			expandedIds.clear();
		}
	}

	function resetPagination() {
		currentCursor = null;
		cursorHistory = [];
	}

	function applyFilters() {
		resetPagination();
		expandedIds.clear();
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

	<div class="mb-8 rounded-xl border bg-card p-5 shadow-sm">
		<div class="mb-4 flex items-center gap-2 border-b pb-4">
			<Search class="h-4 w-4 text-muted-foreground" />
			<h3 class="font-semibold">Filters</h3>
		</div>
		<div class="flex flex-col gap-4 sm:flex-row sm:items-end">
			<div class="relative w-full flex-1">
				<label
					for="entity-search"
					class="mb-1.5 block text-xs font-medium tracking-wide text-muted-foreground uppercase"
				>
					Search Entity
				</label>
				<div class="relative">
					<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						id="entity-search"
						type="text"
						placeholder="Search by entity name..."
						bind:value={searchQuery}
						class="h-10 pl-9"
					/>
				</div>
			</div>
			<div class="w-full sm:w-[240px]">
				<label
					for="entity-type"
					class="mb-1.5 block text-xs font-medium tracking-wide text-muted-foreground uppercase"
				>
					Entity Type
				</label>
				<div class="relative">
					<select
						id="entity-type"
						bind:value={selectedType}
						onchange={applyFilters}
						class="flex h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
					>
						<option value="">All Types</option>
						{#if entityTypes.length > 0}
							{#each entityTypes as t (t.type)}
								<option value={t.type}>{t.type} ({t.count})</option>
							{/each}
						{/if}
					</select>
					<ChevronDown
						class="pointer-events-none absolute top-3 right-3 h-4 w-4 text-muted-foreground"
					/>
				</div>
			</div>
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
			<div class="overflow-x-auto">
				<table class="w-full text-left text-sm">
					<thead>
						<tr class="border-b bg-muted/30">
							<th class="w-12 px-4 py-3 font-semibold text-muted-foreground">View</th>
							<th class="px-6 py-3 font-semibold text-muted-foreground">Entity</th>
							<th class="px-6 py-3 font-semibold text-muted-foreground">Type</th>
							<th class="px-6 py-3 font-semibold text-muted-foreground">Slug</th>
							<th class="px-6 py-3 font-semibold text-muted-foreground">Linked Content</th>
							<th class="px-6 py-3 font-semibold text-muted-foreground">Article</th>
							<th class="px-6 py-3 font-semibold text-muted-foreground">Generated</th>
						</tr>
					</thead>
					<tbody class="divide-y">
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
								<td class="px-6 py-4 align-top">
									<div class="font-semibold text-foreground">{entity.name}</div>
									<div class="mt-1 font-mono text-xs text-muted-foreground">{entity._id}</div>
								</td>
								<td class="px-6 py-4 align-top">
									<Badge variant="secondary" class="capitalize">{entity.type}</Badge>
								</td>
								<td class="px-6 py-4 align-top text-muted-foreground">{entity.slug}</td>
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
							</tr>

							{#if expandedIds.has(entity._id)}
								{@const details = entityDetails[entity._id]}
								<tr class="bg-muted/10">
									<td colspan="7" class="px-6 py-5">
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
														<h5 class="font-medium">Archive History ({details.archives.length})</h5>
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
																Showing {MAX_ARCHIVE_PREVIEW} of {details.archives.length} archived versions.
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
						{:else}
							<tr>
								<td colspan="7" class="px-6 py-16 text-center">
									<p class="text-sm text-muted-foreground">
										No entities found for the current filters/search.
									</p>
								</td>
							</tr>
						{/each}
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
