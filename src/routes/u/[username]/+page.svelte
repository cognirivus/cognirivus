<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';

	const auth = useAuth();
	const client = useConvexClient();
	const username = $derived(page.params.username);

	const profileQuery = useQuery((api as any).profiles.getByUsername, () => ({ username }));
	const feedQuery = useQuery((api as any).feed.listUser, () => ({
		username,
		tab: 'new',
		window: '30d',
		paginationOpts: { numItems: 20, cursor: null }
	}));

	async function follow() {
		if (!auth.isAuthenticated) {
			goto(`/signin?redirectTo=${encodeURIComponent(page.url.pathname + page.url.search)}`);
			return;
		}
		if (!profileQuery.data) return;
		try {
			const result = await client.mutation((api as any).social_graph.followUser, {
				targetAuthId: profileQuery.data.authId
			});
			toast.success(result.following ? 'Following user' : 'Unfollowed user');
		} catch (error: any) {
			toast.error(error?.message ?? 'Follow failed');
		}
	}
</script>

<main class="mx-auto max-w-4xl px-4 py-6 sm:px-6">
	{#if profileQuery.isLoading}
		<p class="text-sm text-muted-foreground">Loading profile...</p>
	{:else if !profileQuery.data}
		<p class="text-sm text-destructive">Profile not found.</p>
	{:else}
		<section class="rounded-lg border border-border bg-card p-5">
			<h1 class="text-2xl font-semibold tracking-tight">u/{profileQuery.data.username}</h1>
			<p class="mt-1 text-sm text-muted-foreground">{profileQuery.data.name}</p>
			<div class="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
				<span>{profileQuery.data.postCount} posts</span>
				<span>{profileQuery.data.followerCount} followers</span>
				<span>{profileQuery.data.followingCount} following</span>
			</div>
			<div class="mt-4">
				<Button variant="outline" onclick={follow}>Follow / Unfollow</Button>
			</div>
		</section>

		<section class="mt-5">
			<h2 class="mb-3 text-lg font-semibold">Recent Posts</h2>
			{#if (feedQuery.data?.page?.length ?? 0) === 0}
				<p class="text-sm text-muted-foreground">No posts yet.</p>
			{:else}
				<div class="space-y-3">
					{#each feedQuery.data?.page ?? [] as post (post._id)}
						<article class="rounded-lg border border-border bg-card p-4">
							<a href="/post/{post._id}" class="font-medium hover:underline">{post.title}</a>
							<p class="mt-1 line-clamp-2 text-sm text-muted-foreground">{post.snippet}</p>
							<p class="mt-2 text-xs text-muted-foreground">
								score {post.score} • {post.commentCount} comments
							</p>
						</article>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</main>

