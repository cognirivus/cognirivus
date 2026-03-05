<script lang="ts">
	import { page } from '$app/state';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { ExternalLink, Link2, Loader2, RotateCw } from '@lucide/svelte';

	type SimilarLink = {
		id: string;
		title: string;
		url: string;
		favicon?: string;
	};

	const client = useConvexClient();

	const routeId = $derived(page.route.id ?? '');
	const postId = $derived(routeId === '/post/[id]' ? page.params.id : null);
	const sourceItemId = $derived(
		routeId === '/source/[sourceItemId]' ? (page.params.sourceItemId as Id<'source_items'>) : null
	);
	const isTargetRoute = $derived(routeId === '/post/[id]' || routeId === '/source/[sourceItemId]');
	const isAdmin = $derived(Boolean(page.data?.isAdmin));

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

	const similarLinks = $derived.by(() => {
		const data = similarQuery.data?.results;
		return Array.isArray(data) ? (data as Array<SimilarLink>) : [];
	});
	const similarSeedUrl = $derived(
		typeof similarQuery.data?.sourceUrl === 'string' ? similarQuery.data.sourceUrl : sourceUrl
	);
	const queryState = $derived(
		typeof similarQuery.data?.state === 'string' ? similarQuery.data.state : null
	);
	const queryIsRefreshing = $derived(Boolean(similarQuery.data?.isRefreshing));
	const queryLastFetchedAt = $derived(
		typeof similarQuery.data?.lastFetchedAt === 'number' ? similarQuery.data.lastFetchedAt : null
	);
	const queryLastError = $derived(
		typeof similarQuery.data?.lastError === 'string' ? similarQuery.data.lastError : null
	);

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

	$effect(() => {
		const timer = setInterval(() => {
			nowMs = Date.now();
		}, 60_000);
		return () => clearInterval(timer);
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
		if (!sourceUrl || !isAdmin || manualRefreshLoading) {
			return;
		}
		manualRefreshLoading = true;
		manualRefreshError = null;
		try {
			await client.action((api as any).similar_links.refreshNow, {
				url: sourceUrl
			});
		} catch (error) {
			manualRefreshError = toErrorMessage(error, 'Refresh failed.');
		} finally {
			manualRefreshLoading = false;
		}
	};

	const emptyMessage = $derived.by(() => {
		if (manualRefreshError) {
			return manualRefreshError;
		}
		if (ensureError) {
			return ensureError;
		}
		if (similarQuery.error) {
			return toErrorMessage(similarQuery.error, 'Failed to load similar links.');
		}
		if (queryLastError) {
			return queryLastError;
		}
		return 'No similar links found.';
	});

	const freshnessMessage = $derived.by(() => {
		if (!queryLastFetchedAt) {
			if (queryIsRefreshing || manualRefreshLoading) {
				return 'Refreshing similar links...';
			}
			return null;
		}

		const relative = formatRelative(queryLastFetchedAt, nowMs);
		if (manualRefreshLoading) {
			return `Refreshing (last updated ${relative})`;
		}
		if (queryState === 'error_backoff') {
			return `Showing cached results from ${relative}`;
		}
		if (queryState === 'stale' || queryIsRefreshing) {
			return `Refreshing in background. Cached ${relative}`;
		}
		return `Updated ${relative}`;
	});

	const freshnessToneClass = $derived.by(() => {
		if (queryState === 'error_backoff') {
			return 'text-amber-600 dark:text-amber-400';
		}
		if (queryState === 'stale' || queryIsRefreshing || manualRefreshLoading) {
			return 'text-muted-foreground';
		}
		return 'text-muted-foreground';
	});
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
	<div class="flex h-full min-h-0 flex-col px-4 py-5">
		<div class="flex items-center justify-between gap-2">
			<h3 class="text-[10px] font-black tracking-widest text-muted-foreground uppercase">
				Similar links
			</h3>
			<div class="flex items-center gap-2">
				{#if similarLinks.length > 0}
					<span class="text-[10px] text-muted-foreground tabular-nums"
						>{similarLinks.length} found</span
					>
				{/if}
				{#if isAdmin && sourceUrl}
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

		{#if freshnessMessage}
			<p class={`mt-2 text-[10px] ${freshnessToneClass}`}>{freshnessMessage}</p>
		{/if}

		<div class="mt-3 min-h-0 flex-1 overflow-y-auto pe-1">
			{#if sourceLoading || ensureLoading || similarQuery.isLoading}
				<div class="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
					<Loader2 class="size-4 animate-spin" />
					<span class="text-[10px] tracking-wide uppercase">Finding similar content...</span>
				</div>
			{:else if similarLinks.length === 0}
				<div class="flex flex-col items-center justify-center gap-1.5 py-8 text-center">
					<Link2 class="size-4 text-muted-foreground/50" />
					<p class="text-[11px] text-muted-foreground">{emptyMessage}</p>
				</div>
			{:else}
				<div class="space-y-1">
					{#each similarLinks as link (link.id)}
						<a
							href={link.url}
							target="_blank"
							rel="noreferrer"
							class="group flex items-start gap-2.5 rounded-lg p-2 transition-colors hover:bg-muted/50"
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

							<div class="flex min-w-0 flex-1 flex-col gap-0.5">
								<span
									class="line-clamp-2 text-[12px] leading-snug font-medium group-hover:text-foreground"
								>
									{link.title}
								</span>
								<span class="text-[10px] text-muted-foreground/70">
									{@render domainFromUrl(link.url)}
								</span>
							</div>

							<ExternalLink
								class="mt-1 size-3 shrink-0 text-transparent transition-colors group-hover:text-muted-foreground"
							/>
						</a>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}
