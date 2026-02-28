<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';

	const auth = useAuth();
	const client = useConvexClient();

	const publicCommunitiesQuery = useQuery((api as any).communities.listPublic, { limit: 100 });
	const myCommunitiesQuery = useQuery((api as any).communities.listMine, {});
	const myMembershipByCommunityId = $derived.by(() => {
		const membershipMap = new Map<
			string,
			{
				membershipStatus: 'active' | 'pending' | 'none' | 'rejected';
				membershipRole: 'owner' | 'admin' | 'member';
			}
		>();
		for (const item of myCommunitiesQuery.data ?? []) {
			membershipMap.set(item.community._id, {
				membershipStatus: item.membershipStatus,
				membershipRole: item.membershipRole
			});
		}
		return membershipMap;
	});

	async function requestJoin(communityId: string) {
		if (!auth.isAuthenticated) {
			return;
		}
		try {
			const result = await client.mutation((api as any).communities.requestJoin, { communityId });
			toast.success(result.status === 'active' ? 'Joined community' : 'Join request submitted');
		} catch (error: any) {
			toast.error(error?.message ?? 'Join failed');
		}
	}

	function signinForCommunities() {
		goto(`/signin?redirectTo=${encodeURIComponent(page.url.pathname + page.url.search)}`);
	}
</script>

<main class="mx-auto max-w-6xl px-4 py-6 sm:px-6">
	<div class="mb-6 flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Communities</h1>
			<p class="text-sm text-muted-foreground">
				Discover public communities and collaborate in focused spaces.
			</p>
		</div>
		{#if auth.isAuthenticated}
			<Button href="/c/new">Create Community</Button>
		{:else}
			<Button variant="outline" onclick={signinForCommunities}>Sign in to create</Button>
		{/if}
	</div>

	{#if auth.isAuthenticated}
		<section class="mb-8">
			<h2 class="mb-3 text-lg font-semibold">My Communities</h2>
			{#if (myCommunitiesQuery.data?.length ?? 0) === 0}
				<p class="text-sm text-muted-foreground">You have not joined any communities yet.</p>
			{:else}
				<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{#each myCommunitiesQuery.data ?? [] as item (item.community._id)}
						<article class="rounded-lg border border-border bg-card p-4">
							<a href={`/c/${item.community.slug}`} class="font-medium hover:underline">
								c/{item.community.slug}
							</a>
							<p class="mt-1 line-clamp-2 text-sm text-muted-foreground">
								{item.community.description}
							</p>
							<p class="mt-2 text-xs text-muted-foreground">
								status {item.membershipStatus} | role {item.membershipRole}
							</p>
							<div class="mt-3 flex flex-wrap gap-2">
								<Button size="sm" variant="outline" href={`/c/${item.community.slug}`}>
									Open
								</Button>
								{#if item.membershipRole === 'owner' || item.membershipRole === 'admin'}
									<Button size="sm" variant="outline" href={`/c/${item.community.slug}/manage`}>
										Manage
									</Button>
								{/if}
							</div>
						</article>
					{/each}
				</div>
			{/if}
		</section>
	{/if}

	<section>
		<h2 class="mb-3 text-lg font-semibold">Public Communities</h2>
		{#if publicCommunitiesQuery.isLoading}
			<p class="text-sm text-muted-foreground">Loading communities...</p>
		{:else if (publicCommunitiesQuery.data?.length ?? 0) === 0}
			<p class="text-sm text-muted-foreground">No public communities yet.</p>
		{:else}
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{#each publicCommunitiesQuery.data ?? [] as community (community._id)}
					{@const membership = myMembershipByCommunityId.get(community._id)}
					<article class="rounded-lg border border-border bg-card p-4">
						<a href={`/c/${community.slug}`} class="font-medium hover:underline">
							c/{community.slug}
						</a>
						<p class="mt-1 line-clamp-2 text-sm text-muted-foreground">{community.description}</p>
						<p class="mt-2 text-xs text-muted-foreground">
							{community.memberCount} members | {community.visibility}
						</p>
						<div class="mt-3 flex flex-wrap gap-2">
							<Button size="sm" variant="outline" href={`/c/${community.slug}`}>Open</Button>
							{#if !auth.isAuthenticated}
								<Button size="sm" disabled>Join</Button>
							{:else if membership?.membershipStatus === 'active'}
								<Button size="sm" variant="secondary" disabled>Joined</Button>
							{:else if membership?.membershipStatus === 'pending'}
								<Button size="sm" variant="secondary" disabled>Requested</Button>
							{:else}
								<Button size="sm" onclick={() => requestJoin(community._id)}>Join</Button>
							{/if}
							{#if membership?.membershipRole === 'owner' || membership?.membershipRole === 'admin'}
								<Button size="sm" variant="outline" href={`/c/${community.slug}/manage`}>
									Manage
								</Button>
							{/if}
						</div>
					</article>
				{/each}
			</div>
			{#if !auth.isAuthenticated}
				<div class="mt-4 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
					Sign in to join communities, vote, comment, and follow.
				</div>
			{/if}
		{/if}
	</section>
</main>
