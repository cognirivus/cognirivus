<script lang="ts">
	import { page } from '$app/state';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import type { Id } from '$convex/_generated/dataModel';
	import { api } from '$convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Dialog from '$lib/components/ui/dialog';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';
	import { ArrowLeft, Link2, Loader2, Pause, Play, RefreshCw, Trash2 } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	const auth = useAuth();
	const client = useConvexClient();
	const username = $derived(page.params.username);

	const currentUserQuery = useQuery(api.auth.getCurrentUser, {});
	const isAuthorized = $derived(
		auth.isAuthenticated && currentUserQuery.data?.username === username
	);

	const sourcesQuery = useQuery((api as any).sources.listMySources, () =>
		isAuthorized ? { paginationOpts: { numItems: 200, cursor: null } } : 'skip'
	);
	const refreshQuotaQuery = useQuery((api as any).sources.getMyRefreshQuota, () =>
		isAuthorized ? {} : 'skip'
	);
	const suggestionsQuery = useQuery((api as any).sources.listSavedSourceSuggestions, () =>
		isAuthorized ? { paginationOpts: { numItems: 50, cursor: null } } : 'skip'
	);

	let selectedSourceIds = $state<Array<string>>([]);
	let runningJobId = $state<Id<'source_jobs'> | null>(null);
	let busySourceId = $state<string | null>(null);
	let busySuggestionId = $state<string | null>(null);
	let bulkUnsubscribeDialogOpen = $state(false);

	const jobQuery = useQuery((api as any).sources.getJobStatus, () =>
		runningJobId ? { jobId: runningJobId } : 'skip'
	);

	$effect(() => {
		if (jobQuery.data && (jobQuery.data.status === 'done' || jobQuery.data.status === 'failed')) {
			if (jobQuery.data.status === 'done') {
				toast.success('Bulk unsubscribe completed');
			} else {
				toast.error(jobQuery.data.error ?? 'Bulk unsubscribe failed');
			}
			runningJobId = null;
			selectedSourceIds = [];
		}
	});

	const allSelected = $derived.by(() => {
		const pageItems = sourcesQuery.data?.page ?? [];
		return (
			pageItems.length > 0 &&
			pageItems.every((row: any) => selectedSourceIds.includes(row.sourceId))
		);
	});

	const isRefreshLimited = $derived.by(() => {
		if (!refreshQuotaQuery.data || refreshQuotaQuery.data.isUnlimited) {
			return false;
		}
		return (refreshQuotaQuery.data.remaining ?? 0) <= 0;
	});

	function isFetchableSourceType(type: string) {
		return type !== 'bookmarks';
	}

	const refreshResetsAtUtc = $derived.by(() => {
		const resetsAt = refreshQuotaQuery.data?.resetsAt;
		if (!resetsAt) {
			return null;
		}
		return new Date(resetsAt).toLocaleString('en-US', { timeZone: 'UTC' });
	});

	function toggleSelect(sourceId: string, checked: boolean) {
		if (checked) {
			if (!selectedSourceIds.includes(sourceId)) {
				selectedSourceIds = [...selectedSourceIds, sourceId];
			}
			return;
		}
		selectedSourceIds = selectedSourceIds.filter((id) => id !== sourceId);
	}

	function toggleSelectAll(checked: boolean) {
		if (checked) {
			selectedSourceIds = (sourcesQuery.data?.page ?? []).map((row: any) => row.sourceId);
			return;
		}
		selectedSourceIds = [];
	}

	async function pauseOrResume(sourceId: Id<'sources'>, status: 'active' | 'paused') {
		busySourceId = sourceId;
		try {
			if (status === 'active') {
				await client.mutation((api as any).sources.pauseSource, { sourceId });
				toast.success('Source paused');
			} else {
				await client.mutation((api as any).sources.resumeSource, { sourceId });
				toast.success('Source resumed');
			}
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to update source');
		} finally {
			busySourceId = null;
		}
	}

	async function refreshSource(sourceId: Id<'sources'>) {
		if (isRefreshLimited) {
			toast.error(
				refreshResetsAtUtc
					? `Daily refresh limit reached. Resets at ${refreshResetsAtUtc} UTC.`
					: 'Daily refresh limit reached.'
			);
			return;
		}
		busySourceId = sourceId;
		try {
			await client.action((api as any).sources.refreshSource, { sourceId });
			toast.success('Refresh queued');
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to refresh source');
		} finally {
			busySourceId = null;
		}
	}

	async function unsubscribeOne(sourceId: Id<'sources'>) {
		busySourceId = sourceId;
		try {
			const jobId = await client.action((api as any).sources.unsubscribeSource, { sourceId });
			runningJobId = jobId;
			toast.success('Unsubscribe job queued');
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to unsubscribe');
		} finally {
			busySourceId = null;
		}
	}

	function requestBulkUnsubscribe() {
		if (selectedSourceIds.length === 0) {
			return;
		}
		bulkUnsubscribeDialogOpen = true;
	}

	async function bulkUnsubscribe() {
		try {
			const jobId = await client.action((api as any).sources.bulkUnsubscribeSources, {
				sourceIds: selectedSourceIds
			});
			runningJobId = jobId;
			toast.success('Bulk unsubscribe job queued');
			bulkUnsubscribeDialogOpen = false;
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to queue bulk unsubscribe');
		}
	}

	async function followSuggestion(suggestionId: Id<'saved_source_suggestions'>) {
		busySuggestionId = suggestionId;
		try {
			const result = await client.action((api as any).sources.followSavedSourceSuggestion, {
				suggestionId
			});
			if (result.subscriptionStatus === 'already_subscribed') {
				toast.info('You already follow this source.');
			} else {
				toast.success('Source followed from saved links.');
			}
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to follow suggestion');
		} finally {
			busySuggestionId = null;
		}
	}
</script>

<main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
	<div class="mx-auto w-full max-w-6xl">
		<div class="mb-6 flex items-center justify-between">
			<div class="flex items-center gap-4">
				<Button variant="ghost" size="icon" href="/u/{username}">
					<ArrowLeft class="size-5" />
				</Button>
				<div>
					<h1 class="text-2xl font-semibold tracking-tight">Manage Sources</h1>
					<p class="text-sm text-muted-foreground">
						Pause, refresh, and bulk-unsubscribe your sources.
					</p>
					{#if refreshQuotaQuery.data}
						{#if refreshQuotaQuery.data.isUnlimited}
							<p class="mt-1 text-xs text-muted-foreground">Manual refreshes: Unlimited</p>
						{:else}
							<p class="mt-1 text-xs text-muted-foreground">
								Manual refreshes left today: {refreshQuotaQuery.data.remaining ??
									0}/{refreshQuotaQuery.data.dailyLimit ?? 3}
								{#if refreshResetsAtUtc}
									| resets {refreshResetsAtUtc} UTC
								{/if}
							</p>
						{/if}
					{/if}
				</div>
			</div>
			<Button
				variant="destructive"
				disabled={selectedSourceIds.length === 0 || !!runningJobId}
				onclick={requestBulkUnsubscribe}
				class="gap-2"
			>
				<Trash2 class="size-4" />
				Bulk Unsubscribe ({selectedSourceIds.length})
			</Button>
		</div>

		{#if runningJobId}
			<Card class="mb-4">
				<CardContent class="flex items-center justify-between py-3 text-sm">
					<div class="flex items-center gap-2">
						<Loader2 class="size-4 animate-spin" />
						<span>
							Background job: {jobQuery.data?.status ?? 'queued'} - processed {jobQuery.data
								?.processed ?? 0}
						</span>
					</div>
					{#if jobQuery.data?.error}
						<span class="text-destructive">{jobQuery.data.error}</span>
					{/if}
				</CardContent>
			</Card>
		{/if}

		{#if !auth.isAuthenticated || (currentUserQuery.data && !isAuthorized)}
			<Card class="border-destructive/20 bg-destructive/5 text-destructive">
				<CardContent class="py-10 text-center">
					<p class="font-medium">You are not authorized to manage these sources.</p>
					<Button variant="outline" class="mt-4" href="/u/{username}">Go back to profile</Button>
				</CardContent>
			</Card>
		{:else if sourcesQuery.isLoading}
			<div class="flex h-40 items-center justify-center">
				<p class="text-sm text-muted-foreground italic">Loading your sources...</p>
			</div>
		{:else if (sourcesQuery.data?.page?.length ?? 0) === 0}
			<Card class="bg-muted/30">
				<CardContent class="py-20 text-center">
					<p class="text-muted-foreground italic">No sources subscribed yet.</p>
					<Button variant="default" class="mt-4" href="/submit">Add your first source</Button>
				</CardContent>
			</Card>
		{:else}
			<div class="rounded-lg border border-border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead class="w-12">
								<Checkbox checked={allSelected} onCheckedChange={(v) => toggleSelectAll(!!v)} />
							</TableHead>
							<TableHead>Source</TableHead>
							<TableHead>Type</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Last Sync</TableHead>
							<TableHead class="text-right">Items</TableHead>
							<TableHead class="text-right">Shared Posts</TableHead>
							<TableHead class="text-right">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{#each sourcesQuery.data?.page ?? [] as row (row.subscriptionId)}
							{@const canRefresh = isFetchableSourceType(row.type)}
							{@const refreshTitle = !canRefresh
								? 'Bookmarks are non-fetchable. Upload a bookmarks file to add new items.'
								: isRefreshLimited
									? refreshResetsAtUtc
										? `Daily limit reached. Resets ${refreshResetsAtUtc} UTC`
										: 'Daily limit reached'
									: 'Refresh now'}
							<TableRow>
								<TableCell>
									<Checkbox
										checked={selectedSourceIds.includes(row.sourceId)}
										onCheckedChange={(v) => toggleSelect(row.sourceId, !!v)}
									/>
								</TableCell>
								<TableCell>
									<div class="max-w-[360px]">
										<div class="flex flex-wrap items-center gap-2">
											<p class="truncate font-medium">{row.title}</p>
											{#if row.addedVia === 'manual'}
												<Badge variant="outline">Manual</Badge>
											{:else if row.addedVia === 'saved_link'}
												<Badge variant="outline">Saved Link</Badge>
											{/if}
										</div>
										<p class="truncate text-xs text-muted-foreground">{row.canonicalUrl}</p>
									</div>
								</TableCell>
								<TableCell class="uppercase">{row.type}</TableCell>
								<TableCell>
									<div class="space-y-1">
										<Badge
											variant={row.status === 'active'
												? 'default'
												: row.status === 'paused'
													? 'secondary'
													: 'destructive'}
										>
											{row.status}
										</Badge>
										{#if row.status === 'error' && row.lastError}
											<p class="max-w-[280px] truncate text-[11px] text-destructive">
												{row.lastError}
											</p>
										{/if}
									</div>
								</TableCell>
								<TableCell class="text-xs text-muted-foreground">
									{#if row.lastFetchedAt}
										{new Date(row.lastFetchedAt).toLocaleString()}
									{:else}
										-
									{/if}
								</TableCell>
								<TableCell class="text-right">{row.itemCount}</TableCell>
								<TableCell class="text-right">{row.sharedPostCount}</TableCell>
								<TableCell class="text-right">
									<div class="flex justify-end gap-1.5">
										<Button
											variant="outline"
											size="icon-sm"
											disabled={busySourceId === row.sourceId}
											onclick={() => pauseOrResume(row.sourceId, row.status)}
											title={row.status === 'active' ? 'Pause' : 'Resume'}
										>
											{#if row.status === 'active'}
												<Pause class="size-3.5" />
											{:else}
												<Play class="size-3.5" />
											{/if}
										</Button>
										<Button
											variant="outline"
											size="icon-sm"
											disabled={busySourceId === row.sourceId || isRefreshLimited || !canRefresh}
											onclick={() => refreshSource(row.sourceId)}
											title={refreshTitle}
										>
											<RefreshCw class="size-3.5" />
										</Button>
										<Button
											variant="destructive"
											size="icon-sm"
											disabled={busySourceId === row.sourceId || !!runningJobId}
											onclick={() => unsubscribeOne(row.sourceId)}
											title="Unsubscribe"
										>
											<Trash2 class="size-3.5" />
										</Button>
									</div>
								</TableCell>
							</TableRow>
						{/each}
					</TableBody>
				</Table>
			</div>
		{/if}

		{#if isAuthorized && (suggestionsQuery.data?.page?.length ?? 0) > 0}
			<Card class="mt-6">
				<CardContent class="space-y-4 py-5">
					<div>
						<h2 class="text-base font-semibold">Suggested from Saved Links</h2>
						<p class="text-sm text-muted-foreground">
							These domains came from links you saved privately. Follow them when you want future
							updates.
						</p>
					</div>

					<div class="space-y-2">
						{#each suggestionsQuery.data?.page ?? [] as suggestion (suggestion._id)}
							<div
								class="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
							>
								<div class="min-w-0">
									<div class="flex flex-wrap items-center gap-2">
										<p class="font-medium">{suggestion.originHost}</p>
										<Badge variant="outline">{suggestion.itemCount} saved</Badge>
										{#if suggestion.isFollowing}
											<Badge variant="secondary">Following</Badge>
										{/if}
									</div>
									<p class="truncate text-xs text-muted-foreground">{suggestion.canonicalUrl}</p>
									<p class="truncate text-xs text-muted-foreground">
										Latest saved: {suggestion.latestSavedTitle}
									</p>
								</div>
								<div class="flex items-center gap-2">
									<Button
										variant="outline"
										size="sm"
										href={suggestion.canonicalUrl}
										target="_blank"
										class="gap-2"
									>
										<Link2 class="size-3.5" />
										Open
									</Button>
									<Button
										size="sm"
										disabled={suggestion.isFollowing || busySuggestionId === suggestion._id}
										onclick={() => followSuggestion(suggestion._id)}
									>
										{#if busySuggestionId === suggestion._id}
											<Loader2 class="mr-2 size-3.5 animate-spin" />
											Following...
										{:else if suggestion.isFollowing}
											Following
										{:else}
											Follow Source
										{/if}
									</Button>
								</div>
							</div>
						{/each}
					</div>
				</CardContent>
			</Card>
		{/if}
	</div>
</main>

<Dialog.Root bind:open={bulkUnsubscribeDialogOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Confirm Unsubscribe</Dialog.Title>
			<Dialog.Description>
				Unsubscribe {selectedSourceIds.length} source(s)?
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (bulkUnsubscribeDialogOpen = false)}>Cancel</Button>
			<Button
				variant="destructive"
				disabled={selectedSourceIds.length === 0 || !!runningJobId}
				onclick={bulkUnsubscribe}
			>
				Unsubscribe
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
