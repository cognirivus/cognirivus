<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { Calendar, MessageSquare, ThumbsDown, ThumbsUp, User } from '@lucide/svelte';
	import { api } from '$convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
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

<main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
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
		<Card class="mb-4 gap-0 py-3">
			<CardContent class="text-xs text-muted-foreground">
				Sign in to vote and comment.
				<a
					class="ml-2 font-medium underline"
					href={`/signin?redirectTo=${encodeURIComponent(page.url.pathname + page.url.search)}`}
				>
					Sign in
				</a>
			</CardContent>
		</Card>
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
				<Card class="gap-0 py-4">
					<CardContent>
						<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
						<div class="min-w-0 flex-1">
							<a href="/post/{post._id}" class="line-clamp-2 text-base font-medium hover:underline">
								{post.title}
							</a>
							<p class="mt-1 line-clamp-2 text-sm text-muted-foreground">{post.snippet}</p>
							<div class="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
								<span class="inline-flex items-center gap-1">
									<User class="size-3.5" />
									u/{post.authorUsername ?? post.authorName}
								</span>
								{#if post.communitySlug}
									<a
										href="/c/{post.communitySlug}"
										class="inline-flex items-center gap-1 hover:text-foreground hover:underline"
									>
										c/{post.communitySlug}
									</a>
								{/if}
								<span class="inline-flex items-center gap-1">
									<Calendar class="size-3.5" />
									{new Date(post.createdAt).toLocaleString()}
								</span>
							</div>
						</div>

						<div class="flex shrink-0 items-center gap-2 self-start sm:self-auto">
							<Button
								size="icon-sm"
								variant={post.userVote === 1 ? 'secondary' : 'outline'}
								class={post.userVote === 1
									? 'border-primary/40 text-primary [&_svg_path]:!fill-current'
									: ''}
								disabled={!auth.isAuthenticated}
								onclick={() => vote(post._id, 1)}
								aria-label="Like post"
							>
								<ThumbsUp class="size-4" />
							</Button>
							<Button
								size="icon-sm"
								variant={post.userVote === -1 ? 'secondary' : 'outline'}
								class={post.userVote === -1
									? 'border-destructive/40 text-destructive [&_svg_path]:!fill-current'
									: ''}
								disabled={!auth.isAuthenticated}
								onclick={() => vote(post._id, -1)}
								aria-label="Dislike post"
							>
								<ThumbsDown class="size-4" />
							</Button>
						</div>
					</div>
					<div class="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
						<span class="inline-flex items-center gap-1">
							<MessageSquare class="size-3.5" />
							{post.commentCount} comments
						</span>
						<span class="inline-flex items-center gap-1">
							<ThumbsUp class="size-3.5" />
							{post.likes}
						</span>
						<span class="inline-flex items-center gap-1">
							<ThumbsDown class="size-3.5" />
							{post.dislikes}
						</span>
						<span>score {post.score}</span>
					</div>
					</CardContent>
				</Card>
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

