<script lang="ts">
	import { page } from '$app/state';
	import { useAppAuth } from '$lib/auth.svelte';
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
	import {
		ArrowLeft,
		Calendar,
		ExternalLink,
		Globe,
		Loader2,
		Lock,
		MessageSquare,
		ThumbsUp,
		Trash2,
		Users
	} from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	const auth = useAppAuth();
	const client = useConvexClient();
	const username = $derived(page.params.username);

	const currentUserQuery = useQuery(api.auth.getCurrentUser, {});
	const isAuthorized = $derived(
		auth.isAuthenticated && currentUserQuery.data?.username === username
	);

	const feedQuery = useQuery((api as any).feed.listGlobal, () =>
		isAuthorized
			? {
					scope: 'me' as const,
					tab: 'new' as const,
					paginationOpts: { numItems: 200, cursor: null }
				}
			: 'skip'
	);

	let selectedPostIds = $state<Array<string>>([]);
	let bulkDeleting = $state(false);
	type PendingDelete =
		| { kind: 'single'; postId: Id<'posts'> }
		| { kind: 'bulk'; postIds: Array<Id<'posts'>> }
		| null;
	let pendingDelete = $state<PendingDelete>(null);
	let deleteDialogOpen = $state(false);

	const allSelected = $derived.by(() => {
		const rows = (feedQuery.data?.page ?? []).filter((item: any) => item.kind === 'post');
		return rows.length > 0 && rows.every((row: any) => selectedPostIds.includes(row._id));
	});

	function toggleSelect(postId: string, checked: boolean) {
		if (checked) {
			if (!selectedPostIds.includes(postId)) {
				selectedPostIds = [...selectedPostIds, postId];
			}
			return;
		}
		selectedPostIds = selectedPostIds.filter((id) => id !== postId);
	}

	function toggleSelectAll(checked: boolean) {
		const rowIds = (feedQuery.data?.page ?? [])
			.filter((item: any) => item.kind === 'post')
			.map((item: any) => item._id);
		selectedPostIds = checked ? rowIds : [];
	}

	async function deletePost(postId: Id<'posts'>) {
		try {
			await client.mutation((api as any).posts.deletePost, { postId });
			selectedPostIds = selectedPostIds.filter((id) => id !== postId);
			toast.success('Post deleted');
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to delete post');
		}
	}

	async function bulkDelete(postIds: Array<Id<'posts'>>) {
		if (postIds.length === 0) return;
		bulkDeleting = true;
		try {
			const results = await Promise.allSettled(
				postIds.map((postId) =>
					client.mutation((api as any).posts.deletePost, { postId: postId as Id<'posts'> })
				)
			);
			const successCount = results.filter((r) => r.status === 'fulfilled').length;
			const failCount = results.length - successCount;
			selectedPostIds = [];
			if (successCount > 0) {
				toast.success(`Deleted ${successCount} post${successCount === 1 ? '' : 's'}`);
			}
			if (failCount > 0) {
				toast.error(`${failCount} post deletion${failCount === 1 ? '' : 's'} failed`);
			}
		} finally {
			bulkDeleting = false;
		}
	}

	function requestDeletePost(postId: Id<'posts'>) {
		pendingDelete = { kind: 'single', postId };
		deleteDialogOpen = true;
	}

	function requestBulkDelete() {
		if (selectedPostIds.length === 0) return;
		pendingDelete = {
			kind: 'bulk',
			postIds: selectedPostIds.map((postId) => postId as Id<'posts'>)
		};
		deleteDialogOpen = true;
	}

	function getDeleteDialogDescription() {
		if (!pendingDelete) return 'This action cannot be undone.';
		if (pendingDelete.kind === 'single') return 'Delete this post permanently?';
		return `Delete ${pendingDelete.postIds.length} posts permanently?`;
	}

	async function confirmDelete() {
		if (!pendingDelete) return;
		const current = pendingDelete;
		deleteDialogOpen = false;
		pendingDelete = null;
		if (current.kind === 'single') {
			await deletePost(current.postId);
			return;
		}
		await bulkDelete(current.postIds);
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
					<h1 class="text-2xl font-semibold tracking-tight">Manage Posts</h1>
					<p class="text-sm text-muted-foreground">Table view with multi-select and bulk delete.</p>
				</div>
			</div>
			<Button
				variant="destructive"
				disabled={selectedPostIds.length === 0 || bulkDeleting}
				onclick={requestBulkDelete}
				class="gap-2"
			>
				{#if bulkDeleting}
					<Loader2 class="size-4 animate-spin" />
				{:else}
					<Trash2 class="size-4" />
				{/if}
				Bulk Delete ({selectedPostIds.length})
			</Button>
		</div>

		{#if !auth.isAuthenticated || (currentUserQuery.data && !isAuthorized)}
			<Card class="border-destructive/20 bg-destructive/5 text-destructive">
				<CardContent class="py-10 text-center">
					<p class="font-medium">You are not authorized to manage these posts.</p>
					<Button variant="outline" class="mt-4" href="/u/{username}">Go back to profile</Button>
				</CardContent>
			</Card>
		{:else if feedQuery.isLoading}
			<div class="flex h-40 items-center justify-center">
				<p class="text-sm text-muted-foreground italic">Loading your posts...</p>
			</div>
		{:else if (feedQuery.data?.page?.length ?? 0) === 0}
			<Card class="bg-muted/30">
				<CardContent class="py-20 text-center">
					<p class="text-muted-foreground italic">You have not posted anything yet.</p>
					<Button variant="default" class="mt-4" href="/submit">Create your first post</Button>
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
							<TableHead>Title</TableHead>
							<TableHead>Scope</TableHead>
							<TableHead class="text-right">Stats</TableHead>
							<TableHead>Created</TableHead>
							<TableHead class="text-right">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{#each (feedQuery.data?.page ?? []).filter((row: any) => row.kind === 'post') as post (post._id)}
							<TableRow>
								<TableCell>
									<Checkbox
										checked={selectedPostIds.includes(post._id)}
										onCheckedChange={(v) => toggleSelect(post._id, !!v)}
									/>
								</TableCell>
								<TableCell>
									<div class="max-w-[420px]">
										<a href="/post/{post._id}" class="line-clamp-1 font-medium hover:underline">
											{post.title}
										</a>
										<p class="line-clamp-1 text-xs text-muted-foreground">{post.snippet}</p>
									</div>
								</TableCell>
								<TableCell>
									{#if post.visibility === 'private'}
										<Badge variant="outline" class="gap-1">
											<Lock class="size-3.5" />
											Private
										</Badge>
									{:else if post.communitySlug}
										<Badge variant="outline" class="gap-1">
											<Users class="size-3.5" />
											c/{post.communitySlug}
										</Badge>
									{:else}
										<Badge variant="outline" class="gap-1">
											<Globe class="size-3.5" />
											Public
										</Badge>
									{/if}
								</TableCell>
								<TableCell class="text-right text-xs text-muted-foreground">
									<div class="flex justify-end gap-3">
										<span class="inline-flex items-center gap-1">
											<MessageSquare class="size-3.5" />
											{post.commentCount}
										</span>
										<span class="inline-flex items-center gap-1">
											<ThumbsUp class="size-3.5" />
											{post.score}
										</span>
									</div>
								</TableCell>
								<TableCell class="text-xs text-muted-foreground">
									<span class="inline-flex items-center gap-1">
										<Calendar class="size-3.5" />
										{new Date(post.createdAt).toLocaleString()}
									</span>
								</TableCell>
								<TableCell class="text-right">
									<div class="flex justify-end gap-1.5">
										{#if post.type === 'link' && post.url}
											<Button size="icon-sm" variant="outline" href={post.url} target="_blank">
												<ExternalLink class="size-3.5" />
											</Button>
										{/if}
										<Button
											size="icon-sm"
											variant="destructive"
											onclick={() => requestDeletePost(post._id)}
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
	</div>
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
			<Button variant="destructive" disabled={bulkDeleting} onclick={confirmDelete}>Delete</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
