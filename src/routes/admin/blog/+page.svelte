<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import type { Id } from '../../../convex/_generated/dataModel';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Plus, Pencil, Trash2, Eye, EyeOff, Save, X } from '@lucide/svelte';

	const blogsQuery = useQuery(api.blogs.list, { onlyPublished: false });
	const client = useConvexClient();

	let isEditing = $state(false);
	let editingId = $state<Id<'blogs'> | null>(null);
	let title = $state('');
	let content = $state('');
	let published = $state(false);
	let error = $state('');
	let isSaving = $state(false);

	function startCreate() {
		isEditing = true;
		editingId = null;
		title = '';
		content = '';
		published = false;
		error = '';
	}

	function startEdit(blog: any) {
		isEditing = true;
		editingId = blog._id;
		title = blog.title;
		content = blog.content;
		published = blog.published;
		error = '';
	}

	async function handleSubmit(event: Event) {
		event.preventDefault();
		error = '';
		isSaving = true;

		try {
			if (editingId) {
				await client.mutation(api.blogs.update, { id: editingId, title, content, published });
			} else {
				await client.mutation(api.blogs.create, { title, content, published });
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

	function formatDate(date: number) {
		return new Intl.DateTimeFormat('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		}).format(date);
	}
</script>

<div class="p-6">
	<div class="mx-auto flex w-full max-w-6xl flex-col gap-8">
		<header class="flex items-center justify-between">
			<div>
				<h1 class="text-2xl font-bold tracking-tight text-foreground">Blog Management</h1>
				<p class="text-sm text-muted-foreground">Create, edit, and manage your blog posts.</p>
			</div>
			{#if !isEditing}
				<Button onclick={startCreate} class="gap-2">
					<Plus class="h-4 w-4" />
					New Post
				</Button>
			{/if}
		</header>

		{#if isEditing}
			<div class="rounded-2xl border border-border bg-card p-6 shadow-sm">
				<form onsubmit={handleSubmit} class="space-y-6">
					<div class="flex items-center justify-between">
						<h2 class="text-lg font-bold">{editingId ? 'Edit Post' : 'New Post'}</h2>
						<Button variant="ghost" size="icon" onclick={() => (isEditing = false)}>
							<X class="h-4 w-4" />
						</Button>
					</div>

					<div class="space-y-2">
						<label for="title" class="text-sm font-medium">Title</label>
						<input
							type="text"
							id="title"
							bind:value={title}
							required
							placeholder="Post title"
							class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
						/>
					</div>

					<div class="space-y-2">
						<label for="content" class="text-sm font-medium">Content (Markdown)</label>
						<textarea
							id="content"
							bind:value={content}
							required
							rows="15"
							placeholder="Write your post content here..."
							class="flex min-h-[300px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
						></textarea>
					</div>

					<div class="flex items-center gap-2">
						<input
							type="checkbox"
							id="published"
							bind:checked={published}
							class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
						/>
						<label for="published" class="text-sm font-medium">Published</label>
					</div>

					{#if error}
						<p class="text-sm text-destructive">{error}</p>
					{/if}

					<div class="flex justify-end gap-3">
						<Button variant="outline" onclick={() => (isEditing = false)} disabled={isSaving}
							>Cancel</Button
						>
						<Button type="submit" disabled={isSaving} class="gap-2">
							{#if isSaving}
								<Loader variant="circular" size="xs" />
								Saving...
							{:else}
								<Save class="h-4 w-4" />
								{editingId ? 'Update Post' : 'Create Post'}
							{/if}
						</Button>
					</div>
				</form>
			</div>
		{:else if blogsQuery.isLoading}
			<div class="flex h-64 items-center justify-center">
				<Loader variant="circular" size="lg" />
			</div>
		{:else if blogsQuery.error}
			<div class="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-destructive">
				Failed to load blogs.
			</div>
		{:else if blogsQuery.data}
			<div class="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
				<table class="w-full text-left text-sm">
					<thead class="bg-muted/50 text-muted-foreground">
						<tr>
							<th class="px-6 py-3 font-medium">Title</th>
							<th class="px-6 py-3 font-medium">Status</th>
							<th class="px-6 py-3 font-medium">Created</th>
							<th class="px-6 py-3 text-right font-medium">Actions</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-border">
						{#each blogsQuery.data as blog}
							<tr class="transition-colors hover:bg-muted/30">
								<td class="px-6 py-4 font-medium text-foreground">{blog.title}</td>
								<td class="px-6 py-4">
									{#if blog.published}
										<span
											class="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
										>
											<Eye class="h-3 w-3" />
											Published
										</span>
									{:else}
										<span
											class="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
										>
											<EyeOff class="h-3 w-3" />
											Draft
										</span>
									{/if}
								</td>
								<td class="px-6 py-4 text-muted-foreground">{formatDate(blog.createdAt)}</td>
								<td class="px-6 py-4 text-right">
									<div class="flex justify-end gap-2">
										<Button
											variant="ghost"
											size="icon"
											title="Edit"
											onclick={() => startEdit(blog)}
										>
											<Pencil class="h-4 w-4" />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											title="Delete"
											class="text-destructive hover:bg-destructive/10"
											onclick={() => handleDelete(blog._id)}
										>
											<Trash2 class="h-4 w-4" />
										</Button>
									</div>
								</td>
							</tr>
						{:else}
							<tr>
								<td colspan="4" class="px-6 py-12 text-center text-muted-foreground">
									No blog posts found. Create your first post!
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</div>
