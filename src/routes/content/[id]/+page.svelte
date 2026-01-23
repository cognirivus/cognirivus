<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { page } from '$app/state';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import {
		Calendar,
		Tag,
		Book,
		MapPin,
		Brain,
		Users,
		Building2,
		Briefcase,
		Check,
		ChevronRight,
		FileText
	} from '@lucide/svelte';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';
	import { Markdown } from '$lib/components/prompt-kit/markdown/index.js';
	import MarkCompleteToggle from '$lib/components/MarkCompleteToggle.svelte';
	import { goto } from '$app/navigation';

	const contentId = $derived(page.params.id as any);
	const contentQuery = useQuery((api as any).content.getById, () =>
		contentId ? { id: contentId } : 'skip'
	);
	const item = $derived(contentQuery.data);

	const flashcardsQuery = useQuery((api as any).flashcards.listByContent, () =>
		contentId ? { contentId } : 'skip'
	);

	const progressQuery = useQuery(api.content.getUserProgress, {});

	function getEntityIcon(type: string) {
		const t = type.toLowerCase();
		if (t === 'location' || t.includes('place')) return MapPin;
		if (t === 'person') return Users;
		if (t.includes('organization') || t.includes('office')) return Building2;
		if (t.includes('legislation') || t.includes('act') || t.includes('law')) return Briefcase;
		return Tag;
	}
</script>

<svelte:head>
	<title>{item?.title || 'Content'} - Knowledge Base</title>
</svelte:head>

<div class="flex h-full w-full overflow-hidden">
	<div class="flex-1 overflow-y-auto">
		<div class="mx-auto max-w-4xl px-4 py-8 sm:px-6">
			{#if contentQuery.isLoading}
				<div class="flex h-[50vh] items-center justify-center">
					<Loader variant="circular" size="lg" />
				</div>
			{:else if !item}
				<div class="flex flex-col items-center justify-center py-20 text-center">
					<div class="mb-4 rounded-full bg-muted p-4">
						<FileText class="h-8 w-8 text-muted-foreground" />
					</div>
					<h2 class="text-xl font-bold">Content not found</h2>
					<p class="text-sm text-muted-foreground">
						The content you're looking for doesn't exist or has been removed.
					</p>
					<Button href="/content" variant="outline" class="mt-4">Back to Knowledge Base</Button>
				</div>
			{:else}
				<!-- Breadcrumb Context -->
				<div class="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
					<a
						href={item.topic === 'Current Affairs' ? '/content?news=true' : '/content'}
						class="hover:text-foreground hover:underline"
					>
						{item.topic === 'Current Affairs' ? 'Current Affairs' : 'Knowledge Base'}
					</a>
					{#if item.subject}
						<ChevronRight class="h-3.5 w-3.5" />
						<a
							href="/content?subject={item.subject._id}"
							class="hover:text-foreground hover:underline"
						>
							{item.subject.name}
						</a>
					{/if}
					<ChevronRight class="h-3.5 w-3.5" />
					<span class="line-clamp-1 max-w-[200px] text-foreground">{item.title}</span>
				</div>

				<article class="space-y-6">
					<!-- Header -->
					<header class="space-y-4">
						<!-- Tags Row -->
						<div class="flex flex-wrap items-center gap-2">
							{#if item.subject}
								<Badge
									variant="outline"
									class="border-primary/20 bg-primary/5 text-[10px] font-bold text-primary uppercase"
								>
									GS-{item.subject.gsPaper} | {item.subject.name}
								</Badge>
							{/if}
							<Badge variant="secondary" class="flex items-center gap-1 text-[10px] uppercase">
								<Tag class="h-3 w-3" />
								{item.topic}
							</Badge>
							{#if progressQuery.data?.[item._id]}
								<Badge
									variant="outline"
									class="border-green-500/20 bg-green-500/5 text-[10px] font-bold text-green-600 uppercase"
								>
									<Check class="mr-1 h-3 w-3" />
									Completed
								</Badge>
							{/if}
						</div>

						<!-- Title -->
						<h1 class="text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-4xl">
							{item.title}
						</h1>

						<!-- Meta Row -->
						<div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
							{#if item.newsDate}
								<div class="flex items-center gap-1.5">
									<Calendar class="h-4 w-4 text-primary" />
									<span class="font-medium">{item.newsDate}</span>
								</div>
							{/if}

							{#if item.source}
								<div class="flex items-center gap-1.5">
									<Book class="h-4 w-4" />
									<span>{item.source}</span>
								</div>
							{/if}

							{#if page.data.currentUser}
								<div class="ml-auto">
									<MarkCompleteToggle contentId={item._id} />
								</div>
							{/if}
						</div>

						<!-- Entities -->
						{#if item.entities && item.entities.length > 0}
							<div class="flex flex-wrap items-center gap-2 border-t pt-4">
								<span class="text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
									>Related:</span
								>
								{#each item.entities as ent}
									{@const Icon = getEntityIcon(ent.type)}
									<a
										href="/content/report?view=entity&type={encodeURIComponent(
											ent.type
										)}&slug={ent.slug}"
										class="group flex items-center gap-1.5 rounded-full border bg-muted/30 px-2.5 py-1 text-xs font-medium transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
									>
										<Icon class="h-3.5 w-3.5" />
										{ent.name}
										<ChevronRight
											class="h-3 w-3 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
										/>
									</a>
								{/each}
							</div>
						{/if}
					</header>

					<!-- Flashcards CTA -->
					{#if page.data.currentUser && flashcardsQuery.data && flashcardsQuery.data.length > 0}
						<div
							class="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 p-4"
						>
							<div class="flex items-center gap-3">
								<div class="rounded-full bg-primary/10 p-2 text-primary">
									<Brain class="h-5 w-5" />
								</div>
								<div>
									<p class="text-sm font-semibold">{flashcardsQuery.data.length} Flashcards</p>
									<p class="text-xs text-muted-foreground">Test your knowledge</p>
								</div>
							</div>
							<Button href="/flashcards/study?contentId={item._id}" size="sm" class="gap-2">
								Study Now
								<ChevronRight class="h-4 w-4" />
							</Button>
						</div>
					{/if}

					<!-- Content Body -->
					<div class="rounded-lg border bg-card p-6 shadow-sm">
						<div class="prose prose-zinc dark:prose-invert max-w-none">
							<Markdown content={item.body} />
						</div>
					</div>

					<!-- Footer -->
					{#if item.subject}
						<footer
							class="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3"
						>
							<p class="text-xs text-muted-foreground">
								Part of <span class="font-semibold text-foreground">{item.subject.name}</span>
							</p>
							<Button
								variant="ghost"
								size="sm"
								href="/content?subject={item.subject._id}"
								class="h-8 gap-1 text-xs"
							>
								View all {item.subject.name}
								<ChevronRight class="h-3.5 w-3.5" />
							</Button>
						</footer>
					{/if}
				</article>
			{/if}
		</div>
	</div>
</div>
