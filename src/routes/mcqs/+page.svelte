<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import {
		Search,
		Filter,
		ChevronLeft,
		ChevronRight,
		CheckCircle2,
		XCircle,
		HelpCircle,
		BookOpen,
		Tag,
		RefreshCcw,
		X,
		Trophy,
		Layers,
		Calendar,
		GraduationCap,
		ChevronDown
	} from '@lucide/svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { fade, slide } from 'svelte/transition';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';
	import { onMount } from 'svelte';

	// State from URL
	const searchQuery = $derived(page.url.searchParams.get('q') || undefined);
	const selectedType = $derived(page.url.searchParams.get('type') || undefined);
	const selectedExam = $derived(page.url.searchParams.get('exam') || undefined);
	const selectedYear = $derived(
		page.url.searchParams.get('year') ? Number(page.url.searchParams.get('year')) : undefined
	);
	const currentCursor = $derived(page.url.searchParams.get('cursor') || null);
	const currentIndex = $derived(Number(page.url.searchParams.get('index') || 0));

	// Queries
	const mcqsQuery = useQuery(api.mcqs.list, () => ({
		search: searchQuery,
		exam: selectedExam,
		year: selectedYear,
		mcqType: selectedType,
		paginationOpts: { numItems: 1, cursor: currentCursor }
	}));

	const hierarchyQuery = useQuery(api.mcqs.getFilterHierarchy, () => ({
		type: selectedType,
		exam: selectedExam,
		year: selectedYear
	}));

	const countQuery = useQuery(api.mcqs.count, () => ({
		search: searchQuery,
		exam: selectedExam,
		year: selectedYear,
		mcqType: selectedType
	}));

	const mcq = $derived(mcqsQuery.data?.page?.[0]);
	const totalCount = $derived(countQuery.data ?? 0);
	const hasNextPage = $derived(mcqsQuery.data?.isDone === false);
	const hasPrevPage = $derived(currentIndex > 0);

	// Interaction state
	let selectedOptions = $state<Record<string, string>>({});
	let showExplanations = $state<Record<string, boolean>>({});

	function handleOptionSelect(mcqId: string, option: string) {
		if (selectedOptions[mcqId]) return;
		selectedOptions[mcqId] = option;
	}

	function resetMcq(mcqId: string) {
		const newSelected = { ...selectedOptions };
		delete newSelected[mcqId];
		selectedOptions = newSelected;

		const newShowExplanations = { ...showExplanations };
		delete newShowExplanations[mcqId];
		showExplanations = newShowExplanations;
	}

	// Navigation
	function updateFilters(updates: Record<string, string | number | undefined>) {
		const params = new URLSearchParams(page.url.searchParams);
		Object.entries(updates).forEach(([key, value]) => {
			if (value === undefined || value === 'all' || value === '') params.delete(key);
			else params.set(key, String(value));

			// Reset dependent filters if hierarchy is changed
			if (key === 'type' && value !== selectedType) {
				params.delete('exam');
				params.delete('year');
			}
			if (key === 'exam' && value !== selectedExam) {
				params.delete('year');
			}
		});
		params.delete('cursor');
		params.delete('index');
		goto(`${page.url.pathname}?${params.toString()}`, { noScroll: true });
	}

	function goToPage(next: boolean) {
		const params = new URLSearchParams(page.url.searchParams);
		if (next && mcqsQuery.data?.continueCursor) {
			params.set('cursor', mcqsQuery.data.continueCursor);
			params.set('index', String(currentIndex + 1));
		} else if (!next && currentIndex > 0) {
			history.back();
			return;
		}
		goto(`${page.url.pathname}?${params.toString()}`, { noScroll: true });
	}

	let searchInput = $state('');
	$effect(() => {
		searchInput = searchQuery || '';
	});

	function handleSearch() {
		updateFilters({ q: searchInput || undefined });
	}

	let isMobileFiltersOpen = $state(false);

	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});
</script>

<div class="flex h-full flex-col bg-muted/20 lg:flex-row">
	<!-- Hierarchical Sidebar Filters (Desktop) -->
	<aside class="hidden border-r bg-background lg:block lg:w-80">
		<div class="flex h-full flex-col p-6">
			<h2 class="mb-6 flex shrink-0 items-center gap-2 text-lg font-bold">
				<Filter class="h-5 w-5 text-primary" />
				Filters
			</h2>

			<div class="flex min-h-0 flex-1 flex-col gap-8">
				<div class="shrink-0 space-y-6">
					<!-- 1. Type -->
					<div class="space-y-2">
						<label
							class="flex items-center gap-2 text-xs font-bold tracking-wider text-muted-foreground uppercase"
						>
							<Layers class="h-3 w-3" />
							1. Question Type
						</label>
						<div class="relative">
							<select
								class="flex h-10 w-full appearance-none items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 capitalize"
								value={selectedType || ''}
								onchange={(e) => updateFilters({ type: e.currentTarget.value })}
							>
								<option value="">Select Type</option>
								<option value="all">All Types</option>
								{#if mounted}
									{#each hierarchyQuery.data?.types || [] as type (type)}
										<option value={type}>{type}</option>
									{/each}
								{/if}
							</select>
							<ChevronDown
								class="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 opacity-50"
							/>
						</div>
					</div>

					<!-- 2. Exam -->
					<div class="space-y-2">
						<label
							class="flex items-center gap-2 text-xs font-bold tracking-wider text-muted-foreground uppercase {!selectedType
								? 'opacity-40'
								: ''}"
						>
							<GraduationCap class="h-3 w-3" />
							2. Exam
						</label>
						<div class="relative">
							<select
								class="flex h-10 w-full appearance-none items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 uppercase"
								value={selectedExam || ''}
								onchange={(e) => updateFilters({ exam: e.currentTarget.value })}
								disabled={!selectedType}
							>
								<option value="">Select Exam</option>
								<option value="all">All Exams</option>
								{#if mounted}
									{#each hierarchyQuery.data?.exams || [] as exam (exam)}
										<option value={exam}>{exam}</option>
									{/each}
								{/if}
							</select>
							<ChevronDown
								class="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 opacity-50"
							/>
						</div>
					</div>

					<!-- 3. Year -->
					<div class="space-y-2">
						<label
							class="flex items-center gap-2 text-xs font-bold tracking-wider text-muted-foreground uppercase {!selectedExam
								? 'opacity-40'
								: ''}"
						>
							<Calendar class="h-3 w-3" />
							3. Year
						</label>
						<div class="relative">
							<select
								class="flex h-10 w-full appearance-none items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
								value={selectedYear ? String(selectedYear) : ''}
								onchange={(e) =>
									updateFilters({
										year: e.currentTarget.value ? Number(e.currentTarget.value) : undefined
									})}
								disabled={!selectedExam}
							>
								<option value="">Select Year</option>
								<option value="all">All Years</option>
								{#if mounted}
									{#each hierarchyQuery.data?.years || [] as year (year)}
										<option value={String(year)}>{year}</option>
									{/each}
								{/if}
							</select>
							<ChevronDown
								class="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 opacity-50"
							/>
						</div>
					</div>
				</div>

				<!-- 4. Tags -->
				<div class="flex min-h-0 flex-1 flex-col space-y-3">
					<label
						class="flex shrink-0 items-center gap-2 text-xs font-bold tracking-wider text-muted-foreground uppercase"
					>
						<Tag class="h-3 w-3" />
						Available Tags
					</label>
					<div class="flex-1 overflow-y-auto pr-1 [scrollbar-width:thin]">
						<div class="flex flex-wrap gap-1.5 p-1">
							{#if hierarchyQuery.isLoading || !mounted}
								<Loader size="sm" />
							{:else}
								{#each hierarchyQuery.data?.tags || [] as tag (tag)}
									<Badge
										variant="outline"
										class="cursor-pointer text-[10px] transition-colors hover:bg-primary/10"
										onclick={() => updateFilters({ q: tag })}
									>
										{tag}
									</Badge>
								{:else}
									<p class="text-[10px] text-muted-foreground italic">
										No tags for current selection
									</p>
								{/each}
							{/if}
						</div>
					</div>
				</div>
			</div>

			<div class="shrink-0 border-t pt-6">
				<Button variant="outline" class="w-full gap-2" onclick={() => goto('/mcqs')}>
					<RefreshCcw class="h-4 w-4" />
					Reset All
				</Button>
			</div>
		</div>
	</aside>

	<!-- Mobile Filters Backdrop & Menu -->
	{#if isMobileFiltersOpen}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm lg:hidden"
			onclick={() => (isMobileFiltersOpen = false)}
			transition:fade
		></div>
		<div
			class="fixed inset-y-0 left-0 z-50 w-full max-w-xs border-r bg-background p-6 shadow-xl lg:hidden"
			transition:slide={{ axis: 'x', duration: 300 }}
		>
			<div class="flex h-full flex-col">
				<div class="mb-6 flex shrink-0 items-center justify-between">
					<h2 class="flex items-center gap-2 text-lg font-bold">
						<Filter class="h-5 w-5 text-primary" />
						Filters
					</h2>
					<Button variant="ghost" size="icon" onclick={() => (isMobileFiltersOpen = false)}>
						<X class="h-5 w-5" />
					</Button>
				</div>

				<div class="flex min-h-0 flex-1 flex-col space-y-8">
					<!-- Fixed Filters -->
					<div class="shrink-0 space-y-6">
						<!-- 1. Type -->
						<div class="space-y-2">
							<label class="text-xs font-bold text-muted-foreground uppercase"
								>1. Question Type</label
							>
							<select
								class="w-full rounded-md border p-2 text-sm capitalize"
								value={selectedType || ''}
								onchange={(e) => {
									updateFilters({ type: e.currentTarget.value });
									isMobileFiltersOpen = false;
								}}
							>
								<option value="">Select Type</option>
								<option value="all">All Types</option>
								{#each hierarchyQuery.data?.types || [] as type}
									<option value={type}>{type}</option>
								{/each}
							</select>
						</div>

						<!-- 2. Exam -->
						<div class="space-y-2">
							<label class="text-xs font-bold text-muted-foreground uppercase">2. Exam</label>
							<select
								class="w-full rounded-md border p-2 text-sm uppercase"
								value={selectedExam || ''}
								onchange={(e) => {
									updateFilters({ exam: e.currentTarget.value });
									isMobileFiltersOpen = false;
								}}
								disabled={!selectedType}
							>
								<option value="">Select Exam</option>
								<option value="all">All Exams</option>
								{#each hierarchyQuery.data?.exams || [] as exam}
									<option value={exam}>{exam}</option>
								{/each}
							</select>
						</div>

						<!-- 3. Year -->
						<div class="space-y-2">
							<label class="text-xs font-bold text-muted-foreground uppercase">3. Year</label>
							<select
								class="w-full rounded-md border p-2 text-sm"
								value={selectedYear || ''}
								onchange={(e) => {
									updateFilters({ year: e.currentTarget.value ? Number(e.currentTarget.value) : undefined });
									isMobileFiltersOpen = false;
								}}
								disabled={!selectedExam}
							>
								<option value="">Select Year</option>
								<option value="all">All Years</option>
								{#each hierarchyQuery.data?.years || [] as year}
									<option value={String(year)}>{year}</option>
								{/each}
							</select>
						</div>
					</div>

					<!-- 4. Tags (Expands) -->
					<div class="flex min-h-0 flex-1 flex-col space-y-3">
						<label class="shrink-0 text-xs font-bold text-muted-foreground uppercase">Tags</label>
						<div class="flex-1 overflow-y-auto pr-1 [scrollbar-width:thin]">
							<div class="flex flex-wrap gap-1.5 p-1">
								{#each hierarchyQuery.data?.tags || [] as tag}
									<Badge
										variant="outline"
										class="cursor-pointer text-[10px]"
										onclick={() => {
											updateFilters({ q: tag });
											isMobileFiltersOpen = false;
										}}
									>
										{tag}
									</Badge>
								{/each}
							</div>
						</div>
					</div>
				</div>

				<div class="mt-6 shrink-0 border-t pt-4">
					<Button
						variant="outline"
						class="w-full"
						onclick={() => {
							goto('/mcqs');
							isMobileFiltersOpen = false;
						}}
					>
						Reset All
					</Button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Main Study Area -->
	<main class="flex min-w-0 flex-1 flex-col bg-background lg:bg-muted/10">
		<!-- Search & Progress Bar -->
		<header class="flex items-center gap-3 border-b bg-background px-4 py-2 sm:px-6">
			<Button
				variant="ghost"
				size="icon"
				class="shrink-0 lg:hidden"
				onclick={() => (isMobileFiltersOpen = true)}
			>
				<Filter class="h-5 w-5" />
			</Button>

			<div class="relative flex-1">
				<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					placeholder="Search..."
					class="h-9 w-full pl-10"
					bind:value={searchInput}
					onkeydown={(e) => e.key === 'Enter' && handleSearch()}
				/>
			</div>

			<div class="hidden items-center gap-3 text-xs font-medium sm:flex">
				<div class="flex h-1.5 w-24 overflow-hidden rounded-full bg-muted lg:w-32">
					{#if mounted}
						<div
							class="bg-primary transition-all duration-500"
							style="width: {((currentIndex + 1) / totalCount) * 100}%"
						></div>
					{/if}
				</div>
				<span class="tabular-nums text-muted-foreground whitespace-nowrap">
					{#if mounted}
						{currentIndex + 1} / {totalCount}
					{:else}
						...
					{/if}
				</span>
			</div>
		</header>

		<!-- Question View -->
		<div
			class="flex flex-1 items-start justify-center overflow-y-auto p-4 sm:p-8 lg:p-12 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
		>
			{#if mcqsQuery.isLoading || !mounted}
				<div class="flex flex-col items-center gap-4 py-20">
					<Loader size="lg" />
					<p class="animate-pulse text-sm text-muted-foreground">Loading question...</p>
				</div>
			{:else if !mcq}
				<div class="max-w-sm py-20 text-center">
					<div
						class="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-muted"
					>
						<HelpCircle class="h-10 w-10 text-muted-foreground" />
					</div>
					<h3 class="mb-2 text-xl font-bold">No matching questions</h3>
					<p class="mb-6 text-muted-foreground">
						Try broadening your filters or clearing your search.
					</p>
					<Button onclick={() => goto('/mcqs')}>Clear Filters</Button>
				</div>
			{:else}
				{@const isAnswered = !!selectedOptions[mcq._id]}
				{@const isCorrect = selectedOptions[mcq._id] === mcq.correct_option}
				<div class="w-full max-w-4xl space-y-8">
					<!-- Question Header & Text -->
					<div class="space-y-6">
						<div class="flex items-center justify-between border-b pb-4">
							<div class="flex gap-2">
								<Badge variant="outline" class="bg-background font-bold uppercase">
									{mcq.exam}
									{mcq.year}
								</Badge>
								<Badge variant="secondary" class="font-bold">
									Q. {mcq.question_no}
								</Badge>
								<div class="ml-2 text-xs font-bold tracking-widest text-muted-foreground uppercase">
									{mcq.mcq_type}
								</div>
							</div>
						</div>

						<div class="space-y-4">
							<div class="flex flex-wrap gap-1.5">
								{#each mcq.tags as tag (tag)}
									<Badge
										variant="secondary"
										class="cursor-pointer text-[10px] font-bold transition-colors hover:bg-primary/20"
										onclick={() => updateFilters({ q: tag })}
									>
										#{tag}
									</Badge>
								{/each}
							</div>
							<h2 class="text-lg leading-relaxed font-semibold whitespace-pre-wrap sm:text-xl">
								{mcq.question}
							</h2>
						</div>
					</div>

					<!-- Options Grid -->
					<div class="grid gap-4 sm:grid-cols-2">
						{#each [['A', mcq.option_a], ['B', mcq.option_b], ['C', mcq.option_c], ['D', mcq.option_d]] as [label, text]}
							{@const isSelected = selectedOptions[mcq._id] === label}
							{@const isCorrectOption = label === mcq.correct_option}

							<button
								class="flex w-full items-start gap-4 rounded-xl border-2 p-5 text-left transition-all duration-200
								{isAnswered
									? isCorrectOption
										? 'border-emerald-500 bg-emerald-500/10'
										: isSelected
											? 'border-rose-500 bg-rose-500/10'
											: 'opacity-40 grayscale-[0.3]'
									: 'hover:border-primary hover:bg-primary/5 active:scale-[0.99]'}"
								onclick={() => handleOptionSelect(mcq._id, label)}
								disabled={isAnswered}
							>
								<div
									class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-sm font-black
								{isSelected
										? 'border-primary bg-primary text-primary-foreground'
										: 'border-border bg-background text-muted-foreground'}
								{isAnswered && isCorrectOption ? 'border-emerald-500 bg-emerald-500 text-white' : ''}
								{isAnswered && isSelected && !isCorrectOption ? 'border-rose-500 bg-rose-500 text-white' : ''}"
								>
									{label}
								</div>
								<span class="pt-0.5 text-base font-medium">{text}</span>
								{#if isAnswered && isCorrectOption}
									<CheckCircle2 class="ml-auto h-6 w-6 text-emerald-500" />
								{:else if isAnswered && isSelected && !isCorrectOption}
									<XCircle class="ml-auto h-6 w-6 text-rose-500" />
								{/if}
							</button>
						{/each}
					</div>

					<!-- Explanation / Feedback Area -->
					{#if isAnswered}
						<div class="space-y-6 pt-6">
							<div
								class="flex flex-col items-center justify-between gap-6 rounded-2xl border bg-muted/30 p-6 sm:flex-row"
							>
								<div class="flex items-center gap-4">
									{#if isCorrect}
										<div
											class="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
										>
											<Trophy class="h-7 w-7" />
										</div>
										<div>
											<p class="text-base font-black tracking-wider text-emerald-600 uppercase">
												Spot On!
											</p>
											<p class="text-sm text-muted-foreground">
												Excellent work on this {mcq.year} PYQ.
											</p>
										</div>
									{:else}
										<div
											class="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg shadow-rose-500/20"
										>
											<HelpCircle class="h-7 w-7" />
										</div>
										<div>
											<p class="text-base font-black tracking-wider text-rose-600 uppercase">
												Keep Learning
											</p>
											<p class="text-sm text-muted-foreground">
												The correct answer is <span class="font-bold text-foreground"
													>Option {mcq.correct_option}</span
												>.
											</p>
										</div>
									{/if}
								</div>

								<div class="flex w-full gap-3 sm:w-auto">
									<Button
										variant="outline"
										size="lg"
										class="flex-1 gap-2 sm:flex-initial"
										onclick={() => resetMcq(mcq._id)}
									>
										<RefreshCcw class="h-4 w-4" />
										Retry
									</Button>
									<Button
										size="lg"
										class="flex-1 gap-2 sm:flex-initial"
										onclick={() => goToPage(true)}
										disabled={!hasNextPage}
									>
										Next Question
										<ChevronRight class="h-4 w-4" />
									</Button>
								</div>
							</div>

							<div class="space-y-4 rounded-2xl border bg-background p-8 shadow-sm">
								<div class="flex items-center gap-2 text-primary">
									<BookOpen class="h-6 w-6" />
									<span class="text-xs font-bold tracking-widest uppercase">Analysis & Context</span>
								</div>
								<div class="prose prose-sm max-w-none dark:prose-invert">
									<p class="text-base leading-relaxed whitespace-pre-wrap text-muted-foreground">
										{mcq.search_text
											.split(mcq.question)
											.pop()
											?.split(mcq.option_d)
											.pop()
											?.trim() ||
											'Analyze the question based on Art & Culture and Polity standard references.'}
									</p>
								</div>
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Bottom Navigation Bar -->
		<footer class="border-t bg-background px-6 py-2 lg:px-12">
			<div class="mx-auto flex max-w-3xl items-center justify-between gap-4">
				<Button
					variant="ghost"
					size="sm"
					class="h-8 gap-2 px-3"
					onclick={() => goToPage(false)}
					disabled={!hasPrevPage}
				>
					<ChevronLeft class="h-4 w-4" />
					<span class="hidden sm:inline">Previous</span>
				</Button>

				<div class="flex items-center gap-3">
					<p class="text-xs font-black tabular-nums text-muted-foreground">
						{#if mounted}
							{currentIndex + 1} of {totalCount}
						{:else}
							...
						{/if}
					</p>
				</div>

				<Button
					variant="ghost"
					size="sm"
					class="h-8 gap-2 px-3"
					onclick={() => goToPage(true)}
					disabled={!hasNextPage}
				>
					<span class="hidden sm:inline">Next</span>
					<ChevronRight class="h-4 w-4" />
				</Button>
			</div>
		</footer>
	</main>
</div>

<style>
	:global(body) {
		overflow: hidden;
	}
</style>
