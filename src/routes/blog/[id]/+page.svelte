<script lang="ts">
	import { page } from '$app/state';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import type { Id } from '../../../convex/_generated/dataModel';
	import { Markdown } from '$lib/components/prompt-kit/markdown/index.js';
	import { Calendar } from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { authClient } from '$lib/auth-client';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { ReactionsBar, CommentsSection } from '$lib/components/interactions/index.js';

	const id = $derived(page.params.id as Id<'blogs'>);
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

	async function handleDeleteComment(commentId: string) {
		if (!confirm('Are you sure you want to delete this comment?')) return;
		try {
			await client.mutation(api.blogs.removeComment, { id: commentId as Id<'blog_comments'> });
		} catch (e) {
			console.error('Failed to delete comment:', e);
		}
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
			<div class="mt-10 border-b border-border pb-6">
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
