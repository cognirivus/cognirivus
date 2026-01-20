<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { page } from '$app/state';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Calendar, Tag, Book, ArrowLeft, ExternalLink, MapPin, Brain } from '@lucide/svelte';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';
	import MarkCompleteToggle from '$lib/components/MarkCompleteToggle.svelte';
	import { useConvexClient } from 'convex-svelte';

	const client = useConvexClient();
	const contentId = $derived(page.params.id as any);
	const contentQuery = useQuery((api as any).content.getById, () =>
		contentId ? { id: contentId } : 'skip'
	);
	const item = $derived(contentQuery.data);

	const flashcardsQuery = useQuery((api as any).flashcards.listByContent, () =>
		contentId ? { contentId } : 'skip'
	);

	const locations = $derived(item?.entities?.filter((e: any) => e.type === 'location') || []);
</script>

<svelte:head>
	<title>{item?.title || 'Content'} - Knowledge Base</title>
</svelte:head>

<div class="container mx-auto max-w-7xl px-4 py-8">
	<div class="mb-6">
		<Button variant="ghost" size="sm" href="/content" class="gap-2 text-muted-foreground">
			<ArrowLeft class="h-4 w-4" />
			Back to Knowledge Base
		</Button>
	</div>

	{#if contentQuery.isLoading}
		<div class="flex h-[50vh] items-center justify-center">
			<Loader variant="circular" size="lg" />
		</div>
	{:else if !item}
		<div class="flex flex-col items-center justify-center py-20 text-center">
			<h2 class="text-2xl font-bold">Content not found</h2>
			<p class="text-muted-foreground">
				The piece of content you are looking for does not exist or has been removed.
			</p>
			<Button href="/content" class="mt-4">Return to Knowledge Base</Button>
		</div>
	{:else}
		<article class="space-y-8">
			<header class="space-y-4">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<div class="flex flex-wrap items-center gap-2">
						{#if item.subject}
							<a href="/content/subject/{item.subject.slug}">
								<Badge
									variant="outline"
									class="border-orange-200 bg-orange-50 text-xs font-bold tracking-wider text-orange-600 uppercase"
								>
									GS-{item.subject.gsPaper} | {item.subject.name}
								</Badge>
							</a>
						{/if}
						<Badge variant="secondary" class="flex items-center gap-1 text-xs">
							<Tag class="h-3 w-3" />
							{item.topic}
						</Badge>
					</div>
					<MarkCompleteToggle contentId={item._id} />
				</div>

				<h1 class="text-4xl font-extrabold tracking-tight lg:text-5xl">
					{item.title}
				</h1>

				<div class="flex flex-wrap items-center gap-4 border-y py-4 text-sm text-muted-foreground">
					{#if item.newsDate}
						<div class="flex items-center gap-1.5 font-bold text-primary uppercase">
							<Calendar class="h-4 w-4" />
							News Date: {item.newsDate}
						</div>
					{/if}

					{#if item.entities && item.entities.length > 0}
						{#each item.entities as ent}
							<a
								href="/content/entity/{ent.type}/{ent.slug}"
								class="flex items-center gap-1.5 font-semibold text-primary hover:underline"
							>
								<MapPin class="h-4 w-4" />
								{ent.name}
							</a>
						{/each}
					{/if}

					{#if item.source}
						<div class="flex items-center gap-1.5">
							<Book class="h-4 w-4" />
							Source: <span class="font-medium text-foreground">{item.source}</span>
						</div>
					{/if}
				</div>
			</header>

			{#if flashcardsQuery.data && flashcardsQuery.data.length > 0}
				<Card.Root class="border-primary/20 bg-primary/5">
					<Card.Content class="flex items-center justify-between p-4">
						<div class="flex items-center gap-4">
							<div class="rounded-full bg-primary/10 p-2 text-primary">
								<Brain class="h-5 w-5" />
							</div>
							<div>
								<p class="font-semibold">{flashcardsQuery.data.length} Flashcards Available</p>
								<p class="text-sm text-muted-foreground">Test your knowledge on this topic.</p>
							</div>
						</div>
						<Button href="/flashcards/study?contentId={item._id}" size="sm" class="gap-2">
							Study Now
						</Button>
					</Card.Content>
				</Card.Root>
			{:else if flashcardsQuery.data && flashcardsQuery.data.length === 0}
				<div class="rounded-lg border border-dashed p-4 text-center">
					<p class="text-sm text-muted-foreground">No flashcards generated for this content yet.</p>
				</div>
			{/if}

			<Card.Root class="border-none bg-transparent shadow-none">
				<Card.Content class="p-0">
					<div class="prose prose-zinc dark:prose-invert max-w-none">
						<p class="text-lg leading-relaxed whitespace-pre-wrap text-foreground/90">
							{item.text}
						</p>
					</div>
				</Card.Content>
			</Card.Root>

			{#if item.subject}
				<footer class="border-t pt-12">
					<div class="flex items-center justify-between">
						<p class="text-sm text-muted-foreground">
							Part of the {item.subject.name} collection.
						</p>
						<Button variant="outline" size="sm" href="/content/subject/{item.subject.slug}">
							View more {item.subject.name}
						</Button>
					</div>
				</footer>
			{/if}
		</article>
	{/if}
</div>
