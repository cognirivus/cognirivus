<script lang="ts">
	import { page } from '$app/state';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { Crown, Shield, User, Users } from '@lucide/svelte';
	import { api } from '$convex/_generated/api';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { toast } from 'svelte-sonner';

	type MemberItem = {
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

	let allMembers = $state<Array<MemberItem>>([]);
	let continueCursor = $state<string | null>(null);
	let isDone = $state(false);
	let loading = $state(false);
	let initialized = $state(false);

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
</script>

<main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
	<div class="mx-auto w-full max-w-4xl">
		{#if communityQuery.isLoading}
			<p class="text-sm text-muted-foreground">Loading community...</p>
		{:else if !communityQuery.data}
			<p class="text-sm text-destructive">Community not found.</p>
		{:else}
			<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
				<div>
					<h1 class="text-2xl font-semibold tracking-tight">Members</h1>
					<p class="text-sm text-muted-foreground">
						{communityQuery.data.community.memberCount} members in c/{communityQuery.data.community
							.slug}
					</p>
				</div>
				<Button variant="outline" href="/c/{slug}">Back to Community</Button>
			</div>

			{#if !initialized && loading}
				<p class="text-sm text-muted-foreground">Loading members...</p>
			{:else if initialized && allMembers.length === 0}
				<Card class="gap-0 py-4">
					<CardContent class="text-sm text-muted-foreground">No members yet.</CardContent>
				</Card>
			{:else if allMembers.length > 0}
				<Card class="gap-0 overflow-hidden py-0">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>User</Table.Head>
								<Table.Head>Name</Table.Head>
								<Table.Head>Role</Table.Head>
								<Table.Head class="hidden sm:table-cell">Joined</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each allMembers as member (member.userAuthId)}
								<Table.Row>
									<Table.Cell class="font-medium">
										{#if member.username}
											<a
												class="inline-flex items-center gap-1 hover:underline"
												href="/u/{member.username}"
											>
												<Users class="size-3.5" />
												u/{member.username}
											</a>
										{:else}
											<span class="text-muted-foreground">—</span>
										{/if}
									</Table.Cell>
									<Table.Cell class="text-muted-foreground">{member.name}</Table.Cell>
									<Table.Cell>
										{@const RoleIcon = roleIcon[member.role]}
										<Badge variant="outline" class="gap-1 text-xs">
											<RoleIcon class="size-3" />
											{roleLabel[member.role]}
										</Badge>
									</Table.Cell>
									<Table.Cell class="hidden text-muted-foreground sm:table-cell">
										{new Date(member.joinedAt).toLocaleDateString()}
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</Card>

				<div class="mt-3 flex items-center justify-between">
					<p class="text-xs text-muted-foreground">
						Showing {allMembers.length} of {communityQuery.data.community.memberCount} members
					</p>
					{#if !isDone}
						<Button
							variant="outline"
							size="sm"
							disabled={loading}
							onclick={() => loadPage(continueCursor)}
						>
							{loading ? 'Loading...' : 'Load More'}
						</Button>
					{/if}
				</div>
			{/if}
		{/if}
	</div>
</main>
