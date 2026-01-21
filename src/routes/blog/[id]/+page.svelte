<script lang="ts">
	import { page } from '$app/state';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import type { Id } from '../../../convex/_generated/dataModel';
	import { Markdown } from '$lib/components/prompt-kit/markdown/index.js';
	import {
		Calendar,
		ChevronLeft,
		ThumbsUp,
		ThumbsDown,
		MessageCircle,
		Send,
		LoaderCircle
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { authClient } from '$lib/auth-client';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';

	const id = $derived(page.params.id as Id<'blogs'>);
	const blogQuery = useQuery(api.blogs.get, () => ({ id }));
	const commentsQuery = useQuery(api.blogs.getComments, () => ({ blogId: id }));
	const client = useConvexClient();
	const session = authClient.useSession();

	let commentText = $state('');
	let isSubmitting = $state(false);

	function formatDate(date: number) {
		return new Intl.DateTimeFormat('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		}).format(date);
	}

	function formatCommentDate(date: number) {
		return new Intl.DateTimeFormat('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		}).format(date);
	}

	async function handleLike() {
		if (!session.value?.data?.user) return;
		try {
			await client.mutation(api.blogs.toggleLike, { blogId: id });
		} catch (e) {
			console.error('Failed to toggle like:', e);
		}
	}

	async function handleDislike() {
		if (!session.value?.data?.user) return;
		try {
			await client.mutation(api.blogs.toggleDislike, { blogId: id });
		} catch (e) {
			console.error('Failed to toggle dislike:', e);
		}
	}

	async function handleAddComment() {
		if (!session.value?.data?.user || !commentText.trim()) return;
		isSubmitting = true;
		try {
			await client.mutation(api.blogs.addComment, { blogId: id, body: commentText.trim() });
			commentText = '';
		} catch (e) {
			console.error('Failed to add comment:', e);
		} finally {
			isSubmitting = false;
		}
	}

	async function handleDeleteComment(commentId: Id<'blog_comments'>) {
		if (!confirm('Are you sure you want to delete this comment?')) return;
		try {
			await client.mutation(api.blogs.removeComment, { id: commentId });
		} catch (e) {
			console.error('Failed to delete comment:', e);
		}
	}

	async function handleCommentLike(commentId: Id<'blog_comments'>) {
		if (!session.value?.data?.user) return;
		try {
			await client.mutation(api.blogs.toggleCommentLike, { commentId });
		} catch (e) {
			console.error('Failed to toggle comment like:', e);
		}
	}

	async function handleCommentDislike(commentId: Id<'blog_comments'>) {
		if (!session.value?.data?.user) return;
		try {
			await client.mutation(api.blogs.toggleCommentDislike, { commentId });
		} catch (e) {
			console.error('Failed to toggle comment dislike:', e);
		}
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
{:else if blogQuery.data}
	{@const blog = blogQuery.data}
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
			<div class="mt-10 flex items-center gap-6 border-b border-border pb-6">
				<div class="flex items-center gap-2">
					{#if session.value?.data?.user}
						<Button
							variant={blog.userReaction === 'like' ? 'default' : 'outline'}
							size="sm"
							class="gap-2"
							onclick={handleLike}
						>
							<ThumbsUp class="h-4 w-4" />
							{blog.likes}
						</Button>
						<Button
							variant={blog.userReaction === 'dislike' ? 'default' : 'outline'}
							size="sm"
							class="gap-2"
							onclick={handleDislike}
						>
							<ThumbsDown class="h-4 w-4" />
							{blog.dislikes}
						</Button>
					{:else}
						<Button
							variant="outline"
							size="sm"
							class="gap-2"
							href="/signin"
							title="Sign in to like"
						>
							<ThumbsUp class="h-4 w-4" />
							{blog.likes}
						</Button>
						<Button
							variant="outline"
							size="sm"
							class="gap-2"
							href="/signin"
							title="Sign in to dislike"
						>
							<ThumbsDown class="h-4 w-4" />
							{blog.dislikes}
						</Button>
					{/if}
				</div>
				<button
					class="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
					onclick={() =>
						document.getElementById('comments')?.scrollIntoView({ behavior: 'smooth' })}
				>
					<MessageCircle class="h-4 w-4" />
					<span class="text-sm">{blog.commentCount} comments</span>
				</button>
			</div>
		</header>

		<div class="prose prose-neutral dark:prose-invert max-w-none">
			<Markdown content={blog.body} />
		</div>

		<!-- Comments Section -->
		<div id="comments" class="mt-10 border-t border-border pt-8">
			<h2 class="mb-6 text-xl font-bold">Comments</h2>

			<!-- Add Comment Form -->
			{#if session.value?.data?.user}
				<div class="mb-8">
					<div class="flex gap-3">
						<div
							class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary"
						>
							{session.value.data.user.name?.charAt(0).toUpperCase() ?? 'U'}
						</div>
						<div class="flex-1 space-y-3">
							<Textarea
								bind:value={commentText}
								placeholder="Share your thoughts..."
								class="min-h-32 resize-none border-muted-foreground/20 bg-muted/30 transition-colors focus:border-primary focus:bg-background"
							/>
							<div class="flex justify-end">
								<Button
									onclick={handleAddComment}
									disabled={isSubmitting || !commentText.trim()}
									size="sm"
									class="gap-2"
								>
									{#if isSubmitting}
										<LoaderCircle class="h-4 w-4 animate-spin" />
										Posting...
									{:else}
										<Send class="h-4 w-4" />
										Post Comment
									{/if}
								</Button>
							</div>
						</div>
					</div>
				</div>
			{:else}
				<Card.Root class="mb-8 border-dashed">
					<Card.Content class="flex flex-col items-center justify-center py-10 text-center">
						<MessageCircle class="mb-3 h-10 w-10 text-muted-foreground/50" />
						<p class="mb-1 text-sm font-medium text-foreground">Join the conversation</p>
						<Card.Description class="mb-4 max-w-xs">
							Sign in to share your thoughts and engage with the community.
						</Card.Description>
						<Button href="/signin" size="sm">Sign in to comment</Button>
					</Card.Content>
				</Card.Root>
			{/if}

			<!-- Comments List -->
			{#if commentsQuery.isLoading}
				<div class="flex justify-center py-8">
					<LoaderCircle class="h-6 w-6 animate-spin text-muted-foreground" />
				</div>
			{:else if commentsQuery.data && commentsQuery.data.length > 0}
				<div class="space-y-6">
					{#each commentsQuery.data as comment, i}
						<div
							class="flex gap-3 rounded-lg p-4 transition-colors hover:bg-muted/50 {i % 2 === 0
								? 'bg-muted/30'
								: 'bg-transparent'}"
						>
							<div
								class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground"
							>
								U
							</div>
							<div class="flex-1 space-y-2">
								<div class="flex items-center gap-2">
									<span class="text-sm font-medium text-foreground"> Anonymous </span>
									<span class="text-xs text-muted-foreground">
										{formatCommentDate(comment.createdAt)}
									</span>
									{#if session.value?.data?.user?.id === comment.userId}
										<Button
											variant="ghost"
											size="sm"
											class="ml-auto h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
											onclick={() => handleDeleteComment(comment._id)}
										>
											Delete
										</Button>
									{/if}
								</div>
								<p class="text-sm leading-relaxed text-foreground/90">
									{comment.body}
								</p>
								<div class="flex items-center gap-1 pt-1">
									{#if session.value?.data?.user}
										<Button
											variant="ghost"
											size="sm"
											class="h-7 gap-1 px-2 text-muted-foreground hover:text-foreground {comment.userReaction ===
											'like'
												? 'text-primary'
												: ''}"
											onclick={() => handleCommentLike(comment._id)}
										>
											<ThumbsUp class="h-3.5 w-3.5" />
											<span class="text-xs">{comment.likes}</span>
										</Button>
										<Button
											variant="ghost"
											size="sm"
											class="h-7 gap-1 px-2 text-muted-foreground hover:text-foreground {comment.userReaction ===
											'dislike'
												? 'text-destructive'
												: ''}"
											onclick={() => handleCommentDislike(comment._id)}
										>
											<ThumbsDown class="h-3.5 w-3.5" />
											<span class="text-xs">{comment.dislikes}</span>
										</Button>
									{:else}
										<Button
											variant="ghost"
											size="sm"
											class="h-7 gap-1 px-2 text-muted-foreground"
											href="/signin"
										>
											<ThumbsUp class="h-3.5 w-3.5" />
											<span class="text-xs">{comment.likes}</span>
										</Button>
										<Button
											variant="ghost"
											size="sm"
											class="h-7 gap-1 px-2 text-muted-foreground"
											href="/signin"
										>
											<ThumbsDown class="h-3.5 w-3.5" />
											<span class="text-xs">{comment.dislikes}</span>
										</Button>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<p class="text-center text-sm text-muted-foreground">
					No comments yet. Be the first to comment!
				</p>
			{/if}
		</div>
	</article>
{:else}
	<div class="flex h-32 items-center justify-center text-muted-foreground">
		Blog post not found.
	</div>
{/if}
