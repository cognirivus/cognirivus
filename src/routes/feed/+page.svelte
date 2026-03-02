<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import {
		Calendar,
		Globe,
		MessageSquare,
		ThumbsDown,
		ThumbsUp,
		User,
		Users,
		Lock,
		ExternalLink
	} from '@lucide/svelte';
	import { api } from '$convex/_generated/api';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { toast } from 'svelte-sonner';

	type FeedTab = 'new' | 'top' | 'discussed';
	type FeedWindow = '24h' | '7d' | '30d';
	type FeedScope = 'you' | 'public' | 'community';

	const auth = useAuth();
	const client = useConvexClient();

	const tab = $derived((page.url.searchParams.get('tab') as FeedTab | null) ?? 'new');
	const windowBucket = $derived(
		(page.url.searchParams.get('window') as FeedWindow | null) ?? '24h'
	);
	const scope = $derived(
		(page.url.searchParams.get('scope') as FeedScope | null) ??
			(auth.isAuthenticated ? 'you' : 'public')
	);
	const cursor = $derived(page.url.searchParams.get('cursor'));

	const feedQuery = useQuery((api as any).feed.listGlobal, () => {
		const base = {
			paginationOpts: {
				numItems: 20,
				cursor
			}
		};
		return {
			...base,
			tab,
			scope,
			window: windowBucket
		};
	});

	function updateParams(next: {
		scope?: FeedScope;
		tab?: FeedTab;
		window?: FeedWindow;
		cursor?: string | null;
	}) {
		const params = Object.fromEntries(page.url.searchParams.entries()) as Record<string, string>;
		if (next.scope) {
			params.scope = next.scope;
			delete params.cursor;
		}
		if (next.tab) params.tab = next.tab;
		if (next.window) params.window = next.window;
		if (next.cursor) params.cursor = next.cursor;
		else if (next.cursor === null) delete params.cursor;

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
			<h1 class="text-2xl font-semibold tracking-tight">
				{#if scope === 'you'}My Private Feed{:else if scope === 'community'}Community Feed{:else}Public
					Feed{/if}
			</h1>
			<p class="text-sm text-muted-foreground">
				{#if scope === 'you'}Your link collection and private notes.{:else}Knowledge posts ranked by
					new, top, and discussed.{/if}
			</p>
		</div>
		{#if auth.isAuthenticated}
			<Button href="/submit">Submit Post</Button>
		{:else}
			<Button variant="outline" href={`/signin?redirectTo=${encodeURIComponent('/feed')}`}>
				Sign in to submit
			</Button>
		{/if}
	</div>

	{#if !auth.isAuthenticated && scope === 'you'}
		<Card class="mb-4 gap-0 py-3">
			<CardContent class="text-xs text-muted-foreground">
				Sign in to view your private feed.
				<a
					class="ml-2 font-medium underline"
					href={`/signin?redirectTo=${encodeURIComponent(page.url.pathname + page.url.search)}`}
				>
					Sign in
				</a>
			</CardContent>
		</Card>
	{:else if !auth.isAuthenticated}
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
		<div
			class="flex items-center gap-1 overflow-hidden rounded-md border border-border bg-muted/20 p-1"
		>
			{#each ['you', 'public', 'community'] as s (s)}
				{#if s !== 'you' || auth.isAuthenticated}
					<Button
						variant={scope === s ? 'secondary' : 'ghost'}
						size="sm"
						class="h-8 px-3 text-xs"
						onclick={() => updateParams({ scope: s as FeedScope })}
					>
						{s.charAt(0).toUpperCase() + s.slice(1)}
					</Button>
				{/if}
			{/each}
		</div>

		{#if scope !== 'you'}
			<div class="mx-1 h-4 w-px bg-border"></div>
			{#each ['new', 'top', 'discussed'] as t (t)}
				<Button
					variant={tab === t ? 'default' : 'outline'}
					size="sm"
					class="h-8"
					onclick={() => updateParams({ tab: t as FeedTab, cursor: null })}
				>
					{t}
				</Button>
			{/each}
			<div class="mx-1 h-4 w-px bg-border"></div>
			{#each ['24h', '7d', '30d'] as w (w)}
				<Button
					variant={windowBucket === w ? 'secondary' : 'ghost'}
					size="sm"
					class="h-8"
					onclick={() => updateParams({ window: w as FeedWindow, cursor: null })}
				>
					{w}
				</Button>
			{/each}
		{/if}
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
								<div class="flex items-start justify-between gap-3">
									<div class="flex items-center gap-2">
										<a
											href="/post/{post._id}"
											class="line-clamp-2 text-base font-medium hover:underline"
										>
											{post.title}
										</a>
										{#if post.visibility === 'private'}
											<Lock class="size-3.5 text-muted-foreground" />
										{/if}
										{#if post.type === 'link' && post.url}
											<a
												href={post.url}
												target="_blank"
												rel="noopener noreferrer"
												class="text-muted-foreground hover:text-foreground"
											>
												<ExternalLink class="size-3.5" />
											</a>
										{/if}
									</div>
									<span
										class="hidden shrink-0 items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground sm:inline-flex"
									>
										<Calendar class="size-3.5" />
										{new Date(post.createdAt).toLocaleString()}
									</span>
								</div>
								<p class="mt-1 line-clamp-2 text-sm text-muted-foreground">{post.snippet}</p>
								<span
									class="mt-2 inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground sm:hidden"
								>
									<Calendar class="size-3.5" />
									{new Date(post.createdAt).toLocaleString()}
								</span>
								<div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
									{#if post.authorUsername}
										<Badge href="/u/{post.authorUsername}" variant="outline" class="gap-1">
											<User class="size-3.5" />
											<span class="font-semibold">u/{post.authorUsername}</span>
										</Badge>
									{:else}
										<Badge variant="outline" class="gap-1">
											<User class="size-3.5" />
											<span class="font-semibold">{post.authorName}</span>
										</Badge>
									{/if}
									{#if post.communitySlug}
										<Badge href="/c/{post.communitySlug}" variant="outline" class="gap-1">
											<Users class="size-3.5" />
											<span class="font-semibold">c/{post.communitySlug}</span>
										</Badge>
									{:else if post.visibility === 'private'}
										<Badge variant="outline" class="gap-1 border-muted-foreground/30 bg-muted/20">
											<Lock class="size-3.5" />
											<span class="font-semibold text-muted-foreground">Private</span>
										</Badge>
									{:else}
										<Badge variant="outline" class="gap-1">
											<Globe class="size-3.5" />
											<span class="font-semibold">Public</span>
										</Badge>
									{/if}
								</div>
							</div>
						</div>
						<div class="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
							<div class="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
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
							<div class="flex shrink-0 items-center gap-2 self-end sm:self-auto">
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
					</CardContent>
				</Card>
			{/each}
		</div>

		{#if cursor || !(feedQuery.data?.isDone ?? true)}
			<div class="mt-5 flex items-center justify-between">
				<Button
					variant="outline"
					size="sm"
					disabled={!cursor}
					onclick={() => updateParams({ cursor: null })}
				>
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
	{/if}
</main>
