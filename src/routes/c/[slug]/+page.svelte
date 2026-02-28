<script lang="ts">
	import { page } from '$app/state';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { Calendar, Users } from '@lucide/svelte';
	import { api } from '$convex/_generated/api';
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
				<span class="inline-flex items-center gap-1">
					<Users class="size-3.5" />
					{communityQuery.data.community.memberCount} members
				</span>
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
							<a href="/post/{post._id}" class="font-medium hover:underline">{post.title}</a>
							<p class="mt-1 line-clamp-2 text-sm text-muted-foreground">{post.snippet}</p>
							<p class="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
								<span>score {post.score}</span>
								<span>{post.commentCount} comments</span>
								{#if post.authorUsername}
									<a class="hover:underline" href="/u/{post.authorUsername}">
										u/{post.authorUsername}
									</a>
								{:else}
									<span>{post.authorName}</span>
								{/if}
								<span class="inline-flex items-center gap-1">
									<Calendar class="size-3.5" />
									{new Date(post.createdAt).toLocaleDateString()}
								</span>
							</p>
							</CardContent>
						</Card>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</main>

