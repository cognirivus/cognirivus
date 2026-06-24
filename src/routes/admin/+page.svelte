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
	const communitiesQuery = useQuery((api as any).admin.listCommunities, { limit: 30 });
	const usersQuery = useQuery((api as any).admin.listUsers, { limit: 30 });
	const knowledgeCellsQuery = useQuery((api as any).admin.listKnowledgeCells, { limit: 30 });
	const knowledgeNotesQuery = useQuery((api as any).admin.listKnowledgeNotes, { limit: 30 });
	const infoSourcesQuery = useQuery((api as any).admin.listInformationSources, { limit: 30 });
	const domainsQuery = useQuery((api as any).admin.listDomains, { limit: 30 });
	const entitiesQuery = useQuery((api as any).admin.listEntities, { limit: 30 });
	const goalsQuery = useQuery((api as any).admin.listGoals, { limit: 30 });
	const pathsQuery = useQuery((api as any).admin.listPaths, { limit: 30 });

	let busyKey = $state<string | null>(null);
	type PendingDelete =
		| { kind: 'source'; id: Id<'sources'> }
		| { kind: 'sourceItem'; id: Id<'source_items'> }
		| { kind: 'post'; id: Id<'posts'> }
		| { kind: 'community'; id: Id<'communities'> }
		| { kind: 'user'; id: string }
		| { kind: 'knowledgeCell'; id: Id<'knowledge_cells'> }
		| { kind: 'knowledgeNote'; id: Id<'knowledge_notes'> }
		| { kind: 'informationSource'; id: Id<'information_sources'> }
		| { kind: 'domain'; id: Id<'knowledge_domains'> }
		| { kind: 'entity'; id: Id<'knowledge_entities'> }
		| { kind: 'goal'; id: Id<'learning_goals'> }
		| { kind: 'path'; id: Id<'knowledge_paths'> }
		| null;
	let pendingDelete = $state<PendingDelete>(null);
	let deleteDialogOpen = $state(false);

	async function removeSource(sourceId: Id<'sources'>) {
		busyKey = `source:${sourceId}`;
		try {
			const result = await client.action((api as any).admin.deleteSourcePermanently, { sourceId });
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

	async function removeCommunity(communityId: Id<'communities'>) {
		busyKey = `community:${communityId}`;
		try {
			const result = await client.action((api as any).admin.deleteCommunityPermanently, {
				communityId
			});
			if (!result.deleted) {
				toast.error('Community not found');
				return;
			}
			toast.success(`Community deleted, ${result.r2DeletedCount} R2 objects removed`);
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to delete community');
		} finally {
			busyKey = null;
		}
	}

	async function removeUser(authId: string) {
		busyKey = `user:${authId}`;
		try {
			const result = await client.action((api as any).admin.deleteUserPermanently, { authId });
			if (!result.deleted) {
				toast.error('User not found');
				return;
			}
			toast.success(`User deleted, ${result.r2DeletedCount} R2 objects removed`);
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to delete user');
		} finally {
			busyKey = null;
		}
	}

	async function removeKnowledgeCell(cellId: Id<'knowledge_cells'>) {
		busyKey = `cell:${cellId}`;
		try {
			const result = await client.action((api as any).admin.deleteKnowledgeCellPermanently, {
				cellId
			});
			if (!result.deleted) {
				toast.error('Knowledge cell not found');
				return;
			}
			toast.success(`Knowledge cell deleted${result.r2Deleted ? ' (R2 body removed)' : ''}`);
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to delete knowledge cell');
		} finally {
			busyKey = null;
		}
	}

	async function removeKnowledgeNote(noteId: Id<'knowledge_notes'>) {
		busyKey = `note:${noteId}`;
		try {
			const result = await client.action((api as any).admin.deleteKnowledgeNotePermanently, {
				noteId
			});
			if (!result.deleted) {
				toast.error('Knowledge note not found');
				return;
			}
			toast.success(`Knowledge note deleted${result.r2Deleted ? ' (R2 body removed)' : ''}`);
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to delete knowledge note');
		} finally {
			busyKey = null;
		}
	}

	async function removeInformationSource(sourceId: Id<'information_sources'>) {
		busyKey = `infoSource:${sourceId}`;
		try {
			const result = await client.action((api as any).admin.deleteInformationSourcePermanently, {
				sourceId
			});
			if (!result.deleted) {
				toast.error('Information source not found');
				return;
			}
			toast.success('Information source deleted');
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to delete information source');
		} finally {
			busyKey = null;
		}
	}

	async function removeDomain(domainId: Id<'knowledge_domains'>) {
		busyKey = `domain:${domainId}`;
		try {
			const result = await client.action((api as any).admin.deleteDomainPermanently, { domainId });
			if (!result.deleted) {
				toast.error('Domain not found');
				return;
			}
			toast.success('Domain deleted');
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to delete domain');
		} finally {
			busyKey = null;
		}
	}

	async function removeEntity(entityId: Id<'knowledge_entities'>) {
		busyKey = `entity:${entityId}`;
		try {
			const result = await client.action((api as any).admin.deleteEntityPermanently, { entityId });
			if (!result.deleted) {
				toast.error('Entity not found');
				return;
			}
			toast.success('Entity deleted');
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to delete entity');
		} finally {
			busyKey = null;
		}
	}

	async function removeGoal(goalId: Id<'learning_goals'>) {
		busyKey = `goal:${goalId}`;
		try {
			const result = await client.action((api as any).admin.deleteGoalPermanently, { goalId });
			if (!result.deleted) {
				toast.error('Goal not found');
				return;
			}
			toast.success('Goal deleted');
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to delete goal');
		} finally {
			busyKey = null;
		}
	}

	async function removePath(pathId: Id<'knowledge_paths'>) {
		busyKey = `path:${pathId}`;
		try {
			const result = await client.action((api as any).admin.deletePathPermanently, { pathId });
			if (!result.deleted) {
				toast.error('Path not found');
				return;
			}
			toast.success('Path deleted');
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to delete path');
		} finally {
			busyKey = null;
		}
	}

	function requestDelete(kind: string, id: any) {
		pendingDelete = { kind, id } as PendingDelete;
		deleteDialogOpen = true;
	}

	function getDeleteDialogDescription() {
		if (!pendingDelete) return 'This action cannot be undone.';
		const descriptions: Record<string, string> = {
			source: 'Delete this source permanently? This removes all its items and R2 bodies.',
			sourceItem: 'Delete this source item permanently?',
			post: 'Delete this post permanently? This also removes comments, votes, and R2 body.',
			community:
				'Delete this community permanently? This removes all members, posts, collections, and chat messages.',
			user: 'Delete this user permanently? This removes all their posts, votes, comments, knowledge, DMs, and profile.',
			knowledgeCell:
				'Delete this knowledge cell permanently? This removes all versions, claims, citations, relationships, and user progress.',
			knowledgeNote:
				'Delete this knowledge note permanently? This removes all contributions and blocks.',
			informationSource:
				'Delete this information source permanently? This removes all versions, extraction jobs, and candidates.',
			domain: 'Delete this domain permanently? This removes all topic links.',
			entity: 'Delete this entity permanently? This removes all relationships and cell links.',
			goal: 'Delete this goal permanently? This removes all topic and cell links.',
			path: 'Delete this path permanently? This removes all steps.'
		};
		return descriptions[pendingDelete.kind] ?? 'This action cannot be undone.';
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
		if (current.kind === 'post') {
			await removePost(current.id);
			return;
		}
		if (current.kind === 'community') {
			await removeCommunity(current.id);
			return;
		}
		if (current.kind === 'user') {
			await removeUser(current.id);
			return;
		}
		if (current.kind === 'knowledgeCell') {
			await removeKnowledgeCell(current.id);
			return;
		}
		if (current.kind === 'knowledgeNote') {
			await removeKnowledgeNote(current.id);
			return;
		}
		if (current.kind === 'informationSource') {
			await removeInformationSource(current.id);
			return;
		}
		if (current.kind === 'domain') {
			await removeDomain(current.id);
			return;
		}
		if (current.kind === 'entity') {
			await removeEntity(current.id);
			return;
		}
		if (current.kind === 'goal') {
			await removeGoal(current.id);
			return;
		}
		if (current.kind === 'path') {
			await removePath(current.id);
			return;
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
				Permanent cleanup for all entity types with cascade deletion.
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
						</div>
						<div class="rounded-md border p-3">
							<p class="text-xs text-muted-foreground">Last Sweeper Success</p>
							<p class="mt-1 font-medium">
								{dashboardQuery.data.debug.sweeper.lastSuccessAt
									? new Date(dashboardQuery.data.debug.sweeper.lastSuccessAt).toLocaleString()
									: 'Never'}
							</p>
						</div>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader><CardTitle>Sources</CardTitle></CardHeader>
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
													{#if source.rssFeedUrl}<Badge variant="outline">RSS-backed</Badge>{/if}
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
										<TableCell class="text-xs text-muted-foreground"
											>{new Date(source.updatedAt).toLocaleString()}</TableCell
										>
										<TableCell class="text-right">
											<Button
												variant="destructive"
												size="sm"
												disabled={busyKey === `source:${source._id}`}
												onclick={() => requestDelete('source', source._id)}
											>
												<Trash2 class="mr-1 size-4" />Delete
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
				<CardHeader><CardTitle>Source Items</CardTitle></CardHeader>
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
										<TableCell class="text-xs text-muted-foreground"
											>{new Date(sourceItem.publishedAt).toLocaleString()}</TableCell
										>
										<TableCell class="text-right">{sourceItem.hasR2Body ? 'yes' : 'no'}</TableCell>
										<TableCell class="text-right">
											<Button
												variant="destructive"
												size="sm"
												disabled={busyKey === `item:${sourceItem._id}`}
												onclick={() => requestDelete('sourceItem', sourceItem._id)}
											>
												<Trash2 class="mr-1 size-4" />Delete
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
				<CardHeader><CardTitle>Posts</CardTitle></CardHeader>
				<CardContent>
					<div class="rounded-md border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Post</TableHead>
									<TableHead>Author</TableHead>
									<TableHead>Visibility</TableHead>
									<TableHead>Created</TableHead>
									<TableHead class="text-right">Action</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{#each dashboardQuery.data?.posts ?? [] as post (post._id)}
									<TableRow>
										<TableCell>
											<div class="max-w-[380px]">
												<p class="truncate font-medium">{post.title}</p>
												{#if post.url}<p class="truncate text-xs text-muted-foreground">
														{post.url}
													</p>{/if}
											</div>
										</TableCell>
										<TableCell class="text-xs">{post.authorAuthId}</TableCell>
										<TableCell>{post.visibility}</TableCell>
										<TableCell class="text-xs text-muted-foreground"
											>{new Date(post.createdAt).toLocaleString()}</TableCell
										>
										<TableCell class="text-right">
											<Button
												variant="destructive"
												size="sm"
												disabled={busyKey === `post:${post._id}`}
												onclick={() => requestDelete('post', post._id)}
											>
												<Trash2 class="mr-1 size-4" />Delete
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
				<CardHeader><CardTitle>Communities</CardTitle></CardHeader>
				<CardContent>
					{#if communitiesQuery.isLoading}
						<p class="text-sm text-muted-foreground">Loading...</p>
					{:else}
						<div class="rounded-md border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Name</TableHead>
										<TableHead>Slug</TableHead>
										<TableHead>Visibility</TableHead>
										<TableHead>Owner</TableHead>
										<TableHead class="text-right">Action</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{#each communitiesQuery.data ?? [] as community (community._id)}
										<TableRow>
											<TableCell class="font-medium">{community.name}</TableCell>
											<TableCell>{community.slug}</TableCell>
											<TableCell
												><Badge
													variant={community.visibility === 'public' ? 'default' : 'secondary'}
													>{community.visibility}</Badge
												></TableCell
											>
											<TableCell class="max-w-[200px] truncate text-xs"
												>{community.ownerAuthId}</TableCell
											>
											<TableCell class="text-right">
												<Button
													variant="destructive"
													size="sm"
													disabled={busyKey === `community:${community._id}`}
													onclick={() => requestDelete('community', community._id)}
												>
													<Trash2 class="mr-1 size-4" />Delete
												</Button>
											</TableCell>
										</TableRow>
									{/each}
								</TableBody>
							</Table>
						</div>
					{/if}
				</CardContent>
			</Card>

			<Card>
				<CardHeader><CardTitle>Users</CardTitle></CardHeader>
				<CardContent>
					{#if usersQuery.isLoading}
						<p class="text-sm text-muted-foreground">Loading...</p>
					{:else}
						<div class="rounded-md border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Name</TableHead>
										<TableHead>Auth ID</TableHead>
										<TableHead>Email</TableHead>
										<TableHead>Created</TableHead>
										<TableHead class="text-right">Action</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{#each usersQuery.data ?? [] as user (user._id)}
										<TableRow>
											<TableCell class="font-medium">{user.name}</TableCell>
											<TableCell class="max-w-[200px] truncate text-xs">{user.authId}</TableCell>
											<TableCell class="text-xs">{user.email ?? '-'}</TableCell>
											<TableCell class="text-xs text-muted-foreground"
												>{new Date(user.createdAt).toLocaleString()}</TableCell
											>
											<TableCell class="text-right">
												<Button
													variant="destructive"
													size="sm"
													disabled={busyKey === `user:${user.authId}`}
													onclick={() => requestDelete('user', user.authId)}
												>
													<Trash2 class="mr-1 size-4" />Delete
												</Button>
											</TableCell>
										</TableRow>
									{/each}
								</TableBody>
							</Table>
						</div>
					{/if}
				</CardContent>
			</Card>

			<Card>
				<CardHeader><CardTitle>Knowledge Cells</CardTitle></CardHeader>
				<CardContent>
					{#if knowledgeCellsQuery.isLoading}
						<p class="text-sm text-muted-foreground">Loading...</p>
					{:else}
						<div class="rounded-md border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Title</TableHead>
										<TableHead>Type</TableHead>
										<TableHead>Source</TableHead>
										<TableHead>Created</TableHead>
										<TableHead class="text-right">Action</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{#each knowledgeCellsQuery.data ?? [] as cell (cell._id)}
										<TableRow>
											<TableCell class="max-w-[300px] truncate font-medium">{cell.title}</TableCell>
											<TableCell><Badge variant="outline">{cell.cellType}</Badge></TableCell>
											<TableCell>{cell.source}</TableCell>
											<TableCell class="text-xs text-muted-foreground"
												>{new Date(cell.createdAt).toLocaleString()}</TableCell
											>
											<TableCell class="text-right">
												<Button
													variant="destructive"
													size="sm"
													disabled={busyKey === `cell:${cell._id}`}
													onclick={() => requestDelete('knowledgeCell', cell._id)}
												>
													<Trash2 class="mr-1 size-4" />Delete
												</Button>
											</TableCell>
										</TableRow>
									{/each}
								</TableBody>
							</Table>
						</div>
					{/if}
				</CardContent>
			</Card>

			<Card>
				<CardHeader><CardTitle>Knowledge Notes</CardTitle></CardHeader>
				<CardContent>
					{#if knowledgeNotesQuery.isLoading}
						<p class="text-sm text-muted-foreground">Loading...</p>
					{:else}
						<div class="rounded-md border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Title</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>User</TableHead>
										<TableHead>Created</TableHead>
										<TableHead class="text-right">Action</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{#each knowledgeNotesQuery.data ?? [] as note (note._id)}
										<TableRow>
											<TableCell class="max-w-[300px] truncate font-medium">{note.title}</TableCell>
											<TableCell
												><Badge variant={note.status === 'published' ? 'default' : 'secondary'}
													>{note.status}</Badge
												></TableCell
											>
											<TableCell class="max-w-[200px] truncate text-xs">{note.userId}</TableCell>
											<TableCell class="text-xs text-muted-foreground"
												>{new Date(note.createdAt).toLocaleString()}</TableCell
											>
											<TableCell class="text-right">
												<Button
													variant="destructive"
													size="sm"
													disabled={busyKey === `note:${note._id}`}
													onclick={() => requestDelete('knowledgeNote', note._id)}
												>
													<Trash2 class="mr-1 size-4" />Delete
												</Button>
											</TableCell>
										</TableRow>
									{/each}
								</TableBody>
							</Table>
						</div>
					{/if}
				</CardContent>
			</Card>

			<Card>
				<CardHeader><CardTitle>Information Sources</CardTitle></CardHeader>
				<CardContent>
					{#if infoSourcesQuery.isLoading}
						<p class="text-sm text-muted-foreground">Loading...</p>
					{:else}
						<div class="rounded-md border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Title</TableHead>
										<TableHead>Type</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>Created</TableHead>
										<TableHead class="text-right">Action</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{#each infoSourcesQuery.data ?? [] as source (source._id)}
										<TableRow>
											<TableCell class="max-w-[300px] truncate font-medium"
												>{source.title}</TableCell
											>
											<TableCell>{source.sourceType}</TableCell>
											<TableCell>
												<Badge
													variant={source.status === 'failed'
														? 'destructive'
														: source.status === 'ready'
															? 'default'
															: 'secondary'}
												>
													{source.status}
												</Badge>
											</TableCell>
											<TableCell class="text-xs text-muted-foreground"
												>{new Date(source.createdAt).toLocaleString()}</TableCell
											>
											<TableCell class="text-right">
												<Button
													variant="destructive"
													size="sm"
													disabled={busyKey === `infoSource:${source._id}`}
													onclick={() => requestDelete('informationSource', source._id)}
												>
													<Trash2 class="mr-1 size-4" />Delete
												</Button>
											</TableCell>
										</TableRow>
									{/each}
								</TableBody>
							</Table>
						</div>
					{/if}
				</CardContent>
			</Card>

			<Card>
				<CardHeader><CardTitle>Domains</CardTitle></CardHeader>
				<CardContent>
					{#if domainsQuery.isLoading}
						<p class="text-sm text-muted-foreground">Loading...</p>
					{:else}
						<div class="rounded-md border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Name</TableHead>
										<TableHead>Description</TableHead>
										<TableHead class="text-right">Action</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{#each domainsQuery.data ?? [] as domain (domain._id)}
										<TableRow>
											<TableCell class="font-medium">{domain.name}</TableCell>
											<TableCell class="max-w-[400px] truncate text-sm text-muted-foreground"
												>{domain.description ?? '-'}</TableCell
											>
											<TableCell class="text-right">
												<Button
													variant="destructive"
													size="sm"
													disabled={busyKey === `domain:${domain._id}`}
													onclick={() => requestDelete('domain', domain._id)}
												>
													<Trash2 class="mr-1 size-4" />Delete
												</Button>
											</TableCell>
										</TableRow>
									{/each}
								</TableBody>
							</Table>
						</div>
					{/if}
				</CardContent>
			</Card>

			<Card>
				<CardHeader><CardTitle>Entities</CardTitle></CardHeader>
				<CardContent>
					{#if entitiesQuery.isLoading}
						<p class="text-sm text-muted-foreground">Loading...</p>
					{:else}
						<div class="rounded-md border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Name</TableHead>
										<TableHead>Type</TableHead>
										<TableHead class="text-right">Action</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{#each entitiesQuery.data ?? [] as entity (entity._id)}
										<TableRow>
											<TableCell class="font-medium">{entity.name}</TableCell>
											<TableCell>{entity.entityType}</TableCell>
											<TableCell class="text-right">
												<Button
													variant="destructive"
													size="sm"
													disabled={busyKey === `entity:${entity._id}`}
													onclick={() => requestDelete('entity', entity._id)}
												>
													<Trash2 class="mr-1 size-4" />Delete
												</Button>
											</TableCell>
										</TableRow>
									{/each}
								</TableBody>
							</Table>
						</div>
					{/if}
				</CardContent>
			</Card>

			<Card>
				<CardHeader><CardTitle>Goals</CardTitle></CardHeader>
				<CardContent>
					{#if goalsQuery.isLoading}
						<p class="text-sm text-muted-foreground">Loading...</p>
					{:else}
						<div class="rounded-md border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Title</TableHead>
										<TableHead>Type</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>User</TableHead>
										<TableHead class="text-right">Action</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{#each goalsQuery.data ?? [] as goal (goal._id)}
										<TableRow>
											<TableCell class="max-w-[300px] truncate font-medium">{goal.title}</TableCell>
											<TableCell>{goal.goalType}</TableCell>
											<TableCell><Badge variant="outline">{goal.status}</Badge></TableCell>
											<TableCell class="max-w-[200px] truncate text-xs">{goal.userId}</TableCell>
											<TableCell class="text-right">
												<Button
													variant="destructive"
													size="sm"
													disabled={busyKey === `goal:${goal._id}`}
													onclick={() => requestDelete('goal', goal._id)}
												>
													<Trash2 class="mr-1 size-4" />Delete
												</Button>
											</TableCell>
										</TableRow>
									{/each}
								</TableBody>
							</Table>
						</div>
					{/if}
				</CardContent>
			</Card>

			<Card>
				<CardHeader><CardTitle>Paths</CardTitle></CardHeader>
				<CardContent>
					{#if pathsQuery.isLoading}
						<p class="text-sm text-muted-foreground">Loading...</p>
					{:else}
						<div class="rounded-md border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Title</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>User</TableHead>
										<TableHead class="text-right">Action</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{#each pathsQuery.data ?? [] as path (path._id)}
										<TableRow>
											<TableCell class="max-w-[300px] truncate font-medium">{path.title}</TableCell>
											<TableCell
												><Badge variant={path.status === 'active' ? 'default' : 'secondary'}
													>{path.status}</Badge
												></TableCell
											>
											<TableCell class="max-w-[200px] truncate text-xs">{path.userId}</TableCell>
											<TableCell class="text-right">
												<Button
													variant="destructive"
													size="sm"
													disabled={busyKey === `path:${path._id}`}
													onclick={() => requestDelete('path', path._id)}
												>
													<Trash2 class="mr-1 size-4" />Delete
												</Button>
											</TableCell>
										</TableRow>
									{/each}
								</TableBody>
							</Table>
						</div>
					{/if}
				</CardContent>
			</Card>
		</div>
	{/if}
</main>

<Dialog.Root
	open={deleteDialogOpen}
	onOpenChange={(open) => {
		deleteDialogOpen = open;
		if (!open) pendingDelete = null;
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
