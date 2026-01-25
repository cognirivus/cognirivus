<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { page } from '$app/state';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Calendar, Users, MessageSquare, ArrowLeft, ChevronRight, Share2 } from '@lucide/svelte';
	import { Loader } from '$lib/components/prompt-kit/loader';
	import { Markdown } from '$lib/components/prompt-kit/markdown';
	import { ReactionsBar, CommentsSection } from '$lib/components/interactions';
	import { authClient } from '$lib/auth-client';
	import type { Id } from '$convex/_generated/dataModel';
	import { Separator } from '$lib/components/ui/separator';
	import { toast } from 'svelte-sonner';
	import * as Dialog from '$lib/components/ui/dialog';
	import { HighlightWrapper, FloatingToolbar, InlineCommentPane } from '$lib/components/highlights';
	import { highlightStore } from '$lib/stores/highlights.svelte';

	const groupId = $derived(page.params.id as Id<'groups'>);
	const blogId = $derived(page.params.blogId as Id<'blogs'>);
	const client = useConvexClient();
	const session = authClient.useSession();

	let activeCommentId = $state<Id<'highlights'> | null>(null);

	const highlightsQuery = useQuery(api.highlights.listHighlights, () =>
		blogId ? { blogId, groupId } : 'skip'
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
				blogId,
				serializedRange,
				text,
				color,
				groupId: (gId as Id<'groups'>) || groupId
			});
		} catch (e) {
			console.error('Failed to create highlight:', e);
			toast.error('Failed to save highlight');
		}
	}

	async function handleRemoveHighlight(id: Id<'highlights'>) {
		try {
			await client.mutation(api.highlights.removeHighlight, { id });
		} catch (e) {
			console.error('Failed to remove highlight:', e);
		}
	}

	let commentToDelete = $state<Id<'blog_comments'> | null>(null);
	let isDeleteCommentDialogOpen = $state(false);

	// Fetch Group Info
	const groupQuery = useQuery((api as any).groups.get, () => (groupId ? { groupId } : 'skip'));
	const group = $derived(groupQuery.data);

	// Fetch Blog Info
	const blogQuery = useQuery(api.blogs.get, () => (blogId ? { id: blogId } : 'skip'));
	const blog = $derived(blogQuery.data);

	// Group-Scoped Interactions
	const reactionsQuery = useQuery((api as any).blogs.getReactionCounts, () =>
		blogId ? { blogId, groupId } : 'skip'
	);
	const reactions = $derived(
		reactionsQuery.data ?? { likes: 0, dislikes: 0, commentCount: 0, userReaction: null }
	);

	const commentsQuery = useQuery((api as any).blogs.getComments, () =>
		blogId ? { blogId, groupId } : 'skip'
	);
	const comments = $derived(commentsQuery.data ?? []);

	const isAuthenticated = $derived(!!session.value?.data?.user);
	const currentUserId = $derived(session.value?.data?.user?.id);
	const currentUserInitial = $derived(
		session.value?.data?.user?.name?.charAt(0).toUpperCase() ?? 'U'
	);

	// Calculate authors for the layers menu
	const authors = $derived.by(() => {
		const map = new Map<string, { id: string; name: string; count: number }>();
		if (isAuthenticated && currentUserId) {
			map.set(currentUserId, { id: currentUserId, name: 'You', count: 0 });
		}
		highlights.forEach((h) => {
			const existing = map.get(h.userId);
			if (existing) {
				existing.count++;
			} else {
				if (h.userId === currentUserId) {
					const you = map.get(currentUserId!)!;
					you.count++;
				} else {
					map.set(h.userId, {
						id: h.userId,
						name: h.userName || 'Unknown',
						count: 1
					});
				}
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
			await client.mutation((api as any).blogs.toggleLike, { blogId, groupId });
		} catch (e) {
			console.error('Failed to toggle like:', e);
		}
	}

	async function handleDislike() {
		if (!isAuthenticated) return;
		try {
			await client.mutation((api as any).blogs.toggleDislike, { blogId, groupId });
		} catch (e) {
			console.error('Failed to toggle dislike:', e);
		}
	}

	async function handleAddComment(body: string, parentId?: string) {
		await client.mutation((api as any).blogs.addComment, {
			blogId,
			body,
			parentId: parentId as Id<'blog_comments'> | undefined,
			groupId
		});
	}

	async function handleCommentLike(commentId: string) {
		if (!isAuthenticated) return;
		try {
			await client.mutation((api as any).blogs.toggleCommentLike, {
				commentId: commentId as Id<'blog_comments'>
			});
		} catch (e) {
			console.error('Failed to toggle comment like:', e);
		}
	}

	async function confirmDeleteComment() {
		if (!commentToDelete) return;
		try {
			await client.mutation((api as any).blogs.removeComment, { id: commentToDelete });
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

	async function handleCommentDislike(commentId: string) {
		if (!isAuthenticated) return;
		try {
			await client.mutation((api as any).blogs.toggleCommentDislike, {
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

<svelte:head>
	<title>{blog?.title || 'Blog'} - {group?.name || 'Group'}</title>
</svelte:head>

<div class="flex h-full w-full overflow-hidden">
	<div class="flex-1 overflow-y-auto">
		<div class="mx-auto max-w-4xl px-4 py-8 sm:px-6">
			{#if blogQuery.isLoading || groupQuery.isLoading}
				<div class="flex h-[50vh] items-center justify-center">
					<Loader variant="circular" size="lg" />
				</div>
			{:else if !blog}
				<div class="flex flex-col items-center justify-center py-20 text-center">
					<h2 class="text-xl font-bold">Blog post not found</h2>
					<Button href="/groups/{groupId}" variant="outline" class="mt-4">Back to Group</Button>
				</div>
			{:else}
				<!-- Breadcrumb Context -->
				<div class="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
					<Button
						variant="ghost"
						size="sm"
						href="/groups/{groupId}"
						class="-ml-2 h-7 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
					>
						<ArrowLeft class="h-3.5 w-3.5" />
						{group?.name || 'Group'}
					</Button>
					<ChevronRight class="h-3.5 w-3.5" />
					<a href="/blog" class="hover:text-foreground hover:underline">Blog</a>
					<ChevronRight class="h-3.5 w-3.5" />
					<span class="line-clamp-1 max-w-[200px] text-foreground">{blog.title}</span>
				</div>

				<article class="space-y-6">
					<header class="space-y-4">
						<div class="flex flex-wrap items-center gap-2">
							<Badge variant="secondary" class="gap-1 text-[10px] uppercase">
								<Calendar class="h-3 w-3" />
								{formatDate(blog.createdAt)}
							</Badge>
							<Badge
								variant="outline"
								class="border-primary/20 bg-primary/5 text-[10px] font-bold text-primary uppercase"
							>
								<Users class="mr-1 h-3 w-3" />
								Group Exclusive
							</Badge>
						</div>

						<h1 class="text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-4xl">
							{blog.title}
						</h1>

						<div
							class="flex flex-col gap-4 border-t border-b border-border py-4 sm:flex-row sm:items-center sm:justify-between"
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

							<div class="flex items-center gap-2">
								<Button
									variant="ghost"
									size="sm"
									class="h-9 gap-2 px-3 text-muted-foreground"
									href="/blog/{blog._id}"
								>
									<Share2 class="h-4 w-4" />
									View Public
								</Button>
							</div>
						</div>
					</header>

					<HighlightWrapper
						{highlights}
						{currentUserId}
						{groupId}
						onAddHighlight={handleAddHighlight}
						onRemoveHighlight={handleRemoveHighlight}
						onAddComment={(id) => (activeCommentId = id)}
					>
						<div class="rounded-lg border bg-card p-6 shadow-sm">
							<div class="prose prose-zinc dark:prose-invert max-w-none">
								<Markdown content={blog.body} />
							</div>
						</div>
					</HighlightWrapper>

					<!-- Group Info (Bottom) -->
					<div class="rounded-xl border border-primary/20 bg-primary/5 p-6">
						<div class="flex items-center gap-3">
							<div class="rounded-full border border-primary/20 bg-primary/10 p-2 text-primary">
								<MessageSquare class="h-5 w-5" />
							</div>
							<div>
								<p class="text-sm font-bold">Group Feed</p>
								<p class="text-xs text-muted-foreground">
									Your comments and reactions here are only visible to <span
										class="font-bold text-primary">{group?.name}</span
									> members.
								</p>
							</div>
						</div>
					</div>

					<div id="comments" class="scroll-mt-20">
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
	</div>
</div>

<FloatingToolbar {authors} {groupId} />

{#if activeCommentId}
	<InlineCommentPane highlightId={activeCommentId} onClose={() => (activeCommentId = null)} />
{/if}

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
