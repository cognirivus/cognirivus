<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { page } from '$app/state';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import {
		Calendar,
		ArrowLeft,
		MapPin,
		ExternalLink,
		BookOpen,
		Sparkles,
		FileText,
		List,
		Users,
		Building2,
		Briefcase,
		Tag,
		Check
	} from '@lucide/svelte';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';
	import { Separator } from '$lib/components/ui/separator';
	import { Markdown } from '$lib/components/prompt-kit/markdown/index.js';
	import { useConvexClient } from 'convex-svelte';
	import { toast } from 'svelte-sonner';
	import MarkCompleteToggle from '$lib/components/MarkCompleteToggle.svelte';

	const type = $derived((page.params as any).type);
	const slug = $derived((page.params as any).slug);
	const entityQuery = useQuery((api as any).content.getEntityBySlug, () => ({
		slug,
		type
	}));
	const entity = $derived(entityQuery.data);

	const typeMeta = $derived.by(() => {
		const t = type.toLowerCase();
		if (t.includes('location') || t.includes('place'))
			return {
				label: 'Geography',
				plural: 'Locations',
				icon: MapPin,
				desc: 'physical location'
			};
		if (t === 'person')
			return {
				label: 'People',
				plural: 'People',
				icon: Users,
				desc: 'key personality'
			};
		if (t.includes('organization') || t.includes('office'))
			return {
				label: 'Organization',
				plural: 'Organizations',
				icon: Building2,
				desc: 'national/international body'
			};
		if (t.includes('statute') || t.includes('judgment') || t.includes('act') || t.includes('law'))
			return {
				label: 'Legislation',
				plural: 'Legislations',
				icon: Briefcase,
				desc: 'legal/constitutional act'
			};
		return {
			label: type.replace(/-/g, ' '),
			plural: type.replace(/-/g, ' ') + 's',
			icon: Tag,
			desc: `${type.replace(/-/g, ' ')} entity`
		};
	});

	const currentUserQuery = useQuery(api.auth.getCurrentUser, {});
	const user = $derived(currentUserQuery.data);
	const isAdmin = $derived(
		user?.role && (Array.isArray(user.role) ? user.role.includes('admin') : user.role === 'admin')
	);

	const timelineQuery = useQuery((api as any).content.listByEntity, () =>
		entity ? { entityId: entity._id } : 'skip'
	);
	const items = $derived(timelineQuery.data || []);
	const progressQuery = useQuery(api.content.getUserProgress, {});

	const sources = $derived.by(() => {
		const s: Record<string, any> = {};
		items.forEach((item: any, index: number) => {
			s[`Ref${index + 1}`] = {
				title: item.title,
				url: `/content/${item._id}`,
				content: item.body
			};
		});
		return s;
	});

	let viewMode = $state<'segments' | 'report'>('segments');
	let isGenerating = $state(false);
	const client = useConvexClient();

	// Group items by GS Paper then Subject
	const groupedItems = $derived.by(() => {
		const groups: Record<number, Record<string, any[]>> = {};
		items.forEach((item: any) => {
			const gs = item.subject?.gsPaper ?? 0;
			const subjectName = item.subject?.name ?? 'Other';

			if (!groups[gs]) groups[gs] = {};
			if (!groups[gs][subjectName]) groups[gs][subjectName] = [];

			groups[gs][subjectName].push(item);
		});
		return groups;
	});

	const gsPapers = $derived(
		Object.keys(groupedItems)
			.map(Number)
			.sort((a, b) => (a === 0 ? 1 : b === 0 ? -1 : a - b)) // GS 1, 2, 3, 4, then 0
	);

	function getGSLabel(gs: number) {
		if (gs === 0) return 'General / Other';
		return `General Studies Paper ${gs}`;
	}

	async function handleGenerate() {
		if (!entity) return;
		isGenerating = true;
		try {
			await client.action((api as any).synthesizer.generateReport, { entityId: entity._id });
			toast.success('Intelligence report synthesized successfully!');
			viewMode = 'report';
		} catch (err: any) {
			toast.error(err.message || 'Failed to generate report');
		} finally {
			isGenerating = false;
		}
	}
</script>

<svelte:head>
	<title>{entity?.name || typeMeta.label} Analysis - Knowledge Base</title>
</svelte:head>

<div class="container mx-auto max-w-7xl px-4 py-8">
	<div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<Button
			variant="ghost"
			size="sm"
			href="/content/entity/{encodeURIComponent(type)}"
			class="w-fit gap-2 text-muted-foreground"
		>
			<ArrowLeft class="h-4 w-4" />
			<span class="sm:hidden">Back</span>
			<span class="hidden sm:inline">Back to {typeMeta.plural} Index</span>
		</Button>

		{#if entity && !entityQuery.isLoading}
			<div class="flex w-fit items-center gap-1 rounded-lg border bg-muted/50 p-1">
				<Button
					variant={viewMode === 'segments' ? 'default' : 'ghost'}
					size="sm"
					class="h-8 gap-2 rounded-md px-3"
					onclick={() => (viewMode = 'segments')}
				>
					<List class="h-4 w-4" />
					Segments
				</Button>
				<Button
					variant={viewMode === 'report' ? 'default' : 'ghost'}
					size="sm"
					class="h-8 gap-2 rounded-md px-3"
					onclick={() => (viewMode = 'report')}
				>
					<FileText class="h-4 w-4" />
					Article
				</Button>
			</div>
		{/if}
	</div>

	{#if entityQuery.isLoading}
		<div class="flex h-[50vh] items-center justify-center">
			<Loader variant="circular" size="lg" />
		</div>
	{:else if !entity}
		<div class="flex flex-col items-center justify-center py-20 text-center">
			<h2 class="text-2xl font-bold">{typeMeta.label} not found</h2>
			<p class="text-muted-foreground">
				We couldn't find any information for this {typeMeta.desc}.
			</p>
			<Button href="/content/entity/{encodeURIComponent(type)}" class="mt-4"
				>Return to {typeMeta.plural}</Button
			>
		</div>
	{:else}
		<article class="prose prose-zinc dark:prose-invert max-w-none">
			<header
				class="not-prose mb-12 flex flex-col gap-6 border-b pb-8 lg:flex-row lg:items-end lg:justify-between"
			>
				<div class="flex items-start gap-3 md:items-center">
					<div class="shrink-0 rounded-full bg-primary/10 p-3 text-primary">
						<typeMeta.icon class="h-6 w-6 md:h-8 md:w-8" />
					</div>
					<div>
						<h1 class="mb-0 text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl">
							{entity.name}
						</h1>
						<p class="mt-2 text-lg text-muted-foreground md:text-xl">
							{viewMode === 'report'
								? 'Synthesized Intelligence Report'
								: 'Raw Intelligence Segments'}
						</p>
					</div>
				</div>

				{#if isAdmin}
					<Button
						onclick={handleGenerate}
						disabled={isGenerating}
						variant="outline"
						class="w-full gap-2 border-primary/20 text-primary hover:bg-primary/5 lg:w-auto"
					>
						{#if isGenerating}
							<Loader variant="circular" size="sm" class="mr-2" />
							Synthesizing...
						{:else}
							<Sparkles class="h-4 w-4" />
							{entity.report ? 'Update Analysis' : 'Generate Analysis'}
						{/if}
					</Button>
				{/if}
			</header>

			{#if viewMode === 'report'}
				<div class="not-prose min-h-[40vh]">
					{#if entity.report}
						<div class="rounded-2xl border bg-card p-8 shadow-sm">
							<Markdown content={entity.report} {sources} />
						</div>
						<div class="mt-8 text-center text-xs text-muted-foreground italic">
							Last synthesized: {new Date(entity.reportGeneratedAt!).toLocaleString()}
						</div>
					{:else}
						<div class="flex flex-col items-center justify-center py-20 text-center">
							<div class="mb-4 rounded-full bg-primary/5 p-6 text-primary">
								<Sparkles class="h-12 w-12" />
							</div>
							<h3 class="text-xl font-bold">No Synthesized Report Yet</h3>
							<p class="max-w-md text-muted-foreground">
								{isAdmin
									? `Click the button above to generate a comprehensive UPSC-style intelligence report for this ${typeMeta.desc}.`
									: `A comprehensive analysis for this ${typeMeta.desc} is pending synthesis by our faculty.`}
							</p>
						</div>
					{/if}
				</div>
			{:else if timelineQuery.isLoading}
				<div class="flex justify-center py-12">
					<Loader variant="circular" />
				</div>
			{:else if items.length === 0}
				<p class="py-10 text-center text-muted-foreground">
					No analysis found for this {typeMeta.desc}.
				</p>
			{:else}
				<div class="space-y-20">
					{#each gsPapers as gs}
						<section class="space-y-12">
							<div class="not-prose flex items-center gap-4">
								<Badge
									class="h-8 border-none bg-primary px-4 text-xs font-bold tracking-widest text-primary-foreground uppercase"
								>
									{getGSLabel(gs)}
								</Badge>
								<Separator class="flex-1" />
							</div>

							<div class="space-y-16">
								{#each Object.keys(groupedItems[gs]).sort() as subjectName}
									<div class="space-y-8">
										<div
											class="not-prose flex items-center gap-2 text-orange-600 dark:text-orange-400"
										>
											<BookOpen class="h-5 w-5" />
											<h2 class="m-0 text-xl font-bold tracking-tight uppercase">{subjectName}</h2>
										</div>

										<div class="space-y-12 border-l-2 border-muted pl-4 sm:pl-6">
											{#each groupedItems[gs][subjectName] as item}
												<div class="space-y-4">
													<div
														class="not-prose flex flex-wrap items-center justify-between gap-3 py-1"
													>
														<div
															class="flex flex-wrap items-center gap-3 text-xs font-bold tracking-tight text-muted-foreground uppercase"
														>
															{#if item.newsDate}
																<div class="flex items-center gap-1.5 text-primary">
																	<Calendar class="h-3.5 w-3.5" />
																	Date: {item.newsDate}
																</div>
															{/if}
															{#if item.newsId}
																<a
																	href="/content/{item._id}"
																	class="flex items-center gap-1 underline decoration-muted-foreground/30 underline-offset-2 transition-colors hover:text-primary"
																>
																	<ExternalLink class="h-3 w-3" />
																	Source Content
																</a>
															{/if}
															{#if user && progressQuery.data?.[item._id]}
																<div
																	class="flex items-center gap-1 text-green-600 dark:text-green-400"
																>
																	<Check class="h-3 w-3" />
																	Done
																</div>
															{/if}
														</div>
														{#if user}
															<MarkCompleteToggle contentId={item._id} variant="icon" />
														{/if}
													</div>

													<div
														class="font-serif text-lg leading-relaxed whitespace-pre-wrap text-foreground/90"
													>
														{item.body}
													</div>
												</div>
											{/each}
										</div>
									</div>
								{/each}
							</div>
						</section>
					{/each}
				</div>
			{/if}
		</article>
	{/if}
</div>
