<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toast } from 'svelte-sonner';

	const auth = useAuth();
	const client = useConvexClient();
	const postId = $derived(page.params.id);

	const postQuery = useQuery((api as any).posts.get, () => ({ postId }));
	const commentsQuery = useQuery((api as any).posts.listComments, () => ({ postId }));

	let fullBody = $state('');
	let commentText = $state('');
	let replyParentId = $state<string | null>(null);
	let loadingBody = $state(false);
	const signInHref = $derived(
		`/signin?redirectTo=${encodeURIComponent(page.url.pathname + page.url.search)}`
	);

	$effect(() => {
		const post = postQuery.data;
		if (!post) return;
		if (post.body) {
			fullBody = post.body;
			return;
		}
		if (!post.bodyUrl) {
			fullBody = post.snippet;
			return;
		}
		loadingBody = true;
		fetch(post.bodyUrl)
			.then((response) => {
				if (!response.ok) throw new Error('Failed body fetch');
				return response.text();
			})
			.then((text) => {
				fullBody = text;
			})
			.catch(() => {
				fullBody = post.snippet;
			})
			.finally(() => {
				loadingBody = false;
			});
	});

	async function vote(value: 1 | -1) {
		if (!auth.isAuthenticated) {
			return;
		}
		try {
			await client.mutation((api as any).posts.vote, { postId, value });
		} catch (error: any) {
			toast.error(error?.message ?? 'Vote failed');
		}
	}

	async function voteComment(commentId: string, value: 1 | -1) {
		if (!auth.isAuthenticated) {
			return;
		}
		try {
			await client.mutation((api as any).posts.voteComment, { commentId, value });
		} catch (error: any) {
			toast.error(error?.message ?? 'Vote failed');
		}
	}

	async function addComment(event: Event) {
		event.preventDefault();
		if (!auth.isAuthenticated) {
			return;
		}
		try {
			await client.mutation((api as any).posts.addComment, {
				postId,
				parentId: replyParentId || undefined,
				body: commentText
			});
			commentText = '';
			replyParentId = null;
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to add comment');
		}
	}

	async function deletePost() {
		if (!postQuery.data?.canDelete) return;
		if (!confirm('Delete this post?')) return;
		try {
			await client.mutation((api as any).posts.delete, { postId });
			goto('/feed');
		} catch (error: any) {
			toast.error(error?.message ?? 'Delete failed');
		}
	}

	function commentDepth(commentId: string): number {
		type CommentNode = {
			_id: string;
			parentId?: string;
		};

		const comments = (commentsQuery.data ?? []) as Array<CommentNode>;
		const byId = new Map<string, CommentNode>(comments.map((c) => [c._id, c]));
		let depth = 0;
		let current: CommentNode | undefined = byId.get(commentId);
		while (current?.parentId && depth < 8) {
			depth += 1;
			current = byId.get(current.parentId);
		}
		return depth;
	}
</script>

<main class="mx-auto max-w-4xl px-4 py-6 sm:px-6">
	{#if postQuery.isLoading}
		<p class="text-sm text-muted-foreground">Loading post...</p>
	{:else if postQuery.error || !postQuery.data}
		<p class="text-sm text-destructive">Post not found.</p>
	{:else}
		<article class="rounded-lg border border-border bg-card p-5">
			<div class="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
				<div class="flex flex-wrap items-center gap-2">
					<span>u/{postQuery.data.authorUsername ?? postQuery.data.authorName}</span>
					{#if postQuery.data.communitySlug}
						<span>•</span>
						<a class="hover:underline" href="/c/{postQuery.data.communitySlug}">
							c/{postQuery.data.communitySlug}
						</a>
					{/if}
					<span>•</span>
					<span>{new Date(postQuery.data.createdAt).toLocaleString()}</span>
				</div>
				{#if postQuery.data.canDelete}
					<Button variant="destructive" size="sm" onclick={deletePost}>Delete</Button>
				{/if}
			</div>

			<h1 class="text-2xl font-semibold tracking-tight">{postQuery.data.title}</h1>
			{#if postQuery.data.url}
				<p class="mt-2 text-sm">
					<a class="underline" href={postQuery.data.url} target="_blank" rel="noreferrer">
						{postQuery.data.url}
					</a>
				</p>
			{/if}
			<div class="mt-4 whitespace-pre-wrap text-sm leading-6">
				{#if loadingBody}
					Loading body...
				{:else}
					{fullBody}
				{/if}
			</div>

			<div class="mt-5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
				<Button size="sm" variant="outline" disabled={!auth.isAuthenticated} onclick={() => vote(1)}>
					Like
				</Button>
				<Button size="sm" variant="outline" disabled={!auth.isAuthenticated} onclick={() => vote(-1)}>
					Dislike
				</Button>
				<span>score {postQuery.data.score}</span>
				<span>•</span>
				<span>{postQuery.data.commentCount} comments</span>
			</div>
			{#if !auth.isAuthenticated}
				<p class="mt-3 text-xs text-muted-foreground">
					Sign in to vote and comment.
					<a class="ml-1 underline" href={signInHref}>Sign in</a>
				</p>
			{/if}
		</article>

		<section class="mt-6">
			<h2 class="text-lg font-semibold">Comments</h2>
			<form class="mt-3 space-y-2" onsubmit={addComment}>
				{#if replyParentId}
					<div class="text-xs text-muted-foreground">Replying to comment {replyParentId}</div>
				{/if}
				<Textarea
					bind:value={commentText}
					rows={4}
					required
					disabled={!auth.isAuthenticated}
					placeholder={auth.isAuthenticated ? 'Write a comment' : 'Sign in to comment'}
				/>
				<div class="flex items-center gap-2">
					<Button type="submit" disabled={!auth.isAuthenticated}>Post Comment</Button>
					{#if replyParentId}
						<Button type="button" variant="outline" onclick={() => (replyParentId = null)}>
							Cancel Reply
						</Button>
					{/if}
				</div>
			</form>
			{#if !auth.isAuthenticated}
				<p class="mt-2 text-xs text-muted-foreground">
					Commenting is available after sign-in.
					<a class="ml-1 underline" href={signInHref}>Sign in</a>
				</p>
			{/if}

			<div class="mt-4 space-y-3">
				{#each commentsQuery.data ?? [] as comment (comment._id)}
					<div
						class="rounded-lg border border-border bg-card p-3"
						style="margin-left: {commentDepth(comment._id) * 18}px;"
					>
						<div class="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
							<span>u/{comment.authorUsername ?? comment.authorName}</span>
							<span>•</span>
							<span>{new Date(comment.createdAt).toLocaleString()}</span>
						</div>
						<p class="whitespace-pre-wrap text-sm">{comment.body}</p>
						<div class="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
							<Button
								size="sm"
								variant="ghost"
								disabled={!auth.isAuthenticated}
								onclick={() => voteComment(comment._id, 1)}
							>
								+1
							</Button>
							<Button
								size="sm"
								variant="ghost"
								disabled={!auth.isAuthenticated}
								onclick={() => voteComment(comment._id, -1)}
							>
								-1
							</Button>
							<Button
								size="sm"
								variant="ghost"
								disabled={!auth.isAuthenticated}
								onclick={() => (replyParentId = comment._id)}
							>
								Reply
							</Button>
							<span>score {comment.score}</span>
						</div>
					</div>
				{/each}
			</div>
		</section>
	{/if}
</main>


