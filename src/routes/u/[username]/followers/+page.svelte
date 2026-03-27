<script lang="ts">
	import { page } from '$app/state';
	import { useAppAuth } from '$lib/auth.svelte';
	import { useQuery } from 'convex-svelte';
	import { Users } from '@lucide/svelte';
	import { api } from '$convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';

	type FollowUserListItem = {
		authId: string;
		name: string;
		username: string | null;
		image?: string | null;
		followedAt: number;
	};

	const auth = useAppAuth();
	const username = $derived(page.params.username);
	const listLimit = $derived(auth.isAuthenticated ? 100 : 10);
	const signInHref = $derived(
		`/signin?redirectTo=${encodeURIComponent(page.url.pathname + page.url.search)}`
	);
	const profileQuery = useQuery((api as any).profiles.getByUsername, () => ({ username }));
	const followersQuery = useQuery((api as any).social_graph.listFollowers, () => ({
		targetAuthId: profileQuery.data?.authId ?? '',
		limit: listLimit
	}));
	const followers = $derived((followersQuery.data ?? []) as Array<FollowUserListItem>);
	const showMoreForGuests = $derived(
		!auth.isAuthenticated && (profileQuery.data?.followerCount ?? 0) > 10
	);
</script>

<main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
	<div class="mx-auto w-full max-w-4xl">
		{#if profileQuery.isLoading}
			<p class="text-sm text-muted-foreground">Loading profile...</p>
		{:else if !profileQuery.data}
			<p class="text-sm text-destructive">Profile not found.</p>
		{:else}
			<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
				<div>
					<h1 class="text-2xl font-semibold tracking-tight">Followers</h1>
					<p class="text-sm text-muted-foreground">
						{profileQuery.data.followerCount} followers of u/{profileQuery.data.username}
					</p>
				</div>
				<div class="flex gap-2">
					<Button variant="outline" href="/u/{username}/following">Following</Button>
				</div>
			</div>

			{#if followersQuery.isLoading && profileQuery.data.followerCount > 0}
				<p class="text-sm text-muted-foreground">Loading followers...</p>
			{:else if followers.length === 0}
				<Card class="gap-0 py-4">
					<CardContent class="text-sm text-muted-foreground">No followers yet.</CardContent>
				</Card>
			{:else}
				<ul class="space-y-2">
					{#each followers as user (user.authId)}
						<li>
							<Card class="gap-0 py-3">
								<CardContent class="flex items-center justify-between gap-3">
									<div class="min-w-0">
										{#if user.username}
											<a
												class="inline-flex items-center gap-1 text-sm font-medium hover:underline"
												href="/u/{user.username}"
											>
												<Users class="size-3.5" />
												u/{user.username}
											</a>
										{:else}
											<p class="text-sm font-medium">{user.name}</p>
										{/if}
										<p class="truncate text-xs text-muted-foreground">{user.name}</p>
									</div>
									<span class="text-xs text-muted-foreground">
										{new Date(user.followedAt).toLocaleDateString()}
									</span>
								</CardContent>
							</Card>
						</li>
					{/each}
				</ul>
				{#if showMoreForGuests}
					<Card class="mt-3 gap-0 py-3">
						<CardContent class="text-sm text-muted-foreground">
							Showed first 10 followers.
							<a class="ml-1 font-medium underline hover:text-foreground" href={signInHref}>
								Sign in to see more
							</a>
						</CardContent>
					</Card>
				{/if}
			{/if}
		{/if}
	</div>
</main>
