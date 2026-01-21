<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import {
		Calendar,
		Clock,
		Newspaper,
		Search,
		ChevronRight,
		ChevronLeft,
		Check,
		X
	} from '@lucide/svelte';
	import { page } from '$app/state';
	import MarkCompleteToggle from '$lib/components/MarkCompleteToggle.svelte';

	const currentUser = $derived(page.data.currentUser);
	const isAuthenticated = $derived(!!currentUser);

	let searchInput = $state('');
	let searchQuery = $state('');
	let numItems = 10;

	// Manage pagination state
	let cursorStack = $state<(string | null)[]>([null]);
	let currentCursorIndex = $state(0);

	const currentAffairsQuery = useQuery((api as any).content.listPaginated, () => ({
		topic: 'Current Affairs',
		search: searchQuery || undefined,
		paginationOpts: { numItems, cursor: cursorStack[currentCursorIndex] }
	}));

	const currentData = $derived(currentAffairsQuery.data);
	const stories = $derived(currentData?.page || []);
	const hasNextPage = $derived(currentData?.isDone === false);
	const hasPrevPage = $derived(currentCursorIndex > 0);
	const progressQuery = useQuery(api.content.getUserProgress, {});

	function nextPage() {
		if (hasNextPage && currentData?.continueCursor) {
			const nextCursor = currentData.continueCursor;
			if (currentCursorIndex === cursorStack.length - 1) {
				cursorStack.push(nextCursor);
			}
			currentCursorIndex++;
			window.scrollTo({ top: 0, behavior: 'smooth' });
		}
	}

	function prevPage() {
		if (hasPrevPage) {
			currentCursorIndex--;
			window.scrollTo({ top: 0, behavior: 'smooth' });
		}
	}

	function handleSearch() {
		searchQuery = searchInput;
		// Reset pagination on new search
		cursorStack = [null];
		currentCursorIndex = 0;
	}

	function clearSearch() {
		searchInput = '';
		searchQuery = '';
		// Reset pagination on clear
		cursorStack = [null];
		currentCursorIndex = 0;
	}
</script>

<svelte:head>
	<title>Current Affairs - Cognirivus</title>
</svelte:head>

<div class="min-h-screen bg-background">
	<!-- Hero Section -->
	<div class="border-b bg-muted/30">
		<div class="container mx-auto max-w-5xl px-4 py-16 text-center">
			<Badge variant="outline" class="mb-4 border-primary/30 px-3 py-1 text-primary">
				<Newspaper class="mr-2 h-3.5 w-3.5" />
				Daily Intelligence
			</Badge>
			<h1 class="mb-4 text-5xl font-black tracking-tight text-foreground md:text-6xl">
				Current Affairs
			</h1>
			<p class="mx-auto max-w-2xl text-lg text-muted-foreground">
				Atomic news summaries and deep-dive insights curated specifically for UPSC aspirants. Stay
				ahead with factual, non-partisan intelligence.
			</p>

			<div class="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
				<div class="relative w-full max-w-md">
					<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						type="text"
						placeholder="Search news, policies, events..."
						bind:value={searchInput}
						onkeydown={(e) => e.key === 'Enter' && handleSearch()}
						class="h-12 pl-10 ring-offset-background transition-all focus-visible:ring-primary/20"
					/>
				</div>
				<Button onclick={handleSearch} size="lg" class="h-12 px-8">Search Feed</Button>
			</div>

			{#if searchQuery}
				<div class="mt-4 flex justify-center">
					<Badge variant="secondary" class="flex items-center gap-2 px-3 py-1.5 text-sm">
						<span>Search: <span class="font-bold text-primary">{searchQuery}</span></span>
						<button
							onclick={clearSearch}
							class="rounded-full p-0.5 transition-colors hover:bg-muted"
							aria-label="Clear search"
						>
							<X class="h-3.5 w-3.5" />
						</button>
					</Badge>
				</div>
			{/if}
		</div>
	</div>

	<div class="container mx-auto max-w-5xl px-4 py-12">
		{#if currentAffairsQuery.isLoading}
			<div class="space-y-12">
				{#each Array(3) as _}
					<div class="space-y-4">
						<div class="h-48 animate-pulse rounded-xl bg-muted/50"></div>
					</div>
				{/each}
			</div>
		{:else if stories.length === 0}
			<div class="flex flex-col items-center justify-center py-20 text-center">
				<div class="mb-6 rounded-full bg-muted p-6">
					<Search class="h-12 w-12 text-muted-foreground" />
				</div>
				<h3 class="text-2xl font-bold">No stories found</h3>
				<p class="text-muted-foreground">Try a different search term or check back later.</p>
			</div>
		{:else}
			<div class="space-y-8">
				{#each stories as story}
					<article
						class="group relative flex flex-col gap-6 rounded-2xl border border-border/40 p-6 transition-all hover:border-primary/20 hover:bg-muted/30"
					>
						<div class="flex flex-1 flex-col">
							<div class="mb-4 flex flex-wrap items-center gap-2">
								{#if story.newsDate}
									<Badge
										variant="outline"
										class="flex items-center gap-1.5 border-primary/20 bg-primary/5 text-[10px] font-bold tracking-wider text-primary uppercase"
									>
										<Calendar class="h-3 w-3" />
										{story.newsDate}
									</Badge>
								{/if}
								{#if story.subject}
									<Badge variant="secondary" class="text-[10px] font-bold tracking-wider uppercase">
										{story.subject.name}
									</Badge>
								{/if}
								<div
									class="flex items-center gap-1 text-[10px] font-medium tracking-tight text-muted-foreground uppercase"
								>
									<Clock class="h-3 w-3" />
									<span>Atomic Summary</span>
								</div>
							</div>

							<h3
								class="mb-4 text-xl leading-tight font-bold tracking-tight transition-colors group-hover:text-primary md:text-2xl"
							>
								{story.title}
							</h3>

							<div class="prose prose-sm prose-neutral dark:prose-invert max-w-none">
								<p
									class="line-clamp-3 text-base leading-relaxed whitespace-pre-wrap text-muted-foreground md:text-lg"
								>
									{story.body}
								</p>
							</div>

							<div class="mt-8 flex items-center justify-between border-t pt-4">
								<div class="flex items-center gap-2 md:gap-4">
									{#if isAuthenticated}
										<MarkCompleteToggle contentId={story._id} variant="icon" />
									{/if}
									{#if isAuthenticated && progressQuery.data?.[story._id]}
										<span
											class="flex items-center gap-1 text-[10px] font-bold text-green-600 dark:text-green-400"
										>
											<Check class="h-3 w-3" />
											<span class="hidden sm:inline">Completed</span>
										</span>
									{/if}
								</div>

								<div class="flex items-center gap-2">
									<Button
										variant="outline"
										size="sm"
										href="/content/{story._id}"
										class="h-8 gap-1 px-3 text-[10px] font-bold tracking-tight text-primary uppercase md:text-xs"
									>
										Read More
										<ChevronRight class="h-3 w-3" />
									</Button>
								</div>
							</div>
						</div>
					</article>
				{/each}

				<!-- Pagination Controls -->
				<div class="flex items-center justify-between border-t border-b py-8">
					<div class="text-sm text-muted-foreground">
						Page <span class="font-bold text-foreground">{currentCursorIndex + 1}</span>
					</div>
					<div class="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							onclick={prevPage}
							disabled={!hasPrevPage}
							class="gap-2"
						>
							<ChevronLeft class="h-4 w-4" />
							Previous
						</Button>
						<Button
							variant="outline"
							size="sm"
							onclick={nextPage}
							disabled={!hasNextPage}
							class="gap-2"
						>
							Next
							<ChevronRight class="h-4 w-4" />
						</Button>
					</div>
				</div>
			</div>
		{/if}
	</div>

	<!-- Newsletter / CTAs -->
	<div class="border-t bg-muted/20 py-20">
		<div class="container mx-auto max-w-4xl px-4 text-center">
			<h2 class="mb-4 text-3xl font-bold">Never miss an update</h2>
			<p class="mb-8 text-muted-foreground">
				Our AI processes hundreds of news sources daily to bring you only what matters for UPSC.
			</p>
			<div class="flex flex-wrap justify-center gap-4">
				<Button size="lg" variant="default" class="px-8">Get Daily Digest</Button>
				<Button size="lg" variant="outline" class="px-8">Browse Archives</Button>
			</div>
		</div>
	</div>
</div>

<style>
	:global(.prose p) {
		margin-top: 0;
		margin-bottom: 0;
	}
</style>
