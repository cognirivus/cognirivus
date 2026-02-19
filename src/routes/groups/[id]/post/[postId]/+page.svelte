<script lang="ts">
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { authClient } from '$lib/auth-client';
	import { CommentsSection, ReactionsBar } from '$lib/components/interactions';
	import { Markdown } from '$lib/components/prompt-kit/markdown';
	import { Loader } from '$lib/components/prompt-kit/loader';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { ArrowLeft, Calendar, PenSquare, Tag, User } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	const groupId = $derived(page.params.id as Id<'groups'>);
	const postId = $derived(page.params.postId as Id<'group_posts'>);
	const client = useConvexClient();
	const session = authClient.useSession();

	const groupQuery = useQuery((api as any).groups.get, () => (groupId ? { groupId } : 'skip'));
	const group = $derived(groupQuery.data);

	const postQuery = useQuery((api as any).group_posts.get, () =>
		postId ? { groupId, postId } : 'skip'
	);
	const post = $derived(postQuery.data);

	let postBody = $state('');
	let lastFetchedBodyUrl = '';
	let postBodyFetchToken = 0;

	$effect(() => {
		const snippet = post?.snippet ?? '';
		const bodyUrl = post?.bodyUrl;

		if (!bodyUrl || !browser) {
			postBody = snippet;
			lastFetchedBodyUrl = '';
			return;
		}

		if (bodyUrl === lastFetchedBodyUrl) {
			if (!postBody) {
				postBody = snippet;
			}
			return;
		}

		postBody = snippet;
		lastFetchedBodyUrl = bodyUrl;
		const fetchToken = ++postBodyFetchToken;

		void (async () => {
			try {
				const response = await fetch(bodyUrl);
				if (!response.ok) {
					throw new Error(`Failed to fetch post body (${response.status})`);
				}

				const fullBody = await response.text();
				if (fetchToken === postBodyFetchToken && fullBody.trim().length > 0) {
					postBody = fullBody;
				}
			} catch (error) {
				console.error('Failed to fetch full post body:', error);
			}
		})();
	});

	const reactionsQuery = useQuery((api as any).group_posts.getReactionCounts, () =>
		postId ? { groupId, postId } : 'skip'
	);
	const reactions = $derived(
		reactionsQuery.data ?? { likes: 0, dislikes: 0, commentCount: 0, userReaction: null }
	);

	const commentsQuery = useQuery((api as any).group_posts.getComments, () =>
		postId ? { groupId, postId } : 'skip'
	);
	const comments = $derived(commentsQuery.data ?? []);

	const isAuthenticated = $derived(!!$session.data?.user);
	const currentUserId = $derived($session.data?.user?.id);
	const currentUserInitial = $derived($session.data?.user?.name?.charAt(0).toUpperCase() ?? 'U');

	let commentToDelete = $state<Id<'group_post_comments'> | null>(null);
	let isDeleteCommentDialogOpen = $state(false);

	async function handleLike() {
		if (!isAuthenticated) return;
		try {
			await client.mutation((api as any).group_posts.toggleLike, { groupId, postId });
		} catch (e: any) {
			toast.error(e?.message || 'Failed to react');
		}
	}

	async function handleDislike() {
		if (!isAuthenticated) return;
		try {
			await client.mutation((api as any).group_posts.toggleDislike, { groupId, postId });
		} catch (e: any) {
			toast.error(e?.message || 'Failed to react');
		}
	}

	async function handleAddComment(body: string, parentId?: string) {
		await client.mutation((api as any).group_posts.addComment, {
			groupId,
			postId,
			body,
			parentId: parentId as Id<'group_post_comments'> | undefined
		});
	}

	function handleDeleteComment(commentId: string) {
		commentToDelete = commentId as Id<'group_post_comments'>;
		isDeleteCommentDialogOpen = true;
	}

	async function confirmDeleteComment() {
		if (!commentToDelete) return;
		try {
			await client.mutation((api as any).group_posts.removeComment, {
				commentId: commentToDelete
			});
			commentToDelete = null;
			isDeleteCommentDialogOpen = false;
			toast.success('Comment deleted');
		} catch (e: any) {
			toast.error(e?.message || 'Failed to delete comment');
		}
	}

	async function handleCommentLike(commentId: string) {
		if (!isAuthenticated) return;
		await client.mutation((api as any).group_posts.toggleCommentLike, {
			commentId: commentId as Id<'group_post_comments'>
		});
	}

	async function handleCommentDislike(commentId: string) {
		if (!isAuthenticated) return;
		await client.mutation((api as any).group_posts.toggleCommentDislike, {
			commentId: commentId as Id<'group_post_comments'>
		});
	}

	function scrollToComments() {
		document.getElementById('comments')?.scrollIntoView({ behavior: 'smooth' });
	}

	function postTagHref(tag: string) {
		return resolve(`/groups/${groupId}?view=posts&tag=${encodeURIComponent(tag)}`);
	}
</script>

<svelte:head>
	<title>{post?.title || 'Group Post'} - {group?.name || 'Group'}</title>
</svelte:head>

<div class="mx-auto max-w-4xl px-4 pt-8 pb-20 sm:px-6">
	{#if postQuery.isLoading || groupQuery.isLoading}
		<div class="flex h-[50vh] items-center justify-center">
			<Loader variant="circular" size="lg" />
		</div>
	{:else if !post}
		<div class="flex flex-col items-center justify-center py-20 text-center">
			<h2 class="text-xl font-bold">Post not found</h2>
			<Button href="/groups/{groupId}?view=posts" variant="outline" class="mt-4"
				>Back to Posts</Button
			>
		</div>
	{:else}
		<article class="space-y-8">
			<header class="space-y-6">
				<div class="flex flex-wrap items-center gap-2">
					<Button
						variant="ghost"
						size="sm"
						href="/groups/{groupId}?view=posts"
						class="-ml-2 h-7 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
					>
						<ArrowLeft class="h-3.5 w-3.5" />
						Back to Posts
					</Button>
					{#if post.canDelete}
						<Button
							variant="outline"
							size="sm"
							href="/groups/{groupId}/posts/{post._id}/edit"
							class="h-7 gap-1.5 px-2"
						>
							<PenSquare class="h-3.5 w-3.5" />
							Edit
						</Button>
					{/if}
				</div>

				<div class="flex flex-wrap items-center gap-2">
					<Badge variant="secondary" class="gap-1.5 px-2.5 py-1 text-[10px] uppercase">
						<PenSquare class="h-3 w-3 opacity-70" />
						Group Post
					</Badge>
					<Badge variant="secondary" class="gap-1.5 px-2.5 py-1 text-[10px] uppercase">
						<Calendar class="h-3 w-3 opacity-70" />
						{new Date(post.createdAt).toLocaleDateString()}
					</Badge>
					<Badge variant="outline" class="gap-1.5 px-2.5 py-1 text-[10px] uppercase">
						<User class="h-3 w-3" />
						{post.authorName}
					</Badge>
				</div>

				<h1 class="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
					{post.title}
				</h1>

				{#if post.tags.length > 0}
					<div class="flex flex-wrap items-center gap-2">
						{#each post.tags as tag (tag)}
							<a href={postTagHref(tag)} class="inline-flex">
								<Badge
									variant="outline"
									class="cursor-pointer text-[10px] hover:bg-accent hover:text-accent-foreground"
								>
									<Tag class="mr-1 h-3 w-3" />
									{tag}
								</Badge>
							</a>
						{/each}
					</div>
				{/if}

				<div
					class="flex flex-col gap-4 border-t border-b border-border/50 py-5 sm:flex-row sm:items-center sm:justify-between"
				>
					<ReactionsBar
						likes={reactions.likes}
						dislikes={reactions.dislikes}
						commentCount={reactions.commentCount}
						userReaction={reactions.userReaction}
						{isAuthenticated}
						onLike={handleLike}
						onDislike={handleDislike}
						onScrollToComments={scrollToComments}
					/>
				</div>
			</header>

			<div class="rounded-xl border bg-card p-8 shadow-sm">
				<div
					class="prose prose-zinc dark:prose-invert prose-headings:font-semibold prose-p:leading-relaxed max-w-none"
				>
					<Markdown content={postBody} />
				</div>
			</div>

			<div id="comments" class="scroll-mt-20 pt-4">
				<CommentsSection
					{comments}
					isLoading={commentsQuery.isLoading}
					{isAuthenticated}
					{currentUserId}
					{currentUserInitial}
					showTabs={false}
					groupName={group?.name}
					onAddComment={handleAddComment}
					onDeleteComment={handleDeleteComment}
					onCommentLike={handleCommentLike}
					onCommentDislike={handleCommentDislike}
				/>
			</div>
		</article>
	{/if}
</div>

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
