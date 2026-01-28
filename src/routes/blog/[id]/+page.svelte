<script lang="ts">
	import { page } from '$app/state';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import type { Id } from '../../../convex/_generated/dataModel';
	import { Markdown } from '$lib/components/prompt-kit/markdown/index.js';
	import { Calendar, MessageSquare, Share2 } from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { authClient } from '$lib/auth-client';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { ReactionsBar, CommentsSection } from '$lib/components/interactions/index.js';
	import GroupSelectionDialog from '$lib/components/GroupSelectionDialog.svelte';
	import { toast } from 'svelte-sonner';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { HighlightWrapper, FloatingToolbar, InlineCommentPane } from '$lib/components/highlights';
	import { highlightStore } from '$lib/stores/highlights.svelte';

	const id = $derived(page.params.id as Id<'blogs'>);
	let activeCommentId = $state<Id<'highlights'> | null>(null);

	const highlightsQuery = useQuery(api.highlights.listHighlights, () =>
		id ? { blogId: id } : 'skip'
	);
	const highlights = $derived(highlightsQuery.data ?? []);

	async function handleAddHighlight(
		color: string,
		serializedRange: string,
		text: string,
		gId?: string
	) {
		if (!isAuthenticated) return;
		try {
			return await client.mutation(api.highlights.createHighlight, {
				blogId: id,
				serializedRange,
				text,
				color,
				groupId: gId as Id<'groups'> | undefined
			});
		} catch (e) {
			console.error('Failed to create highlight:', e);
			toast.error('Failed to save highlight');
		}
	}

	async function handleRemoveHighlight(hId: Id<'highlights'>) {
		try {
			await client.mutation(api.highlights.removeHighlight, { id: hId });
		} catch (e) {
			console.error('Failed to remove highlight:', e);
		}
	}
	let isGroupDialogOpen = $state(false);
	let groupDialogTitle = $state('Select a Group');
	let groupDialogAction = $state<'discuss' | 'share'>('discuss');

	let commentToDelete = $state<Id<'blog_comments'> | null>(null);
	let isDeleteCommentDialogOpen = $state(false);

	const blogQuery = useQuery(api.blogs.get, () => ({ id }));
	const commentsQuery = useQuery(api.blogs.getComments, () => ({ blogId: id }));
	const client = useConvexClient();
	const session = authClient.useSession();

	const blog = $derived(blogQuery.data);
	const comments = $derived(commentsQuery.data ?? []);

	const isAuthenticated = $derived(!!$session.data?.user);
	const currentUserId = $derived($session.data?.user?.id);
	const currentUserInitial = $derived($session.data?.user?.name?.charAt(0).toUpperCase() ?? 'U');

	// Calculate authors for the layers menu
	const authors = $derived.by(() => {
		const map = new Map<string, { id: string; name: string; count: number }>();

		// Always include "You" if authenticated
		if (isAuthenticated && currentUserId) {
			map.set(currentUserId, { id: currentUserId, name: 'You', count: 0 });
		}

		highlights.forEach((h) => {
			const existing = map.get(h.userId);
			if (existing) {
				existing.count++;
			} else {
				map.set(h.userId, {
					id: h.userId,
					name: h.userId === currentUserId ? 'You' : h.userName || 'Unknown',
					count: 1
				});
			}
		});
		return Array.from(map.values());
	});

	function formatDate(date: number) {
		return new Intl.DateTimeFormat('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		}).format(date);
	}

	async function handleLike() {
		if (!isAuthenticated) return;
		try {
			await client.mutation(api.blogs.toggleLike, { blogId: id });
		} catch (e) {
			console.error('Failed to toggle like:', e);
		}
	}

	async function handleDislike() {
		if (!isAuthenticated) return;
		try {
			await client.mutation(api.blogs.toggleDislike, { blogId: id });
		} catch (e) {
			console.error('Failed to toggle dislike:', e);
		}
	}

	async function handleAddComment(body: string, parentId?: string) {
		await client.mutation(api.blogs.addComment, {
			blogId: id,
			body,
			parentId: parentId as Id<'blog_comments'> | undefined
		});
	}

	async function onGroupSelect(groupId: string) {
		try {
			await client.mutation((api as any).groups.shareContent, {
				groupId: groupId as Id<'groups'>,
				blogId: id
			});

			if (groupDialogAction === 'discuss') {
				window.location.href = `/groups/${groupId}/blog/${id}`;
			} else {
				toast.success('Blog shared to group feed!');
				isGroupDialogOpen = false;
			}
		} catch (e: any) {
			toast.error(e.message || 'Failed to share content');
			console.error('Group action failed:', e);
		}
	}

	function handleShareToGroup() {
		if (!isAuthenticated) return;
		groupDialogTitle = 'Share to Group';
		groupDialogAction = 'share';
		isGroupDialogOpen = true;
	}

	async function confirmDeleteComment() {
		if (!commentToDelete) return;
		try {
			await client.mutation(api.blogs.removeComment, { id: commentToDelete });
			toast.success('Comment deleted');
			isDeleteCommentDialogOpen = false;
			commentToDelete = null;
		} catch (e: any) {
			toast.error(e.message || 'Failed to delete comment');
		}
	}

	function handleDeleteComment(commentId: string) {
		commentToDelete = commentId as Id<'blog_comments'>;
		isDeleteCommentDialogOpen = true;
	}

	async function handleCommentLike(commentId: string) {
		if (!isAuthenticated) return;
		try {
			await client.mutation(api.blogs.toggleCommentLike, {
				commentId: commentId as Id<'blog_comments'>
			});
		} catch (e) {
			console.error('Failed to toggle comment like:', e);
		}
	}

	async function handleCommentDislike(commentId: string) {
		if (!isAuthenticated) return;
		try {
			await client.mutation(api.blogs.toggleCommentDislike, {
				commentId: commentId as Id<'blog_comments'>
			});
		} catch (e) {
			console.error('Failed to toggle comment dislike:', e);
		}
	}

	function scrollToComments() {
		document.getElementById('comments')?.scrollIntoView({ behavior: 'smooth' });
	}
</script>

{#if blogQuery.isLoading}
	<article class="animate-pulse">
		<header class="mb-10">
			<Skeleton class="h-5 w-28 rounded-full" />
			<Skeleton class="mt-5 h-10 w-4/5" />
			<Skeleton class="mt-3 h-10 w-2/3" />
			<div class="mt-8 flex items-center gap-4 border-b border-border/50 pb-6">
				<Skeleton class="h-9 w-24 rounded-lg" />
				<Skeleton class="h-9 w-24 rounded-lg" />
			</div>
		</header>
		<div class="space-y-4">
			<Skeleton class="h-4 w-full" />
			<Skeleton class="h-4 w-full" />
			<Skeleton class="h-4 w-3/4" />
			<Skeleton class="mt-6 h-4 w-full" />
			<Skeleton class="h-4 w-5/6" />
		</div>
	</article>
{:else if blogQuery.error}
	<div class="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
		<p class="text-sm text-destructive">Failed to load the blog post. Please try again.</p>
	</div>
{:else if blog}
	<article>
		<!-- Header -->
		<header class="mb-10">
			<Badge variant="secondary" class="gap-1.5 px-2.5 py-1 text-xs">
				<Calendar class="h-3 w-3" />
				{formatDate(blog.createdAt)}
			</Badge>
			<h1 class="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
				{blog.title}
			</h1>

			<!-- Reactions Bar -->
			<div
				class="mt-8 flex flex-col gap-4 border-b border-border/50 pb-6 sm:flex-row sm:items-center sm:justify-between"
			>
				<ReactionsBar
					likes={blog.likes}
					dislikes={blog.dislikes}
					commentCount={blog.commentCount}
					userReaction={blog.userReaction}
					{isAuthenticated}
					onLike={handleLike}
					onDislike={handleDislike}
					onScrollToComments={scrollToComments}
				/>

				{#if isAuthenticated}
					<Button
						variant="outline"
						size="sm"
						class="gap-2 text-xs font-semibold"
						onclick={handleShareToGroup}
					>
						<Share2 class="h-3.5 w-3.5" />
						Share to Group
					</Button>
				{/if}
			</div>
		</header>

		<!-- Content -->
		<HighlightWrapper
			{highlights}
			{currentUserId}
			{isAuthenticated}
			onAddHighlight={handleAddHighlight}
			onRemoveHighlight={handleRemoveHighlight}
			onAddComment={(id) => (activeCommentId = id)}
		>
			<div
				class="prose prose-neutral dark:prose-invert prose-headings:font-semibold prose-headings:tracking-tight prose-p:leading-relaxed max-w-none"
			>
				<Markdown content={blog.body} />
			</div>
		</HighlightWrapper>

		<!-- Comments Section -->
		<CommentsSection
			{comments}
			isLoading={commentsQuery.isLoading}
			{isAuthenticated}
			{currentUserId}
			{currentUserInitial}
			blogId={id}
			onAddComment={handleAddComment}
			onDeleteComment={handleDeleteComment}
			onCommentLike={handleCommentLike}
			onCommentDislike={handleCommentDislike}
		/>
	</article>
	<div class="h-24"></div>
{:else}
	<div class="flex h-48 flex-col items-center justify-center text-center">
		<p class="text-muted-foreground">Blog post not found.</p>
		<Button href="/blog" variant="outline" class="mt-4">Back to Blog</Button>
	</div>
{/if}

<FloatingToolbar {authors} {isAuthenticated} />

{#if activeCommentId}
	<InlineCommentPane highlightId={activeCommentId} onClose={() => (activeCommentId = null)} />
{/if}

<GroupSelectionDialog
	bind:open={isGroupDialogOpen}
	title={groupDialogTitle}
	onSelect={onGroupSelect}
/>

<Dialog.Root bind:open={isDeleteCommentDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Delete Comment?</Dialog.Title>
			<Dialog.Description>
				Are you sure you want to permanently delete this comment? This action cannot be undone.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (isDeleteCommentDialogOpen = false)}>Cancel</Button>
			<Button variant="destructive" onclick={confirmDeleteComment}>Delete Comment</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
