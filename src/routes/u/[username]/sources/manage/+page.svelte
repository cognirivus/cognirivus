<script lang="ts">
	import { page } from '$app/state';
	import { useAppAuth } from '$lib/auth.svelte';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import type { Id } from '$convex/_generated/dataModel';
	import { api } from '$convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Switch } from '$lib/components/ui/switch';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';
	import {
		ArrowLeft,
		ChevronDown,
		ChevronRight,
		ExternalLink,
		Globe,
		Loader2,
		Pause,
		Play,
		RefreshCw,
		Trash2
	} from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	const auth = useAppAuth();
	const client = useConvexClient();
	const username = $derived(page.params.username);
	let expandedSourceIds = $state<Set<string>>(new Set());

	const currentUserQuery = useQuery(api.auth.getCurrentUser, {});
	const isAuthorized = $derived(
		auth.isAuthenticated && currentUserQuery.data?.username === username
	);

	const sourcesQuery = useQuery((api as any).sources.listMySources, () =>
		isAuthorized ? { paginationOpts: { numItems: 200, cursor: null } } : 'skip'
	);
	const refreshQuotaQuery = useQuery((api as any).sources.getMyRefreshQuota, () =>
		isAuthorized ? {} : 'skip'
	);
	const similarDomainsQuery = useQuery((api as any).sources.listMySimilarLinkDomains, () =>
		isAuthorized ? {} : 'skip'
	);

	let selectedSourceIds = $state<Array<string>>([]);
	let runningJobId = $state<Id<'source_jobs'> | null>(null);
	let busySourceId = $state<string | null>(null);
	let busyRssFeedId = $state<string | null>(null);
	let busySimilarDomain = $state<string | null>(null);
	let bulkUnsubscribeDialogOpen = $state(false);
	let activeTab = $state('sources');

	const jobQuery = useQuery((api as any).sources.getJobStatus, () =>
		runningJobId ? { jobId: runningJobId } : 'skip'
	);

	$effect(() => {
		if (jobQuery.data && (jobQuery.data.status === 'done' || jobQuery.data.status === 'failed')) {
			if (jobQuery.data.status === 'done') {
				toast.success('Bulk unsubscribe completed');
			} else {
				toast.error(jobQuery.data.error ?? 'Bulk unsubscribe failed');
			}
			runningJobId = null;
			selectedSourceIds = [];
		}
	});

	const allSelected = $derived.by(() => {
		const pageItems = sourcesQuery.data?.page ?? [];
		return (
			pageItems.length > 0 &&
			pageItems.every((row: any) => selectedSourceIds.includes(row.sourceId))
		);
	});

	const isRefreshLimited = $derived.by(() => {
		if (!refreshQuotaQuery.data || refreshQuotaQuery.data.isUnlimited) {
			return false;
		}
		return (refreshQuotaQuery.data.remaining ?? 0) <= 0;
	});

	const sourceCount = $derived(sourcesQuery.data?.page?.length ?? 0);
	const similarDomainCount = $derived(similarDomainsQuery.data?.length ?? 0);
	const hasAnyManageData = $derived(sourceCount > 0 || similarDomainCount > 0);

	function canRefreshSource(type: string, rssFeedUrl?: string) {
		return type === 'rss' || type === 'youtube' || !!rssFeedUrl;
	}

	function getSourceFaviconUrl(url: string) {
		try {
			return new URL('/favicon.ico', url).toString();
		} catch {
			return null;
		}
	}

	function getRssFeedLabel(feed: { feedUrl: string; title?: string | null }, sourceUrl: string) {
		if (feed.title?.trim()) {
			return feed.title.trim();
		}

		try {
			const feedUrl = new URL(feed.feedUrl);
			const canonicalUrl = new URL(sourceUrl);
			const feedPath = `${feedUrl.pathname}${feedUrl.search}` || '/';
			const pathLabel = feedPath
				.replace(/^\/+/, '')
				.replace(/\.(xml|rss|atom)$/i, '')
				.replace(/[-_/]+/g, ' ')
				.trim();

			if (pathLabel) {
				return pathLabel.replace(/\b\w/g, (letter) => letter.toUpperCase());
			}

			if (feedUrl.hostname !== canonicalUrl.hostname) {
				return feedUrl.hostname.replace(/^www\./, '');
			}
		} catch {
			// Fall back below.
		}

		return 'RSS feed';
	}

	const refreshResetsAtUtc = $derived.by(() => {
		const resetsAt = refreshQuotaQuery.data?.resetsAt;
		if (!resetsAt) {
			return null;
		}
		return new Date(resetsAt).toLocaleString('en-US', { timeZone: 'UTC' });
	});

	function toggleSelect(sourceId: string, checked: boolean) {
		if (checked) {
			if (!selectedSourceIds.includes(sourceId)) {
				selectedSourceIds = [...selectedSourceIds, sourceId];
			}
			return;
		}
		selectedSourceIds = selectedSourceIds.filter((id) => id !== sourceId);
	}

	function toggleSelectAll(checked: boolean) {
		if (checked) {
			selectedSourceIds = (sourcesQuery.data?.page ?? []).map((row: any) => row.sourceId);
			return;
		}
		selectedSourceIds = [];
	}

	async function pauseOrResume(sourceId: Id<'sources'>, status: 'active' | 'paused') {
		busySourceId = sourceId;
		try {
			if (status === 'active') {
				await client.mutation((api as any).sources.pauseSource, { sourceId });
				toast.success('Source paused');
			} else {
				await client.mutation((api as any).sources.resumeSource, { sourceId });
				toast.success('Source resumed');
			}
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to update source');
		} finally {
			busySourceId = null;
		}
	}

	async function refreshSource(sourceId: Id<'sources'>) {
		if (isRefreshLimited) {
			toast.error(
				refreshResetsAtUtc
					? `Daily refresh limit reached. Resets at ${refreshResetsAtUtc} UTC.`
					: 'Daily refresh limit reached.'
			);
			return;
		}
		busySourceId = sourceId;
		try {
			await client.action((api as any).sources.refreshSource, { sourceId });
			toast.success('Refresh queued');
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to refresh source');
		} finally {
			busySourceId = null;
		}
	}

	async function unsubscribeOne(sourceId: Id<'sources'>) {
		busySourceId = sourceId;
		try {
			const jobId = await client.action((api as any).sources.unsubscribeSource, { sourceId });
			runningJobId = jobId;
			toast.success('Unsubscribe job queued');
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to unsubscribe');
		} finally {
			busySourceId = null;
		}
	}

	async function updateSimilarLinkDomain(domain: string, included: boolean) {
		busySimilarDomain = domain;
		try {
			await client.mutation((api as any).sources.setSimilarLinkDomainInclusion, {
				domain,
				included
			});
			toast.success(
				included ? 'Domain included in similar links.' : 'Domain excluded from similar links.'
			);
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to update similar-links setting');
		} finally {
			busySimilarDomain = null;
		}
	}

	async function detachRssFeed(feedId: Id<'source_rss_feeds'>) {
		busyRssFeedId = feedId;
		try {
			const result = await client.mutation((api as any).sources.detachRssFeed, { feedId });
			toast.success(
				`RSS feed detached${result.reassignedItemCount > 0 ? `, ${result.reassignedItemCount} items updated` : ''}`
			);
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to detach RSS feed');
		} finally {
			busyRssFeedId = null;
		}
	}

	function requestBulkUnsubscribe() {
		if (selectedSourceIds.length === 0) {
			return;
		}
		bulkUnsubscribeDialogOpen = true;
	}

	async function bulkUnsubscribe() {
		try {
			const jobId = await client.action((api as any).sources.bulkUnsubscribeSources, {
				sourceIds: selectedSourceIds
			});
			runningJobId = jobId;
			toast.success('Bulk unsubscribe job queued');
			bulkUnsubscribeDialogOpen = false;
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to queue bulk unsubscribe');
		}
	}
</script>

<main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
	<div class="mx-auto w-full max-w-6xl">
		<div class="mb-6 flex items-center justify-between">
			<div class="flex items-center gap-4">
				<Button variant="ghost" size="icon" href="/u/{username}">
					<ArrowLeft class="size-5" />
				</Button>
				<div>
					<h1 class="text-2xl font-semibold tracking-tight">Manage Sources</h1>
					<p class="text-sm text-muted-foreground">
						Pause, refresh, and bulk-unsubscribe your sources.
					</p>
					{#if refreshQuotaQuery.data}
						{#if refreshQuotaQuery.data.isUnlimited}
							<p class="mt-1 text-xs text-muted-foreground">Manual refreshes: Unlimited</p>
						{:else}
							<p class="mt-1 text-xs text-muted-foreground">
								Manual refreshes left today: {refreshQuotaQuery.data.remaining ??
									0}/{refreshQuotaQuery.data.dailyLimit ?? 3}
								{#if refreshResetsAtUtc}
									| resets {refreshResetsAtUtc} UTC
								{/if}
							</p>
						{/if}
					{/if}
				</div>
			</div>
			{#if activeTab === 'sources'}
				<Button
					variant="destructive"
					disabled={selectedSourceIds.length === 0 || !!runningJobId}
					onclick={requestBulkUnsubscribe}
					class="gap-2"
				>
					<Trash2 class="size-4" />
					Bulk Unsubscribe ({selectedSourceIds.length})
				</Button>
			{/if}
		</div>

		{#if runningJobId}
			<Card class="mb-4">
				<CardContent class="flex items-center justify-between py-3 text-sm">
					<div class="flex items-center gap-2">
						<Loader2 class="size-4 animate-spin" />
						<span>
							Background job: {jobQuery.data?.status ?? 'queued'} - processed {jobQuery.data
								?.processed ?? 0}
						</span>
					</div>
					{#if jobQuery.data?.error}
						<span class="text-destructive">{jobQuery.data.error}</span>
					{/if}
				</CardContent>
			</Card>
		{/if}

		{#if !auth.isAuthenticated || (currentUserQuery.data && !isAuthorized)}
			<Card class="border-destructive/20 bg-destructive/5 text-destructive">
				<CardContent class="py-10 text-center">
					<p class="font-medium">You are not authorized to manage these sources.</p>
					<Button variant="outline" class="mt-4" href="/u/{username}">Go back to profile</Button>
				</CardContent>
			</Card>
		{:else if sourcesQuery.isLoading || similarDomainsQuery.isLoading}
			<div class="flex h-40 items-center justify-center">
				<p class="text-sm text-muted-foreground italic">Loading source controls...</p>
			</div>
		{:else if !hasAnyManageData}
			<Card class="bg-muted/30">
				<CardContent class="py-20 text-center">
					<p class="text-muted-foreground italic">No sources or similar-search domains yet.</p>
					<Button variant="default" class="mt-4" href="/submit">Add your first source</Button>
				</CardContent>
			</Card>
		{:else}
			<Tabs bind:value={activeTab} class="gap-4">
				<TabsList class="grid w-full grid-cols-2 sm:w-auto">
					<TabsTrigger value="sources">Sources ({sourceCount})</TabsTrigger>
					<TabsTrigger value="domains">Similar Search ({similarDomainCount})</TabsTrigger>
				</TabsList>

				<TabsContent value="sources">
					{#if sourceCount === 0}
						<Card class="bg-muted/30">
							<CardContent class="py-16 text-center">
								<p class="text-sm text-muted-foreground italic">No followed sources yet.</p>
							</CardContent>
						</Card>
					{:else}
						<div class="rounded-lg border border-border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead class="w-12">
											<Checkbox
												checked={allSelected}
												onCheckedChange={(v) => toggleSelectAll(!!v)}
											/>
										</TableHead>
										<TableHead>Source</TableHead>
										<TableHead>Type</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>Last Sync</TableHead>
										<TableHead class="text-right">Items</TableHead>
										<TableHead class="text-right">Shared Posts</TableHead>
										<TableHead class="text-right">Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{#each sourcesQuery.data?.page ?? [] as row (row.subscriptionId)}
										{@const canRefresh = canRefreshSource(row.type, row.rssFeedUrl)}
										{@const refreshTitle = !canRefresh
											? 'This source does not have a sync method yet.'
											: isRefreshLimited
												? refreshResetsAtUtc
													? `Daily limit reached. Resets ${refreshResetsAtUtc} UTC`
													: 'Daily limit reached'
												: 'Refresh now'}
										{@const isExpanded = expandedSourceIds.has(row.sourceId)}
										{@const rssFeedsQuery = useQuery((api as any).sources.getSourceRssFeeds, () =>
											isExpanded ? { sourceId: row.sourceId } : 'skip'
										)}
										<TableRow>
											<TableCell>
												<Checkbox
													checked={selectedSourceIds.includes(row.sourceId)}
													onCheckedChange={(v) => toggleSelect(row.sourceId, !!v)}
												/>
											</TableCell>
											<TableCell>
												<div class="max-w-[360px]">
													<div class="flex flex-wrap items-center gap-2">
														<button
															type="button"
															class="flex items-center gap-1 transition-colors hover:text-primary"
															aria-expanded={isExpanded}
															aria-controls={`rss-feeds-${row.sourceId}`}
															onclick={() => {
																const next = new Set(expandedSourceIds);
																if (next.has(row.sourceId)) {
																	next.delete(row.sourceId);
																} else {
																	next.add(row.sourceId);
																}
																expandedSourceIds = next;
															}}
														>
															{#if isExpanded}
																<ChevronDown class="size-3.5" />
															{:else}
																<ChevronRight class="size-3.5" />
															{/if}
															{#if getSourceFaviconUrl(row.canonicalUrl)}
																<img
																	src={getSourceFaviconUrl(row.canonicalUrl)}
																	alt=""
																	class="size-4 shrink-0 rounded-sm object-contain"
																	onerror={(event) => {
																		(event.currentTarget as HTMLImageElement).style.display =
																			'none';
																		(
																			event.currentTarget as HTMLImageElement
																		).nextElementSibling?.classList.remove('hidden');
																	}}
																/>
																<Globe class="hidden size-4 shrink-0 text-muted-foreground" />
															{:else}
																<Globe class="size-4 shrink-0 text-muted-foreground" />
															{/if}
															<p class="truncate font-medium">{row.title}</p>
														</button>
													</div>
													{#if row.rssFeedUrl}
														<Badge variant="outline">RSS-backed</Badge>
													{/if}
													{#if row.addedVia === 'manual'}
														<Badge variant="outline">Manual</Badge>
													{/if}
													{#if isExpanded}
														<div
															id={`rss-feeds-${row.sourceId}`}
															class="mt-2 space-y-1 border-l-2 border-muted-foreground/20 pl-3"
														>
															{#if rssFeedsQuery.isLoading}
																<p class="text-xs text-muted-foreground italic">
																	Loading RSS feeds...
																</p>
															{:else if rssFeedsQuery.data && rssFeedsQuery.data.length > 0}
																<p class="text-xs font-medium text-muted-foreground">
																	RSS Feeds ({rssFeedsQuery.data.length}):
																</p>
																{#each rssFeedsQuery.data as feed (feed._id)}
																	{@const feedLabel = getRssFeedLabel(feed, row.canonicalUrl)}
																	<div class="space-y-0.5">
																		<div class="flex items-center gap-2">
																			<p
																				class="max-w-[240px] truncate text-sm"
																				title={feed.feedUrl}
																			>
																				{feedLabel}
																			</p>
																			<Button
																				variant="ghost"
																				size="icon-sm"
																				class="size-6"
																				href={feed.feedUrl}
																				target="_blank"
																				rel="noopener noreferrer"
																				title="Open RSS feed"
																			>
																				<ExternalLink class="size-3.5" />
																			</Button>
																			<Badge
																				variant={feed.status === 'active' ? 'outline' : 'secondary'}
																				class="px-1.5 py-0 text-[10px]"
																			>
																				{feed.status}
																			</Badge>
																			<Button
																				variant="ghost"
																				size="sm"
																				class="h-6 px-2 text-[11px]"
																				disabled={busyRssFeedId === feed._id}
																				onclick={() => detachRssFeed(feed._id)}
																			>
																				Detach
																			</Button>
																		</div>
																		{#if feed.lastError}
																			<p
																				class="max-w-[300px] truncate text-[10px] text-destructive"
																			>
																				{feed.lastError}
																			</p>
																		{/if}
																	</div>
																{/each}
															{:else}
																<p class="text-xs text-muted-foreground italic">
																	No RSS feeds configured
																</p>
															{/if}
														</div>
													{/if}
												</div>
											</TableCell>
											<TableCell class="uppercase">{row.type}</TableCell>
											<TableCell>
												<div class="space-y-1">
													<Badge
														variant={row.status === 'active'
															? 'default'
															: row.status === 'paused'
																? 'secondary'
																: 'destructive'}
													>
														{row.status}
													</Badge>
													{#if row.status === 'error' && row.lastError}
														<p class="max-w-[280px] truncate text-[11px] text-destructive">
															{row.lastError}
														</p>
													{/if}
												</div>
											</TableCell>
											<TableCell class="text-xs text-muted-foreground">
												{#if row.lastFetchedAt}
													{new Date(row.lastFetchedAt).toLocaleString()}
												{:else}
													-
												{/if}
											</TableCell>
											<TableCell class="text-right">{row.itemCount}</TableCell>
											<TableCell class="text-right">{row.sharedPostCount}</TableCell>
											<TableCell class="text-right">
												<div class="flex justify-end gap-1.5">
													<Button
														variant="outline"
														size="icon-sm"
														disabled={busySourceId === row.sourceId}
														onclick={() => pauseOrResume(row.sourceId, row.status)}
														title={row.status === 'active' ? 'Pause' : 'Resume'}
													>
														{#if row.status === 'active'}
															<Pause class="size-3.5" />
														{:else}
															<Play class="size-3.5" />
														{/if}
													</Button>
													<Button
														variant="outline"
														size="icon-sm"
														disabled={busySourceId === row.sourceId ||
															isRefreshLimited ||
															!canRefresh}
														onclick={() => refreshSource(row.sourceId)}
														title={refreshTitle}
													>
														<RefreshCw class="size-3.5" />
													</Button>
													<Button
														variant="destructive"
														size="icon-sm"
														disabled={busySourceId === row.sourceId || !!runningJobId}
														onclick={() => unsubscribeOne(row.sourceId)}
														title="Unsubscribe"
													>
														<Trash2 class="size-3.5" />
													</Button>
												</div>
											</TableCell>
										</TableRow>
									{/each}
								</TableBody>
							</Table>
						</div>
					{/if}
				</TabsContent>

				<TabsContent value="domains">
					{#if similarDomainCount === 0}
						<Card class="bg-muted/30">
							<CardContent class="py-16 text-center">
								<p class="text-sm text-muted-foreground italic">
									No similar-search domains available yet.
								</p>
							</CardContent>
						</Card>
					{:else}
						<div class="space-y-4">
							<div>
								<h2 class="text-base font-semibold">Similar Search Domains</h2>
								<p class="text-sm text-muted-foreground">
									These are the domains used to filter similar links. Changes apply the next time
									you refresh similar links.
								</p>
							</div>

							<div class="rounded-lg border border-border">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Domain</TableHead>
											<TableHead class="text-right">Sources</TableHead>
											<TableHead>Contributors</TableHead>
											<TableHead>Status</TableHead>
											<TableHead class="text-right">Action</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{#each similarDomainsQuery.data ?? [] as row (row.domain)}
											<TableRow>
												<TableCell>
													<div class="space-y-1">
														<p class="font-medium">{row.domain}</p>
														<p class="text-xs text-muted-foreground">
															Used for `From your sources` filtering.
														</p>
													</div>
												</TableCell>
												<TableCell class="text-right">{row.sourceCount}</TableCell>
												<TableCell>
													<div class="flex max-w-[420px] flex-wrap gap-1.5">
														{#each row.contributors as contributor (contributor.kind + contributor.url)}
															<Badge
																variant="secondary"
																class="max-w-full gap-1 px-2 py-0.5 text-[11px]"
															>
																<span class="truncate">{contributor.label}</span>
															</Badge>
														{/each}
													</div>
												</TableCell>
												<TableCell>
													<Badge variant={row.included ? 'outline' : 'secondary'}>
														{row.included ? 'Included' : 'Excluded'}
													</Badge>
												</TableCell>
												<TableCell class="text-right">
													<div class="flex justify-end gap-2">
														<Switch
															checked={row.included}
															disabled={busySimilarDomain === row.domain}
															onCheckedChange={(checked) =>
																updateSimilarLinkDomain(row.domain, !!checked)}
														/>
													</div>
												</TableCell>
											</TableRow>
										{/each}
									</TableBody>
								</Table>
							</div>
						</div>
					{/if}
				</TabsContent>
			</Tabs>
		{/if}
	</div>
</main>

<Dialog.Root bind:open={bulkUnsubscribeDialogOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Confirm Unsubscribe</Dialog.Title>
			<Dialog.Description>
				Unsubscribe {selectedSourceIds.length} source(s)?
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (bulkUnsubscribeDialogOpen = false)}>Cancel</Button>
			<Button
				variant="destructive"
				disabled={selectedSourceIds.length === 0 || !!runningJobId}
				onclick={bulkUnsubscribe}
			>
				Unsubscribe
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
