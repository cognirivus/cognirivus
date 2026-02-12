<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import {
		Filter,
		ChevronRight,
		ChevronLeft,
		ChevronDown,
		Check,
		MapPin,
		Users,
		Building2,
		Briefcase,
		Tag,
		FileText,
		X,
		Search,
		Zap,
		ThumbsUp,
		ThumbsDown,
		MessageCircle
	} from '@lucide/svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';

	// Read filter/pagination state from URL
	const searchQuery = $derived(page.url.searchParams.get('q') || undefined);
	const selectedSubjectIds = $derived(page.url.searchParams.getAll('subject'));
	const selectedGsPapers = $derived(page.url.searchParams.getAll('gs').map(Number));
	const selectedEntityTypes = $derived(page.url.searchParams.getAll('entityType'));
	const selectedEntityIds = $derived(page.url.searchParams.getAll('entity'));
	const selectedStatus = $derived(
		(page.url.searchParams.get('status') as 'all' | 'completed' | 'incomplete') || 'all'
	);
	const currentCursor = $derived(page.url.searchParams.get('cursor') || null);
	const currentIndex = $derived(Number(page.url.searchParams.get('index') || 0));
	const includeNews = $derived(page.url.searchParams.get('news') === 'true');

	// Check if we should group by entity (when entity type filter is active but no specific entity selected)
	const shouldGroupByEntity = $derived(
		selectedEntityTypes.length > 0 && selectedEntityIds.length === 0
	);

	// Check if any filters are active
	const hasActiveFilters = $derived(
		!!searchQuery ||
			selectedSubjectIds.length > 0 ||
			selectedGsPapers.length > 0 ||
			selectedEntityTypes.length > 0 ||
			selectedEntityIds.length > 0 ||
			selectedStatus !== 'all' ||
			includeNews
	);

	const numItems = 50; // Fetch more when grouping

	const contentQuery = useQuery((api as any).content.listPaginated, () => ({
		topic: includeNews ? 'Current Affairs' : undefined,
		includeNews,
		subjectIds: selectedSubjectIds.length > 0 ? (selectedSubjectIds as any) : undefined,
		gsPapers: selectedGsPapers.length > 0 ? selectedGsPapers : undefined,
		entityTypes: selectedEntityTypes.length > 0 ? selectedEntityTypes : undefined,
		entityIds: selectedEntityIds.length > 0 ? (selectedEntityIds as any) : undefined,
		status: selectedStatus !== 'all' ? selectedStatus : undefined,
		search: searchQuery,
		paginationOpts: { numItems, cursor: currentCursor }
	}));

	const progressQuery = useQuery(api.content.getUserProgress, {});
	const subjectsQuery = useQuery(api.subjects.list, {});

	// Load entities when entity type is selected (only single type)
	const singleEntityType = $derived(
		selectedEntityTypes.length === 1 ? selectedEntityTypes[0] : null
	);
	const entitiesQuery = useQuery((api as any).content.listEntities, () =>
		singleEntityType ? { type: singleEntityType } : 'skip'
	);
	const availableEntities = $derived(
		((entitiesQuery.data as any[]) || []).sort((a, b) => a.name.localeCompare(b.name))
	);

	// Get selected entity details for breadcrumbs (only if single selected)
	const singleEntityQuery = useQuery((api as any).content.getEntity, () =>
		selectedEntityIds.length === 1 ? { id: selectedEntityIds[0] as any } : 'skip'
	);

	const contentItems = $derived(contentQuery.data?.page || []);
	const hasNextPage = $derived(contentQuery.data?.isDone === false);
	const hasPrevPage = $derived(currentIndex > 0);
	const allSubjects = $derived(subjectsQuery.data || []);

	// Get subject names for display
	const selectedSubjectNames = $derived(
		selectedSubjectIds.map((id) => allSubjects.find((s: any) => s._id === id)?.name).filter(Boolean)
	);

	// Group content by entity when entity type filter is active
	const groupedByEntity = $derived.by(() => {
		if (!shouldGroupByEntity) return null;

		const groups: Map<string, { entity: any; items: any[] }> = new Map();

		contentItems.forEach((item: any) => {
			// Find entities matching the selected types
			const matchingEntities = (item.entities || []).filter((e: any) =>
				selectedEntityTypes.includes(e.type)
			);

			if (matchingEntities.length === 0) {
				// Item has no matching entities, put in "Other" group
				const key = '__other__';
				if (!groups.has(key)) {
					groups.set(key, {
						entity: { _id: '__other__', name: 'Other', type: 'other' },
						items: []
					});
				}
				groups.get(key)!.items.push(item);
			} else {
				// Add item to each matching entity's group
				matchingEntities.forEach((entity: any) => {
					const key = entity._id;
					if (!groups.has(key)) {
						groups.set(key, { entity, items: [] });
					}
					groups.get(key)!.items.push(item);
				});
			}
		});

		// Sort groups by item count (descending)
		return Array.from(groups.values()).sort((a, b) => b.items.length - a.items.length);
	});

	// Track collapsed state for each entity group
	let collapsedGroups = $state<Set<string>>(new Set());

	function toggleGroup(entityId: string) {
		const newSet = new Set(collapsedGroups);
		if (newSet.has(entityId)) {
			newSet.delete(entityId);
		} else {
			newSet.add(entityId);
		}
		collapsedGroups = newSet;
	}

	function getEntityIcon(type: string) {
		const t = type.toLowerCase();
		if (t === 'location' || t.includes('place')) return MapPin;
		if (t === 'person') return Users;
		if (t.includes('organization') || t.includes('office')) return Building2;
		if (t.includes('legislation') || t.includes('act') || t.includes('law')) return Briefcase;
		return Tag;
	}

	function goToPage(next: boolean) {
		const params = new URLSearchParams(page.url.searchParams);
		if (next && contentQuery.data?.continueCursor) {
			params.set('cursor', contentQuery.data.continueCursor);
			params.set('index', String(currentIndex + 1));
		} else if (!next && currentIndex > 0) {
			window.history.back();
			return;
		}
		goto(`${page.url.pathname}?${params.toString()}`, { noScroll: true });
	}

	function clearFilters() {
		goto('/content');
	}

	function removeFilter(key: string, value?: string) {
		const params = new URLSearchParams(page.url.searchParams);
		if (value) {
			const values = params.getAll(key).filter((v) => v !== value);
			params.delete(key);
			values.forEach((v) => params.append(key, v));
		} else {
			params.delete(key);
		}
		params.delete('cursor');
		params.delete('index');
		goto(`/content?${params.toString()}`);
	}

	function toggleEntity(entityId: string) {
		const current = new Set(selectedEntityIds);
		if (current.has(entityId)) current.delete(entityId);
		else current.add(entityId);
		const params = new URLSearchParams(page.url.searchParams);
		params.delete('entity');
		Array.from(current).forEach((id) => params.append('entity', id));
		params.delete('cursor');
		params.delete('index');
		goto(`/content?${params.toString()}`);
	}

	function viewEntityArticle(entity: any) {
		goto(
			`/content/article?view=entity&type=${encodeURIComponent(entity.type)}&slug=${entity.slug}`
		);
	}

	function viewAllForEntity(entityId: string) {
		const params = new URLSearchParams(page.url.searchParams);
		params.set('entity', entityId);
		params.delete('cursor');
		params.delete('index');
		goto(`/content?${params.toString()}`);
	}
</script>

{#snippet contentCard(item: any)}
	<article
		class="group relative flex w-full min-w-0 flex-col gap-3 rounded-xl border-b border-border/40 px-4 py-5 transition-all last:border-0 hover:bg-muted/40 sm:px-6"
	>
		<div class="flex min-w-0 flex-wrap items-center gap-2">
			{#if item.subject}
				<Badge
					variant="outline"
					class="border-primary/20 bg-primary/5 text-[10px] font-semibold text-primary uppercase"
				>
					GS {item.subject.gsPaper} • {item.subject.name}
				</Badge>
			{/if}
			<Badge
				variant="secondary"
				class="flex h-auto items-center gap-1 text-[10px] font-medium uppercase"
			>
				<Tag class="h-3 w-3 opacity-50" />
				{item.topic}
			</Badge>
			{#if progressQuery.data?.[item._id]}
				<Badge
					variant="outline"
					class="border-emerald-500/20 bg-emerald-500/5 text-[10px] font-semibold text-emerald-600 uppercase"
				>
					<Check class="mr-1 h-3 w-3" />
					Done
				</Badge>
			{/if}
			<span class="text-[10px] font-medium text-muted-foreground uppercase tabular-nums">
				{item.newsDate || '—'}
			</span>
			{#if item.source}
				<span
					class="max-w-[120px] truncate text-[10px] font-medium text-muted-foreground uppercase"
				>
					{item.source}
				</span>
			{/if}
		</div>

		<div class="flex items-start justify-between gap-4">
			<div class="min-w-0 flex-1 space-y-1.5">
				<a
					href="/content/{item._id}"
					class="block text-base font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary sm:text-lg"
				>
					{item.title}
				</a>
				<p class="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
					{item.body}
				</p>

				<div
					class="flex items-center gap-4 pt-1.5 text-[10px] font-medium text-muted-foreground uppercase"
				>
					<div class="flex items-center gap-1">
						<ThumbsUp class="h-3 w-3" />
						{item.likes}
					</div>
					<div class="flex items-center gap-1">
						<ThumbsDown class="h-3 w-3" />
						{item.dislikes}
					</div>
					<div class="flex items-center gap-1">
						<MessageCircle class="h-3 w-3" />
						{item.commentCount}
					</div>
				</div>
			</div>

			<Button
				variant="ghost"
				size="icon"
				href="/content/{item._id}"
				class="mt-0.5 h-8 w-8 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:opacity-100"
			>
				<ChevronRight class="h-4 w-4" />
			</Button>
		</div>
	</article>
{/snippet}

<div class="flex h-full flex-col">
	<div class="flex-1 overflow-x-hidden overflow-y-auto px-4 py-6 sm:px-8">
		<!-- Active Filters Header -->
		{#if hasActiveFilters}
			<div class="mb-6 rounded-xl border bg-muted/20 p-4">
				<div class="flex flex-wrap items-center gap-2">
					<span class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
						>Active Filters:</span
					>

					{#if searchQuery}
						<Badge variant="secondary" class="gap-1.5 px-2 py-1 text-xs">
							<Search class="h-3 w-3 opacity-50" />
							"{searchQuery}"
							<button
								onclick={() => removeFilter('q')}
								class="ml-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
							>
								<X class="h-3 w-3" />
							</button>
						</Badge>
					{/if}

					{#each selectedGsPapers as gs}
						<Badge variant="secondary" class="gap-1.5 px-2 py-1 text-xs">
							GS Paper {gs}
							<button
								onclick={() => removeFilter('gs', String(gs))}
								class="ml-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
							>
								<X class="h-3 w-3" />
							</button>
						</Badge>
					{/each}

					{#each selectedSubjectNames as name}
						{@const subjectId = allSubjects.find((s: any) => s.name === name)?._id}
						<Badge variant="secondary" class="gap-1.5 px-2 py-1 text-xs">
							{name}
							<button
								onclick={() => removeFilter('subject', subjectId)}
								class="ml-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
							>
								<X class="h-3 w-3" />
							</button>
						</Badge>
					{/each}

					{#if singleEntityType}
						<!-- Breadcrumb style: EntityType > Entity Dropdown -->
						{@const Icon = getEntityIcon(singleEntityType)}
						<div class="flex items-center gap-1.5">
							<Badge
								variant="outline"
								class="gap-1.5 border-primary/20 bg-primary/5 px-2 py-1 text-xs text-primary"
							>
								<Icon class="h-3 w-3" />
								<button
									onclick={() => removeFilter('entityType', singleEntityType)}
									class="font-semibold capitalize hover:underline"
								>
									{singleEntityType}s
								</button>
								<button
									onclick={() => removeFilter('entityType', singleEntityType)}
									class="ml-1 rounded-full hover:bg-primary/10"
								>
									<X class="h-3 w-3" />
								</button>
							</Badge>

							<ChevronRight class="h-3.5 w-3.5 text-muted-foreground/30" />

							<DropdownMenu.Root>
								<DropdownMenu.Trigger>
									{#snippet child({ props })}
										<Button
											variant="outline"
											size="sm"
											class="h-7 gap-1.5 px-2.5 text-xs font-semibold"
											{...props}
										>
											{#if selectedEntityIds.length === 0}
												All {singleEntityType}s
											{:else if selectedEntityIds.length === 1 && singleEntityQuery.data}
												{singleEntityQuery.data.name}
											{:else}
												{selectedEntityIds.length} {singleEntityType}s
											{/if}
											<ChevronDown class="h-3 w-3 opacity-50" />
										</Button>
									{/snippet}
								</DropdownMenu.Trigger>
								<DropdownMenu.Content class="max-h-80 w-64 overflow-y-auto">
									{#if entitiesQuery.isLoading}
										<div class="flex items-center justify-center py-4">
											<Loader variant="circular" size="sm" />
										</div>
									{:else if availableEntities.length === 0}
										<div class="px-2 py-4 text-center text-xs text-muted-foreground">
											No entities found
										</div>
									{:else}
										{#each availableEntities as ent}
											<DropdownMenu.CheckboxItem
												checked={selectedEntityIds.includes(ent._id)}
												onCheckedChange={() => toggleEntity(ent._id)}
											>
												{ent.name}
											</DropdownMenu.CheckboxItem>
										{/each}
									{/if}
									{#if entitiesQuery.isLoading}
										<div class="flex items-center justify-center py-4">
											<Loader variant="circular" size="sm" />
										</div>
									{:else if availableEntities.length === 0}
										<div class="px-2 py-4 text-center text-xs text-muted-foreground">
											No entities found
										</div>
									{:else}
										{#each availableEntities as ent}
											<DropdownMenu.CheckboxItem
												checked={selectedEntityIds.includes(ent._id)}
												onCheckedChange={() => toggleEntity(ent._id)}
											>
												{ent.name}
											</DropdownMenu.CheckboxItem>
										{/each}
									{/if}
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						</div>

						<!-- Selected Entity Badges -->
						{#if selectedEntityIds.length > 0}
							<div class="ml-2 flex flex-wrap items-center gap-1.5 border-l border-border/50 pl-3">
								{#each selectedEntityIds as id}
									{@const ent = availableEntities.find((e) => e._id === id)}
									{#if ent}
										<Badge variant="secondary" class="gap-1.5 px-2 py-1 text-xs">
											{ent.name}
											<button
												onclick={() => removeFilter('entity', id)}
												class="ml-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
											>
												<X class="h-3 w-3" />
											</button>
										</Badge>
									{/if}
								{/each}
							</div>
						{/if}
					{:else}
						<!-- Just entity types, no specific entity type (multiple types) -->
						{#each selectedEntityTypes as type}
							{@const Icon = getEntityIcon(type)}
							<Badge
								variant="outline"
								class="gap-1.5 border-primary/20 bg-primary/5 px-2 py-1 text-xs text-primary"
							>
								<Icon class="h-3 w-3" />
								<span class="font-semibold capitalize">{type}s</span>
								<button
									onclick={() => removeFilter('entityType', type)}
									class="ml-1 rounded-full hover:bg-primary/10"
								>
									<X class="h-3 w-3" />
								</button>
							</Badge>
						{/each}
					{/if}

					{#if selectedStatus !== 'all'}
						<Badge
							variant="outline"
							class="gap-1.5 border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-xs text-emerald-600"
						>
							{#if selectedStatus === 'completed'}
								<Check class="h-3 w-3" />
								Completed
							{:else}
								Incomplete
							{/if}
							<button
								onclick={() => removeFilter('status')}
								class="ml-1 rounded-full hover:bg-emerald-500/10"
							>
								<X class="h-3 w-3" />
							</button>
						</Badge>
					{/if}

					{#if includeNews}
						<Badge
							variant="outline"
							class="gap-1.5 border-amber-500/20 bg-amber-500/5 px-2 py-1 text-xs text-amber-600"
						>
							<Zap class="h-3 w-3 fill-amber-500" />
							Current Affairs
							<button
								onclick={() => removeFilter('news')}
								class="ml-1 rounded-full hover:bg-amber-500/10"
							>
								<X class="h-3 w-3" />
							</button>
						</Badge>
					{/if}

					<Button
						variant="ghost"
						size="sm"
						class="ml-auto h-7 text-xs font-semibold text-muted-foreground hover:text-foreground"
						onclick={clearFilters}
					>
						Clear all
					</Button>
				</div>
			</div>
		{/if}

		{#if contentQuery.isLoading}
			<div class="space-y-4">
				{#each Array(5) as _}
					<div class="flex flex-col gap-3 rounded-xl border border-transparent p-4 sm:px-6">
						<div class="flex gap-2">
							<div class="h-5 w-24 animate-pulse rounded bg-muted"></div>
							<div class="h-5 w-20 animate-pulse rounded bg-muted"></div>
						</div>
						<div class="flex items-start justify-between gap-4">
							<div class="flex-1 space-y-3">
								<div class="h-6 w-3/4 animate-pulse rounded bg-muted"></div>
								<div class="space-y-2">
									<div class="h-4 w-full animate-pulse rounded bg-muted"></div>
									<div class="h-4 w-2/3 animate-pulse rounded bg-muted"></div>
								</div>
							</div>
							<div class="h-8 w-8 animate-pulse rounded-md bg-muted"></div>
						</div>
					</div>
				{/each}
			</div>
		{:else if contentItems.length === 0}
			<div class="flex flex-col items-center justify-center py-24 text-center">
				<div class="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
					<Filter class="h-7 w-7 text-muted-foreground" />
				</div>
				<p class="text-lg font-semibold text-foreground">No insights found</p>
				<p class="mt-1 text-sm text-muted-foreground">
					Try adjusting your filters or search query.
				</p>
				<Button variant="outline" class="mt-6" onclick={clearFilters}>Clear Filters</Button>
			</div>
		{:else if shouldGroupByEntity && groupedByEntity}
			<!-- GROUPED BY ENTITY VIEW -->
			<div class="space-y-6">
				{#each groupedByEntity as { entity, items }}
					{@const Icon = getEntityIcon(entity.type)}
					{@const isCollapsed = collapsedGroups.has(entity._id)}
					{@const isOther = entity._id === '__other__'}

					<div class="overflow-hidden rounded-xl border bg-card shadow-sm">
						<!-- Entity Group Header -->
						<button
							onclick={() => toggleGroup(entity._id)}
							class="flex w-full items-center justify-between border-b bg-muted/30 px-5 py-4 transition-colors hover:bg-muted/50"
						>
							<div class="flex min-w-0 items-center gap-4">
								<div
									class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-background text-primary shadow-sm"
								>
									<Icon class="h-5 w-5" />
								</div>
								<div class="min-w-0 text-left">
									<h3 class="truncate font-semibold text-foreground">{entity.name}</h3>
									<p class="truncate text-xs font-medium text-muted-foreground">
										{items.length} item{items.length !== 1 ? 's' : ''}
										{#if !isOther}
											<span class="mx-1.5 opacity-50">•</span>
											<span class="capitalize">{entity.type}</span>
										{/if}
									</p>
								</div>
							</div>
							<div class="flex shrink-0 items-center gap-2">
								{#if !isOther && entity.slug}
									<Button
										variant="ghost"
										size="sm"
										class="h-8 gap-2 px-3 text-xs font-semibold text-primary hover:bg-primary/10 hover:text-primary"
										onclick={(e) => {
											e.stopPropagation();
											viewEntityArticle(entity);
										}}
									>
										<FileText class="h-3.5 w-3.5" />
										<span class="hidden sm:inline">Article</span>
									</Button>
									<Button
										variant="outline"
										size="sm"
										class="h-8 gap-2 px-3 text-xs font-semibold"
										onclick={(e) => {
											e.stopPropagation();
											viewAllForEntity(entity._id);
										}}
									>
										View All
										<ChevronRight class="h-3.5 w-3.5" />
									</Button>
								{/if}
								<ChevronDown
									class="h-5 w-5 text-muted-foreground transition-transform {isCollapsed
										? '-rotate-90'
										: ''}"
								/>
							</div>
						</button>

						<!-- Content Table (collapsible) -->
						{#if !isCollapsed}
							<div class="divide-y border-t bg-background">
								{#each items.slice(0, 5) as item}
									{@render contentCard(item)}
								{/each}
								{#if items.length > 5}
									<div class="bg-muted/10 p-4 text-center">
										<Button
											variant="ghost"
											size="sm"
											class="gap-2 text-xs font-semibold text-primary hover:text-primary"
											onclick={() => viewAllForEntity(entity._id)}
										>
											View all {items.length} items
											<ChevronRight class="h-3 w-3" />
										</Button>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{:else}
			<!-- FLAT LIST VIEW -->
			<div class="space-y-1">
				{#each contentItems as item}
					{@render contentCard(item)}
				{/each}
			</div>
		{/if}
	</div>

	<!-- Sticky Pagination -->
	{#if contentItems.length > 0}
		<footer
			class="mt-auto border-t bg-background px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.02)] sm:px-8"
		>
			<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
				<div class="min-w-0 text-xs font-medium text-muted-foreground">
					Page <span class="font-bold text-foreground">{currentIndex + 1}</span>
					{#if shouldGroupByEntity && groupedByEntity}
						<span class="ml-2 hidden sm:inline">
							({groupedByEntity.length} group{groupedByEntity.length !== 1 ? 's' : ''})
						</span>
					{/if}
				</div>
				<div class="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						onclick={() => goToPage(false)}
						disabled={!hasPrevPage}
						class="h-8 gap-1.5 px-3 text-xs font-semibold"
					>
						<ChevronLeft class="h-3.5 w-3.5" />
						Prev
					</Button>
					<Button
						variant="outline"
						size="sm"
						onclick={() => goToPage(true)}
						disabled={!hasNextPage}
						class="h-8 gap-1.5 px-3 text-xs font-semibold"
					>
						Next
						<ChevronRight class="h-3.5 w-3.5" />
					</Button>
				</div>
			</div>
		</footer>
	{/if}
</div>
