<script lang="ts">
	import { page } from '$app/state';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import * as Popover from '$lib/components/ui/popover';
	import { ChevronDown, ExternalLink, Link2, Loader2, RotateCw } from '@lucide/svelte';

	type SimilarLink = {
		id: string;
		title: string;
		url: string;
		favicon?: string;
		publishedDate?: string;
	};

	type TabKey = 'sources' | 'web';

	type TabView = {
		state: string | null;
		results: Array<SimilarLink>;
		lastError: string | null;
		lastFetchedAt: number | null;
		isRefreshing: boolean;
		hasDomainUpdates: boolean;
		cachedDomainCount: number;
		currentDomainCount: number;
		newDomains: Array<string>;
		removedDomainCount: number;
	};

	const client = useConvexClient();

	const routeId = $derived(page.route.id ?? '');
	const postId = $derived(routeId === '/post/[id]' ? page.params.id : null);
	const sourceItemId = $derived(
		routeId === '/source/[sourceItemId]' ? (page.params.sourceItemId as Id<'source_items'>) : null
	);
	const isTargetRoute = $derived(routeId === '/post/[id]' || routeId === '/source/[sourceItemId]');
	const currentUserQuery = useQuery((api as any).auth.getCurrentUser, {});
	const canRefreshSimilarLinks = $derived(Boolean(currentUserQuery.data));

	const postQuery = useQuery((api as any).posts.get, () => (postId ? { postId } : 'skip'));
	const sourceItemQuery = useQuery((api as any).sources.getSourceItem, () =>
		sourceItemId ? { sourceItemId } : 'skip'
	);

	const sourceUrl = $derived.by(() => {
		if (routeId === '/post/[id]') {
			const post = postQuery.data;
			return (
				(typeof post?.url === 'string' && post.url.trim()) ||
				(typeof post?.sourceUrlSnapshot === 'string' && post.sourceUrlSnapshot.trim()) ||
				null
			);
		}
		if (routeId === '/source/[sourceItemId]') {
			const sourceItem = sourceItemQuery.data;
			return typeof sourceItem?.url === 'string' && sourceItem.url.trim() ? sourceItem.url : null;
		}
		return null;
	});

	const sourceLoading = $derived.by(() => {
		if (routeId === '/post/[id]') {
			return postQuery.isLoading;
		}
		if (routeId === '/source/[sourceItemId]') {
			return sourceItemQuery.isLoading;
		}
		return false;
	});

	const similarQuery = useQuery((api as any).similar_links.getCachedByUrl, () =>
		sourceUrl ? { url: sourceUrl } : 'skip'
	);

	const tabViews = $derived.by(() => {
		const tabs = similarQuery.data?.tabs;
		const sources: TabView = {
			state: typeof tabs?.sources?.state === 'string' ? tabs.sources.state : null,
			results: Array.isArray(tabs?.sources?.results)
				? (tabs.sources.results as Array<SimilarLink>)
				: [],
			lastError: typeof tabs?.sources?.lastError === 'string' ? tabs.sources.lastError : null,
			lastFetchedAt:
				typeof tabs?.sources?.lastFetchedAt === 'number' ? tabs.sources.lastFetchedAt : null,
			isRefreshing: Boolean(tabs?.sources?.isRefreshing),
			hasDomainUpdates: Boolean(tabs?.sources?.hasDomainUpdates),
			cachedDomainCount:
				typeof tabs?.sources?.cachedDomainCount === 'number' ? tabs.sources.cachedDomainCount : 0,
			currentDomainCount:
				typeof tabs?.sources?.currentDomainCount === 'number' ? tabs.sources.currentDomainCount : 0,
			newDomains: Array.isArray(tabs?.sources?.newDomains)
				? (tabs.sources.newDomains as Array<string>)
				: [],
			removedDomainCount:
				typeof tabs?.sources?.removedDomainCount === 'number'
					? tabs.sources.removedDomainCount
					: 0
		};
		const web: TabView = {
			state: typeof tabs?.web?.state === 'string' ? tabs.web.state : null,
			results: Array.isArray(tabs?.web?.results) ? (tabs.web.results as Array<SimilarLink>) : [],
			lastError: typeof tabs?.web?.lastError === 'string' ? tabs.web.lastError : null,
			lastFetchedAt: typeof tabs?.web?.lastFetchedAt === 'number' ? tabs.web.lastFetchedAt : null,
			isRefreshing: Boolean(tabs?.web?.isRefreshing),
			hasDomainUpdates: Boolean(tabs?.web?.hasDomainUpdates),
			cachedDomainCount:
				typeof tabs?.web?.cachedDomainCount === 'number' ? tabs.web.cachedDomainCount : 0,
			currentDomainCount:
				typeof tabs?.web?.currentDomainCount === 'number' ? tabs.web.currentDomainCount : 0,
			newDomains: Array.isArray(tabs?.web?.newDomains)
				? (tabs.web.newDomains as Array<string>)
				: [],
			removedDomainCount:
				typeof tabs?.web?.removedDomainCount === 'number' ? tabs.web.removedDomainCount : 0
		};
		return { sources, web };
	});
	const sourceDomains = $derived.by(() => {
		const domains = similarQuery.data?.sourceDomains;
		return Array.isArray(domains) ? (domains as Array<string>) : [];
	});
	const sourceDomainCount = $derived(sourceDomains.length);

	let activeTab = $state<TabKey>('sources');
	let hasUserChosenTab = $state(false);
	const activeView = $derived(tabViews[activeTab]);
	const activeResults = $derived(activeView.results);
	const activeState = $derived(activeView.state);
	const activeIsRefreshing = $derived(activeView.isRefreshing);
	const activeLastFetchedAt = $derived(activeView.lastFetchedAt);
	const activeLastError = $derived(activeView.lastError);
	const activeHasDomainUpdates = $derived(activeView.hasDomainUpdates);
	const activeNewDomains = $derived(activeView.newDomains);
	const activeRemovedDomainCount = $derived(activeView.removedDomainCount);
	const activeCachedDomainCount = $derived(activeView.cachedDomainCount);
	const activeCurrentDomainCount = $derived(activeView.currentDomainCount);

	let ensureRequestKey: string | null = null;
	let ensureLoading = $state(false);
	let ensureError = $state<string | null>(null);
	let manualRefreshLoading = $state(false);
	let manualRefreshError = $state<string | null>(null);
	let nowMs = $state(Date.now());

	const toErrorMessage = (error: unknown, fallback: string) => {
		if (error instanceof Error && error.message) {
			return error.message;
		}
		return fallback;
	};

	const formatRelative = (timestampMs: number, now: number) => {
		const diffMs = timestampMs - now;
		const absMs = Math.abs(diffMs);
		const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
		if (absMs < 60_000) {
			return rtf.format(Math.round(diffMs / 1000), 'second');
		}
		if (absMs < 3_600_000) {
			return rtf.format(Math.round(diffMs / 60_000), 'minute');
		}
		if (absMs < 86_400_000) {
			return rtf.format(Math.round(diffMs / 3_600_000), 'hour');
		}
		return rtf.format(Math.round(diffMs / 86_400_000), 'day');
	};

	const formatPublishedDate = (value: string | undefined) => {
		if (!value) {
			return null;
		}
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) {
			return null;
		}
		return new Intl.DateTimeFormat('en', {
			month: 'short',
			day: 'numeric',
			year: parsed.getFullYear() === new Date().getFullYear() ? undefined : 'numeric'
		}).format(parsed);
	};

	$effect(() => {
		const timer = setInterval(() => {
			nowMs = Date.now();
		}, 60_000);
		return () => clearInterval(timer);
	});

	$effect(() => {
		if (!sourceUrl) {
			activeTab = 'sources';
			hasUserChosenTab = false;
			return;
		}
		activeTab = 'sources';
		hasUserChosenTab = false;
	});

	$effect(() => {
		if (hasUserChosenTab || sourceLoading || ensureLoading || similarQuery.isLoading) {
			return;
		}
		if (tabViews.sources.results.length > 0) {
			activeTab = 'sources';
			return;
		}
		if (tabViews.web.results.length > 0) {
			activeTab = 'web';
		}
	});

	$effect(() => {
		if (!isTargetRoute) {
			ensureRequestKey = null;
			ensureLoading = false;
			ensureError = null;
			manualRefreshError = null;
			return;
		}
		if (sourceLoading || !sourceUrl) {
			return;
		}

		const requestKey = `${routeId}:${sourceUrl}`;
		if (requestKey === ensureRequestKey) {
			return;
		}
		ensureRequestKey = requestKey;
		ensureLoading = true;
		ensureError = null;
		manualRefreshError = null;

		let cancelled = false;
		(async () => {
			try {
				await client.action((api as any).similar_links.ensureForUrl, {
					url: sourceUrl
				});
			} catch (error) {
				if (!cancelled) {
					ensureError = toErrorMessage(error, 'Failed to load similar links.');
				}
			} finally {
				if (!cancelled) {
					ensureLoading = false;
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	});

	const handleManualRefresh = async () => {
		if (!sourceUrl || !canRefreshSimilarLinks || manualRefreshLoading) {
			return;
		}
		manualRefreshLoading = true;
		manualRefreshError = null;
		try {
			await client.action((api as any).similar_links.refreshNow, {
				url: sourceUrl,
				scope: activeTab
			});
		} catch (error) {
			manualRefreshError = toErrorMessage(error, 'Refresh failed.');
		} finally {
			manualRefreshLoading = false;
		}
	};

	const activeEmptyMessage = $derived.by(() => {
		if (manualRefreshError) {
			return manualRefreshError;
		}
		if (ensureError) {
			return ensureError;
		}
		if (similarQuery.error) {
			return toErrorMessage(similarQuery.error, 'Failed to load similar links.');
		}
		if (activeLastError) {
			return activeLastError;
		}
		if (activeTab === 'sources') {
			return 'No similar links found from your source domains.';
		}
		return 'No similar links found outside your source domains.';
	});

	const freshnessMessage = $derived.by(() => {
		if (!activeLastFetchedAt) {
			if (activeIsRefreshing || manualRefreshLoading) {
				return 'Refreshing similar links...';
			}
			return null;
		}

		const relative = formatRelative(activeLastFetchedAt, nowMs);
		if (manualRefreshLoading) {
			return `Refreshing ${activeTab === 'sources' ? 'your sources' : 'the web'} (last updated ${relative})`;
		}
		if (activeState === 'error_backoff') {
			return `Showing cached ${activeTab === 'sources' ? 'source' : 'web'} results from ${relative}`;
		}
		if (activeState === 'stale' || activeIsRefreshing) {
			return `Refreshing ${activeTab === 'sources' ? 'source' : 'web'} results in background. Cached ${relative}`;
		}
		return `Updated ${relative}`;
	});

	const freshnessToneClass = $derived.by(() => {
		if (activeState === 'error_backoff') {
			return 'text-amber-600 dark:text-amber-400';
		}
		return 'text-muted-foreground';
	});

	const domainStaleMessage = $derived.by(() => {
		if (!activeHasDomainUpdates) {
			return null;
		}
		if (activeNewDomains.length > 0) {
			return `Your sources changed. Refresh to include ${activeNewDomains.length} new ${activeNewDomains.length === 1 ? 'domain' : 'domains'}.`;
		}
		if (activeRemovedDomainCount > 0) {
			return `Your sources changed. Refresh to remove ${activeRemovedDomainCount} old ${activeRemovedDomainCount === 1 ? 'domain' : 'domains'}.`;
		}
		return 'Your source domains changed. Refresh to update similar links.';
	});

	const tabSummary = $derived([
		{
			key: 'sources' as const,
			label: 'From your sources',
			count: tabViews.sources.results.length
		},
		{
			key: 'web' as const,
			label: 'From web',
			count: tabViews.web.results.length
		}
	]);
</script>

{#snippet domainFromUrl(url: string)}
	{@const hostname = (() => {
		try {
			return new URL(url).hostname.replace(/^www\./, '');
		} catch {
			return url;
		}
	})()}
	{hostname}
{/snippet}

{#if isTargetRoute}
	<div class="flex h-full min-h-0 flex-col">
		<div class="flex items-center justify-between gap-2 px-3 pt-4 pb-2">
			<h3 class="text-[10px] font-black tracking-[0.2em] text-muted-foreground uppercase">
				Similar links
			</h3>
			<div class="flex items-center gap-2">
				{#if canRefreshSimilarLinks && sourceUrl}
					<button
						type="button"
						onclick={handleManualRefresh}
						disabled={manualRefreshLoading}
						class="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
					>
						<RotateCw class={`size-3 ${manualRefreshLoading ? 'animate-spin' : ''}`} />
						Refresh
					</button>
				{/if}
			</div>
		</div>

		<div class="flex items-center border-b border-border/60">
			{#each tabSummary as tab (tab.key)}
				<button
					type="button"
					onclick={() => {
						hasUserChosenTab = true;
						activeTab = tab.key;
						manualRefreshError = null;
					}}
					class={`min-w-0 flex-1 px-2 py-1.5 text-center text-[10px] font-semibold transition-colors ${
						activeTab === tab.key
							? 'text-foreground border-b-2 border-foreground'
							: 'text-muted-foreground hover:text-foreground'
					}`}
				>
					{tab.label}
				</button>
			{/each}
		</div>

		<div class="mt-2 flex items-center justify-between gap-2 px-3">
			{#if freshnessMessage}
				<p class={['min-w-0 truncate text-[10px]', freshnessToneClass]}>{freshnessMessage}</p>
			{:else}
				<div></div>
			{/if}
			{#if sourceDomainCount > 0}
				<Popover.Root>
					<Popover.Trigger>
						<button
							type="button"
							class="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted"
						>
							View domains
							<ChevronDown class="size-3" />
						</button>
					</Popover.Trigger>
					<Popover.Content
						class="w-[240px] border bg-background p-0 text-foreground shadow-lg"
						align="end"
					>
						<div class="flex flex-col">
							<div class="border-b px-3 py-2">
								<p class="text-xs font-semibold">
									{activeTab === 'sources' ? 'Included domains' : 'Excluded domains'}
								</p>
								<p class="mt-0.5 text-[10px] text-muted-foreground">
									{sourceDomainCount} {sourceDomainCount === 1 ? 'domain' : 'domains'}
								</p>
							</div>
							<div class="max-h-[280px] overflow-y-auto p-1">
								{#each sourceDomains as domain (domain)}
									<div class="rounded-sm px-2 py-1.5 text-[11px] text-foreground">
										{domain}
									</div>
								{/each}
							</div>
						</div>
					</Popover.Content>
				</Popover.Root>
			{/if}
		</div>

		{#if domainStaleMessage}
			<div class="mx-3 mt-2 rounded-lg border border-amber-300/70 bg-amber-50 px-2.5 py-2 text-amber-950">
				<div class="flex items-start justify-between gap-2">
					<div class="min-w-0">
						<p class="text-[10px] font-medium">{domainStaleMessage}</p>
						<p class="mt-1 text-[10px] text-amber-800/80">
							Cached for {activeCachedDomainCount} domains. You now have {activeCurrentDomainCount}.
							Manual refresh is rate-limited daily.
						</p>
					</div>
					<div class="flex shrink-0 items-center gap-2">
						{#if activeNewDomains.length > 0}
							<Popover.Root>
								<Popover.Trigger>
									<button
										type="button"
										class="inline-flex items-center gap-1 rounded-md border border-amber-300/80 bg-white px-2 py-1 text-[10px] font-medium text-amber-900 transition-colors hover:bg-amber-100"
									>
										New domains
										<ChevronDown class="size-3" />
									</button>
								</Popover.Trigger>
								<Popover.Content class="w-[240px] border bg-background p-0 text-foreground shadow-lg" align="end">
									<div class="flex flex-col">
										<div class="border-b px-3 py-2">
											<p class="text-xs font-semibold">New domains since last refresh</p>
											<p class="mt-0.5 text-[10px] text-muted-foreground">
												{activeNewDomains.length} {activeNewDomains.length === 1 ? 'domain' : 'domains'}
											</p>
										</div>
										<div class="max-h-[240px] overflow-y-auto p-1">
											{#each activeNewDomains as domain (domain)}
												<div class="rounded-sm px-2 py-1.5 text-[11px] text-foreground">
													{domain}
												</div>
											{/each}
										</div>
									</div>
								</Popover.Content>
							</Popover.Root>
						{/if}
						{#if canRefreshSimilarLinks}
							<button
								type="button"
								onclick={handleManualRefresh}
								disabled={manualRefreshLoading}
								class="inline-flex items-center gap-1 rounded-md border border-amber-300/80 bg-white px-2 py-1 text-[10px] font-medium text-amber-900 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
							>
								<RotateCw class={`size-3 ${manualRefreshLoading ? 'animate-spin' : ''}`} />
								Refresh
							</button>
						{/if}
					</div>
				</div>
			</div>
		{/if}

		<div class="mt-2 min-h-0 flex-1 overflow-y-auto px-3 pe-2">
			{#if sourceLoading || ensureLoading || similarQuery.isLoading}
				<div class="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
					<Loader2 class="size-4 animate-spin" />
					<span class="text-[10px] tracking-wide uppercase">
						Finding similar {activeTab === 'sources' ? 'source' : 'web'} links...
					</span>
				</div>
			{:else if activeResults.length === 0}
				<div class="flex flex-col items-center justify-center gap-1.5 py-8 text-center">
					<Link2 class="size-4 text-muted-foreground/50" />
					<p class="text-[11px] text-muted-foreground">{activeEmptyMessage}</p>
				</div>
			{:else}
				<div class="space-y-1">
					{#each activeResults as link (link.id)}
						{@const publishedLabel = formatPublishedDate(link.publishedDate)}
						<a
							href={link.url}
							target="_blank"
							rel="noreferrer"
							class="group flex items-start gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-muted/50"
						>
							<div
								class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-muted/60"
							>
								{#if link.favicon}
									<img
										src={link.favicon}
										alt=""
										class="size-3.5 rounded-sm object-contain"
										onerror={(event) => {
											(event.currentTarget as HTMLImageElement).style.display = 'none';
											(
												event.currentTarget as HTMLImageElement
											).nextElementSibling?.classList.remove('hidden');
										}}
									/>
									<ExternalLink class="hidden size-2.5 text-muted-foreground" />
								{:else}
									<ExternalLink class="size-2.5 text-muted-foreground" />
								{/if}
							</div>

							<div class="flex min-w-0 flex-1 flex-col gap-1">
								<span
									class="line-clamp-2 text-[12px] leading-snug font-medium group-hover:text-foreground"
								>
									{link.title}
								</span>
								<div class="flex flex-col gap-0.5">
									<span class="truncate text-[10px] text-muted-foreground/75">
										{@render domainFromUrl(link.url)}
									</span>
									{#if publishedLabel}
										<span class="text-[10px] text-muted-foreground/55">{publishedLabel}</span>
									{/if}
								</div>
							</div>

							<ExternalLink
								class="mt-0.5 size-3 shrink-0 text-transparent transition-colors group-hover:text-muted-foreground"
							/>
						</a>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}
