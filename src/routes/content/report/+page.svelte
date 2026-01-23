<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { page } from '$app/state';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import {
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
		Check,
		ChevronRight
	} from '@lucide/svelte';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';
	import { Separator } from '$lib/components/ui/separator';
	import { Markdown } from '$lib/components/prompt-kit/markdown/index.js';
	import { useConvexClient } from 'convex-svelte';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import MarkCompleteToggle from '$lib/components/MarkCompleteToggle.svelte';

	const client = useConvexClient();

	// Read entity params from URL
	const viewParam = $derived(page.url.searchParams.get('view'));
	const entityType = $derived(page.url.searchParams.get('type'));
	const entitySlug = $derived(page.url.searchParams.get('slug'));

	const isEntityView = $derived(viewParam === 'entity' && entityType && entitySlug);

	const entityQuery = useQuery((api as any).content.getEntityBySlug, () =>
		isEntityView ? { slug: entitySlug, type: entityType } : 'skip'
	);
	const entity = $derived(entityQuery.data);

	const timelineQuery = useQuery((api as any).content.listByEntity, () =>
		isEntityView && entity ? { entityId: entity._id } : 'skip'
	);
	const entityItems = $derived(timelineQuery.data || []);

	const progressQuery = useQuery(api.content.getUserProgress, {});

	const currentUserQuery = useQuery(api.auth.getCurrentUser, {});
	const user = $derived(currentUserQuery.data);
	const isAdmin = $derived(
		user?.role && (Array.isArray(user.role) ? user.role.includes('admin') : user.role === 'admin')
	);

	let entityViewMode = $state<'segments' | 'report'>('report');
	let isGenerating = $state(false);

	const typeMeta = $derived.by(() => {
		if (!entityType) return { label: '', plural: '', icon: Tag, desc: '' };
		const t = entityType.toLowerCase();
		if (t.includes('location') || t.includes('place'))
			return { label: 'Geography', plural: 'Locations', icon: MapPin, desc: 'physical location' };
		if (t === 'person')
			return { label: 'People', plural: 'People', icon: Users, desc: 'key personality' };
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
			label: entityType.replace(/-/g, ' '),
			plural: entityType.replace(/-/g, ' ') + 's',
			icon: Tag,
			desc: `${entityType.replace(/-/g, ' ')} entity`
		};
	});

	const groupedItems = $derived.by(() => {
		const groups: Record<number, Record<string, any[]>> = {};
		entityItems.forEach((item: any) => {
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
			.sort((a, b) => (a === 0 ? 1 : b === 0 ? -1 : a - b))
	);

	function getGSLabel(gs: number) {
		if (gs === 0) return 'General / Other';
		return `General Studies Paper ${gs}`;
	}

	const sources = $derived.by(() => {
		const s: Record<string, any> = {};
		entityItems.forEach((item: any, index: number) => {
			s[`Ref${index + 1}`] = {
				title: item.title,
				url: `/content/${item._id}`,
				content: item.body
			};
		});
		return s;
	});

	async function handleGenerate() {
		if (!entity) return;
		isGenerating = true;
		try {
			await client.action((api as any).synthesizer.generateReport, { entityId: entity._id });
			toast.success('Intelligence report synthesized successfully!');
			entityViewMode = 'report';
		} catch (err: any) {
			toast.error(err.message || 'Failed to generate report');
		} finally {
			isGenerating = false;
		}
	}

	function goBack() {
		goto(`/content?entityType=${encodeURIComponent(entityType!)}`);
	}
</script>

<svelte:head>
	<title>{entity?.name || typeMeta.label} Analysis - Knowledge Base</title>
</svelte:head>

<div class="h-full overflow-y-auto">
	<div class="px-4 py-6 sm:px-6">
		{#if !isEntityView}
			<div class="flex flex-col items-center justify-center py-20 text-center">
				<h2 class="text-2xl font-bold">Invalid Report URL</h2>
				<p class="text-muted-foreground">
					Missing entity type or slug parameters. Use the sidebar to select an entity.
				</p>
				<Button href="/content" class="mt-4">Return to Knowledge Base</Button>
			</div>
		{:else if entityQuery.isLoading}
			<div class="flex h-[50vh] items-center justify-center">
				<Loader variant="circular" size="lg" />
			</div>
		{:else if !entity}
			<div class="flex flex-col items-center justify-center py-20 text-center">
				<h2 class="text-2xl font-bold">{typeMeta.label} not found</h2>
				<p class="text-muted-foreground">
					We couldn't find any information for this {typeMeta.desc}.
				</p>
				<Button onclick={goBack} class="mt-4">Return to {typeMeta.plural}</Button>
			</div>
		{:else}
			<!-- Breadcrumb Navigation -->
			<div class="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
				<a href="/content" class="hover:text-foreground hover:underline">Knowledge Base</a>
				<ChevronRight class="h-3.5 w-3.5" />
				<a
					href="/content?entityType={encodeURIComponent(entityType!)}"
					class="capitalize hover:text-foreground hover:underline"
				>
					{typeMeta.plural}
				</a>
				<ChevronRight class="h-3.5 w-3.5" />
				<span class="line-clamp-1 max-w-[200px] text-foreground">{entity.name}</span>
			</div>

			<article class="max-w-4xl space-y-6">
				<!-- Header -->
				<header class="space-y-4">
					<!-- Tags Row -->
					<div class="flex flex-wrap items-center gap-2">
						<Badge
							variant="outline"
							class="border-primary/20 bg-primary/5 text-[10px] font-bold text-primary uppercase"
						>
							<typeMeta.icon class="mr-1 h-3 w-3" />
							{typeMeta.label}
						</Badge>
						<Badge variant="secondary" class="text-[10px] uppercase">
							{entityItems.length} segments
						</Badge>
					</div>

					<!-- Title -->
					<h1 class="text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-4xl">
						{entity.name}
					</h1>

					<!-- View Mode Toggle & Actions -->
					<div class="flex flex-wrap items-center justify-between gap-4 border-t pt-4">
						<div class="flex items-center gap-1 rounded-lg border bg-muted/50 p-1">
							<Button
								variant={entityViewMode === 'segments' ? 'default' : 'ghost'}
								size="sm"
								class="h-8 gap-2 rounded-md px-3"
								onclick={() => (entityViewMode = 'segments')}
							>
								<List class="h-4 w-4" />
								Segments
							</Button>
							<Button
								variant={entityViewMode === 'report' ? 'default' : 'ghost'}
								size="sm"
								class="h-8 gap-2 rounded-md px-3"
								onclick={() => (entityViewMode = 'report')}
							>
								<FileText class="h-4 w-4" />
								Article
							</Button>
						</div>

						{#if isAdmin}
							<Button
								onclick={handleGenerate}
								disabled={isGenerating}
								variant="outline"
								size="sm"
								class="gap-2 border-primary/20 text-primary hover:bg-primary/5"
							>
								{#if isGenerating}
									<Loader variant="circular" size="sm" />
									Synthesizing...
								{:else}
									<Sparkles class="h-4 w-4" />
									{entity.report ? 'Update Analysis' : 'Generate Analysis'}
								{/if}
							</Button>
						{/if}
					</div>
				</header>

				{#if entityViewMode === 'report'}
					<!-- Report View -->
					{#if entity.report}
						<div class="rounded-lg border bg-card p-6 shadow-sm">
							<div class="prose prose-zinc dark:prose-invert max-w-none">
								<Markdown content={entity.report} {sources} />
							</div>
						</div>
						<p class="text-center text-xs text-muted-foreground italic">
							Last synthesized: {new Date(entity.reportGeneratedAt!).toLocaleString()}
						</p>
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
				{:else if timelineQuery.isLoading}
					<div class="flex justify-center py-12">
						<Loader variant="circular" />
					</div>
				{:else if entityItems.length === 0}
					<div class="flex flex-col items-center justify-center py-20 text-center">
						<div class="mb-4 rounded-full bg-muted p-4">
							<FileText class="h-8 w-8 text-muted-foreground" />
						</div>
						<p class="text-lg font-medium">No segments found</p>
						<p class="text-muted-foreground">No content found for this {typeMeta.desc}.</p>
					</div>
				{:else}
					<!-- Segments List -->
					<div class="space-y-6">
						{#each gsPapers as gs}
							<section class="space-y-4">
								<div class="flex items-center gap-3">
									<Badge
										class="h-7 border-none bg-primary px-3 text-[10px] font-bold tracking-widest text-primary-foreground uppercase"
									>
										{getGSLabel(gs)}
									</Badge>
									<Separator class="flex-1" />
								</div>

								{#each Object.keys(groupedItems[gs]).sort() as subjectName}
									<div class="space-y-2">
										<div class="flex items-center gap-2 text-orange-600 dark:text-orange-400">
											<BookOpen class="h-4 w-4" />
											<h3 class="text-xs font-bold tracking-tight uppercase">{subjectName}</h3>
										</div>

										<div class="overflow-x-auto rounded-lg border shadow-sm">
											<table class="w-full min-w-[600px] text-sm lg:min-w-0">
												<thead>
													<tr class="border-b bg-muted/50">
														<th
															class="w-24 px-4 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase"
														>
															Date
														</th>
														<th
															class="px-4 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase"
														>
															Content
														</th>
														<th
															class="w-20 px-4 py-2.5 text-center text-[10px] font-bold text-muted-foreground uppercase"
														>
															Status
														</th>
														<th
															class="w-20 px-4 py-2.5 text-center text-[10px] font-bold text-muted-foreground uppercase"
														>
															Action
														</th>
													</tr>
												</thead>
												<tbody class="divide-y bg-background">
													{#each groupedItems[gs][subjectName] as eItem}
														<tr class="transition-colors hover:bg-muted/30">
															<td class="px-4 py-3 text-xs text-muted-foreground">
																{eItem.newsDate || '—'}
															</td>
															<td class="max-w-md px-4 py-3">
																<p class="line-clamp-2 text-foreground/90">
																	{eItem.body?.slice(0, 150)}{eItem.body?.length > 150 ? '...' : ''}
																</p>
															</td>
															<td class="px-4 py-3 text-center">
																{#if user && progressQuery.data?.[eItem._id]}
																	<Badge
																		variant="outline"
																		class="border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400"
																	>
																		<Check class="mr-1 h-3 w-3" />
																		Done
																	</Badge>
																{:else if user}
																	<MarkCompleteToggle contentId={eItem._id} variant="icon" />
																{:else}
																	<span class="text-xs text-muted-foreground">—</span>
																{/if}
															</td>
															<td class="px-4 py-3 text-center">
																<a
																	href="/content/{eItem._id}"
																	class="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
																>
																	View
																	<ExternalLink class="h-3 w-3" />
																</a>
															</td>
														</tr>
													{/each}
												</tbody>
											</table>
										</div>
									</div>
								{/each}
							</section>
						{/each}
					</div>
				{/if}
			</article>
		{/if}
	</div>
</div>
