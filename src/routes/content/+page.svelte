<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import {
		Book,
		Tag,
		Calendar,
		Search,
		Filter,
		MapPin,
		ChevronRight,
		LayoutGrid,
		Fingerprint,
		Check,
		X
	} from '@lucide/svelte';
	import MarkCompleteToggle from '$lib/components/MarkCompleteToggle.svelte';

	let searchInput = $state('');
	let searchQuery = $state('');
	let selectedSubject = $state('All');

	const subjectsQuery = useQuery((api as any).subjects.list, {});
	const contentQuery = useQuery((api as any).content.list, () => ({
		excludeTopic: 'Current Affairs',
		subjectId:
			selectedSubject === 'All'
				? undefined
				: subjectsQuery.data?.find((s: any) => s.name === selectedSubject)?._id
	}));
	const progressQuery = useQuery(api.content.getUserProgress, {});

	const filteredContent = $derived(
		((contentQuery.data as any[]) || [])?.filter(
			(item: any) =>
				item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
				item.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
				item.topic.toLowerCase().includes(searchQuery.toLowerCase())
		)
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
</script>

<svelte:head>
	<title>Knowledge Base - Cognirivus</title>
</svelte:head>

<div class="container mx-auto max-w-6xl px-4 py-8">
	<div class="mb-12 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
		<div class="space-y-1">
			<h1 class="text-4xl font-extrabold tracking-tight text-foreground">Knowledge Base</h1>
			<p class="text-lg text-muted-foreground">
				Browse intelligence, facts, and AI-extracted insights for UPSC.
			</p>
		</div>

		<div class="flex w-full max-w-md flex-col gap-2 sm:flex-row sm:items-center">
			<div class="relative flex-1">
				<Search class="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
				<Input
					type="search"
					placeholder="Search intelligence..."
					bind:value={searchInput}
					onkeydown={handleKeyDown}
					class="h-11 w-full pl-9"
				/>
			</div>
			<Button onclick={handleSearch} size="lg" class="w-full sm:w-auto">Search</Button>
		</div>
	</div>

	{#if searchQuery}
		<div class="mb-8 flex">
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

	<!-- Browsing Entry Points -->
	<div class="mb-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
		<a
			href="/content/entity"
			class="group flex items-center justify-between rounded-2xl border bg-primary/5 p-6 transition-all hover:border-primary/50 hover:bg-primary/10 hover:shadow-md"
		>
			<div class="flex items-center gap-4">
				<div
					class="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"
				>
					<Fingerprint class="h-6 w-6" />
				</div>
				<div>
					<h3 class="font-bold text-foreground">Entity Explorer</h3>
					<p class="text-xs text-muted-foreground">Browse by people, locations, and more</p>
				</div>
			</div>
			<ChevronRight
				class="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary"
			/>
		</a>

		<a
			href="/content/subject"
			class="group flex items-center justify-between rounded-2xl border bg-orange-500/5 p-6 transition-all hover:border-orange-500/50 hover:bg-orange-500/10 hover:shadow-md"
		>
			<div class="flex items-center gap-4">
				<div
					class="flex h-12 w-12 items-center justify-center rounded-full bg-orange-500/10 text-orange-500 transition-colors group-hover:bg-orange-500 group-hover:text-white"
				>
					<LayoutGrid class="h-6 w-6" />
				</div>
				<div>
					<h3 class="font-bold text-foreground">Subject Index</h3>
					<p class="text-xs text-muted-foreground">Browse by UPSC subjects</p>
				</div>
			</div>
			<ChevronRight
				class="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-orange-500"
			/>
		</a>

		<div class="flex items-center gap-4 rounded-2xl border bg-muted/30 p-6 opacity-60 grayscale">
			<div
				class="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
			>
				<Tag class="h-6 w-6" />
			</div>
			<div>
				<h3 class="font-bold text-foreground">GS Paper View</h3>
				<p class="text-xs">Coming soon</p>
			</div>
		</div>
	</div>

	<!-- Subject Quick Filters -->
	<div class="mb-8 flex items-center gap-2 border-b pb-6">
		<span class="mr-2 hidden text-xs font-bold text-muted-foreground uppercase sm:block"
			>Quick Filter:</span
		>
		<div class="scrollbar-hide flex flex-1 items-center gap-2 overflow-x-auto pb-1">
			<Button
				variant={selectedSubject === 'All' ? 'default' : 'outline'}
				size="sm"
				class="h-8 shrink-0 rounded-full px-4"
				onclick={() => (selectedSubject = 'All')}
			>
				All
			</Button>
			{#if subjectsQuery.data}
				{#each (subjectsQuery.data as any[]).slice(0, 12) as subject}
					<Button
						variant={selectedSubject === subject.name ? 'default' : 'outline'}
						size="sm"
						class="h-8 shrink-0 rounded-full px-4"
						onclick={() => (selectedSubject = subject.name)}
					>
						{subject.name}
					</Button>
				{/each}
				{#if (subjectsQuery.data as any[]).length > 12}
					<Button
						variant="ghost"
						size="sm"
						href="/content/subject"
						class="h-8 shrink-0 rounded-full px-4 text-primary"
					>
						More...
					</Button>
				{/if}
			{/if}
		</div>
	</div>

	{#if contentQuery.isLoading}
		<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
			{#each Array(6) as _}
				<Card.Root class="animate-pulse">
					<Card.Header class="px-5 pb-3">
						<div class="h-6 w-3/4 rounded bg-muted"></div>
						<div class="flex gap-2">
							<div class="h-4 w-16 rounded bg-muted"></div>
						</div>
					</Card.Header>
					<Card.Content class="px-5">
						<div class="space-y-2">
							<div class="h-4 w-full rounded bg-muted"></div>
							<div class="h-4 w-2/3 rounded bg-muted"></div>
						</div>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{:else if filteredContent.length === 0}
		<div class="flex flex-col items-center justify-center py-20 text-center">
			<div class="mb-4 rounded-full bg-muted p-4">
				<Filter class="h-8 w-8 text-muted-foreground" />
			</div>
			<p class="text-lg font-medium text-foreground">No insights found</p>
			<p class="text-muted-foreground">Try adjusting your filters or search query.</p>
		</div>
	{:else}
		<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
			{#each filteredContent as item}
				<a href="/content/{item._id}" class="group block">
					<Card.Root
						class="flex h-full flex-col overflow-hidden transition-all group-hover:border-primary/50 group-hover:shadow-md"
					>
						<Card.Header class="px-5 pb-3">
							<div class="mb-2 flex flex-wrap items-center gap-2">
								{#if item.subject}
									<Badge
										variant="outline"
										class="border-primary/20 bg-primary/5 text-[10px] font-bold tracking-wider text-primary uppercase"
									>
										GS-{item.subject.gsPaper} | {item.subject.name}
									</Badge>
								{/if}
								<Badge variant="secondary" class="flex items-center gap-1 text-[10px]">
									<Tag class="h-2 w-2" />
									{item.topic}
								</Badge>
							</div>
							<Card.Title
								class="line-clamp-2 text-lg leading-tight font-bold transition-colors group-hover:text-primary"
							>
								{item.title}
							</Card.Title>
						</Card.Header>
						<Card.Content class="flex-1 px-5">
							<p
								class="line-clamp-4 text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground"
							>
								{item.text}
							</p>
						</Card.Content>
						<Card.Footer class="flex items-center justify-between border-t bg-muted/20 px-5 py-3">
							<div class="flex items-center gap-3">
								{#if item.newsDate}
									<div class="flex items-center gap-2 text-xs font-bold text-primary uppercase">
										<Calendar class="h-3 w-3" />
										{item.newsDate}
									</div>
								{/if}
								{#if progressQuery.data?.[item._id]}
									<div
										class="flex items-center gap-1 text-[10px] font-bold text-green-600 dark:text-green-400"
									>
										<Check class="h-3 w-3" />
										Done
									</div>
								{/if}
							</div>
							{#if item.source}
								<div
									class="flex items-center gap-1 text-[10px] font-medium tracking-tight text-muted-foreground uppercase"
								>
									<Book class="h-2.5 w-2.5" />
									{item.source}
								</div>
							{/if}
						</Card.Footer>
					</Card.Root>
				</a>
			{/each}
		</div>
	{/if}
</div>
