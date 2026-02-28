<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';

	type FeedTab = 'new' | 'top' | 'discussed';
	type FeedWindow = '24h' | '7d' | '30d';

	const auth = useAuth();
	const client = useConvexClient();

	const tab = $derived((page.url.searchParams.get('tab') as FeedTab | null) ?? 'new');
	const windowBucket = $derived((page.url.searchParams.get('window') as FeedWindow | null) ?? '24h');
	const cursor = $derived(page.url.searchParams.get('cursor'));

	const feedQuery = useQuery((api as any).feed.listGlobal, () => ({
		tab,
		window: windowBucket,
		paginationOpts: {
			numItems: 20,
			cursor
		}
	}));

	function updateParams(next: { tab?: FeedTab; window?: FeedWindow; cursor?: string | null }) {
		const params = Object.fromEntries(page.url.searchParams.entries()) as Record<string, string>;
		if (next.tab) params.tab = next.tab;
		if (next.window) params.window = next.window;
		if (next.cursor) params.cursor = next.cursor;
		else delete params.cursor;

		const queryString = new URLSearchParams(params).toString();
		const target = queryString.length > 0 ? `/feed?${queryString}` : '/feed';
		goto(target, { noScroll: true, keepFocus: true });
	}

	async function vote(postId: string, value: 1 | -1) {
		if (!auth.isAuthenticated) {
			return;
		}
		try {
			await client.mutation((api as any).posts.vote, { postId, value });
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to vote');
		}
	}
</script>

<main class="mx-auto max-w-5xl px-4 py-6 sm:px-6">
	<div class="mb-5 flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Global Feed</h1>
			<p class="text-sm text-muted-foreground">Knowledge posts ranked by new, top, and discussed.</p>
		</div>
		{#if auth.isAuthenticated}
			<Button href="/submit">Submit Post</Button>
		{:else}
			<Button variant="outline" href={`/signin?redirectTo=${encodeURIComponent('/feed')}`}>
				Sign in to submit
			</Button>
		{/if}
	</div>

	{#if !auth.isAuthenticated}
		<div class="mb-4 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
			Sign in to vote and comment.
			<a class="ml-2 underline" href={`/signin?redirectTo=${encodeURIComponent(page.url.pathname + page.url.search)}`}>
				Sign in
			</a>
		</div>
	{/if}

	<div class="mb-4 flex flex-wrap items-center gap-2">
		{#each ['new', 'top', 'discussed'] as t (t)}
			<Button variant={tab === t ? 'default' : 'outline'} size="sm" onclick={() => updateParams({ tab: t as FeedTab, cursor: null })}>
				{t}
			</Button>
		{/each}
		<div class="mx-2 h-4 w-px bg-border"></div>
		{#each ['24h', '7d', '30d'] as w (w)}
			<Button variant={windowBucket === w ? 'secondary' : 'ghost'} size="sm" onclick={() => updateParams({ window: w as FeedWindow, cursor: null })}>
				{w}
			</Button>
		{/each}
	</div>

	{#if feedQuery.isLoading}
		<p class="text-sm text-muted-foreground">Loading feed...</p>
	{:else if feedQuery.error}
		<p class="text-sm text-destructive">Failed to load feed.</p>
	{:else if (feedQuery.data?.page?.length ?? 0) === 0}
		<p class="text-sm text-muted-foreground">No posts yet. Be the first to publish.</p>
	{:else}
		<div class="space-y-3">
			{#each feedQuery.data?.page ?? [] as post (post._id)}
				<article class="rounded-lg border border-border bg-card p-4">
					<div class="flex items-start justify-between gap-4">
						<div class="min-w-0 flex-1">
							<a href="/post/{post._id}" class="line-clamp-2 text-base font-medium hover:underline">
								{post.title}
							</a>
							<p class="mt-1 line-clamp-2 text-sm text-muted-foreground">{post.snippet}</p>
							<div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
								<span>u/{post.authorUsername ?? post.authorName}</span>
								{#if post.communitySlug}
									<span>•</span>
									<a href="/c/{post.communitySlug}" class="hover:text-foreground hover:underline">
										c/{post.communitySlug}
									</a>
								{/if}
								<span>•</span>
								<span>{new Date(post.createdAt).toLocaleString()}</span>
							</div>
						</div>

						<div class="flex shrink-0 items-center gap-2">
							<Button
								size="sm"
								variant="outline"
								disabled={!auth.isAuthenticated}
								onclick={() => vote(post._id, 1)}
							>
								+1
							</Button>
							<Button
								size="sm"
								variant="outline"
								disabled={!auth.isAuthenticated}
								onclick={() => vote(post._id, -1)}
							>
								-1
							</Button>
						</div>
					</div>
					<div class="mt-3 text-xs text-muted-foreground">
						score {post.score} • {post.commentCount} comments • likes {post.likes} • dislikes {post.dislikes}
					</div>
				</article>
			{/each}
		</div>

		<div class="mt-5 flex items-center justify-between">
			<Button variant="outline" size="sm" disabled={!cursor} onclick={() => updateParams({ cursor: null })}>
				First Page
			</Button>
			<Button
				variant="outline"
				size="sm"
				disabled={feedQuery.data?.isDone ?? true}
				onclick={() => updateParams({ cursor: feedQuery.data?.continueCursor ?? null })}
			>
				Next Page
			</Button>
		</div>
	{/if}
</main>

