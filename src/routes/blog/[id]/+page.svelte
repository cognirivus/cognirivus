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
	import CircleSelectionDialog from '$lib/components/CircleSelectionDialog.svelte';
	import { toast } from 'svelte-sonner';
	import * as Dialog from '$lib/components/ui/dialog/index.js';

	const id = $derived(page.params.id as Id<'blogs'>);
	let isCircleDialogOpen = $state(false);
	let circleDialogTitle = $state('Select a Circle');
	let circleDialogAction = $state<'discuss' | 'share'>('discuss');

	let commentToDelete = $state<Id<'blog_comments'> | null>(null);
	let isDeleteCommentDialogOpen = $state(false);

	const blogQuery = useQuery(api.blogs.get, () => ({ id }));
	const commentsQuery = useQuery(api.blogs.getComments, () => ({ blogId: id }));
	const client = useConvexClient();
	const session = authClient.useSession();

	const blog = $derived(blogQuery.data);
	const comments = $derived(commentsQuery.data ?? []);

	const isAuthenticated = $derived(!!session.value?.data?.user);
	const currentUserId = $derived(session.value?.data?.user?.id);
	const currentUserInitial = $derived(
		session.value?.data?.user?.name?.charAt(0).toUpperCase() ?? 'U'
	);

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

	async function onCircleSelect(groupId: string) {
		try {
			await client.mutation((api as any).groups.shareContent, {
				groupId: groupId as Id<'groups'>,
				blogId: id
			});

			if (circleDialogAction === 'discuss') {
				window.location.href = `/groups/${groupId}/blog/${id}`;
			} else {
				toast.success('Blog shared to circle feed!');
				isCircleDialogOpen = false;
			}
		} catch (e: any) {
			toast.error(e.message || 'Failed to share content');
			console.error('Circle action failed:', e);
		}
	}

	function handleDiscussInCircle() {
		if (!isAuthenticated) return;
		circleDialogTitle = 'Discuss in Circle';
		circleDialogAction = 'discuss';
		isCircleDialogOpen = true;
	}

	function handleShareToCircle() {
		if (!isAuthenticated) return;
		circleDialogTitle = 'Share to Circle';
		circleDialogAction = 'share';
		isCircleDialogOpen = true;
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
	<article>
		<header class="mb-8">
			<Skeleton class="h-6 w-32" />
			<Skeleton class="mt-4 h-12 w-3/4" />
			<div class="mt-10 flex items-center gap-6 border-b border-border pb-6">
				<Skeleton class="h-9 w-24" />
				<Skeleton class="h-9 w-24" />
			</div>
		</header>
		<div class="space-y-4">
			<Skeleton class="h-4 w-full" />
			<Skeleton class="h-4 w-full" />
			<Skeleton class="h-4 w-2/3" />
		</div>
	</article>
{:else if blogQuery.error}
	<div class="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-destructive">
		Failed to load the blog post.
	</div>
{:else if blog}
	<article>
		<header class="mb-8">
			<Badge variant="secondary" class="gap-1">
				<Calendar class="h-3 w-3" />
				{formatDate(blog.createdAt)}
			</Badge>
			<h1 class="mt-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
				{blog.title}
			</h1>
			<!-- Like/Dislike Section -->
			<div
				class="mt-10 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between"
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

				<div class="flex items-center gap-2">
					<Button
						variant="secondary"
						size="sm"
						class="h-9 gap-2 px-4 font-bold"
						onclick={handleDiscussInCircle}
					>
						<MessageSquare class="h-4 w-4" />
						Discuss in Circle
					</Button>
					<Button
						variant="ghost"
						size="icon"
						class="h-9 w-9 text-muted-foreground"
						title="Share to Circle"
						onclick={handleShareToCircle}
					>
						<Share2 class="h-4 w-4" />
					</Button>
				</div>
			</div>
		</header>

		<div class="prose prose-neutral dark:prose-invert max-w-none">
			<Markdown content={blog.body} />
		</div>

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
{:else}
	<div class="flex h-32 items-center justify-center text-muted-foreground">
		Blog post not found.
	</div>
{/if}

<CircleSelectionDialog
	bind:open={isCircleDialogOpen}
	title={circleDialogTitle}
	onSelect={onCircleSelect}
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
