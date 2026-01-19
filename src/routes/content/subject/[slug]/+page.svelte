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
		BookOpen,
		ExternalLink,
		MapPin,
		Users,
		Building2,
		Briefcase,
		Tag
	} from '@lucide/svelte';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';

	const slug = $derived((page.params as any).slug);
	const subjectQuery = useQuery((api as any).subjects.getBySlug, () => ({ slug }));
	const subject = $derived(subjectQuery.data);

	function getEntityIcon(type: string) {
		const t = type.toLowerCase();
		if (t === 'location') return MapPin;
		if (t === 'person') return Users;
		if (t === 'organization') return Building2;
		if (t === 'legislation') return Briefcase;
		return Tag;
	}

	const contentQuery = useQuery((api as any).content.list, () =>
		subject ? { subjectId: subject._id } : 'skip'
	);
	const items = $derived(contentQuery.data || []);

	const groupedByEntity = $derived.by(() => {
		const groups: Record<string, { entity: any; items: any[] }> = {};
		const general: any[] = [];

		items.forEach((item: any) => {
			const entities = item.entities || [];
			if (entities.length === 0) {
				general.push(item);
			} else {
				entities.forEach((ent: any) => {
					const key = `${ent.type}:${ent.name}`;
					if (!groups[key]) {
						groups[key] = { entity: ent, items: [] };
					}
					if (!groups[key].items.find((i) => i._id === item._id)) {
						groups[key].items.push(item);
					}
				});
			}
		});

		const sortByDate = (a: any, b: any) => {
			const dateA = a.newsDate || '';
			const dateB = b.newsDate || '';
			return dateB.localeCompare(dateA);
		};

		Object.values(groups).forEach((g) => g.items.sort(sortByDate));
		general.sort(sortByDate);

		return {
			entities: Object.values(groups).sort((a, b) => {
				if (a.entity.type !== b.entity.type) return a.entity.type.localeCompare(b.entity.type);
				return a.entity.name.localeCompare(b.entity.name);
			}),
			general
		};
	});
</script>

<svelte:head>
	<title>{subject?.name || 'Subject'} - UPSC Knowledge Base</title>
</svelte:head>

<div class="container mx-auto max-w-7xl px-4 py-8">
	<div class="mb-8">
		<Button variant="ghost" size="sm" href="/content/subject" class="gap-2 text-muted-foreground">
			<ArrowLeft class="h-4 w-4" />
			Back to Subject Index
		</Button>
	</div>

	{#if subjectQuery.isLoading}
		<div class="flex h-[50vh] items-center justify-center">
			<Loader variant="circular" size="lg" />
		</div>
	{:else if !subject}
		<div class="flex flex-col items-center justify-center py-20 text-center">
			<h2 class="text-2xl font-bold">Subject not found</h2>
			<p class="text-muted-foreground">We couldn't find any information for this subject.</p>
			<Button href="/content/subject" class="mt-4">Return to Subject Index</Button>
		</div>
	{:else}
		<header class="mb-12 space-y-4">
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
					<h1 class="text-4xl font-extrabold tracking-tight">{subject.name}</h1>
				</div>
			</div>
		</header>

		{#if contentQuery.isLoading}
			<div class="space-y-6">
				{#each Array(3) as _}
					<Card.Root class="h-32 animate-pulse bg-muted/20" />
				{/each}
			</div>
		{:else if items.length === 0}
			<div class="rounded-2xl border border-dashed p-12 text-center">
				<p class="text-muted-foreground italic">No analysis found for this subject yet.</p>
			</div>
		{:else}
			<div class="space-y-16">
				{#if groupedByEntity.entities.length > 0}
					<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
						{#each groupedByEntity.entities as group}
							{@const Icon = getEntityIcon(group.entity.type)}
							<a
								href="/content/subject/{slug}/{group.entity.type}/{group.entity.slug}"
								class="group"
							>
								<Card.Root
									class="flex h-full flex-col overflow-hidden transition-all hover:border-primary/50 hover:bg-primary/5 hover:shadow-lg"
								>
									<Card.Header class="pb-3">
										<div class="flex items-center justify-between">
											<div
												class="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"
											>
												<Icon class="h-5 w-5" />
											</div>
											<Badge variant="secondary" class="text-[10px] font-bold">
												{group.items.length} Intelligence Items
											</Badge>
										</div>
										<Card.Title class="mt-4 text-xl font-bold tracking-tight">
											{group.entity.name}
										</Card.Title>
									</Card.Header>
									<Card.Content class="flex-1">
										<p class="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
											Latest: {group.items[0].title}
										</p>
									</Card.Content>
									<Card.Footer class="border-t bg-muted/20 px-6 py-3">
										<div
											class="flex w-full items-center justify-between text-xs font-bold tracking-wider text-primary uppercase"
										>
											<span>Explore Subject Analysis</span>
											<ArrowLeft class="h-3 w-3 rotate-180" />
										</div>
									</Card.Footer>
								</Card.Root>
							</a>
						{/each}
					</div>
				{/if}

				{#if groupedByEntity.general.length > 0}
					<section class="space-y-6">
						<div class="flex items-center gap-4 text-muted-foreground">
							<div
								class="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
							>
								<BookOpen class="h-5 w-5" />
							</div>
							<h2 class="text-2xl font-bold tracking-tight">General Subject Updates</h2>
							<Separator class="flex-1" />
						</div>

						<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
							{#each groupedByEntity.general as item}
								<Card.Root
									class="flex h-full flex-col overflow-hidden transition-all hover:border-orange-500/30 hover:shadow-md"
								>
									<Card.Header class="pb-3">
										<div class="flex items-center justify-between gap-4">
											<Badge variant="outline" class="text-[10px] font-bold text-primary uppercase">
												<Calendar class="mr-1 h-3 w-3" />
												{item.newsDate || 'General Fact'}
											</Badge>
										</div>
										<Card.Title
											class="mt-3 text-lg leading-tight font-bold transition-colors group-hover:text-primary"
										>
											{item.title}
										</Card.Title>
									</Card.Header>
									<Card.Content class="flex-1">
										<p
											class="line-clamp-4 text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground"
										>
											{item.text}
										</p>
									</Card.Content>
									<Card.Footer
										class="flex items-center justify-between border-t bg-muted/30 px-6 py-3"
									>
										<Badge variant="secondary" class="text-[10px]">{item.topic}</Badge>
										<Button
											variant="link"
											size="sm"
											href="/content/{item._id}"
											class="h-auto p-0 text-xs"
										>
											Details
										</Button>
									</Card.Footer>
								</Card.Root>
							{/each}
						</div>
					</section>
				{/if}
			</div>
		{/if}
	{/if}
</div>
