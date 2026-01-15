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
	import { authClient } from '$lib/auth-client';

	const id = $derived(page.params.id as Id<'blogs'>);
	const blogQuery = useQuery(api.blogs.get, () => ({ id }));
	const blogsQuery = useQuery(api.blogs.list, { onlyPublished: true });
	const commentsQuery = useQuery(api.blogs.getComments, () => ({ blogId: id }));
	const client = useConvexClient();
	const session = authClient.useSession();

	const otherBlogs = $derived(blogsQuery.data?.filter((b) => b._id !== id).slice(0, 5) ?? []);

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
			await client.mutation(api.blogs.addComment, { blogId: id, content: commentText.trim() });
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

<div class="min-h-screen bg-background p-6">
	<div class="mx-auto max-w-6xl">
		{#if blogQuery.isLoading}
			<div class="flex h-64 items-center justify-center">
				<LoaderCircle class="h-8 w-8 animate-spin text-muted-foreground" />
			</div>
		{:else if blogQuery.error}
			<div class="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-destructive">
				Failed to load the blog post.
			</div>
		{:else if blogQuery.data}
			{@const blog = blogQuery.data}
			<div class="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_300px]">
				<article>
					<header class="mb-8">
						<div class="flex items-center gap-2 text-sm text-muted-foreground">
							<Calendar class="h-4 w-4" />
							{formatDate(blog.createdAt)}
						</div>
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
						<Markdown content={blog.content} />
					</div>

					<!-- Comments Section -->
					<div id="comments" class="mt-10 border-t border-border pt-8">
						<h2 class="mb-6 text-xl font-bold">Comments</h2>

						<!-- Add Comment Form -->
						{#if session.value?.data?.user}
							<div class="mb-8">
								<div class="relative">
									<textarea
										bind:value={commentText}
										placeholder="Write a comment..."
										rows="3"
										class="w-full resize-none rounded-lg border border-input bg-background px-4 pt-3 pb-14 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
									></textarea>
									<Button
										onclick={handleAddComment}
										disabled={isSubmitting || !commentText.trim()}
										size="sm"
										class="absolute right-3 bottom-3 gap-2"
									>
										{#if isSubmitting}
											<LoaderCircle class="h-4 w-4 animate-spin" />
											Posting...
										{:else}
											<Send class="h-4 w-4" />
											Send
										{/if}
									</Button>
								</div>
							</div>
						{:else}
							<div
								class="mb-8 flex flex-col items-center justify-center rounded-lg border border-border bg-muted/30 p-8 text-center"
							>
								<p class="mb-4 text-sm text-muted-foreground">
									Log in to join the conversation and share your thoughts.
								</p>
								<Button href="/signin" variant="outline" size="sm">Sign in to comment</Button>
							</div>
						{/if}

						<!-- Comments List -->
						{#if commentsQuery.isLoading}
							<div class="flex justify-center py-8">
								<LoaderCircle class="h-6 w-6 animate-spin text-muted-foreground" />
							</div>
						{:else if commentsQuery.data && commentsQuery.data.length > 0}
							<div class="space-y-6">
								{#each commentsQuery.data as comment}
									<div class="rounded-lg border border-border bg-card p-4">
										<div class="mb-2 flex items-center justify-between">
											<span class="text-xs text-muted-foreground">
												{formatCommentDate(comment.createdAt)}
											</span>
											{#if session.value?.data?.user?.id === comment.userId}
												<Button
													variant="ghost"
													size="sm"
													class="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
													onclick={() => handleDeleteComment(comment._id)}
												>
													Delete
												</Button>
											{/if}
										</div>
										<p class="text-sm text-foreground">{comment.content}</p>
										<div class="mt-3 flex items-center gap-2">
											{#if session.value?.data?.user}
												<Button
													variant={comment.userReaction === 'like' ? 'default' : 'ghost'}
													size="sm"
													class="h-7 gap-1 px-2"
													onclick={() => handleCommentLike(comment._id)}
												>
													<ThumbsUp class="h-3 w-3" />
													<span class="text-xs">{comment.likes}</span>
												</Button>
												<Button
													variant={comment.userReaction === 'dislike' ? 'default' : 'ghost'}
													size="sm"
													class="h-7 gap-1 px-2"
													onclick={() => handleCommentDislike(comment._id)}
												>
													<ThumbsDown class="h-3 w-3" />
													<span class="text-xs">{comment.dislikes}</span>
												</Button>
											{:else}
												<Button variant="ghost" size="sm" class="h-7 gap-1 px-2" href="/signin">
													<ThumbsUp class="h-3 w-3" />
													<span class="text-xs">{comment.likes}</span>
												</Button>
												<Button variant="ghost" size="sm" class="h-7 gap-1 px-2" href="/signin">
													<ThumbsDown class="h-3 w-3" />
													<span class="text-xs">{comment.dislikes}</span>
												</Button>
											{/if}
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

				<aside class="sticky top-16 space-y-8 self-start">
					<div>
						<h3 class="mb-4 text-sm font-bold tracking-wider text-muted-foreground uppercase">
							Recent Posts
						</h3>
						<div class="space-y-6">
							{#each otherBlogs as other}
								<a
									href="/blog/{other._id}"
									class="group -mx-2 flex flex-col rounded-md border-b border-border/50 px-2 py-3 transition-colors last:border-0 hover:bg-muted/80"
								>
									<h4
										class="mb-2 line-clamp-2 text-sm leading-snug font-medium transition-colors group-hover:text-primary"
									>
										{other.title}
									</h4>

									<div class="flex items-center justify-between text-xs text-muted-foreground">
										<p class="text-[11px] font-medium opacity-80">{formatDate(other.createdAt)}</p>

										<!-- Compact Stats -->
										<div class="flex items-center gap-3">
											<div class="flex items-center gap-1">
												<ThumbsUp class="h-3 w-3" />
												<span class="text-[10px]">{other.likes}</span>
											</div>
											<div class="flex items-center gap-1">
												<ThumbsDown class="h-3 w-3" />
												<span class="text-[10px]">{other.dislikes}</span>
											</div>
											<div class="flex items-center gap-1">
												<MessageCircle class="h-3 w-3" />
												<span class="text-[10px]">{other.commentCount}</span>
											</div>
										</div>
									</div>
								</a>
							{:else}
								<p class="text-sm text-muted-foreground">No other posts yet.</p>
							{/each}
						</div>
					</div>
				</aside>
			</div>
		{:else}
			<div class="flex h-32 items-center justify-center text-muted-foreground">
				Blog post not found.
			</div>
		{/if}
	</div>
</div>
