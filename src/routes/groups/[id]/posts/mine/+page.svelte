<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Loader } from '$lib/components/prompt-kit/loader';
	import { Calendar, CheckSquare, MessageSquare, PenSquare, Trash2 } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import * as Dialog from '$lib/components/ui/dialog';

	const client = useConvexClient();
	const groupId = $derived(page.params.id as Id<'groups'>);
	const currentUserId = $derived(
		(page.data.currentUser as any)?.id ?? (page.data.currentUser as any)?._id
	);

	const myPostsQuery = useQuery((api as any).group_posts.list, () =>
		groupId && currentUserId ? { groupId, authorId: currentUserId } : 'skip'
	);
	const myPosts = $derived(myPostsQuery.data ?? []);

	let searchQuery = $state('');
	let selectedTag = $state('all');
	let sortBy = $state<'newest' | 'oldest' | 'title'>('newest');

	let selectedIds = $state<Set<Id<'group_posts'>>>(new Set());
	let isDeleting = $state(false);
	let isConfirmOpen = $state(false);

	const selectedCount = $derived(selectedIds.size);
	const availableTags = $derived.by(() => {
		const tags = new Set<string>();
		for (const post of myPosts as Array<any>) {
			for (const tag of (post.tags ?? []) as Array<string>) {
				tags.add(tag);
			}
		}
		return Array.from(tags).sort((a, b) => a.localeCompare(b));
	});
	const filteredPosts = $derived.by(() => {
		const query = searchQuery.trim().toLowerCase();
		const filtered = (myPosts as Array<any>).filter((post) => {
			const matchesTag = selectedTag === 'all' || (post.tags ?? []).includes(selectedTag);
			if (!matchesTag) return false;
			if (!query) return true;
			const haystack = `${post.title} ${post.snippet} ${(post.tags ?? []).join(' ')}`.toLowerCase();
			return haystack.includes(query);
		});

		const sorted = [...filtered];
		if (sortBy === 'oldest') {
			sorted.sort((a, b) => a.createdAt - b.createdAt);
		} else if (sortBy === 'title') {
			sorted.sort((a, b) => a.title.localeCompare(b.title));
		} else {
			sorted.sort((a, b) => b.createdAt - a.createdAt);
		}
		return sorted;
	});
	const allVisibleSelected = $derived(
		filteredPosts.length > 0 && filteredPosts.every((post: any) => selectedIds.has(post._id))
	);

	$effect(() => {
		const validIds = new Set(myPosts.map((post: any) => post._id));
		const next = new Set(Array.from(selectedIds).filter((id) => validIds.has(id)));
		if (next.size !== selectedIds.size) {
			selectedIds = next;
		}
	});

	function formatDate(ts: number) {
		return new Date(ts).toLocaleDateString();
	}

	function toggleSelect(postId: Id<'group_posts'>) {
		const next = new Set(selectedIds);
		if (next.has(postId)) {
			next.delete(postId);
		} else {
			next.add(postId);
		}
		selectedIds = next;
	}

	function toggleSelectAll() {
		if (filteredPosts.length === 0) return;
		const next = new Set(selectedIds);

		if (allVisibleSelected) {
			for (const post of filteredPosts as Array<any>) {
				next.delete(post._id);
			}
		} else {
			for (const post of filteredPosts as Array<any>) {
				next.add(post._id);
			}
		}

		selectedIds = next;
	}

	function clearFilters() {
		searchQuery = '';
		selectedTag = 'all';
		sortBy = 'newest';
	}

	async function handleBulkDelete() {
		if (selectedCount === 0 || isDeleting) return;
		isDeleting = true;
		try {
			const result: { deletedCount: number } = await client.mutation(
				(api as any).group_posts.removeBulk,
				{
					groupId,
					postIds: Array.from(selectedIds)
				}
			);
			selectedIds = new Set();
			isConfirmOpen = false;
			toast.success(`Deleted ${result.deletedCount} post${result.deletedCount === 1 ? '' : 's'}`);
		} catch (e: any) {
			toast.error(e?.message || 'Failed to delete selected posts');
		} finally {
			isDeleting = false;
		}
	}
</script>

<svelte:head>
	<title>My Posts - Group</title>
</svelte:head>

<div class="mx-auto max-w-5xl space-y-5 p-6">
	<div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
		<div>
			<h1 class="text-lg font-semibold">My Posts</h1>
			<p class="text-xs text-muted-foreground">
				Review your posts and remove multiple posts in one action.
			</p>
		</div>
		<div class="flex items-center gap-2">
			<Button variant="outline" size="sm" href={resolve(`/groups/${groupId}?view=posts`)}>
				Back to Feed
			</Button>
			<Button size="sm" class="gap-2" href={resolve(`/groups/${groupId}/posts/create`)}>
				<PenSquare class="h-4 w-4" />
				Create Post
			</Button>
		</div>
	</div>

	{#if myPostsQuery.isLoading}
		<div class="flex h-[35vh] items-center justify-center">
			<Loader variant="circular" size="lg" />
		</div>
	{:else if myPosts.length === 0}
		<div class="rounded-xl border border-dashed bg-muted/10 p-12 text-center">
			<h2 class="text-lg font-semibold">No posts yet</h2>
			<p class="mt-2 text-sm text-muted-foreground">Create your first group post to see it here.</p>
		</div>
	{:else}
		<div class="rounded-xl border bg-card p-4">
			<div class="grid gap-3 md:grid-cols-[1fr_180px_180px_auto] md:items-center">
				<Input bind:value={searchQuery} placeholder="Search title, snippet, or tags..." class="h-9" />
				<select bind:value={selectedTag} class="h-9 rounded-md border bg-background px-3 text-sm">
					<option value="all">All tags</option>
					{#each availableTags as tag (tag)}
						<option value={tag}>#{tag}</option>
					{/each}
				</select>
				<select bind:value={sortBy} class="h-9 rounded-md border bg-background px-3 text-sm">
					<option value="newest">Newest first</option>
					<option value="oldest">Oldest first</option>
					<option value="title">Title A-Z</option>
				</select>
				<Button variant="outline" size="sm" onclick={clearFilters}>Reset</Button>
			</div>
		</div>

		<div class="rounded-xl border bg-card p-4">
			<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
				<div class="flex items-center gap-2 text-sm text-muted-foreground">
					<CheckSquare class="h-4 w-4" />
					{selectedCount} selected | {filteredPosts.length} shown
				</div>
				<div class="flex items-center gap-2">
					<Button variant="outline" size="sm" onclick={toggleSelectAll}>
						{allVisibleSelected ? 'Clear Visible' : 'Select Visible'}
					</Button>
					<Button
						variant="destructive"
						size="sm"
						disabled={selectedCount === 0}
						onclick={() => (isConfirmOpen = true)}
						class="gap-2"
					>
						<Trash2 class="h-4 w-4" />
						Delete Selected
					</Button>
				</div>
			</div>

			{#if filteredPosts.length === 0}
				<div class="rounded-lg border border-dashed bg-muted/10 p-8 text-center">
					<p class="text-sm text-muted-foreground">No posts match your filters.</p>
				</div>
			{:else}
				<div class="space-y-3">
					{#each filteredPosts as post (post._id)}
						<div class="rounded-lg border p-4">
							<div class="flex items-start gap-3">
								<input
									type="checkbox"
									class="mt-1 h-4 w-4"
									checked={selectedIds.has(post._id)}
									onchange={() => toggleSelect(post._id)}
								/>
								<div class="min-w-0 flex-1 space-y-2">
									<div class="flex flex-wrap items-center gap-2">
										<Badge variant="secondary" class="text-[10px] uppercase">Group Post</Badge>
										<span class="inline-flex items-center gap-1 text-xs text-muted-foreground">
											<Calendar class="h-3.5 w-3.5" />
											{formatDate(post.createdAt)}
										</span>
									</div>

									<p class="truncate text-base font-semibold">{post.title}</p>
									<p class="line-clamp-2 text-sm text-muted-foreground">{post.snippet}</p>

									{#if post.tags.length > 0}
										<div class="flex flex-wrap gap-1.5">
											{#each post.tags as tag (tag)}
												<Badge variant="outline" class="text-[10px]">#{tag}</Badge>
											{/each}
										</div>
									{/if}

									<div class="flex flex-wrap items-center gap-2 pt-1">
										<Button
											size="sm"
											class="h-8 gap-2 px-3"
											href={resolve(`/groups/${groupId}/post/${post._id}`)}
										>
											<MessageSquare class="h-4 w-4" />
											Open
										</Button>
										<Button
											size="sm"
											variant="outline"
											class="h-8 gap-2 px-3"
											href={resolve(`/groups/${groupId}/posts/${post._id}/edit`)}
										>
											<PenSquare class="h-4 w-4" />
											Edit
										</Button>
									</div>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

<Dialog.Root bind:open={isConfirmOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Delete selected posts?</Dialog.Title>
			<Dialog.Description>
				This will permanently remove {selectedCount} selected post{selectedCount === 1 ? '' : 's'} and
				their discussions.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (isConfirmOpen = false)} disabled={isDeleting}
				>Cancel</Button
			>
			<Button variant="destructive" onclick={handleBulkDelete} disabled={isDeleting} class="gap-2">
				{#if isDeleting}
					<Loader variant="circular" size="sm" />
					Deleting...
				{:else}
					<Trash2 class="h-4 w-4" />
					Delete
				{/if}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

