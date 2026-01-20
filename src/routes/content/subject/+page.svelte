<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { LayoutGrid, Search, ArrowLeft, BookOpen, ChevronRight, X } from '@lucide/svelte';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';

	let searchInput = $state('');
	let searchQuery = $state('');

	const subjectsQuery = useQuery((api as any).subjects.list, {});
	const subjects = $derived(subjectsQuery.data || []);

	const filteredSubjects = $derived(
		subjects.filter((s: any) => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
	);

	const subjectsByGS = $derived.by(() => {
		const groups: Record<number, any[]> = {};
		filteredSubjects.forEach((s: any) => {
			if (!groups[s.gsPaper]) groups[s.gsPaper] = [];
			groups[s.gsPaper].push(s);
		});
		return groups;
	});

	function handleSearch() {
		searchQuery = searchInput;
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			handleSearch();
		}
	}

	function clearSearch() {
		searchInput = '';
		searchQuery = '';
	}
</script>

<svelte:head>
	<title>Browse Subjects - UPSC Knowledge Base</title>
</svelte:head>

<div class="container mx-auto max-w-6xl px-4 py-8">
	<div class="mb-8">
		<Button variant="ghost" size="sm" href="/content" class="gap-2 text-muted-foreground">
			<ArrowLeft class="h-4 w-4" />
			Back to Knowledge Base
		</Button>
	</div>

	<div class="mb-12 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
		<div class="space-y-1">
			<div class="flex items-center gap-2 text-orange-500">
				<LayoutGrid class="h-6 w-6" />
				<span class="text-sm font-bold tracking-widest uppercase">Syllabus</span>
			</div>
			<h1 class="text-4xl font-extrabold tracking-tight">Subject Index</h1>
			<p class="text-lg text-muted-foreground">
				Browse extracted intelligence categorized by UPSC subjects and GS papers.
			</p>
		</div>

		<div class="flex w-full max-w-md flex-col gap-2 sm:flex-row sm:items-center">
			<div class="relative flex-1">
				<Search class="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
				<Input
					type="search"
					placeholder="Search subjects..."
					bind:value={searchInput}
					onkeydown={handleKeyDown}
					class="h-11 w-full pl-9"
				/>
			</div>
			<Button onclick={handleSearch} size="lg" class="w-full sm:w-auto">Filter</Button>
		</div>
	</div>

	{#if searchQuery}
		<div class="mb-8 flex">
			<Badge variant="secondary" class="flex items-center gap-2 px-3 py-1.5 text-sm">
				<span>Filter: <span class="font-bold text-primary">{searchQuery}</span></span>
				<button
					onclick={clearSearch}
					class="rounded-full p-0.5 transition-colors hover:bg-muted"
					aria-label="Clear filter"
				>
					<X class="h-3.5 w-3.5" />
				</button>
			</Badge>
		</div>
	{/if}

	{#if subjectsQuery.isLoading}
		<div class="flex h-[40vh] items-center justify-center">
			<Loader variant="circular" size="lg" />
		</div>
	{:else}
		<div class="space-y-12">
			{#each [1, 2, 3, 4, 0] as gs}
				{#if subjectsByGS[gs]}
					<section>
						<div class="mb-6 flex items-center gap-4">
							<div class="h-px flex-1 bg-muted"></div>
							<Badge
								variant="secondary"
								class="h-8 bg-muted/50 px-4 text-xs font-bold tracking-widest uppercase"
							>
								{gs === 0 ? 'General / Other' : `General Studies Paper ${gs}`}
							</Badge>
							<div class="h-px flex-1 bg-muted"></div>
						</div>

						<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
							{#each subjectsByGS[gs] as sub}
								<a
									href="/content/subject/{sub.slug}"
									class="group flex items-center justify-between rounded-xl border bg-card p-5 transition-all hover:border-orange-500/50 hover:bg-orange-500/5 hover:shadow-md"
								>
									<div class="flex items-center gap-3">
										<div
											class="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500/10 text-orange-500 transition-colors group-hover:bg-orange-500 group-hover:text-white"
										>
											<BookOpen class="h-5 w-5" />
										</div>
										<span
											class="font-bold tracking-tight text-foreground transition-colors group-hover:text-orange-600"
										>
											{sub.name}
										</span>
									</div>
									<ChevronRight
										class="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1"
									/>
								</a>
							{/each}
						</div>
					</section>
				{/if}
			{/each}
		</div>
	{/if}
</div>
