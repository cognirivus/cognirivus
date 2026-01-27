<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import {
		Search,
		ChevronRight,
		ChevronDown,
		Check,
		X,
		Filter,
		RotateCcw,
		MapPin,
		Users,
		Building2,
		Briefcase,
		Tag,
		FileText,
		BookOpen,
		PanelLeft,
		PanelRight,
		Info,
		Zap,
		Library,
		Sparkles,
		Brain
	} from '@lucide/svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Separator } from '$lib/components/ui/separator';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';
	import { browser } from '$app/environment';
	import { Switch } from '$lib/components/ui/switch';
	import { Label } from '$lib/components/ui/label';

	let { children } = $props();

	// Sidebar state
	let isSidebarOpen = $state(true);
	let isRightSidebarOpen = $state(false);
	let isMobile = $state(false);

	$effect(() => {
		if (browser) {
			const checkMobile = () => {
				const mobile = window.innerWidth < 1024;
				if (mobile !== isMobile) {
					isMobile = mobile;
					isSidebarOpen = !mobile;
					if (!mobile) {
						isRightSidebarOpen = true;
					} else {
						isRightSidebarOpen = false;
					}
				}
			};
			checkMobile();
			window.addEventListener('resize', checkMobile);
			return () => window.removeEventListener('resize', checkMobile);
		}
	});

	function toggleSidebar() {
		isSidebarOpen = !isSidebarOpen;
	}

	function toggleRightSidebar() {
		isRightSidebarOpen = !isRightSidebarOpen;
	}

	// Read state from URL search params
	const search = $derived(page.url.searchParams.get('q') || '');
	const selectedSubjectIds = $derived(page.url.searchParams.getAll('subject'));
	const selectedGsPapers = $derived(page.url.searchParams.getAll('gs').map(Number));
	const selectedEntityTypes = $derived(page.url.searchParams.getAll('entityType'));
	const selectedEntity = $derived(page.url.searchParams.get('entity'));
	const status = $derived(page.url.searchParams.get('status') || 'all');
	const includeNews = $derived(page.url.searchParams.get('news') === 'true');

	// Local search state for input
	let searchInput = $state('');

	$effect(() => {
		searchInput = search;
	});

	const subjectsQuery = useQuery(api.subjects.list, {});
	const entityTypesQuery = useQuery(api.content.listEntityTypes, {});

	const allSubjects = $derived(subjectsQuery.data || []);
	const allEntityTypes = $derived(entityTypesQuery.data || []);

	// Dynamic sidebar content for [id] route
	const contentId = $derived(page.params.id as any);
	const contentQuery = useQuery((api as any).content.getById, () =>
		contentId ? { id: contentId } : 'skip'
	);
	const contentItem = $derived(contentQuery.data);

	const entitiesWithArticles = $derived(
		contentItem?.entities
			?.filter((e: any) => e.article)
			.sort((a: any, b: any) => b.segmentCount - a.segmentCount) ?? []
	);

	const subjects = $derived(
		selectedGsPapers.length > 0
			? allSubjects.filter((s: any) => selectedGsPapers.includes(s.gsPaper))
			: allSubjects
	);

	function getEntityIcon(type: string) {
		const t = type.toLowerCase();
		if (t === 'location' || t.includes('place')) return MapPin;
		if (t === 'person') return Users;
		if (t.includes('organization') || t.includes('office')) return Building2;
		if (t.includes('legislation') || t.includes('act') || t.includes('law')) return Briefcase;
		return Tag;
	}

	function updateParams(
		newParams: Record<string, string | string[] | number | number[] | boolean | null | undefined>
	) {
		const params = new URLSearchParams(page.url.searchParams);

		Object.entries(newParams).forEach(([key, value]) => {
			if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
				params.delete(key);
			} else if (Array.isArray(value)) {
				params.delete(key);
				value.forEach((v) => params.append(key, String(v)));
			} else {
				params.set(key, String(value));
			}
		});

		// Reset pagination on filter change
		params.delete('cursor');
		params.delete('index');

		// Always navigate to main /content when changing filters
		goto(`/content?${params.toString()}`, {
			keepFocus: true,
			noScroll: true
		});

		if (isMobile) {
			isSidebarOpen = false;
			isRightSidebarOpen = false;
		}
	}

	function handleSearch() {
		updateParams({ q: searchInput || null });
	}

	function toggleNews(checked: boolean) {
		updateParams({ news: checked || null });
	}

	function toggleSubject(id: string) {
		const current = new Set(selectedSubjectIds);
		if (current.has(id)) current.delete(id);
		else current.add(id);
		updateParams({ subject: Array.from(current) });
	}

	function toggleGsPaper(paper: number) {
		const current = new Set(selectedGsPapers);
		if (current.has(paper)) current.delete(paper);
		else current.add(paper);
		updateParams({ gs: Array.from(current) });
	}

	function selectEntityType(type: string) {
		// Single select for entity type - clears entity selection
		if (selectedEntityTypes.includes(type) && selectedEntityTypes.length === 1) {
			updateParams({ entityType: null, entity: null });
		} else {
			updateParams({ entityType: [type], entity: null });
		}
	}

	function setStatus(newStatus: string) {
		updateParams({ status: newStatus === 'all' ? null : newStatus });
	}

	function clearFilters() {
		searchInput = '';
		goto('/content');
	}

	const hasFilters = $derived(
		search ||
			selectedSubjectIds.length > 0 ||
			selectedGsPapers.length > 0 ||
			selectedEntityTypes.length > 0 ||
			selectedEntity ||
			status !== 'all' ||
			includeNews
	);
</script>

<svelte:head>
	<title>Intelligence Center - Cognirivus</title>
</svelte:head>

<div class="flex h-[calc(100vh-40px)] w-full max-w-full overflow-hidden bg-background">
	<!-- Mobile Overlay -->
	{#if (isSidebarOpen || isRightSidebarOpen) && isMobile}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			onclick={() => {
				isSidebarOpen = false;
				isRightSidebarOpen = false;
			}}
			class="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm transition-opacity duration-300 lg:hidden"
		></div>
	{/if}

	<!-- Left Sidebar Filters -->
	<aside
		class="fixed inset-y-0 left-0 z-50 flex h-full flex-col border-r bg-sidebar transition-[transform,opacity,width] duration-300 ease-in-out lg:relative
        {isSidebarOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0'}
        {isSidebarOpen ? 'w-72' : 'lg:w-0 lg:overflow-hidden lg:border-transparent'}"
	>
		<div class="flex h-10 items-center justify-between gap-2 border-b px-4">
			<div class="flex items-center gap-2">
				{#if includeNews}
					<Zap class="h-3.5 w-3.5 fill-orange-500/20 text-orange-500" />
				{:else}
					<Library class="h-3.5 w-3.5 text-primary" />
				{/if}
				<h2 class="text-[11px] font-bold tracking-tight text-foreground/80 uppercase">
					{includeNews ? 'Current Affairs Filters' : 'Knowledge Filters'}
				</h2>
			</div>
			<button
				class="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				onclick={() => (isSidebarOpen = false)}
			>
				<PanelLeft class="h-4 w-4" />
			</button>
		</div>

		<div class="flex-1 space-y-6 overflow-y-auto p-6">
			<!-- GS Papers Section -->
			<div class="space-y-3">
				<h3 class="text-[10px] font-black tracking-widest text-muted-foreground uppercase">
					GS Papers
				</h3>
				<div class="grid grid-cols-2 gap-2">
					{#each [1, 2, 3, 4] as paper}
						<button
							onclick={() => toggleGsPaper(paper)}
							class="flex items-center justify-between rounded-lg border px-3 py-2 text-xs font-bold transition-all hover:bg-accent
                            {selectedGsPapers.includes(paper)
								? 'border-primary bg-primary/5 text-primary'
								: 'bg-background text-muted-foreground'}"
						>
							GS {paper}
							{#if selectedGsPapers.includes(paper)}
								<Check class="h-3 w-3" />
							{/if}
						</button>
					{/each}
				</div>
			</div>

			<Separator class="opacity-50" />

			<!-- Status Section -->
			<div class="space-y-3">
				<h3 class="text-[10px] font-black tracking-widest text-muted-foreground uppercase">
					Read Status
				</h3>
				<div class="space-y-1">
					{#each ['all', 'completed', 'incomplete'] as s}
						<button
							onclick={() => setStatus(s)}
							class="flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-bold transition-colors hover:bg-accent
                            {status === s
								? 'bg-accent text-foreground'
								: 'text-muted-foreground hover:text-foreground'}"
						>
							<span class="capitalize">{s}</span>
							{#if status === s}
								<div class="h-1.5 w-1.5 rounded-full bg-primary"></div>
							{/if}
						</button>
					{/each}
				</div>
			</div>

			<Separator class="opacity-50" />

			<!-- Subjects Section -->
			<div class="space-y-3">
				<div class="flex items-center justify-between">
					<h3 class="text-[10px] font-black tracking-widest text-muted-foreground uppercase">
						Subjects
					</h3>
					{#if selectedSubjectIds.length > 0}
						<button
							onclick={() => updateParams({ subject: null })}
							class="text-[10px] font-bold text-primary uppercase hover:underline"
						>
							Clear
						</button>
					{/if}
				</div>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button
								variant="outline"
								size="sm"
								class="w-full justify-between px-3 text-xs font-bold ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
								{...props}
							>
								<div class="flex items-center gap-2 truncate">
									<BookOpen class="h-3.5 w-3.5 text-muted-foreground" />
									<span class="truncate">
										{selectedSubjectIds.length > 0
											? `${selectedSubjectIds.length} Selected`
											: 'Select Subjects'}
									</span>
								</div>
								<ChevronDown class="h-3.5 w-3.5 opacity-50" />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content class="max-h-[300px] w-60 overflow-y-auto">
						{#each subjects as subject}
							<DropdownMenu.CheckboxItem
								checked={selectedSubjectIds.includes(subject._id)}
								onCheckedChange={() => toggleSubject(subject._id)}
							>
								{subject.name}
							</DropdownMenu.CheckboxItem>
						{/each}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>

			<Separator class="opacity-50" />

			<!-- Entity Types Section -->
			<div class="space-y-3">
				<div class="flex items-center justify-between">
					<h3 class="text-[10px] font-black tracking-widest text-muted-foreground uppercase">
						Entity Type
					</h3>
					{#if selectedEntityTypes.length > 0}
						<button
							onclick={() => updateParams({ entityType: null, entity: null })}
							class="text-[10px] font-bold text-primary uppercase hover:underline"
						>
							Clear
						</button>
					{/if}
				</div>
				<div class="space-y-1">
					{#each allEntityTypes as { type, count }}
						{@const Icon = getEntityIcon(type)}
						{@const isSelected = selectedEntityTypes.includes(type)}
						<button
							onclick={() => selectEntityType(type)}
							class="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-xs font-bold transition-all hover:bg-accent
							{isSelected ? 'bg-accent text-primary' : 'text-muted-foreground hover:text-foreground'}"
						>
							<Icon class="h-3.5 w-3.5" />
							<span class="capitalize">{type}</span>
							<span class="ml-auto text-[10px] opacity-50">{count}</span>
						</button>
					{/each}
				</div>
			</div>
		</div>

		{#if hasFilters}
			<div class="border-t bg-muted/20 p-4">
				<Button
					variant="outline"
					class="w-full gap-2 text-xs font-bold tracking-tighter uppercase"
					onclick={clearFilters}
				>
					<RotateCcw class="h-3.5 w-3.5" />
					Reset Filters
				</Button>
			</div>
		{/if}
	</aside>

	<!-- Main Content Area -->
	<main class="relative flex flex-1 flex-col overflow-hidden">
		{#if !isSidebarOpen}
			<button
				onclick={toggleSidebar}
				class="absolute top-0 left-0 z-50 flex h-10 w-10 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				title="Open Filters"
			>
				<PanelLeft class="h-4 w-4" />
			</button>
		{/if}

		{#if !isRightSidebarOpen && isMobile}
			<button
				onclick={toggleRightSidebar}
				class="absolute top-0 right-0 z-50 flex h-10 w-10 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				title="Open Analysis"
			>
				<PanelRight class="h-4 w-4" />
			</button>
		{/if}

		<!-- Main Header / Search -->
		<header
			class="flex h-12 shrink-0 items-center justify-center gap-4 bg-background px-4 lg:h-10 {isSidebarOpen
				? ''
				: 'pl-12'} {isRightSidebarOpen || !isMobile ? '' : 'pr-12'}"
		>
			<div class="flex min-w-0 items-center gap-4 sm:gap-8">
				<div class="flex min-w-0 items-center gap-2 sm:max-w-xl sm:gap-4">
					<div class="relative min-w-0 flex-1">
						<Search
							class="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
						/>
						<Input
							type="text"
							placeholder={isMobile ? 'Search...' : 'Search knowledge center...'}
							bind:value={searchInput}
							onkeydown={(e) => e.key === 'Enter' && handleSearch()}
							class="h-8 w-full border-none bg-muted/30 pr-10 pl-9 text-xs ring-offset-background transition-all focus-visible:ring-primary/20"
						/>
						{#if searchInput}
							<button
								onclick={() => {
									searchInput = '';
									handleSearch();
								}}
								class="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
							>
								<X class="h-3 w-3" />
							</button>
						{/if}
					</div>
					<Button
						onclick={handleSearch}
						size="sm"
						class="h-8 px-2 text-xs font-bold tracking-tight uppercase sm:px-4"
					>
						<Search class="h-3.5 w-3.5 sm:mr-2" />
						<span class="hidden sm:inline">Search</span>
					</Button>
				</div>

				<div class="flex shrink-0 items-center space-x-1.5 border-l pl-4 sm:space-x-2 sm:pl-8">
					<Label
						for="news-toggle"
						class="flex cursor-pointer items-center gap-1.5 text-[10px] font-bold tracking-tight text-muted-foreground uppercase"
					>
						<Zap class="h-3.5 w-3.5 {includeNews ? 'fill-orange-500/20 text-orange-500' : ''}" />
						<span class="hidden sm:inline {includeNews ? 'text-orange-500' : ''}">
							Current Affairs
						</span>
					</Label>
					<Switch id="news-toggle" checked={includeNews} onCheckedChange={toggleNews} />
				</div>
			</div>
		</header>

		<!-- Sub-content area (where children go) -->
		<div class="relative flex-1 overflow-hidden">
			{@render children()}
		</div>

		<!-- Right Sidebar FAB for Mobile -->
		{#if isMobile}
			<button
				onclick={() => (isRightSidebarOpen = true)}
				class="fixed right-6 bottom-12 z-40 flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all hover:scale-105 active:scale-95 lg:hidden {isRightSidebarOpen
					? 'pointer-events-none scale-0 opacity-0'
					: 'scale-100 opacity-100'}"
				aria-label="View Details"
			>
				<Info class="size-4" />
			</button>
		{/if}
	</main>

	<!-- Right Sidebar -->
	<aside
		class="fixed inset-y-0 right-0 z-50 flex h-full flex-col border-l bg-sidebar transition-[transform,opacity,width] duration-300 ease-in-out lg:relative
        {isRightSidebarOpen || !isMobile
			? 'translate-x-0 opacity-100'
			: 'translate-x-full opacity-0'}
        {isRightSidebarOpen || !isMobile
			? 'w-72'
			: 'lg:w-0 lg:overflow-hidden lg:border-transparent'}"
	>
		<div class="flex h-10 items-center justify-between gap-2 border-b px-4">
			{#if isMobile}
				<button
					class="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					onclick={() => (isRightSidebarOpen = false)}
				>
					<PanelRight class="h-4 w-4" />
				</button>
			{/if}
			<div class="flex flex-1 items-center justify-end gap-2">
				<h2 class="text-[11px] font-bold tracking-tight text-foreground/80 uppercase">
					Analysis & Details
				</h2>
				<Info class="h-3.5 w-3.5 text-primary" />
			</div>
		</div>

		<div class="flex-1 space-y-6 overflow-y-auto p-6">
			{#if contentItem}
				<!-- Related Articles -->
				{#if entitiesWithArticles.length > 0}
					<div class="space-y-4">
						<h3
							class="flex items-center gap-2 text-[10px] font-black tracking-widest text-muted-foreground uppercase"
						>
							<FileText class="h-3 w-3" />
							Knowledge Articles
						</h3>
						<div class="space-y-3">
							{#each entitiesWithArticles as ent}
								<div
									class="group space-y-3 rounded-xl border bg-card p-4 transition-all hover:border-primary/30 hover:shadow-md"
								>
									<div class="flex items-center justify-between">
										<Badge variant="outline" class="h-4 px-1.5 text-[8px] font-bold uppercase">
											{ent.type}
										</Badge>
										<Sparkles class="h-3 w-3 text-primary opacity-50" />
									</div>
									<h4 class="text-xs font-bold tracking-tight">{ent.name} Article</h4>
									<p class="line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
										UPSC analysis incorporating this segment and {ent.segmentCount - 1} others.
									</p>
									<div class="pt-1">
										<Button
											href="/content/article?view=entity&type={encodeURIComponent(
												ent.type
											)}&slug={ent.slug}"
											variant="secondary"
											size="sm"
											class="h-7 w-full gap-2 text-[10px] font-bold uppercase transition-all group-hover:bg-primary group-hover:text-primary-foreground"
										>
											<FileText class="h-3 w-3" />
											Read Article
										</Button>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{:else}
					<div class="flex h-full flex-col items-center justify-center py-20 text-center">
						<div class="rounded-full bg-muted p-5">
							<Info class="size-10 text-muted-foreground" />
						</div>
						<h3 class="mt-5 text-base font-medium text-foreground">Analysis & Details</h3>
						<p class="mt-1 text-sm text-muted-foreground">
							Select a news segment or entity to see detailed analysis.
						</p>
					</div>
				{/if}
			{:else}
				<div class="flex h-full flex-col items-center justify-center py-20 text-center">
					<div class="rounded-full bg-muted p-5">
						<Info class="size-10 text-muted-foreground" />
					</div>
					<h3 class="mt-5 text-base font-medium text-foreground">Analysis & Details</h3>
					<p class="mt-1 text-sm text-muted-foreground">
						Select a news segment or entity to see detailed analysis.
					</p>
				</div>
			{/if}
		</div>
	</aside>
</div>

<style>
	:global(main) {
		scrollbar-gutter: stable;
	}
</style>
