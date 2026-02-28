<script lang="ts">
	import { page } from '$app/state';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';

	const client = useConvexClient();
	const slug = $derived(page.params.slug);

	const communityQuery = useQuery((api as any).communities.getBySlug, () => ({ slug }));

	type PendingRequest = {
		membershipId: string;
		userAuthId: string;
		requestedAt: number;
		requesterName: string;
		requesterEmail: string;
		requesterUsername: string | null;
	};

	let pendingRequests = $state<Array<PendingRequest>>([]);
	let loadingRequests = $state(false);
	let initialized = $state(false);

	$effect(() => {
		slug;
		initialized = false;
		pendingRequests = [];
	});

	async function refreshPendingRequests() {
		if (!communityQuery.data?.isManager) {
			pendingRequests = [];
			initialized = true;
			return;
		}

		loadingRequests = true;
		try {
			const rows = await client.query((api as any).communities.listPendingRequests, {
				communityId: communityQuery.data.community._id
			});
			pendingRequests = rows as Array<PendingRequest>;
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to load pending requests');
		} finally {
			loadingRequests = false;
			initialized = true;
		}
	}

	$effect(() => {
		if (!communityQuery.isLoading && communityQuery.data && !initialized) {
			refreshPendingRequests();
		}
	});

	async function approve(membershipId: string) {
		try {
			await client.mutation((api as any).communities.approveJoin, { membershipId });
			toast.success('Join request approved');
			await refreshPendingRequests();
		} catch (error: any) {
			toast.error(error?.message ?? 'Approve failed');
		}
	}

	async function reject(membershipId: string) {
		try {
			await client.mutation((api as any).communities.rejectJoin, { membershipId });
			toast.success('Join request rejected');
			await refreshPendingRequests();
		} catch (error: any) {
			toast.error(error?.message ?? 'Reject failed');
		}
	}
</script>

<main class="mx-auto max-w-5xl px-4 py-6 sm:px-6">
	{#if communityQuery.isLoading}
		<p class="text-sm text-muted-foreground">Loading community...</p>
	{:else if !communityQuery.data}
		<p class="text-sm text-destructive">Community not found.</p>
	{:else if !communityQuery.data.isManager}
		<div class="rounded-md border border-border bg-card p-4">
			<p class="text-sm text-destructive">Manager access required.</p>
			<div class="mt-3">
				<Button variant="outline" href={`/c/${slug}`}>Back to Community</Button>
			</div>
		</div>
	{:else}
		<div class="mb-5 flex flex-wrap items-center justify-between gap-3">
			<div>
				<h1 class="text-2xl font-semibold tracking-tight">Manage c/{communityQuery.data.community.slug}</h1>
				<p class="text-sm text-muted-foreground">Review and process pending join requests.</p>
			</div>
			<div class="flex gap-2">
				<Button variant="outline" href={`/c/${slug}`}>View Community</Button>
				<Button variant="outline" onclick={refreshPendingRequests} disabled={loadingRequests}>
					Refresh
				</Button>
			</div>
		</div>

		{#if loadingRequests && pendingRequests.length === 0}
			<p class="text-sm text-muted-foreground">Loading pending requests...</p>
		{:else if pendingRequests.length === 0}
			<p class="text-sm text-muted-foreground">No pending join requests.</p>
		{:else}
			<div class="space-y-3">
				{#each pendingRequests as request (request.membershipId)}
					<article class="rounded-lg border border-border bg-card p-4">
						<div class="flex flex-wrap items-start justify-between gap-3">
							<div>
								<p class="text-sm font-medium">
									{request.requesterUsername
										? `u/${request.requesterUsername}`
										: request.requesterName}
								</p>
								<p class="text-xs text-muted-foreground">{request.requesterEmail}</p>
								<p class="mt-1 text-xs text-muted-foreground">
									Requested at {new Date(request.requestedAt).toLocaleString()}
								</p>
							</div>
							<div class="flex gap-2">
								<Button size="sm" onclick={() => approve(request.membershipId)}>Approve</Button>
								<Button size="sm" variant="outline" onclick={() => reject(request.membershipId)}>
									Reject
								</Button>
							</div>
						</div>
					</article>
				{/each}
			</div>
		{/if}
	{/if}
</main>
