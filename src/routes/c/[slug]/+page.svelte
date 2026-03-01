<script lang="ts">
	import { page } from '$app/state';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { Calendar, MessageSquare, ThumbsDown, ThumbsUp, User, Users } from '@lucide/svelte';
	import { api } from '$convex/_generated/api';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { toast } from 'svelte-sonner';

	type FeedTab = 'new' | 'top' | 'discussed';

	const auth = useAuth();
	const client = useConvexClient();
	const slug = $derived(page.params.slug);
	const tab = $derived((page.url.searchParams.get('tab') as FeedTab | null) ?? 'new');
	const signInHref = $derived(
		`/signin?redirectTo=${encodeURIComponent(page.url.pathname + page.url.search)}`
	);

	const communityQuery = useQuery((api as any).communities.getBySlug, () => ({ slug }));
	const followingQuery = useQuery((api as any).social_graph.listFollowing, {});
	const feedQuery = useQuery((api as any).feed.listCommunity, () => ({
		slug,
		tab,
		window: '24h',
		paginationOpts: { numItems: 20, cursor: null }
	}));
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

<main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
	{#if communityQuery.isLoading}
		<p class="text-sm text-muted-foreground">Loading community...</p>
	{:else if !communityQuery.data}
		<p class="text-sm text-destructive">Community not found.</p>
	{:else}
		<Card class="gap-0 py-5">
			<CardContent>
			<h1 class="text-2xl font-semibold tracking-tight">c/{communityQuery.data.community.slug}</h1>
			<p class="mt-1 text-sm text-muted-foreground">{communityQuery.data.community.description}</p>
			<div class="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
				<a href="/c/{slug}/members" class="inline-flex items-center gap-1 hover:underline">
					<Users class="size-3.5" />
					{communityQuery.data.community.memberCount} members
				</a>
				<span>•</span>
				<span>{communityQuery.data.community.visibility}</span>
				<span>•</span>
				<span>membership: {communityQuery.data.membershipStatus}</span>
			</div>
			<div class="mt-4 flex flex-wrap gap-2">
				{#if communityQuery.data.membershipStatus === 'active'}
					<Button variant="secondary" disabled>Joined</Button>
				{:else if communityQuery.data.membershipStatus === 'pending'}
					<Button variant="secondary" disabled>Request Pending</Button>
				{:else}
					<Button variant="outline" disabled={!auth.isAuthenticated} onclick={requestJoin}>
						Join / Request
					</Button>
				{/if}
				<Button
					variant={isFollowing ? 'secondary' : 'outline'}
					disabled={!auth.isAuthenticated}
					onclick={followCommunity}
				>
					{isFollowing ? 'Following' : 'Follow'}
				</Button>
				{#if communityQuery.data.canRead}
					<Button href={`/c/${communityQuery.data.community.slug}/chat`} variant="outline">
						<MessageSquare class="mr-1.5 h-4 w-4" />
						Chat
					</Button>
				{/if}
				{#if communityQuery.data.canPost}
					<Button href="/submit">Submit in Community</Button>
				{/if}
				{#if communityQuery.data.isManager}
					<Button variant="outline" href={`/c/${communityQuery.data.community.slug}/manage`}>
						Manage Requests
					</Button>
				{/if}
			</div>
			{#if !auth.isAuthenticated}
				<p class="mt-3 text-xs text-muted-foreground">
					Sign in to join or follow this community.
					<a class="ml-1 underline" href={signInHref}>Sign in</a>
				</p>
			{/if}
			</CardContent>
		</Card>

		<section class="mt-5">
			<div class="mb-3 flex items-center gap-2">
				{#each ['new', 'top', 'discussed'] as t (t)}
					<Button variant={tab === t ? 'default' : 'outline'} size="sm" href={`/c/${slug}?tab=${t}`}>{t}</Button>
				{/each}
			</div>

			{#if feedQuery.error}
				<p class="text-sm text-destructive">{feedQuery.error.message}</p>
			{:else if (feedQuery.data?.page?.length ?? 0) === 0}
				<p class="text-sm text-muted-foreground">No posts in this community yet.</p>
			{:else}
				<div class="space-y-3">
					{#each feedQuery.data?.page ?? [] as post (post._id)}
						<Card class="gap-0 py-4">
							<CardContent>
								<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
									<div class="min-w-0 flex-1">
										<div class="flex items-start justify-between gap-3">
											<a href="/post/{post._id}" class="line-clamp-2 text-base font-medium hover:underline">
												{post.title}
											</a>
											<span class="hidden shrink-0 items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground sm:inline-flex">
												<Calendar class="size-3.5" />
												{new Date(post.createdAt).toLocaleString()}
											</span>
										</div>
										<p class="mt-1 line-clamp-2 text-sm text-muted-foreground">{post.snippet}</p>
										<span class="mt-2 inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground sm:hidden">
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
			{/if}
		</section>
	{/if}
</main>

