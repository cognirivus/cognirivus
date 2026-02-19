<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import type { Id } from '../../../convex/_generated/dataModel';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Badge } from '$lib/components/ui/badge';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import {
		Plus,
		Pencil,
		Trash2,
		Eye,
		EyeOff,
		Save,
		X,
		ArrowLeft,
		BookOpen,
		CheckSquare,
		Square,
		Loader2,
		Upload
	} from '@lucide/svelte';

	const PAGE_SIZE = 25;
	let cursorStack = $state<(string | null)[]>([null]);
	let currentCursorIndex = $state(0);

	const blogsQuery = useQuery((api as any).blogs.listPaginated, () => ({
		onlyPublished: false,
		paginationOpts: { numItems: PAGE_SIZE, cursor: cursorStack[currentCursorIndex] }
	}));
	const blogsPage = $derived(blogsQuery.data?.page || []);
	const hasNextPage = $derived(blogsQuery.data?.isDone === false);
	const hasPrevPage = $derived(currentCursorIndex > 0);
	const skeletonRows = [0, 1, 2];

	const client = useConvexClient();

	let isEditing = $state(false);
	let editingId = $state<Id<'blogs'> | null>(null);
	let title = $state('');
	let body = $state('');
	let bodyUrl = $state<string | null>(null);
	let isLoadingFullBody = $state(false);
	let published = $state(false);
	let error = $state('');
	let isSaving = $state(false);
	let selectedIds = $state<Set<Id<'blogs'>>>(new Set());
	let isDeleting = $state(false);

	function startCreate() {
		isEditing = true;
		editingId = null;
		title = '';
		body = '';
		bodyUrl = null;
		published = false;
		error = '';
	}

	function startEdit(blog: any) {
		isEditing = true;
		editingId = blog._id;
		title = blog.title;
		body = blog.body;
		bodyUrl = blog.bodyUrl || null;
		published = blog.published;
		error = '';
	}

	async function loadFullBody() {
		if (!bodyUrl) return;
		isLoadingFullBody = true;
		error = '';
		try {
			const res = await fetch(bodyUrl);
			if (!res.ok) throw new Error('Failed to fetch full blog body from storage.');
			body = await res.text();
		} catch (e: any) {
			error = e.message || 'Failed to load full blog body.';
		} finally {
			isLoadingFullBody = false;
		}
	}

	async function handleSubmit(event: Event) {
		event.preventDefault();
		error = '';
		isSaving = true;

		try {
			if (editingId) {
				await client.action(api.blogs.update, { id: editingId, title, body, published });
			} else {
				await client.action(api.blogs.create, { title, body, published });
			}
			isEditing = false;
		} catch (e: any) {
			error = e.message || 'An error occurred while saving.';
		} finally {
			isSaving = false;
		}
	}

	async function handleDelete(id: Id<'blogs'>) {
		if (confirm('Are you sure you want to delete this blog post?')) {
			try {
				await client.mutation(api.blogs.remove, { id });
			} catch (e: any) {
				alert(e.message || 'Failed to delete blog post.');
			}
		}
	}

	function toggleSelect(id: Id<'blogs'>) {
		const next = new Set(selectedIds);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		selectedIds = next;
	}

	function toggleSelectAll() {
		if (blogsPage.length === 0) return;
		const allIds = blogsPage.map((blog: { _id: Id<'blogs'> }) => blog._id);
		if (selectedIds.size === allIds.length) {
			selectedIds = new Set();
		} else {
			selectedIds = new Set(allIds);
		}
	}

	function nextPage() {
		if (!hasNextPage || !blogsQuery.data?.continueCursor) return;
		const nextCursor = blogsQuery.data.continueCursor;
		if (currentCursorIndex === cursorStack.length - 1) {
			cursorStack = [...cursorStack, nextCursor];
		}
		currentCursorIndex += 1;
		selectedIds = new Set();
	}

	function prevPage() {
		if (!hasPrevPage) return;
		currentCursorIndex -= 1;
		selectedIds = new Set();
	}

	async function handleBulkDelete() {
		if (selectedIds.size === 0) return;
		const count = selectedIds.size;
		if (
			!confirm(
				`Are you sure you want to delete ${count} blog post(s)? This will also delete all reactions and comments.`
			)
		)
			return;

		isDeleting = true;
		try {
			await client.mutation(api.blogs.removeBulk, { ids: Array.from(selectedIds) });
			selectedIds = new Set();
			alert(`Deleted ${count} blog post(s)`);
		} catch (e: any) {
			alert(e.message || 'Failed to delete blog posts');
		} finally {
			isDeleting = false;
		}
	}

	function formatDate(date: number) {
		return new Intl.DateTimeFormat('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		}).format(date);
	}
</script>

<div class="container mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
	<!-- Header -->
	<div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div class="space-y-2">
			<div class="flex items-center gap-2">
				<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
					<BookOpen class="h-4 w-4 text-primary" />
				</div>
				<h1 class="text-3xl font-semibold tracking-tight">Blog Management</h1>
			</div>
			<p class="text-muted-foreground">
				Create, edit, and manage your blog posts with markdown support.
			</p>
		</div>
		{#if !isEditing}
			<Button onclick={startCreate} class="gap-2 font-medium shadow-sm">
				<Plus class="h-4 w-4" />
				New Post
			</Button>
			{#if selectedIds.size > 0}
				<Button
					variant="destructive"
					size="sm"
					onclick={handleBulkDelete}
					disabled={isDeleting}
					class="gap-2 font-medium"
				>
					{#if isDeleting}
						<Loader2 class="h-4 w-4 animate-spin" />
					{:else}
						<Trash2 class="h-4 w-4" />
					{/if}
					Delete ({selectedIds.size})
				</Button>
			{/if}
		{/if}
	</div>

	{#if isEditing}
		<div class="overflow-hidden rounded-xl border bg-card shadow-sm">
			<div class="border-b bg-muted/30 px-6 py-4">
				<div class="flex items-center justify-between">
					<div>
						<h2 class="text-lg font-semibold">{editingId ? 'Edit Post' : 'Create New Post'}</h2>
						<p class="text-sm text-muted-foreground">
							Fill in the details below to {editingId ? 'update' : 'create'} your blog post.
						</p>
					</div>
					<Button
						variant="ghost"
						size="icon"
						onclick={() => (isEditing = false)}
						class="h-8 w-8 rounded-full"
					>
						<X class="h-4 w-4" />
					</Button>
				</div>
			</div>

			<div class="p-6">
				<form onsubmit={handleSubmit} class="space-y-6">
					<div class="space-y-2">
						<label for="title" class="text-sm font-medium">Post Title</label>
						<Input
							type="text"
							id="title"
							bind:value={title}
							required
							placeholder="Enter a compelling title..."
							class="h-11 text-lg font-medium"
						/>
					</div>

					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<label for="body" class="text-sm font-medium">Content (Markdown)</label>
							<div class="flex items-center gap-2">
								{#if editingId && bodyUrl && body.length < 600}
									<Button
										type="button"
										variant="outline"
										size="sm"
										onclick={loadFullBody}
										disabled={isLoadingFullBody}
										class="h-7 gap-1.5 text-xs font-medium"
									>
										{#if isLoadingFullBody}
											<Loader2 class="h-3 w-3 animate-spin" />
										{:else}
											<Upload class="h-3 w-3" />
										{/if}
										Load Full Body
									</Button>
								{/if}
								<Badge variant="outline" class="text-[10px] font-medium tracking-wider uppercase"
									>Markdown Supported</Badge
								>
							</div>
						</div>
						<Textarea
							id="body"
							bind:value={body}
							required
							rows={15}
							placeholder="Write your story..."
							class="min-h-[400px] resize-y p-4 font-mono text-sm leading-relaxed"
						/>
					</div>

					<div
						class="flex items-center gap-3 rounded-lg border bg-muted/20 p-4 transition-colors hover:bg-muted/30"
					>
						<input
							type="checkbox"
							id="published"
							bind:checked={published}
							class="h-4 w-4 rounded border-input text-primary focus:ring-primary/20"
						/>
						<div class="space-y-0.5">
							<label for="published" class="cursor-pointer text-sm font-semibold">
								Publish Post
							</label>
							<p class="text-xs text-muted-foreground">
								Make this post visible to everyone immediately after saving.
							</p>
						</div>
					</div>

					{#if error}
						<div
							class="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm font-medium text-destructive"
						>
							{error}
						</div>
					{/if}

					<div class="flex flex-col-reverse justify-end gap-3 border-t pt-6 sm:flex-row">
						<Button
							variant="outline"
							onclick={() => (isEditing = false)}
							disabled={isSaving}
							class="w-full sm:w-auto"
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={isSaving}
							class="w-full gap-2 font-medium shadow-sm sm:w-auto"
						>
							{#if isSaving}
								<Loader variant="circular" size="sm" />
								Saving...
							{:else}
								<Save class="h-4 w-4" />
								{editingId ? 'Update Post' : 'Save & Create'}
							{/if}
						</Button>
					</div>
				</form>
			</div>
		</div>
	{:else if blogsQuery.isLoading}
		<div class="grid gap-4">
			{#each skeletonRows as row (row)}
				<div class="rounded-xl border bg-card p-6">
					<div class="flex items-center justify-between">
						<div class="space-y-2">
							<Skeleton class="h-6 w-[250px]" />
							<Skeleton class="h-4 w-[150px]" />
						</div>
						<div class="flex gap-2">
							<Skeleton class="h-9 w-9 rounded-md" />
							<Skeleton class="h-9 w-9 rounded-md" />
						</div>
					</div>
				</div>
			{/each}
		</div>
	{:else if blogsQuery.error}
		<div class="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
			<p class="font-medium text-destructive">Failed to load blog posts</p>
			<p class="mt-1 text-sm text-muted-foreground">Please try refreshing the page.</p>
		</div>
	{:else if blogsQuery.data}
		<div class="overflow-hidden rounded-xl border bg-card shadow-sm">
			<div class="overflow-x-auto">
				<table class="w-full text-left text-sm">
					<thead>
						<tr class="border-b bg-muted/40 transition-colors">
							<th class="h-12 w-12 px-4 align-middle">
								<button
									type="button"
									onclick={toggleSelectAll}
									class="flex items-center justify-center"
								>
									{#if blogsPage.length > 0 && selectedIds.size === blogsPage.length}
										<CheckSquare class="h-4 w-4 text-primary" />
									{:else if selectedIds.size > 0}
										<CheckSquare class="h-4 w-4 text-muted-foreground" />
									{:else}
										<Square class="h-4 w-4 text-muted-foreground" />
									{/if}
								</button>
							</th>
							<th class="h-12 px-6 align-middle font-medium text-muted-foreground">Title</th>
							<th class="h-12 px-6 align-middle font-medium text-muted-foreground">Status</th>
							<th class="h-12 px-6 align-middle font-medium text-muted-foreground">Date Created</th>
							<th class="h-12 px-6 text-right align-middle font-medium text-muted-foreground"
								>Actions</th
							>
						</tr>
					</thead>
					<tbody class="divide-y">
						{#each blogsPage as blog (blog._id)}
							<tr class="transition-colors hover:bg-muted/20">
								<td class="w-12 px-4 py-4">
									<button
										type="button"
										onclick={() => toggleSelect(blog._id)}
										class="flex items-center justify-center"
									>
										{#if selectedIds.has(blog._id)}
											<CheckSquare class="h-4 w-4 text-primary" />
										{:else}
											<Square class="h-4 w-4 text-muted-foreground hover:text-foreground" />
										{/if}
									</button>
								</td>
								<td class="px-6 py-4">
									<span class="font-semibold text-foreground">{blog.title}</span>
								</td>
								<td class="px-6 py-4">
									{#if blog.published}
										<Badge
											variant="outline"
											class="gap-1.5 border-emerald-500/20 bg-emerald-500/5 font-medium text-emerald-700 dark:text-emerald-400"
										>
											<Eye class="h-3 w-3" />
											Published
										</Badge>
									{:else}
										<Badge
											variant="outline"
											class="gap-1.5 border-amber-500/20 bg-amber-500/5 font-medium text-amber-700 dark:text-amber-400"
										>
											<EyeOff class="h-3 w-3" />
											Draft
										</Badge>
									{/if}
								</td>
								<td class="px-6 py-4 font-medium text-muted-foreground tabular-nums">
									{formatDate(blog.createdAt)}
								</td>
								<td class="px-6 py-4 text-right">
									<div class="flex justify-end gap-1">
										<Button
											variant="ghost"
											size="icon-sm"
											title="Edit Post"
											onclick={() => startEdit(blog)}
											class="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
										>
											<Pencil class="h-4 w-4" />
										</Button>
										<Button
											variant="ghost"
											size="icon-sm"
											title="Delete Post"
											class="h-8 w-8 rounded-full text-destructive/80 hover:bg-destructive/10 hover:text-destructive"
											onclick={() => handleDelete(blog._id)}
										>
											<Trash2 class="h-4 w-4" />
										</Button>
									</div>
								</td>
							</tr>
						{:else}
							<tr>
								<td colspan="5" class="px-6 py-16 text-center">
									<div class="flex flex-col items-center gap-3">
										<div class="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
											<BookOpen class="h-6 w-6 text-muted-foreground/50" />
										</div>
										<h3 class="font-semibold text-foreground">No blog posts yet</h3>
										<p class="text-sm text-muted-foreground max-w-xs mx-auto">
											Start by creating your first post to share updates and articles.
										</p>
										<Button variant="outline" size="sm" onclick={startCreate} class="mt-2">
											Create Post
										</Button>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="flex items-center justify-between border-t bg-muted/20 px-6 py-4">
				<p class="text-sm text-muted-foreground">
					Page <span class="font-semibold text-foreground">{currentCursorIndex + 1}</span> · {blogsPage.length}
					entries
				</p>
				<div class="flex items-center gap-2">
					<Button variant="outline" size="sm" onclick={prevPage} disabled={!hasPrevPage}>
						<ArrowLeft class="mr-1 h-4 w-4" />
						Previous
					</Button>
					<Button variant="outline" size="sm" onclick={nextPage} disabled={!hasNextPage}>
						Next
						<ArrowLeft class="ml-1 h-4 w-4 rotate-180" />
					</Button>
				</div>
			</div>
		</div>
	{/if}
</div>
