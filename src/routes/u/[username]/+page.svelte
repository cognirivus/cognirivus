<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { FileText, MessageSquare, UserRoundCheck, Users } from '@lucide/svelte';
	import { api } from '$convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { toast } from 'svelte-sonner';

	const auth = useAuth();
	const client = useConvexClient();
	const username = $derived(page.params.username);

	const profileQuery = useQuery((api as any).profiles.getByUsername, () => ({ username }));
	const currentUserQuery = useQuery((api as any).auth.getCurrentUser, {});
	const followingQuery = useQuery((api as any).social_graph.listFollowing, {});
	const feedQuery = useQuery((api as any).feed.listUser, () => ({
		username,
		tab: 'new',
		window: '30d',
		paginationOpts: { numItems: 20, cursor: null }
	}));
	let followOverride = $state<boolean | null>(null);
	let followOverrideAuthId = $state<string | null>(null);
	const targetAuthId = $derived(profileQuery.data?.authId ?? null);
	const isFollowing = $derived.by(() => {
		if (!targetAuthId || !auth.isAuthenticated) {
			return false;
		}
		if (followOverrideAuthId === targetAuthId && followOverride !== null) {
			return followOverride;
		}
		return (followingQuery.data?.userIds ?? []).includes(targetAuthId);
	});
	const isOwnProfile = $derived(
		!!targetAuthId && auth.isAuthenticated && currentUserQuery.data?.id === targetAuthId
	);

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
			followOverrideAuthId = profileQuery.data.authId;
			followOverride = result.following;
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
						<a
							class="inline-flex items-center gap-1 hover:text-foreground hover:underline"
							href="/u/{username}/followers"
						>
							<Users class="size-3.5" />
							{profileQuery.data.followerCount} followers
						</a>
						<a
							class="inline-flex items-center gap-1 hover:text-foreground hover:underline"
							href="/u/{username}/following"
						>
							<UserRoundCheck class="size-3.5" />
							{profileQuery.data.followingCount} following
						</a>
					</div>
					<div class="mt-4 flex items-center gap-2">
						<Button
							variant={isFollowing ? 'secondary' : 'outline'}
							disabled={isOwnProfile}
							onclick={follow}
						>
							{isOwnProfile ? 'Your profile' : isFollowing ? 'Unfollow' : 'Follow'}
						</Button>
						{#if !isOwnProfile && auth.isAuthenticated}
							<Button variant="outline" onclick={() => goto(`/chat/${username}`)}>
								<MessageSquare class="mr-2 size-4" />
								Message
							</Button>
						{/if}
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
