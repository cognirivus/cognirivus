<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import type { Id } from '../../../convex/_generated/dataModel';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Plus, Pencil, Trash2, Eye, EyeOff, Save, X, ArrowLeft, BookOpen } from '@lucide/svelte';

	const blogsQuery = useQuery(api.blogs.list, { onlyPublished: false });
	const client = useConvexClient();

	let isEditing = $state(false);
	let editingId = $state<Id<'blogs'> | null>(null);
	let title = $state('');
	let body = $state('');
	let published = $state(false);
	let error = $state('');
	let isSaving = $state(false);

	function startCreate() {
		isEditing = true;
		editingId = null;
		title = '';
		body = '';
		published = false;
		error = '';
	}

	function startEdit(blog: any) {
		isEditing = true;
		editingId = blog._id;
		title = blog.title;
		body = blog.body;
		published = blog.published;
		error = '';
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

	function formatDate(date: number) {
		return new Intl.DateTimeFormat('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		}).format(date);
	}
</script>

<div class="container mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
	<div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div class="space-y-1">
			<div class="flex items-center gap-2">
				<h1 class="text-3xl font-bold tracking-tight">Blog Management</h1>
			</div>
			<p class="ml-10 text-muted-foreground">
				Create, edit, and manage your blog posts with markdown support.
			</p>
		</div>
		{#if !isEditing}
			<Button onclick={startCreate} class="ml-10 gap-2 shadow-md shadow-primary/20 sm:ml-0">
				<Plus class="h-4 w-4" />
				New Post
			</Button>
		{/if}
	</div>

	{#if isEditing}
		<Card.Root class="overflow-hidden border-primary/10 shadow-lg">
			<Card.Header class="bg-muted/30 pb-4">
				<div class="flex items-center justify-between">
					<div>
						<Card.Title>{editingId ? 'Edit Post' : 'Create New Post'}</Card.Title>
						<Card.Description
							>Fill in the details below to {editingId ? 'update' : 'create'} your blog post.</Card.Description
						>
					</div>
					<Button
						variant="ghost"
						size="icon"
						onclick={() => (isEditing = false)}
						class="rounded-full"
					>
						<X class="h-4 w-4" />
					</Button>
				</div>
			</Card.Header>
			<Separator />
			<Card.Content class="pt-6">
				<form onsubmit={handleSubmit} class="space-y-6">
					<div class="space-y-2">
						<label for="title" class="text-sm font-semibold tracking-tight">Post Title</label>
						<Input
							type="text"
							id="title"
							bind:value={title}
							required
							placeholder="Enter a compelling title..."
							class="text-lg font-medium"
						/>
					</div>

					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<label for="body" class="text-sm font-semibold tracking-tight"
								>Content (Markdown)</label
							>
							<span class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
								>Markdown Supported</span
							>
						</div>
						<Textarea
							id="body"
							bind:value={body}
							required
							rows={15}
							placeholder="Write your story..."
							class="min-h-[400px] font-mono text-sm leading-relaxed"
						/>
					</div>

					<div
						class="flex items-center space-x-2 rounded-lg border bg-muted/20 p-4 transition-colors hover:bg-muted/30"
					>
						<input
							type="checkbox"
							id="published"
							bind:checked={published}
							class="h-4 w-4 rounded border-input bg-background text-primary focus:ring-ring focus:ring-offset-2"
						/>
						<div class="grid gap-1.5 leading-none">
							<label
								for="published"
								class="text-sm leading-none font-semibold peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
							>
								Publish Post
							</label>
							<p class="text-xs text-muted-foreground">
								Make this post visible to everyone immediately after saving.
							</p>
						</div>
					</div>

					{#if error}
						<div
							class="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
						>
							{error}
						</div>
					{/if}

					<Separator />

					<div class="flex flex-col-reverse justify-end gap-3 pt-2 sm:flex-row">
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
							class="w-full gap-2 shadow-md shadow-primary/20 sm:w-auto"
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
			</Card.Content>
		</Card.Root>
	{:else if blogsQuery.isLoading}
		<div class="grid gap-4">
			{#each Array(3) as _}
				<Card.Root>
					<Card.Content class="p-6">
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
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{:else if blogsQuery.error}
		<Card.Root class="border-destructive/20 bg-destructive/10">
			<Card.Content class="pt-6 text-center text-destructive">
				<p class="font-medium">Failed to load blog posts</p>
				<p class="mt-1 text-sm opacity-80">Please try refreshing the page.</p>
			</Card.Content>
		</Card.Root>
	{:else if blogsQuery.data}
		<Card.Root>
			<Card.Content class="p-0">
				<div class="overflow-x-auto">
					<table class="w-full text-left text-sm">
						<thead>
							<tr class="border-b bg-muted/50 transition-colors hover:bg-muted/50">
								<th class="h-12 px-6 align-middle font-medium text-muted-foreground">Title</th>
								<th class="h-12 px-6 align-middle font-medium text-muted-foreground">Status</th>
								<th class="h-12 px-6 align-middle font-medium text-muted-foreground"
									>Date Created</th
								>
								<th class="h-12 px-6 text-right align-middle font-medium text-muted-foreground"
									>Actions</th
								>
							</tr>
						</thead>
						<tbody class="divide-y">
							{#each blogsQuery.data as blog}
								<tr class="transition-colors hover:bg-muted/30">
									<td class="px-6 py-4">
										<span class="font-semibold text-foreground">{blog.title}</span>
									</td>
									<td class="px-6 py-4">
										{#if blog.published}
											<Badge
												variant="outline"
												class="gap-1 border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
											>
												<Eye class="h-3 w-3" />
												Published
											</Badge>
										{:else}
											<Badge
												variant="outline"
												class="gap-1 border-yellow-500/50 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
											>
												<EyeOff class="h-3 w-3" />
												Draft
											</Badge>
										{/if}
									</td>
									<td class="px-6 py-4 font-medium text-muted-foreground">
										{formatDate(blog.createdAt)}
									</td>
									<td class="px-6 py-4 text-right">
										<div class="flex justify-end gap-1">
											<Button
												variant="ghost"
												size="icon-sm"
												title="Edit Post"
												onclick={() => startEdit(blog)}
												class="rounded-full"
											>
												<Pencil class="h-4 w-4" />
											</Button>
											<Button
												variant="ghost"
												size="icon-sm"
												title="Delete Post"
												class="rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
												onclick={() => handleDelete(blog._id)}
											>
												<Trash2 class="h-4 w-4" />
											</Button>
										</div>
									</td>
								</tr>
							{:else}
								<tr>
									<td colspan="4" class="px-6 py-12 text-center">
										<div class="flex flex-col items-center gap-2">
											<BookOpen class="h-12 w-12 text-muted-foreground/20" />
											<h3 class="font-semibold text-foreground">No blog posts yet</h3>
											<p class="text-sm text-muted-foreground">
												Start by creating your first post!
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
			</Card.Content>
		</Card.Root>
	{/if}
</div>
