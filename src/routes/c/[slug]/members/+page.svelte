<script lang="ts">
	import { page } from '$app/state';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { Crown, Loader2, Shield, User, UserMinus, Users } from '@lucide/svelte';
	import { api } from '$convex/_generated/api';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import CommunitySubpageHeader from '$lib/components/community/CommunitySubpageHeader.svelte';
	import { toast } from 'svelte-sonner';

	type MemberItem = {
		membershipId: string;
		userAuthId: string;
		role: 'owner' | 'admin' | 'member';
		joinedAt: number;
		name: string;
		username: string | null;
		image?: string | null;
	};

	const PAGE_SIZE = 25;

	const slug = $derived(page.params.slug);
	const client = useConvexClient();
	const communityQuery = useQuery((api as any).communities.getBySlug, () => ({ slug }));
	const currentUserQuery = useQuery(api.auth.getCurrentUser, {});

	let allMembers = $state<Array<MemberItem>>([]);
	let continueCursor = $state<string | null>(null);
	let isDone = $state(false);
	let loading = $state(false);
	let initialized = $state(false);
	let removingMembershipId = $state<string | null>(null);

	function resetMembersState() {
		initialized = false;
		allMembers = [];
		continueCursor = null;
		isDone = false;
	}

	async function loadPage(cursor: string | null) {
		if (!communityQuery.data) return;
		loading = true;
		try {
			const result = await client.query((api as any).communities.listMembers, {
				communityId: communityQuery.data.community._id,
				paginationOpts: { numItems: PAGE_SIZE, cursor }
			});
			if (cursor === null) {
				allMembers = result.page;
			} else {
				allMembers = [...allMembers, ...result.page];
			}
			continueCursor = result.continueCursor;
			isDone = result.isDone;
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to load members');
		} finally {
			loading = false;
			initialized = true;
		}
	}

	$effect(() => {
		if (!communityQuery.isLoading && communityQuery.data && !initialized) {
			loadPage(null);
		}
	});

	$effect(() => {
		const slugKey = slug;
		resetMembersState();
		if (!slugKey) return;
	});

	const roleIcon = {
		owner: Crown,
		admin: Shield,
		member: User
	} as const;

	const roleLabel = {
		owner: 'Owner',
		admin: 'Admin',
		member: 'Member'
	} as const;

	const AVATAR_COLORS = [
		'bg-rose-500',
		'bg-blue-500',
		'bg-emerald-500',
		'bg-amber-500',
		'bg-violet-500',
		'bg-cyan-500',
		'bg-pink-500',
		'bg-indigo-500'
	];

	function nameToColor(name: string): string {
		let hash = 0;
		for (let i = 0; i < name.length; i++) {
			hash = name.charCodeAt(i) + ((hash << 5) - hash);
		}
		return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
	}

	function roleBadgeVariant(role: 'owner' | 'admin' | 'member') {
		if (role === 'owner') return 'default' as const;
		if (role === 'admin') return 'secondary' as const;
		return 'outline' as const;
	}

	function canRemoveMember(member: MemberItem) {
		if (!communityQuery.data?.isManager) return false;
		if (!communityQuery.data.membershipRole) return false;
		if (currentUserQuery.data?.id === member.userAuthId) return false;
		if (member.role === 'owner') return false;
		if (communityQuery.data.membershipRole === 'owner') return true;
		return member.role === 'member';
	}

	async function removeMember(member: MemberItem) {
		removingMembershipId = member.membershipId;
		try {
			await client.mutation((api as any).communities.removeMember, {
				membershipId: member.membershipId
			});
			toast.success(`Removed ${member.username ? `u/${member.username}` : member.name}`);
			await loadPage(null);
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to remove member');
		} finally {
			removingMembershipId = null;
		}
	}
</script>

<main class="mx-auto w-full max-w-6xl overflow-x-hidden px-4 py-6 sm:px-6">
	{#if communityQuery.isLoading}
		<div class="flex flex-col items-center justify-center py-20">
			<Loader2 class="size-6 animate-spin text-muted-foreground" />
			<p class="mt-3 text-sm text-muted-foreground">Loading community…</p>
		</div>
	{:else if !communityQuery.data}
		<div class="flex flex-col items-center justify-center py-20">
			<Users class="size-8 text-muted-foreground/50" />
			<p class="mt-3 text-sm text-destructive">Community not found.</p>
		</div>
	{:else}
		<CommunitySubpageHeader communityData={communityQuery.data} activeNav="members" />

		<div class="mt-6">
			<!-- Section header -->
			<div class="mb-4 flex items-center justify-between">
				<div>
					<h2 class="text-lg font-semibold tracking-tight">Members</h2>
					<p class="text-sm text-muted-foreground">
						{allMembers.length} of {communityQuery.data.community.memberCount} members
					</p>
				</div>
			</div>

			{#if !initialized && loading}
				<div class="flex items-center justify-center py-12">
					<Loader2 class="size-5 animate-spin text-muted-foreground" />
					<span class="ml-2 text-sm text-muted-foreground">Loading members…</span>
				</div>
			{:else if initialized && allMembers.length === 0}
				<div class="flex flex-col items-center justify-center rounded-lg border bg-card py-12">
					<Users class="size-8 text-muted-foreground/40" />
					<p class="mt-3 text-sm text-muted-foreground">No members yet</p>
				</div>
			{:else if allMembers.length > 0}
				<div class="space-y-2">
					{#each allMembers as member (member.userAuthId)}
						{@const displayName = member.username ?? member.name}
						{@const avatarLetter = displayName.charAt(0).toUpperCase()}
						{@const RoleIcon = roleIcon[member.role]}
						<div class="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
							<!-- Avatar -->
							<div
								class="{nameToColor(
									displayName
								)} flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
							>
								{avatarLetter}
							</div>

							<!-- Name + role -->
							<div class="min-w-0 flex-1">
								<div class="flex flex-wrap items-center gap-2">
									{#if member.username}
										<a href="/u/{member.username}" class="text-sm font-medium hover:underline">
											u/{member.username}
										</a>
									{:else}
										<span class="text-sm font-medium">{member.name}</span>
									{/if}
									<Badge variant={roleBadgeVariant(member.role)} class="gap-1 text-[11px]">
										<RoleIcon class="size-3" />
										{roleLabel[member.role]}
									</Badge>
								</div>
							</div>

							<!-- Joined date -->
							<span class="hidden shrink-0 text-xs text-muted-foreground sm:block">
								Joined {new Date(member.joinedAt).toLocaleDateString()}
							</span>
							{#if canRemoveMember(member)}
								<Button
									variant="outline"
									size="sm"
									disabled={removingMembershipId === member.membershipId}
									onclick={() => removeMember(member)}
								>
									<UserMinus class="size-3.5" />
									Remove
								</Button>
							{/if}
						</div>
					{/each}
				</div>

				<!-- Load more -->
				{#if !isDone}
					<div class="mt-4 flex justify-center">
						<Button
							variant="outline"
							size="sm"
							disabled={loading}
							onclick={() => loadPage(continueCursor)}
						>
							{#if loading}
								<Loader2 class="mr-2 size-4 animate-spin" />
								Loading…
							{:else}
								Load More
							{/if}
						</Button>
					</div>
				{/if}
			{/if}
		</div>
	{/if}
</main>
