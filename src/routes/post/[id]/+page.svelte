<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { Archive, Tag, ThumbsDown, ThumbsUp } from '@lucide/svelte';
	import { api } from '$convex/_generated/api';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import CommentsSection from '$lib/components/comments/CommentsSection.svelte';
	import { sanitizeDisplayText } from '$lib/utils';
	import { toast } from 'svelte-sonner';

	const auth = useAuth();
	const client = useConvexClient();
	const postId = $derived(page.params.id);

	const postQuery = useQuery((api as any).posts.get, () => ({ postId }));
	const commentsQuery = useQuery((api as any).posts.listComments, () => ({ postId }));
	const currentUserQuery = useQuery(api.auth.getCurrentUser, {});

	let fullBody = $state('');
	let loadingBody = $state(false);
	let deletePostDialogOpen = $state(false);
	const signInHref = $derived(
		`/signin?redirectTo=${encodeURIComponent(page.url.pathname + page.url.search)}`
	);
	const currentUserInitial = $derived.by(() => {
		const username = currentUserQuery.data?.username;
		if (username && username.length > 0) {
			return username.charAt(0).toUpperCase();
		}
		const name = currentUserQuery.data?.name;
		if (name && name.length > 0) {
			return name.charAt(0).toUpperCase();
		}
		return 'U';
	});

	$effect(() => {
		const post = postQuery.data;
		if (!post) return;
		if (post.body) {
			fullBody = sanitizeDisplayText(post.body);
			return;
		}
		if (!post.bodyUrl) {
			fullBody = sanitizeDisplayText(post.snippet);
			return;
		}
		loadingBody = true;
		fetch(post.bodyUrl)
			.then((response) => {
				if (!response.ok) throw new Error('Failed body fetch');
				return response.text();
			})
			.then((text) => {
				fullBody = sanitizeDisplayText(text);
			})
			.catch(() => {
				fullBody = sanitizeDisplayText(post.snippet);
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

	async function addComment(body: string, parentId?: string) {
		if (!auth.isAuthenticated) {
			return;
		}
		try {
			await client.mutation((api as any).posts.addComment, {
				postId,
				parentId,
				body
			});
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to add comment');
		}
	}

	async function deletePost() {
		if (!postQuery.data?.canDelete) return;
		try {
			await client.mutation((api as any).posts.delete, { postId });
			goto('/feed');
		} catch (error: any) {
			toast.error(error?.message ?? 'Delete failed');
		}
	}

	function requestDeletePost() {
		if (!postQuery.data?.canDelete) return;
		deletePostDialogOpen = true;
	}

	async function confirmDeletePost() {
		deletePostDialogOpen = false;
		await deletePost();
	}
</script>

<main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
	<div class="mx-auto w-full max-w-4xl">
		{#if postQuery.isLoading}
			<p class="text-sm text-muted-foreground">Loading post...</p>
		{:else if postQuery.error || !postQuery.data}
			<p class="text-sm text-destructive">Post not found.</p>
		{:else}
			<article class="rounded-lg border border-border bg-card p-5">
				<div
					class="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"
				>
					<div class="flex flex-wrap items-center gap-2">
						{#if postQuery.data.authorUsername}
							<a class="hover:underline" href="/u/{postQuery.data.authorUsername}">
								u/{postQuery.data.authorUsername}
							</a>
						{:else}
							<span>{postQuery.data.authorName}</span>
						{/if}
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
						<Button variant="destructive" size="sm" onclick={requestDeletePost}>Delete</Button>
					{/if}
				</div>

				<h1 class="text-2xl font-semibold tracking-tight">
					{sanitizeDisplayText(postQuery.data.title)}
				</h1>
				{#if postQuery.data.url}
					<p class="mt-2 text-sm">
						<a class="underline" href={postQuery.data.url} target="_blank" rel="noreferrer">
							{postQuery.data.url}
						</a>
					</p>
				{/if}

				<div class="mt-3 flex flex-wrap gap-2">
					{#if (postQuery.data.tags?.length ?? 0) > 0}
						{#each postQuery.data.tags as tag}
							<Badge variant="secondary" class="gap-1 bg-secondary/50">
								<Tag class="size-3" />
								{tag}
							</Badge>
						{/each}
					{/if}
					{#if postQuery.data.sourceType}
						<Badge variant="outline" class="gap-1 border-dashed bg-muted/30">
							<Archive class="size-3" />
							{postQuery.data.sourceType === 'chrome_import'
								? 'Chrome Bookmark'
								: postQuery.data.sourceType}
						</Badge>
					{/if}
				</div>
				<div class="mt-4 text-sm leading-6 whitespace-pre-wrap">
					{#if loadingBody}
						Loading body...
					{:else}
						{fullBody}
					{/if}
				</div>

				<div class="mt-5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
					<Button
						size="icon-sm"
						variant={postQuery.data.userVote === 1 ? 'secondary' : 'outline'}
						class={postQuery.data.userVote === 1
							? 'border-primary/40 text-primary [&_svg_path]:!fill-current'
							: ''}
						disabled={!auth.isAuthenticated}
						onclick={() => vote(1)}
						aria-label="Like post"
					>
						<ThumbsUp class="size-4" />
					</Button>
					<Button
						size="icon-sm"
						variant={postQuery.data.userVote === -1 ? 'secondary' : 'outline'}
						class={postQuery.data.userVote === -1
							? 'border-destructive/40 text-destructive [&_svg_path]:!fill-current'
							: ''}
						disabled={!auth.isAuthenticated}
						onclick={() => vote(-1)}
						aria-label="Dislike post"
					>
						<ThumbsDown class="size-4" />
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

			<CommentsSection
				comments={commentsQuery.data ?? []}
				isLoading={commentsQuery.isLoading}
				isAuthenticated={auth.isAuthenticated}
				{signInHref}
				{currentUserInitial}
				onAddComment={addComment}
				onCommentLike={(commentId) => voteComment(commentId, 1)}
				onCommentDislike={(commentId) => voteComment(commentId, -1)}
			/>
		{/if}
	</div>
</main>

<Dialog.Root bind:open={deletePostDialogOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Delete Post</Dialog.Title>
			<Dialog.Description>Delete this post?</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (deletePostDialogOpen = false)}>Cancel</Button>
			<Button variant="destructive" onclick={confirmDeletePost}>Delete</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
