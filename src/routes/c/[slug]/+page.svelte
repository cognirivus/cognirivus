<script lang="ts">
	import { page } from '$app/state';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
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
	const feedQuery = useQuery((api as any).feed.listCommunity, () => ({
		slug,
		tab,
		window: '24h',
		paginationOpts: { numItems: 20, cursor: null }
	}));

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
			toast.success(result.following ? 'Following community' : 'Unfollowed community');
		} catch (error: any) {
			toast.error(error?.message ?? 'Follow failed');
		}
	}
</script>

<main class="mx-auto max-w-5xl px-4 py-6 sm:px-6">
	{#if communityQuery.isLoading}
		<p class="text-sm text-muted-foreground">Loading community...</p>
	{:else if !communityQuery.data}
		<p class="text-sm text-destructive">Community not found.</p>
	{:else}
		<section class="rounded-lg border border-border bg-card p-5">
			<h1 class="text-2xl font-semibold tracking-tight">c/{communityQuery.data.community.slug}</h1>
			<p class="mt-1 text-sm text-muted-foreground">{communityQuery.data.community.description}</p>
			<div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
				<span>{communityQuery.data.community.memberCount} members</span>
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
				<Button variant="outline" disabled={!auth.isAuthenticated} onclick={followCommunity}>
					Follow
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
		</section>

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
						<article class="rounded-lg border border-border bg-card p-4">
							<a href="/post/{post._id}" class="font-medium hover:underline">{post.title}</a>
							<p class="mt-1 line-clamp-2 text-sm text-muted-foreground">{post.snippet}</p>
							<p class="mt-2 text-xs text-muted-foreground">
								score {post.score} • {post.commentCount} comments • u/{post.authorUsername ?? post.authorName}
							</p>
						</article>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</main>

