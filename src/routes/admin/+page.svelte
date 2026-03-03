<script lang="ts">
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { toast } from 'svelte-sonner';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
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

	async function removeSource(sourceId: Id<'sources'>) {
		if (!confirm('Delete this source permanently? This removes all its items and R2 bodies.')) {
			return;
		}
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
		if (!confirm('Delete this source item permanently?')) {
			return;
		}
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
		if (!confirm('Delete this post permanently? This also removes comments, votes, and R2 body.')) {
			return;
		}
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
												<p class="truncate font-medium">{source.title}</p>
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
												onclick={() => removeSource(source._id)}
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
												onclick={() => removeSourceItem(sourceItem._id)}
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
												onclick={() => removePost(post._id)}
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
