<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { Compass, Globe, Plus, Search, Settings, ShieldCheck, Users } from '@lucide/svelte';
	import { api } from '$convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { toast } from 'svelte-sonner';

	const auth = useAuth();
	const client = useConvexClient();

	const publicCommunitiesQuery = useQuery((api as any).communities.listPublic, { limit: 100 });
	const myCommunitiesQuery = useQuery((api as any).communities.listMine, {});
	const myMembershipByCommunityId = $derived.by(() => {
		const membershipByCommunityId: Record<
			string,
			{
				membershipStatus: 'active' | 'pending' | 'none' | 'rejected';
				membershipRole: 'owner' | 'admin' | 'member';
			}
		> = {};
		for (const item of myCommunitiesQuery.data ?? []) {
			membershipByCommunityId[item.community._id] = {
				membershipStatus: item.membershipStatus,
				membershipRole: item.membershipRole
			};
		}
		return membershipByCommunityId;
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

	let activeTab = $state('mine');
	let searchQuery = $state('');

	const AVATAR_COLORS = [
		'bg-rose-500',
		'bg-orange-500',
		'bg-amber-500',
		'bg-emerald-500',
		'bg-teal-500',
		'bg-cyan-500',
		'bg-blue-500',
		'bg-indigo-500',
		'bg-violet-500',
		'bg-fuchsia-500',
		'bg-pink-500',
		'bg-lime-500'
	];

	function slugToColor(slug: string): string {
		let hash = 0;
		for (let i = 0; i < slug.length; i++) {
			hash = slug.charCodeAt(i) + ((hash << 5) - hash);
		}
		return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
	}

	const filteredPublicCommunities = $derived.by(() => {
		const communities = publicCommunitiesQuery.data ?? [];
		if (!searchQuery.trim()) return communities;
		const q = searchQuery.toLowerCase();
		return communities.filter(
			(c: any) =>
				c.slug.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q)
		);
	});

	const ROLE_LABELS: Record<string, string> = {
		owner: 'Owner',
		admin: 'Admin',
		member: 'Member'
	};
</script>

<main class="mx-auto w-full max-w-6xl overflow-x-hidden px-4 py-6 sm:px-6">
	<div class="mb-6 flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Communities</h1>
			<p class="text-sm text-muted-foreground">
				Discover public communities and collaborate in focused spaces.
			</p>
		</div>
		{#if auth.isAuthenticated}
			<Button href="/c/new">
				<Plus class="size-4" />
				Create Community
			</Button>
		{:else}
			<Button variant="outline" onclick={signinForCommunities}>Sign in to create</Button>
		{/if}
	</div>

	<Tabs bind:value={activeTab}>
		<TabsList class="mb-6 grid w-full grid-cols-2 sm:inline-flex sm:w-auto">
			<TabsTrigger value="mine">My Communities</TabsTrigger>
			<TabsTrigger value="discover">Discover</TabsTrigger>
		</TabsList>

		<!-- My Communities Tab -->
		<TabsContent value="mine">
			{#if !auth.isAuthenticated}
				<div class="flex flex-col items-center justify-center py-16 text-center">
					<div
						class="mb-4 flex size-14 items-center justify-center rounded-full bg-muted"
					>
						<Compass class="size-7 text-muted-foreground" />
					</div>
					<h3 class="mb-1 text-lg font-medium">Sign in to see your communities</h3>
					<p class="mb-4 max-w-sm text-sm text-muted-foreground">
						Sign in to join communities, vote, comment, and follow.
					</p>
					<Button onclick={signinForCommunities}>Sign In</Button>
				</div>
			{:else if (myCommunitiesQuery.data?.length ?? 0) === 0}
				<div class="flex flex-col items-center justify-center py-16 text-center">
					<div
						class="mb-4 flex size-14 items-center justify-center rounded-full bg-muted"
					>
						<Compass class="size-7 text-muted-foreground" />
					</div>
					<h3 class="mb-1 text-lg font-medium">You haven't joined any communities yet</h3>
					<p class="mb-4 max-w-sm text-sm text-muted-foreground">
						Explore public communities and find your people.
					</p>
					<Button onclick={() => (activeTab = 'discover')}>Discover Communities</Button>
				</div>
			{:else}
				<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{#each myCommunitiesQuery.data ?? [] as item (item.community._id)}
						{@const color = slugToColor(item.community.slug)}
						<Card class="gap-0 py-0 overflow-hidden">
							<CardContent class="p-4">
								<div class="flex items-start gap-3">
									<div
										class="{color} flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
									>
										{item.community.slug.charAt(0).toUpperCase()}
									</div>
									<div class="min-w-0 flex-1">
										<a
											href={`/c/${item.community.slug}`}
											class="font-medium hover:underline"
										>
											c/{item.community.slug}
										</a>
										{#if item.community.description}
											<p class="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
												{item.community.description}
											</p>
										{/if}
									</div>
								</div>

								<div class="mt-3 flex flex-wrap items-center gap-2">
									<Badge variant="secondary">
										{ROLE_LABELS[item.membershipRole] ?? item.membershipRole}
									</Badge>
									<span class="inline-flex items-center gap-1 text-xs text-muted-foreground">
										{#if item.community.visibility === 'public'}
											<Globe class="size-3.5" />
										{:else}
											<ShieldCheck class="size-3.5" />
										{/if}
										{item.community.visibility}
									</span>
									{#if item.community.memberCount != null}
										<span class="inline-flex items-center gap-1 text-xs text-muted-foreground">
											<Users class="size-3.5" />
											{item.community.memberCount}
										</span>
									{/if}
								</div>

								<div class="mt-3 flex flex-wrap gap-2">
									<Button size="sm" variant="outline" href={`/c/${item.community.slug}`}>
										View
									</Button>
									{#if item.membershipRole === 'owner' || item.membershipRole === 'admin'}
										<Button
											size="sm"
											variant="outline"
											href={`/c/${item.community.slug}/manage`}
										>
											<Settings class="size-3.5" />
											Manage
										</Button>
									{/if}
								</div>
							</CardContent>
						</Card>
					{/each}
				</div>
			{/if}
		</TabsContent>

		<!-- Discover Tab -->
		<TabsContent value="discover">
			<div class="relative mb-4">
				<Search class="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					placeholder="Search communities..."
					class="pl-9"
					bind:value={searchQuery}
				/>
			</div>

			{#if publicCommunitiesQuery.isLoading}
				<div class="flex items-center justify-center py-16">
					<p class="text-sm text-muted-foreground">Loading communities...</p>
				</div>
			{:else if filteredPublicCommunities.length === 0}
				<div class="flex flex-col items-center justify-center py-16 text-center">
					<div
						class="mb-4 flex size-14 items-center justify-center rounded-full bg-muted"
					>
						<Users class="size-7 text-muted-foreground" />
					</div>
					<h3 class="mb-1 text-lg font-medium">No communities found</h3>
					<p class="mb-4 max-w-sm text-sm text-muted-foreground">
						{#if searchQuery.trim()}
							No communities match your search. Try different keywords.
						{:else}
							Be the first to create a community!
						{/if}
					</p>
					{#if auth.isAuthenticated}
						<Button href="/c/new">
							<Plus class="size-4" />
							Create Community
						</Button>
					{/if}
				</div>
			{:else}
				<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{#each filteredPublicCommunities as community (community._id)}
						{@const membership = myMembershipByCommunityId[community._id]}
						{@const color = slugToColor(community.slug)}
						<Card class="gap-0 py-0 overflow-hidden">
							<CardContent class="p-4">
								<div class="flex items-start gap-3">
									<div
										class="{color} flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
									>
										{community.slug.charAt(0).toUpperCase()}
									</div>
									<div class="min-w-0 flex-1">
										<a
											href={`/c/${community.slug}`}
											class="font-medium hover:underline"
										>
											c/{community.slug}
										</a>
										{#if community.description}
											<p class="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
												{community.description}
											</p>
										{/if}
									</div>
								</div>

								<div class="mt-3 flex flex-wrap items-center gap-2">
									<span class="inline-flex items-center gap-1 text-xs text-muted-foreground">
										{#if community.visibility === 'public'}
											<Globe class="size-3.5" />
										{:else}
											<ShieldCheck class="size-3.5" />
										{/if}
										{community.visibility}
									</span>
									<span class="inline-flex items-center gap-1 text-xs text-muted-foreground">
										<Users class="size-3.5" />
										{community.memberCount} members
									</span>
									{#if membership?.membershipStatus === 'active'}
										<Badge variant="secondary">
											{ROLE_LABELS[membership.membershipRole] ?? membership.membershipRole}
										</Badge>
									{/if}
								</div>

								<div class="mt-3 flex flex-wrap gap-2">
									{#if !auth.isAuthenticated}
										<Button size="sm" onclick={signinForCommunities}>Join</Button>
									{:else if membership?.membershipStatus === 'active'}
										<Button size="sm" variant="secondary" disabled>Joined</Button>
									{:else if membership?.membershipStatus === 'pending'}
										<Button size="sm" variant="secondary" disabled>Requested</Button>
									{:else}
										<Button size="sm" onclick={() => requestJoin(community._id)}>
											Join
										</Button>
									{/if}
									{#if membership?.membershipRole === 'owner' || membership?.membershipRole === 'admin'}
										<Button
											size="sm"
											variant="outline"
											href={`/c/${community.slug}/manage`}
										>
											<Settings class="size-3.5" />
											Manage
										</Button>
									{/if}
								</div>
							</CardContent>
						</Card>
					{/each}
				</div>
				{#if !auth.isAuthenticated}
					<div
						class="mt-4 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground"
					>
						Sign in to join communities, vote, comment, and follow.
					</div>
				{/if}
			{/if}
		</TabsContent>
	</Tabs>
</main>
