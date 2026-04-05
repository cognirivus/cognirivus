<script lang="ts">
	import { page } from '$app/state';
	import { useAppAuth } from '$lib/auth.svelte';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import {
		BookMarked,
		Calendar,
		MessageSquare,
		ThumbsDown,
		ThumbsUp,
		User,
		Users,
		Tag,
		Archive,
		Search,
		X,
		Clock,
		TrendingUp,
		Plus,
		Heart,
		Rss,
		LayoutGrid,
		List
	} from '@lucide/svelte';
	import { api } from '$convex/_generated/api';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import TagMultiSelect from '$lib/components/TagMultiSelect.svelte';
	import CommunitySubpageHeader from '$lib/components/community/CommunitySubpageHeader.svelte';

	type FeedTab = 'new' | 'top' | 'discussed';

	const auth = useAppAuth();
	const client = useConvexClient();
	const slug = $derived(page.params.slug);
	const tab = $derived((page.url.searchParams.get('tab') as FeedTab | null) ?? 'new');
	const search = $derived(page.url.searchParams.get('search') ?? '');
	const selectedTags = $derived(
		page.url.searchParams.get('tags')?.split(',').filter(Boolean) ?? []
	);
	const cursor = $derived(page.url.searchParams.get('cursor'));

	let searchInput = $state('');
	let layoutMode = $state<'bento' | 'list'>(
		(typeof localStorage !== 'undefined' && (localStorage.getItem('feedLayoutMode') as 'bento' | 'list')) || 'bento'
	);

	$effect(() => {
		searchInput = search;
	});

	// Persist layout mode to localStorage
	$effect(() => {
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('feedLayoutMode', layoutMode);
		}
	});
	const signInHref = $derived(
		`/signin?redirectTo=${encodeURIComponent(page.url.pathname + page.url.search)}`
	);

	const communityQuery = useQuery((api as any).communities.getBySlug, () => ({ slug }));
	const followingQuery = useQuery((api as any).social_graph.listFollowing, {});
	const feedQuery = useQuery((api as any).feed.listCommunity, () => {
		const s = search;
		const ts = selectedTags;
		return {
			slug,
			tab,
			window: '24h',
			search: s || undefined,
			tags: ts.length > 0 ? ts : undefined,
			paginationOpts: { numItems: 20, cursor }
		};
	});
	let followOverride = $state<boolean | null>(null);
	let followOverrideCommunityId = $state<string | null>(null);
	const currentCommunityId = $derived(communityQuery.data?.community._id ?? null);
	const isFollowing = $derived.by(() => {
		if (!auth.isAuthenticated || !currentCommunityId) {
			return false;
		}
		if (followOverrideCommunityId === currentCommunityId && followOverride !== null) {
			return followOverride;
		}
		if (communityQuery.data?.membershipStatus === 'active') {
			return true;
		}
		return (followingQuery.data?.communityIds ?? []).includes(currentCommunityId);
	});

	function updateParams(next: {
		tab?: FeedTab;
		search?: string | null;
		tags?: string[] | null;
		cursor?: string | null;
	}) {
		const params = Object.fromEntries(page.url.searchParams.entries()) as Record<string, string>;
		if (next.tab) {
			params.tab = next.tab;
			delete params.cursor;
		}
		if (next.search !== undefined) {
			if (next.search === null || next.search === '') delete params.search;
			else params.search = next.search;
			delete params.cursor;
		}
		if (next.tags !== undefined) {
			if (next.tags === null || next.tags.length === 0) delete params.tags;
			else params.tags = next.tags.join(',');
			delete params.cursor;
		}
		if (next.cursor) params.cursor = next.cursor;
		else if (next.cursor === null) delete params.cursor;

		const queryString = new URLSearchParams(params).toString();
		const target = queryString.length > 0 ? `/c/${slug}?${queryString}` : `/c/${slug}`;
		goto(target, { noScroll: true, keepFocus: true });
	}

	async function requestJoin() {
		if (!auth.isAuthenticated) {
			return;
		}
		try {
			if (!communityQuery.data) return;
			const result = await client.mutation((api as any).communities.requestJoin, {
				communityId: communityQuery.data.community._id
			});
			toast.success(result.status === 'active' ? 'Joined community' : 'Join request submitted');
		} catch (error: any) {
			toast.error(error?.message ?? 'Join failed');
		}
	}

	async function followCommunity() {
		if (!auth.isAuthenticated) {
			return;
		}
		try {
			if (!communityQuery.data) return;
			const result = await client.mutation((api as any).social_graph.followCommunity, {
				communityId: communityQuery.data.community._id
			});
			followOverrideCommunityId = communityQuery.data.community._id;
			followOverride = result.following;
			toast.success(result.following ? 'Following community' : 'Unfollowed community');
		} catch (error: any) {
			toast.error(error?.message ?? 'Follow failed');
		}
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

<main class="mx-auto w-full max-w-6xl overflow-x-hidden px-4 py-6 sm:px-6">
	{#if communityQuery.isLoading}
		<div class="flex items-center justify-center py-20">
			<p class="text-sm text-muted-foreground">Loading community...</p>
		</div>
	{:else if !communityQuery.data}
		<div class="flex items-center justify-center py-20">
			<p class="text-sm text-destructive">Community not found.</p>
		</div>
	{:else}
		{@const membershipStatus = communityQuery.data.membershipStatus}
		{@const canPost = communityQuery.data.canPost}

		<CommunitySubpageHeader communityData={communityQuery.data} activeNav="feed" />

		<!-- Action row -->
		<div class="mt-3 flex flex-wrap items-center gap-2">
			{#if membershipStatus === 'active'}
				<Button variant="secondary" size="sm" disabled>
					<Users class="size-4" />
					Joined
				</Button>
			{:else if membershipStatus === 'pending'}
				<Button variant="secondary" size="sm" disabled>
					<Clock class="size-4" />
					Request Pending
				</Button>
			{:else}
				<Button variant="outline" size="sm" disabled={!auth.isAuthenticated} onclick={requestJoin}>
					<Plus class="size-4" />
					Join
				</Button>
			{/if}

			<Button
				variant={isFollowing ? 'secondary' : 'outline'}
				size="sm"
				disabled={!auth.isAuthenticated}
				onclick={followCommunity}
			>
				{#if isFollowing}
					<Heart class="size-4 fill-current" />
					Following
				{:else}
					<Rss class="size-4" />
					Follow
				{/if}
			</Button>

			{#if canPost}
				<Button href="/submit" size="sm">
					<Plus class="size-4" />
					Submit
				</Button>
			{/if}

			<Button href={`/c/${slug}/collections`} variant="outline" size="sm">
				<BookMarked class="size-4" />
				Collections
			</Button>

			{#if !auth.isAuthenticated}
				<span class="text-xs text-muted-foreground">
					<a class="font-medium underline" href={signInHref}>Sign in</a> to join or follow.
				</span>
			{/if}
		</div>

		<!-- Feed -->
		<div class="mt-6">
			<div>
				<!-- Tab bar -->
				<div class="mb-4 flex items-center justify-between overflow-x-auto border-b">
					<div class="flex items-center">
						<button
							class="inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors sm:px-4 sm:py-2.5 {tab ===
							'new'
								? 'border-primary text-foreground'
								: 'border-transparent text-muted-foreground hover:text-foreground'}"
							onclick={() => updateParams({ tab: 'new', cursor: null })}
						>
							<Clock class="size-4" />
							New
						</button>
						<button
							class="inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors sm:px-4 sm:py-2.5 {tab ===
							'top'
								? 'border-primary text-foreground'
								: 'border-transparent text-muted-foreground hover:text-foreground'}"
							onclick={() => updateParams({ tab: 'top', cursor: null })}
						>
							<TrendingUp class="size-4" />
							Top
						</button>
						<button
							class="inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors sm:px-4 sm:py-2.5 {tab ===
							'discussed'
								? 'border-primary text-foreground'
								: 'border-transparent text-muted-foreground hover:text-foreground'}"
							onclick={() => updateParams({ tab: 'discussed', cursor: null })}
						>
							<MessageSquare class="size-4" />
							Discussed
						</button>
					</div>
					<div class="flex shrink-0 items-center gap-1">
						<Button
							variant={layoutMode === 'bento' ? 'ghost' : 'ghost'}
							size="icon-sm"
							class={layoutMode === 'bento' ? 'text-primary' : 'text-muted-foreground'}
							onclick={() => (layoutMode = 'bento')}
							aria-label="Bento layout"
						>
							<LayoutGrid class="size-4" />
						</Button>
						<Button
							variant={layoutMode === 'list' ? 'ghost' : 'ghost'}
							size="icon-sm"
							class={layoutMode === 'list' ? 'text-primary' : 'text-muted-foreground'}
							onclick={() => (layoutMode = 'list')}
							aria-label="List layout"
						>
							<List class="size-4" />
						</Button>
					</div>
				</div>

				<!-- Search & tag filter -->
				<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
					<div class="relative flex-1">
						<Search class="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							placeholder="Search community..."
							class="pr-9 pl-9 text-sm"
							bind:value={searchInput}
							onkeydown={(e) => {
								if (e.key === 'Enter') {
									updateParams({ search: searchInput, cursor: null });
								}
							}}
						/>
						{#if searchInput}
							<button
								class="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
								onclick={() => {
									searchInput = '';
									updateParams({ search: '', cursor: null });
								}}
							>
								<X class="size-4" />
							</button>
						{/if}
					</div>

					<TagMultiSelect
						availableTags={Array.from(
							new Set((feedQuery.data?.page ?? []).flatMap((p: any) => p.tags ?? []))
						)}
						{selectedTags}
						onSelect={(tags) => updateParams({ tags: tags, cursor: null })}
					/>
				</div>

				<!-- Posts -->
				{#if feedQuery.error}
					<p class="py-8 text-center text-sm text-destructive">{feedQuery.error.message}</p>
				{:else if (feedQuery.data?.page?.length ?? 0) === 0}
					<div
						class="flex flex-col items-center justify-center rounded-lg border border-dashed py-16"
					>
						<Archive class="mb-3 size-10 text-muted-foreground/50" />
						<p class="text-sm text-muted-foreground">No posts in this community yet.</p>
					</div>
				{:else if layoutMode === 'list'}
					<div class="space-y-3">
						{#each feedQuery.data?.page ?? [] as post (post._id)}
							<Card class="gap-0 py-4">
								<CardContent>
									<a href="/post/{post._id}" class="text-lg font-semibold hover:underline">
										{post.title}
									</a>
									<p class="mt-2 line-clamp-2 text-sm text-muted-foreground">{post.snippet}</p>
									<div class="mt-3 flex flex-wrap items-center gap-1.5">
										{#if post.authorUsername}
											<Badge href="/u/{post.authorUsername}" variant="outline" class="gap-1">
												<User class="size-3" />
												<span class="text-xs">u/{post.authorUsername}</span>
											</Badge>
										{:else}
											<Badge variant="outline" class="gap-1">
												<User class="size-3" />
												<span class="text-xs">{post.authorName}</span>
											</Badge>
										{/if}
										<Badge variant="outline" class="gap-1">
											<Calendar class="size-3" />
											<span class="text-xs">{new Date(post.createdAt).toLocaleDateString()}</span>
										</Badge>
										{#if (post.tags?.length ?? 0) > 0}
											{#each post.tags as tag}
												<Badge variant="secondary" class="gap-1 bg-secondary/50">
													<Tag class="size-3" />
													<span class="text-xs">{tag}</span>
												</Badge>
											{/each}
										{/if}
										{#if post.sourceType}
											<Badge variant="outline" class="gap-1 border-dashed bg-muted/30">
												<Archive class="size-3" />
												<span class="text-xs">
													{post.sourceType === 'chrome_import' ? 'Chrome Bookmark' : post.sourceType}
												</span>
											</Badge>
										{/if}
									</div>
									<div class="mt-3 flex items-center justify-between gap-3">
										<div class="flex items-center gap-3 text-xs text-muted-foreground">
											<span class="inline-flex items-center gap-1">
												<MessageSquare class="size-3.5" />
												{post.commentCount}
											</span>
											<span class="inline-flex items-center gap-1">
												<ThumbsUp class="size-3.5" />
												{post.likes ?? 0}
											</span>
											<span class="inline-flex items-center gap-1">
												<ThumbsDown class="size-3.5" />
												{post.dislikes ?? 0}
											</span>
										</div>
										<div class="flex items-center gap-2">
											<Button
												size="icon-sm"
												variant={post.userVote === 1 ? 'secondary' : 'ghost'}
												class={`h-7 w-7 ${post.userVote === 1 ? 'text-primary' : ''}`}
												disabled={!auth.isAuthenticated}
												onclick={() => vote(post._id, 1)}
												aria-label="Like"
											>
												<ThumbsUp class="size-3.5" />
											</Button>
											<Button
												size="icon-sm"
												variant={post.userVote === -1 ? 'secondary' : 'ghost'}
												class={`h-7 w-7 ${post.userVote === -1 ? 'text-destructive' : ''}`}
												disabled={!auth.isAuthenticated}
												onclick={() => vote(post._id, -1)}
												aria-label="Dislike"
											>
												<ThumbsDown class="size-3.5" />
											</Button>
											<a
												href="/post/{post._id}"
												class="ml-2 text-sm font-medium text-primary hover:underline"
											>
												Read more →
											</a>
										</div>
									</div>
								</CardContent>
							</Card>
						{/each}
					</div>
				{:else}
					<div
						class="grid auto-rows-auto gap-4 sm:grid-cols-2 lg:grid-cols-3"
						style="grid-auto-flow: dense;"
					>
						{#each feedQuery.data?.page ?? [] as post, index (post._id)}
							{@const isLarge = post.score > 30 || post.commentCount > 15}
							{@const isMedium = !isLarge && (post.score > 10 || post.commentCount > 5)}
							<article
								class={`group relative overflow-hidden bg-background transition-colors hover:bg-muted/20 ${
									isLarge ? 'sm:col-span-2 sm:row-span-2' : isMedium ? 'sm:row-span-2' : ''
								}`}
							>
								<div class="flex h-full flex-col p-5">
									<div class="flex-1">
										<h1
											class={`font-bold leading-tight tracking-tight ${
												isLarge
													? 'text-2xl sm:text-3xl lg:text-4xl'
													: isMedium
														? 'text-xl sm:text-2xl'
														: 'text-lg sm:text-xl'
											}`}
										>
											<a href="/post/{post._id}" class="hover:underline">
												{post.title}
											</a>
										</h1>
										<p
											class={`mt-3 text-muted-foreground ${
												isLarge ? 'line-clamp-6 text-base' : isMedium ? 'line-clamp-4 text-sm' : 'line-clamp-3 text-sm'
											}`}
										>
											{post.snippet}
										</p>
									</div>
									<div class="mt-4 space-y-3">
										<div class="flex flex-wrap items-center gap-1.5">
											{#if post.authorUsername}
												<Badge href="/u/{post.authorUsername}" variant="outline" class="gap-1">
													<User class="size-3" />
													<span class="text-xs">u/{post.authorUsername}</span>
												</Badge>
											{:else}
												<Badge variant="outline" class="gap-1">
													<User class="size-3" />
													<span class="text-xs">{post.authorName}</span>
												</Badge>
											{/if}
											<Badge variant="outline" class="gap-1">
												<Calendar class="size-3" />
												<span class="text-xs">{new Date(post.createdAt).toLocaleDateString()}</span>
											</Badge>
											{#if (post.tags?.length ?? 0) > 0}
												{#each post.tags as tag}
													<Badge variant="secondary" class="gap-1 bg-secondary/50">
														<Tag class="size-3" />
														<span class="text-xs">{tag}</span>
													</Badge>
												{/each}
											{/if}
											{#if post.sourceType}
												<Badge variant="outline" class="gap-1 border-dashed bg-muted/30">
													<Archive class="size-3" />
													<span class="text-xs">
														{post.sourceType === 'chrome_import' ? 'Chrome Bookmark' : post.sourceType}
													</span>
												</Badge>
											{/if}
										</div>
										<div class="flex items-center justify-between gap-3 text-xs text-muted-foreground">
											<div class="flex items-center gap-3">
												<span class="inline-flex items-center gap-1">
													<MessageSquare class="size-3.5" />
													{post.commentCount}
												</span>
												<span class="inline-flex items-center gap-1">
													<ThumbsUp class="size-3.5" />
													{post.likes ?? 0}
												</span>
												<span class="inline-flex items-center gap-1">
													<ThumbsDown class="size-3.5" />
													{post.dislikes ?? 0}
												</span>
											</div>
											<div class="flex items-center gap-1.5">
												<Button
													size="icon-sm"
													variant={post.userVote === 1 ? 'secondary' : 'ghost'}
													class={`h-7 w-7 ${post.userVote === 1 ? 'text-primary' : ''}`}
													disabled={!auth.isAuthenticated}
													onclick={() => vote(post._id, 1)}
													aria-label="Like"
												>
													<ThumbsUp class="size-3.5" />
												</Button>
												<Button
													size="icon-sm"
													variant={post.userVote === -1 ? 'secondary' : 'ghost'}
													class={`h-7 w-7 ${post.userVote === -1 ? 'text-destructive' : ''}`}
													disabled={!auth.isAuthenticated}
													onclick={() => vote(post._id, -1)}
													aria-label="Dislike"
												>
													<ThumbsDown class="size-3.5" />
												</Button>
											</div>
										</div>
										<a
											href="/post/{post._id}"
											class="inline-flex items-center text-sm font-medium text-primary hover:underline"
										>
											Read more →
										</a>
									</div>
								</div>
							</article>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</main>
