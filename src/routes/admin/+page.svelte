<script lang="ts">
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { toast } from 'svelte-sonner';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';
	import { Shield, Trash2 } from '@lucide/svelte';

	const client = useConvexClient();
	const dashboardQuery = useQuery((api as any).admin.listDashboard, {});

	let busyKey = $state<string | null>(null);
	type PendingDelete =
		| { kind: 'source'; id: Id<'sources'> }
		| { kind: 'sourceItem'; id: Id<'source_items'> }
		| { kind: 'post'; id: Id<'posts'> }
		| null;
	let pendingDelete = $state<PendingDelete>(null);
	let deleteDialogOpen = $state(false);

	async function removeSource(sourceId: Id<'sources'>) {
		busyKey = `source:${sourceId}`;
		try {
			const result = await client.action((api as any).admin.deleteSourcePermanently, {
				sourceId
			});
			if (!result.deleted) {
				toast.error('Source not found');
				return;
			}
			toast.success(
				`Source deleted: ${result.sourceItemCount} items, ${result.r2DeletedCount} R2 objects removed`
			);
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to delete source');
		} finally {
			busyKey = null;
		}
	}

	async function removeSourceItem(sourceItemId: Id<'source_items'>) {
		busyKey = `item:${sourceItemId}`;
		try {
			const result = await client.action((api as any).admin.deleteSourceItemPermanently, {
				sourceItemId
			});
			if (!result.deleted) {
				toast.error('Source item not found');
				return;
			}
			toast.success(`Source item deleted${result.r2Deleted ? ' (R2 body removed)' : ''}`);
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to delete source item');
		} finally {
			busyKey = null;
		}
	}

	async function removePost(postId: Id<'posts'>) {
		busyKey = `post:${postId}`;
		try {
			const result = await client.action((api as any).admin.deletePostPermanently, { postId });
			if (!result.deleted) {
				toast.error('Post not found');
				return;
			}
			toast.success(`Post deleted${result.r2Deleted ? ' (R2 body removed)' : ''}`);
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to delete post');
		} finally {
			busyKey = null;
		}
	}

	function requestRemoveSource(sourceId: Id<'sources'>) {
		pendingDelete = { kind: 'source', id: sourceId };
		deleteDialogOpen = true;
	}

	function requestRemoveSourceItem(sourceItemId: Id<'source_items'>) {
		pendingDelete = { kind: 'sourceItem', id: sourceItemId };
		deleteDialogOpen = true;
	}

	function requestRemovePost(postId: Id<'posts'>) {
		pendingDelete = { kind: 'post', id: postId };
		deleteDialogOpen = true;
	}

	function getDeleteDialogDescription() {
		if (!pendingDelete) return 'This action cannot be undone.';
		if (pendingDelete.kind === 'source') {
			return 'Delete this source permanently? This removes all its items and R2 bodies.';
		}
		if (pendingDelete.kind === 'sourceItem') {
			return 'Delete this source item permanently?';
		}
		return 'Delete this post permanently? This also removes comments, votes, and R2 body.';
	}

	async function confirmDelete() {
		if (!pendingDelete) return;
		const current = pendingDelete;
		deleteDialogOpen = false;
		pendingDelete = null;
		if (current.kind === 'source') {
			await removeSource(current.id);
			return;
		}
		if (current.kind === 'sourceItem') {
			await removeSourceItem(current.id);
			return;
		}
		await removePost(current.id);
	}
</script>

<main class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
	<div class="mb-6 flex items-center gap-3">
		<div class="rounded-md border border-border p-2">
			<Shield class="size-5" />
		</div>
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Admin Console</h1>
			<p class="text-sm text-muted-foreground">
				Permanent cleanup for sources, source items, and posts.
			</p>
		</div>
	</div>

	{#if dashboardQuery.isLoading}
		<p class="text-sm text-muted-foreground">Loading admin data...</p>
	{:else if dashboardQuery.error}
		<p class="text-sm text-destructive">
			Failed to load admin dashboard: {dashboardQuery.error.message}
		</p>
	{:else}
		<div class="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Debug</CardTitle>
				</CardHeader>
				<CardContent>
					{#if dashboardQuery.data?.nightlyRun}
						<div class="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
							<div class="rounded-md border p-3">
								<p class="text-xs text-muted-foreground">Last Nightly Run</p>
								<div class="mt-1">
									<Badge
										variant={dashboardQuery.data.nightlyRun.status === 'failed'
											? 'destructive'
											: dashboardQuery.data.nightlyRun.status === 'running'
												? 'secondary'
												: 'default'}
									>
										{dashboardQuery.data.nightlyRun.status}
									</Badge>
								</div>
							</div>
							<div class="rounded-md border p-3">
								<p class="text-xs text-muted-foreground">Run Date (UTC)</p>
								<p class="mt-1 font-medium">{dashboardQuery.data.nightlyRun.runDate}</p>
							</div>
							<div class="rounded-md border p-3">
								<p class="text-xs text-muted-foreground">Queued Sync Jobs</p>
								<p class="mt-1 font-medium">{dashboardQuery.data.nightlyRun.queuedJobs}</p>
							</div>
							<div class="rounded-md border p-3">
								<p class="text-xs text-muted-foreground">Processed Sources</p>
								<p class="mt-1 font-medium">{dashboardQuery.data.nightlyRun.processedSources}</p>
							</div>
							<div class="rounded-md border p-3">
								<p class="text-xs text-muted-foreground">Started</p>
								<p class="mt-1 font-medium">
									{new Date(dashboardQuery.data.nightlyRun.startedAt).toLocaleString()}
								</p>
							</div>
							<div class="rounded-md border p-3">
								<p class="text-xs text-muted-foreground">Finished</p>
								<p class="mt-1 font-medium">
									{dashboardQuery.data.nightlyRun.finishedAt
										? new Date(dashboardQuery.data.nightlyRun.finishedAt).toLocaleString()
										: 'In progress'}
								</p>
							</div>
						</div>
						{#if dashboardQuery.data.nightlyRun.error}
							<p class="mt-3 text-sm text-destructive">{dashboardQuery.data.nightlyRun.error}</p>
						{/if}
					{:else}
						<p class="text-sm text-muted-foreground">
							No nightly refresh run has been recorded yet.
						</p>
					{/if}
					<div class="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
						<div class="rounded-md border p-3">
							<p class="text-xs text-muted-foreground">Nightly Lock</p>
							<div class="mt-1">
								<Badge
									variant={dashboardQuery.data.debug.nightlyLock.isLocked ? 'secondary' : 'default'}
								>
									{dashboardQuery.data.debug.nightlyLock.isLocked ? 'locked' : 'unlocked'}
								</Badge>
							</div>
							{#if dashboardQuery.data.debug.nightlyLock.owner}
								<p class="mt-1 truncate text-xs text-muted-foreground">
									Owner: {dashboardQuery.data.debug.nightlyLock.owner}
								</p>
							{/if}
						</div>
						<div class="rounded-md border p-3">
							<p class="text-xs text-muted-foreground">R2 Retry Backlog</p>
							<p class="mt-1 font-medium">
								Q:{dashboardQuery.data.debug.retryBacklog.queued} | R:{dashboardQuery.data.debug
									.retryBacklog.running} | F:{dashboardQuery.data.debug.retryBacklog.failed}
							</p>
						</div>
						<div class="rounded-md border p-3">
							<p class="text-xs text-muted-foreground">Failures (24h)</p>
							<p class="mt-1 font-medium">
								Sync:{dashboardQuery.data.debug.failures24h.sourceJobs24h} | Delete:{dashboardQuery
									.data.debug.failures24h.deletionJobs24h} | R2:{dashboardQuery.data.debug
									.failures24h.r2RetryJobs24h}
							</p>
							<p class="mt-1 text-xs text-muted-foreground">
								Invalid R2 rows: {dashboardQuery.data.debug.failures24h.invalidR2RetryRows}
							</p>
						</div>
						<div class="rounded-md border p-3">
							<p class="text-xs text-muted-foreground">Last Sweeper Success</p>
							<p class="mt-1 font-medium">
								{dashboardQuery.data.debug.sweeper.lastSuccessAt
									? new Date(dashboardQuery.data.debug.sweeper.lastSuccessAt).toLocaleString()
									: 'Never'}
							</p>
						</div>
						<div class="rounded-md border p-3">
							<p class="text-xs text-muted-foreground">Aggregate Backfill</p>
							<p class="mt-1 font-medium">
								Items:{dashboardQuery.data.debug.aggregateBackfill.sourceItemsState} (
								{dashboardQuery.data.debug.aggregateBackfill.sourceItemsProcessed}) | Shares:
								{dashboardQuery.data.debug.aggregateBackfill.postSharesState} (
								{dashboardQuery.data.debug.aggregateBackfill.postSharesProcessed})
							</p>
							<div class="mt-1">
								<Badge
									variant={dashboardQuery.data.debug.aggregateBackfill.allDone
										? 'default'
										: 'secondary'}
								>
									{dashboardQuery.data.debug.aggregateBackfill.allDone ? 'complete' : 'incomplete'}
								</Badge>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Sources</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="rounded-md border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Title</TableHead>
									<TableHead>Type</TableHead>
									<TableHead>Status</TableHead>
									<TableHead class="text-right">Items</TableHead>
									<TableHead>Updated</TableHead>
									<TableHead class="text-right">Action</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{#each dashboardQuery.data?.sources ?? [] as source (source._id)}
									<TableRow>
										<TableCell>
											<div class="max-w-[380px]">
												<div class="flex flex-wrap items-center gap-2">
													<p class="truncate font-medium">{source.title}</p>
													{#if source.rssFeedUrl}
														<Badge variant="outline">RSS-backed</Badge>
													{/if}
												</div>
												<p class="truncate text-xs text-muted-foreground">{source.canonicalUrl}</p>
											</div>
										</TableCell>
										<TableCell class="uppercase">{source.type}</TableCell>
										<TableCell>
											<Badge
												variant={source.status === 'error'
													? 'destructive'
													: source.status === 'paused'
														? 'secondary'
														: 'default'}
											>
												{source.status}
											</Badge>
										</TableCell>
										<TableCell class="text-right">{source.itemCount}</TableCell>
										<TableCell class="text-xs text-muted-foreground">
											{new Date(source.updatedAt).toLocaleString()}
										</TableCell>
										<TableCell class="text-right">
											<Button
												variant="destructive"
												size="sm"
												disabled={busyKey === `source:${source._id}`}
												onclick={() => requestRemoveSource(source._id)}
											>
												<Trash2 class="mr-1 size-4" />
												Delete
											</Button>
										</TableCell>
									</TableRow>
								{/each}
							</TableBody>
						</Table>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Source Items</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="rounded-md border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Item</TableHead>
									<TableHead>Source</TableHead>
									<TableHead>Published</TableHead>
									<TableHead class="text-right">R2</TableHead>
									<TableHead class="text-right">Action</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{#each dashboardQuery.data?.sourceItems ?? [] as sourceItem (sourceItem._id)}
									<TableRow>
										<TableCell>
											<div class="max-w-[380px]">
												<p class="truncate font-medium">{sourceItem.title}</p>
												<p class="truncate text-xs text-muted-foreground">{sourceItem.url}</p>
											</div>
										</TableCell>
										<TableCell>{sourceItem.sourceTitle}</TableCell>
										<TableCell class="text-xs text-muted-foreground">
											{new Date(sourceItem.publishedAt).toLocaleString()}
										</TableCell>
										<TableCell class="text-right">
											{sourceItem.hasR2Body ? 'yes' : 'no'}
										</TableCell>
										<TableCell class="text-right">
											<Button
												variant="destructive"
												size="sm"
												disabled={busyKey === `item:${sourceItem._id}`}
												onclick={() => requestRemoveSourceItem(sourceItem._id)}
											>
												<Trash2 class="mr-1 size-4" />
												Delete
											</Button>
										</TableCell>
									</TableRow>
								{/each}
							</TableBody>
						</Table>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Posts</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="rounded-md border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Post</TableHead>
									<TableHead>Author</TableHead>
									<TableHead>Visibility</TableHead>
									<TableHead>Created</TableHead>
									<TableHead class="text-right">R2</TableHead>
									<TableHead class="text-right">Action</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{#each dashboardQuery.data?.posts ?? [] as post (post._id)}
									<TableRow>
										<TableCell>
											<div class="max-w-[380px]">
												<p class="truncate font-medium">{post.title}</p>
												{#if post.url}
													<p class="truncate text-xs text-muted-foreground">{post.url}</p>
												{/if}
											</div>
										</TableCell>
										<TableCell class="text-xs">{post.authorAuthId}</TableCell>
										<TableCell>{post.visibility}</TableCell>
										<TableCell class="text-xs text-muted-foreground">
											{new Date(post.createdAt).toLocaleString()}
										</TableCell>
										<TableCell class="text-right">{post.hasR2Body ? 'yes' : 'no'}</TableCell>
										<TableCell class="text-right">
											<Button
												variant="destructive"
												size="sm"
												disabled={busyKey === `post:${post._id}`}
												onclick={() => requestRemovePost(post._id)}
											>
												<Trash2 class="mr-1 size-4" />
												Delete
											</Button>
										</TableCell>
									</TableRow>
								{/each}
							</TableBody>
						</Table>
					</div>
				</CardContent>
			</Card>
		</div>
	{/if}
</main>

<Dialog.Root
	open={deleteDialogOpen}
	onOpenChange={(open) => {
		deleteDialogOpen = open;
		if (!open) {
			pendingDelete = null;
		}
	}}
>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Confirm Delete</Dialog.Title>
			<Dialog.Description>{getDeleteDialogDescription()}</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (deleteDialogOpen = false)}>Cancel</Button>
			<Button variant="destructive" onclick={confirmDelete}>Delete</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
