<script lang="ts">
	import { page } from '$app/state'
	import { useConvexClient, useQuery } from 'convex-svelte'
	import { api } from '$convex/_generated/api'
	import { Button } from '$lib/components/ui/button'
	import { Badge } from '$lib/components/ui/badge'
	import { Separator } from '$lib/components/ui/separator'
	import { toast } from 'svelte-sonner'
	import CommunitySubpageHeader from '$lib/components/community/CommunitySubpageHeader.svelte'
	import { RefreshCw, Check, X, Clock, UserCheck, Loader2, ShieldAlert } from '@lucide/svelte'

	const client = useConvexClient()
	const slug = $derived(page.params.slug)

	const communityQuery = useQuery((api as any).communities.getBySlug, () => ({ slug }))

	type PendingRequest = {
		membershipId: string
		userAuthId: string
		requestedAt: number
		requesterName: string
		requesterEmail: string
		requesterUsername: string | null
	}

	let pendingRequests = $state<Array<PendingRequest>>([])
	let loadingRequests = $state(false)
	let initialized = $state(false)

	function resetPendingRequestsState() {
		initialized = false
		pendingRequests = []
	}

	$effect(() => {
		const slugKey = slug
		resetPendingRequestsState()
		if (!slugKey) return
	})

	async function refreshPendingRequests() {
		if (!communityQuery.data?.isManager) {
			pendingRequests = []
			initialized = true
			return
		}

		loadingRequests = true
		try {
			const rows = await client.query((api as any).communities.listPendingRequests, {
				communityId: communityQuery.data.community._id
			})
			pendingRequests = rows as Array<PendingRequest>
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to load pending requests')
		} finally {
			loadingRequests = false
			initialized = true
		}
	}

	$effect(() => {
		if (!communityQuery.isLoading && communityQuery.data && !initialized) {
			refreshPendingRequests()
		}
	})

	async function approve(membershipId: string) {
		try {
			await client.mutation((api as any).communities.approveJoin, { membershipId })
			toast.success('Join request approved')
			await refreshPendingRequests()
		} catch (error: any) {
			toast.error(error?.message ?? 'Approve failed')
		}
	}

	async function reject(membershipId: string) {
		try {
			await client.mutation((api as any).communities.rejectJoin, { membershipId })
			toast.success('Join request rejected')
			await refreshPendingRequests()
		} catch (error: any) {
			toast.error(error?.message ?? 'Reject failed')
		}
	}

	function timeAgo(ts: number): string {
		const seconds = Math.floor((Date.now() - ts) / 1000)
		if (seconds < 60) return 'just now'
		const minutes = Math.floor(seconds / 60)
		if (minutes < 60) return `${minutes}m ago`
		const hours = Math.floor(minutes / 60)
		if (hours < 24) return `${hours}h ago`
		const days = Math.floor(hours / 24)
		if (days < 30) return `${days}d ago`
		return new Date(ts).toLocaleDateString()
	}
</script>

<main class="mx-auto w-full max-w-4xl overflow-x-hidden px-4 py-6 sm:px-6">
	{#if communityQuery.isLoading}
		<div class="flex flex-col items-center justify-center py-24 text-muted-foreground">
			<Loader2 class="size-8 animate-spin" />
			<p class="mt-3 text-sm">Loading community…</p>
		</div>
	{:else if !communityQuery.data}
		<div class="flex flex-col items-center justify-center py-24 text-muted-foreground">
			<ShieldAlert class="size-8" />
			<p class="mt-3 text-sm font-medium text-foreground">Community not found</p>
			<p class="mt-1 text-xs">The community you're looking for doesn't exist or was removed.</p>
		</div>
	{:else if !communityQuery.data.isManager}
		<div class="flex flex-col items-center justify-center py-24 text-muted-foreground">
			<ShieldAlert class="size-8" />
			<p class="mt-3 text-sm font-medium text-foreground">Manager access required</p>
			<p class="mt-1 text-xs">You don't have permission to manage this community.</p>
			<Button variant="outline" href={`/c/${slug}`} class="mt-4">Back to Community</Button>
		</div>
	{:else}
		<CommunitySubpageHeader communityData={communityQuery.data} activeNav="manage" />

		<div class="mt-6 space-y-4">
			<!-- Section header -->
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2.5">
					<h2 class="text-lg font-semibold tracking-tight">Pending Requests</h2>
					<Badge variant="secondary" class="text-xs">
						{pendingRequests.length}
					</Badge>
				</div>
				<Button
					variant="outline"
					size="sm"
					onclick={refreshPendingRequests}
					disabled={loadingRequests}
					class="gap-1.5"
				>
					<RefreshCw class="size-3.5 {loadingRequests ? 'animate-spin' : ''}" />
					<span class="hidden sm:inline">Refresh</span>
				</Button>
			</div>

			<Separator />

			<!-- Content -->
			{#if loadingRequests && pendingRequests.length === 0}
				<div class="flex flex-col items-center justify-center py-16 text-muted-foreground">
					<Loader2 class="size-6 animate-spin" />
					<p class="mt-3 text-sm">Loading pending requests…</p>
				</div>
			{:else if pendingRequests.length === 0}
				<div
					class="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-muted-foreground"
				>
					<UserCheck class="size-8" />
					<p class="mt-3 text-sm font-medium text-foreground">No pending requests</p>
					<p class="mt-1 text-xs">All join requests have been reviewed.</p>
				</div>
			{:else}
				<div class="space-y-3">
					{#each pendingRequests as request (request.membershipId)}
						<article class="rounded-lg border bg-card p-4">
							<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
								<div class="flex items-center gap-3 min-w-0">
									<!-- Avatar -->
									<div
										class="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
									>
										{(request.requesterName ?? '?').charAt(0).toUpperCase()}
									</div>
									<!-- Info -->
									<div class="min-w-0">
										<p class="text-sm font-medium truncate">
											{#if request.requesterUsername}
												<a
													class="hover:underline"
													href="/u/{request.requesterUsername}"
												>
													u/{request.requesterUsername}
												</a>
											{:else}
												{request.requesterName}
											{/if}
										</p>
										<p class="text-xs text-muted-foreground truncate">
											{request.requesterEmail}
										</p>
										<div
											class="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"
										>
											<Clock class="size-3" />
											Requested {timeAgo(request.requestedAt)}
										</div>
									</div>
								</div>

								<!-- Actions -->
								<div class="flex gap-2 self-start">
									<Button
										size="sm"
										class="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
										onclick={() => approve(request.membershipId)}
									>
										<Check class="size-3.5" />
										Approve
									</Button>
									<Button
										size="sm"
										variant="outline"
										class="gap-1.5"
										onclick={() => reject(request.membershipId)}
									>
										<X class="size-3.5" />
										Reject
									</Button>
								</div>
							</div>
						</article>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</main>
