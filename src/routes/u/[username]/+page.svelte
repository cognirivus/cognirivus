<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { FileText, UserRoundCheck, Users } from '@lucide/svelte';
	import { api } from '$convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
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

<main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
	<div class="mx-auto w-full max-w-4xl">
	{#if profileQuery.isLoading}
		<p class="text-sm text-muted-foreground">Loading profile...</p>
	{:else if !profileQuery.data}
		<p class="text-sm text-destructive">Profile not found.</p>
	{:else}
		<Card class="gap-0 py-5">
			<CardContent>
			<h1 class="text-2xl font-semibold tracking-tight">u/{profileQuery.data.username}</h1>
			<p class="mt-1 text-sm text-muted-foreground">{profileQuery.data.name}</p>
			<div class="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
				<span class="inline-flex items-center gap-1">
					<FileText class="size-3.5" />
					{profileQuery.data.postCount} posts
				</span>
				<span class="inline-flex items-center gap-1">
					<Users class="size-3.5" />
					{profileQuery.data.followerCount} followers
				</span>
				<span class="inline-flex items-center gap-1">
					<UserRoundCheck class="size-3.5" />
					{profileQuery.data.followingCount} following
				</span>
			</div>
			<div class="mt-4">
				<Button variant="outline" onclick={follow}>Follow / Unfollow</Button>
			</div>
			</CardContent>
		</Card>

		<section class="mt-5">
			<h2 class="mb-3 text-lg font-semibold">Recent Posts</h2>
			{#if (feedQuery.data?.page?.length ?? 0) === 0}
				<p class="text-sm text-muted-foreground">No posts yet.</p>
			{:else}
				<div class="space-y-3">
					{#each feedQuery.data?.page ?? [] as post (post._id)}
						<Card class="gap-0 py-4">
							<CardContent>
							<a href="/post/{post._id}" class="font-medium hover:underline">{post.title}</a>
							<p class="mt-1 line-clamp-2 text-sm text-muted-foreground">{post.snippet}</p>
							<p class="mt-2 text-xs text-muted-foreground">
								score {post.score} • {post.commentCount} comments
							</p>
							</CardContent>
						</Card>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
	</div>
</main>

