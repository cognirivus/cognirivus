<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { page } from '$app/state';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import {
		Calendar,
		ArrowLeft,
		ExternalLink,
		MapPin,
		BookOpen,
		Users,
		Building2,
		Briefcase,
		Tag,
		Check
	} from '@lucide/svelte';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';
	import MarkCompleteToggle from '$lib/components/MarkCompleteToggle.svelte';

	const slug = $derived((page.params as any).slug);
	const type = $derived((page.params as any).type);
	const entitySlug = $derived((page.params as any).entitySlug);

	const subjectQuery = useQuery((api as any).subjects.getBySlug, () => ({ slug }));
	const subject = $derived(subjectQuery.data);

	const entityQuery = useQuery((api as any).content.getEntityBySlug, () => ({
		slug: entitySlug,
		type
	}));
	const entity = $derived(entityQuery.data);

	const typeMeta = $derived.by(() => {
		const t = type.toLowerCase();
		if (t === 'location') return { label: 'Geography', icon: MapPin };
		if (t === 'person') return { label: 'People', icon: Users };
		if (t === 'organization') return { label: 'Organization', icon: Building2 };
		if (t === 'legislation') return { label: 'Legislation', icon: Briefcase };
		return { label: type.charAt(0).toUpperCase() + type.slice(1), icon: Tag };
	});

	const contentQuery = useQuery((api as any).content.listByEntity, () =>
		subject && entity ? { subjectId: subject._id, entityId: entity._id } : 'skip'
	);
	const items = $derived(contentQuery.data || []);
	const progressQuery = useQuery(api.content.getUserProgress, {});
</script>

<svelte:head>
	<title>{entity?.name || 'Location'} in {subject?.name || 'Subject'}- Knowledge Base</title>
</svelte:head>

<div class="container mx-auto max-w-7xl px-4 py-8">
	<div class="mb-8">
		<Button
			variant="ghost"
			size="sm"
			href="/content/subject/{slug}"
			class="gap-2 text-muted-foreground"
		>
			<ArrowLeft class="h-4 w-4" />
			Back to {subject?.name || 'Subject'}
		</Button>
	</div>

	{#if subjectQuery.isLoading || entityQuery.isLoading}
		<div class="flex h-[50vh] items-center justify-center">
			<Loader variant="circular" size="lg" />
		</div>
	{:else if !subject || !entity}
		<div class="flex flex-col items-center justify-center py-20 text-center">
			<h2 class="text-2xl font-bold">Data not found</h2>
			<p class="text-muted-foreground">We couldn't find the requested analysis.</p>
			<Button href="/content/subject" class="mt-4">Return to Subject Index</Button>
		</div>
	{:else}
		<header class="mb-12 space-y-4">
			<div class="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
				<div class="flex items-center gap-4">
					<div class="rounded-2xl bg-orange-500/10 p-4 text-orange-500">
						<BookOpen class="h-8 w-8" />
					</div>
					<div>
						<div class="mb-1 flex items-center gap-2">
							<Badge
								variant="outline"
								class="border-orange-200 text-[10px] font-bold tracking-widest text-orange-600 uppercase"
							>
								General Studies Paper {subject.gsPaper}
							</Badge>
						</div>
						<h1 class="text-4xl font-extrabold tracking-tight">
							<a
								href="/content/entity/{type}/{entitySlug}"
								class="transition-colors hover:text-primary"
							>
								{entity.name}
							</a>
							<span class="font-normal text-muted-foreground">in</span>
							<a href="/content/subject/{slug}" class="transition-colors hover:text-primary">
								{subject.name}
							</a>
						</h1>
					</div>
				</div>
			</div>
		</header>

		{#if contentQuery.isLoading}
			<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
				{#each Array(3) as _}
					<Card.Root class="h-48 animate-pulse bg-muted/20" />
				{/each}
			</div>
		{:else if items.length === 0}
			<div class="rounded-2xl border border-dashed p-12 text-center">
				<p class="text-muted-foreground italic">No specific analysis found for this combination.</p>
			</div>
		{:else}
			<div class="mx-auto max-w-4xl space-y-12">
				{#each items as item}
					<article class="group relative space-y-4">
						<header class="flex flex-wrap items-center justify-between gap-3">
							<div class="flex flex-wrap items-center gap-3">
								<Badge
									variant="outline"
									class="bg-primary/5 text-[10px] font-bold tracking-tight text-primary uppercase"
								>
									<Calendar class="mr-1.5 h-3 w-3" />
									{item.newsDate || 'General Fact'}
								</Badge>
								<Badge variant="secondary" class="text-[10px] tracking-wider uppercase"
									>{item.topic}</Badge
								>
								{#if progressQuery.data?.[item._id]}
									<span
										class="flex items-center gap-1 text-[10px] font-bold text-green-600 dark:text-green-400"
									>
										<Check class="h-3 w-3" />
										Done
									</span>
								{/if}
							</div>
							<MarkCompleteToggle contentId={item._id} variant="icon" />
						</header>

						<div class="prose prose-zinc dark:prose-invert max-w-none">
							<div
								class="font-serif text-lg leading-relaxed whitespace-pre-wrap text-foreground/90"
							>
								{item.text}
							</div>
						</div>

						<footer class="flex items-center justify-between pt-2">
							<div class="h-px flex-1 bg-border/40"></div>
							<Button
								variant="ghost"
								size="sm"
								href="/content/{item._id}"
								class="ml-4 h-6 gap-2 px-2 text-[10px] font-bold text-muted-foreground hover:text-primary"
							>
								Detailed Metadata
								<ArrowLeft class="h-2 w-2 rotate-180" />
							</Button>
						</footer>
					</article>
				{/each}
			</div>
		{/if}
	{/if}
</div>
