<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { Calendar, Search, X, ArrowRight } from '@lucide/svelte';

	let searchInput = $state('');
	let searchQuery = $state('');

	const newsQuery = useQuery(api.news.list, { limit: 100 });

	const filteredNews = $derived(
		newsQuery.data?.filter(
			(item) =>
				item.body.toLowerCase().includes(searchQuery.toLowerCase()) ||
				item.date.includes(searchQuery)
		) ?? []
	);

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

	function formatDate(dateStr: string) {
		try {
			const date = new Date(dateStr);
			return date.toLocaleDateString('en-US', {
				weekday: 'long',
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			});
		} catch (e) {
			return dateStr;
		}
	}
</script>

<svelte:head>
	<title>Daily News - Cognirivus</title>
</svelte:head>

<div class="container mx-auto max-w-7xl px-4 py-10 sm:px-6">
	<!-- Header -->
	<div class="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
		<div class="space-y-2">
			<h1 class="text-3xl font-semibold tracking-tight">Daily News</h1>
			<p class="text-muted-foreground">Stay updated with the latest newspaper analysis and news.</p>
		</div>
		<div class="flex w-full max-w-sm items-center gap-2">
			<div class="relative flex-1">
				<Search class="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
				<Input
					type="search"
					placeholder="Search news..."
					bind:value={searchInput}
					onkeydown={handleKeyDown}
					class="h-9 w-full bg-muted/30 pl-9"
				/>
			</div>
			<Button onclick={handleSearch} size="sm" class="h-9 px-4 font-semibold">Search</Button>
		</div>
	</div>

	{#if searchQuery}
		<div class="mb-8 flex justify-end">
			<Badge variant="secondary" class="gap-1.5 px-3 py-1.5 text-sm">
				<span class="text-muted-foreground">Search:</span>
				<span class="font-semibold text-primary">"{searchQuery}"</span>
				<button
					onclick={clearSearch}
					class="ml-1 rounded-full p-0.5 hover:bg-background/50"
					aria-label="Clear search"
				>
					<X class="h-3.5 w-3.5" />
				</button>
			</Badge>
		</div>
	{/if}

	{#if newsQuery.isLoading}
		<div class="grid gap-6">
			{#each Array(3) as _}
				<div class="rounded-xl border bg-card p-6">
					<div class="mb-4 h-6 w-1/4 animate-pulse rounded bg-muted"></div>
					<div class="space-y-3">
						<div class="h-4 w-full animate-pulse rounded bg-muted"></div>
						<div class="h-4 w-full animate-pulse rounded bg-muted"></div>
						<div class="h-4 w-2/3 animate-pulse rounded bg-muted"></div>
					</div>
				</div>
			{/each}
		</div>
	{:else if filteredNews.length === 0}
		<div class="flex flex-col items-center justify-center py-24 text-center">
			<div class="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
				<Search class="h-7 w-7 text-muted-foreground" />
			</div>
			<h3 class="text-lg font-semibold">No news found</h3>
			<p class="mt-2 text-sm text-muted-foreground">
				Try adjusting your search or check back later.
			</p>
			<Button variant="outline" class="mt-6" onclick={clearSearch}>Clear Search</Button>
		</div>
	{:else}
		<div class="grid gap-6">
			{#each filteredNews as item}
				<div
					class="group relative overflow-hidden rounded-xl border bg-card p-6 transition-all hover:border-primary/20 hover:shadow-sm"
				>
					<div class="mb-4 flex items-center justify-between gap-4">
						<Badge variant="secondary" class="gap-1.5 font-medium">
							<Calendar class="h-3.5 w-3.5 opacity-70" />
							{item.date}
						</Badge>
					</div>

					<h2 class="mb-3 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
						{formatDate(item.date)}
					</h2>

					<p class="mb-6 line-clamp-4 leading-relaxed whitespace-pre-wrap text-muted-foreground">
						{item.body}
					</p>

					<div class="flex items-center justify-between border-t pt-4">
						<span class="text-xs font-medium text-muted-foreground italic">
							Processed into Knowledge Base
						</span>
						<Button variant="ghost" size="sm" class="h-8 gap-1.5 text-xs font-semibold">
							Read Analysis
							<ArrowRight class="h-3.5 w-3.5" />
						</Button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
