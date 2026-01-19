<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { Calendar, Search } from '@lucide/svelte';

	let searchInput = $state('');
	let searchQuery = $state('');

	const newsQuery = useQuery(api.news.list, { limit: 100 });

	const filteredNews = $derived(
		newsQuery.data?.filter(
			(item) =>
				item.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
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

<div class="container mx-auto max-w-7xl px-4 py-8">
	<div class="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Daily News</h1>
			<p class="text-muted-foreground">Stay updated with the latest newspaper analysis and news.</p>
		</div>
		<div class="flex w-full max-w-sm flex-col gap-2 sm:flex-row sm:items-center">
			<div class="relative flex-1">
				<Search class="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
				<Input
					type="search"
					placeholder="Search news..."
					bind:value={searchInput}
					onkeydown={handleKeyDown}
					class="h-11 w-full pl-9"
				/>
			</div>
			<Button onclick={handleSearch} size="lg" class="w-full sm:w-auto">Search</Button>
		</div>
	</div>

	{#if newsQuery.isLoading}
		<div class="grid gap-6">
			{#each Array(3) as _}
				<Card.Root class="animate-pulse">
					<Card.Header>
						<div class="h-6 w-1/4 rounded bg-muted"></div>
						<div class="h-4 w-1/3 rounded bg-muted"></div>
					</Card.Header>
					<Card.Content>
						<div class="space-y-2">
							<div class="h-4 w-full rounded bg-muted"></div>
							<div class="h-4 w-full rounded bg-muted"></div>
							<div class="h-4 w-2/3 rounded bg-muted"></div>
						</div>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{:else if filteredNews.length === 0}
		<div class="flex flex-col items-center justify-center py-12 text-center">
			<p class="text-lg font-medium">No news found</p>
			<p class="text-muted-foreground">Try adjusting your search or check back later.</p>
		</div>
	{:else}
		<div class="grid gap-6">
			{#each filteredNews as item}
				<Card.Root class="overflow-hidden transition-all hover:shadow-md">
					<Card.Header class="pb-3">
						<div class="flex items-center justify-between gap-2">
							<Badge variant="secondary" class="flex items-center gap-1">
								<Calendar class="h-3 w-3" />
								{item.date}
							</Badge>
						</div>
						<Card.Title class="mt-2 text-xl leading-tight font-semibold">
							{formatDate(item.date)}
						</Card.Title>
					</Card.Header>
					<Card.Content>
						<p class="line-clamp-4 whitespace-pre-wrap text-muted-foreground">
							{item.content}
						</p>
					</Card.Content>
					<Card.Footer>
						<span class="text-xs font-medium text-muted-foreground italic">
							Full content processed into Knowledge Base
						</span>
					</Card.Footer>
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>
