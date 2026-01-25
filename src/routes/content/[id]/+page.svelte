<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { page } from '$app/state';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import {
		Calendar,
		Tag,
		Book,
		MapPin,
		Brain,
		Users,
		Building2,
		Briefcase,
		Check,
		ChevronRight,
		FileText,
		Share2,
		MessageSquare,
		Globe
	} from '@lucide/svelte';
	import { Loader } from '$lib/components/prompt-kit/loader';
	import { Markdown } from '$lib/components/prompt-kit/markdown';
	import MarkCompleteToggle from '$lib/components/MarkCompleteToggle.svelte';
	import { ReactionsBar, CommentsSection } from '$lib/components/interactions';
	import { authClient } from '$lib/auth-client';
	import type { Id } from '$convex/_generated/dataModel';
	import GroupSelectionDialog from '$lib/components/GroupSelectionDialog.svelte';
	import { toast } from 'svelte-sonner';
	import * as Dialog from '$lib/components/ui/dialog';
	import { HighlightWrapper, FloatingToolbar, InlineCommentPane } from '$lib/components/highlights';
	import { highlightStore } from '$lib/stores/highlights.svelte';

	const contentId = $derived(page.params.id as Id<'content'>);
	let activeCommentId = $state<Id<'highlights'> | null>(null);

	const highlightsQuery = useQuery(api.highlights.listHighlights, () =>
		page.params.id ? { contentId: page.params.id as Id<'content'> } : 'skip'
	);
	const highlights = $derived(highlightsQuery.data ?? []);

	const client = useConvexClient();
	const session = authClient.useSession();

	const contentQuery = useQuery((api as any).content.getById, () =>
		page.params.id ? { id: page.params.id as Id<'content'> } : 'skip'
	);
	const item = $derived(contentQuery.data);

	const flashcardsQuery = useQuery((api as any).flashcards.listByContent, () =>
		page.params.id ? { contentId: page.params.id as Id<'content'> } : 'skip'
	);

	const progressQuery = useQuery(api.content.getUserProgress, {});

	const reactionsQuery = useQuery(api.content.getReactionCounts, () =>
		page.params.id ? { contentId: page.params.id as Id<'content'> } : 'skip'
	);
	const reactions = $derived(
		reactionsQuery.data ?? { likes: 0, dislikes: 0, commentCount: 0, userReaction: null }
	);

	const commentsQuery = useQuery(api.content.getComments, () =>
		page.params.id ? { contentId: page.params.id as Id<'content'> } : 'skip'
	);
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

	async function handleAddHighlight(
		color: string,
		serializedRange: string,
		text: string,
		gId?: string
	) {
		if (!isAuthenticated) return;
		try {
			return await client.mutation(api.highlights.createHighlight, {
				contentId,
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

	async function handleRemoveHighlight(id: Id<'highlights'>) {
		try {
			await client.mutation(api.highlights.removeHighlight, { id });
		} catch (e) {
			console.error('Failed to remove highlight:', e);
		}
	}

	let isGroupDialogOpen = $state(false);
	let groupDialogTitle = $state('Select a Group');
	let groupDialogAction = $state<'discuss' | 'share'>('discuss');

	let commentToDelete = $state<Id<'content_comments'> | null>(null);
	let isDeleteCommentDialogOpen = $state(false);

	function getEntityIcon(type: string) {
		const t = type.toLowerCase();
		if (t === 'location' || t.includes('place')) return MapPin;
		if (t === 'person') return Users;
		if (t.includes('organization') || t.includes('office')) return Building2;
		if (t.includes('legislation') || t.includes('act') || t.includes('law')) return Briefcase;
		return Tag;
	}

	async function handleLike() {
		if (!isAuthenticated) return;
		try {
			await client.mutation(api.content.toggleLike, { contentId });
		} catch (e) {
			console.error('Failed to toggle like:', e);
		}
	}

	async function handleDislike() {
		if (!isAuthenticated) return;
		try {
			await client.mutation(api.content.toggleDislike, { contentId });
		} catch (e) {
			console.error('Failed to toggle dislike:', e);
		}
	}

	async function handleAddComment(body: string, parentId?: string) {
		await client.mutation(api.content.addComment, {
			contentId,
			body,
			parentId: parentId as Id<'content_comments'> | undefined
		});
	}

	async function onGroupSelect(groupId: string) {
		try {
			await client.mutation((api as any).groups.shareContent, {
				groupId: groupId as Id<'groups'>,
				contentId
			});

			if (groupDialogAction === 'discuss') {
				window.location.href = `/groups/${groupId}/content/${contentId}`;
			} else {
				toast.success('Content shared to group feed!');
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
			await client.mutation(api.content.removeComment, { id: commentToDelete });
			toast.success('Comment deleted');
			isDeleteCommentDialogOpen = false;
			commentToDelete = null;
		} catch (e: any) {
			toast.error(e.message || 'Failed to delete comment');
		}
	}

	function handleDeleteComment(commentId: string) {
		commentToDelete = commentId as Id<'content_comments'>;
		isDeleteCommentDialogOpen = true;
	}

	async function handleCommentLike(commentId: string) {
		if (!isAuthenticated) return;
		try {
			await client.mutation(api.content.toggleCommentLike, {
				commentId: commentId as Id<'content_comments'>
			});
		} catch (e) {
			console.error('Failed to toggle comment like:', e);
		}
	}

	async function handleCommentDislike(commentId: string) {
		if (!isAuthenticated) return;
		try {
			await client.mutation(api.content.toggleCommentDislike, {
				commentId: commentId as Id<'content_comments'>
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
	<title>{item?.title || 'Content'} - Knowledge Base</title>
</svelte:head>

<div class="flex h-full w-full overflow-hidden">
	<div class="flex-1 overflow-y-auto">
		<div class="mx-auto max-w-4xl px-4 pt-8 pb-32 sm:px-6">
			{#if contentQuery.isLoading}
				<div class="flex h-[50vh] items-center justify-center">
					<p>Loading content...</p>
				</div>
			{:else if !item}
				<div class="flex flex-col items-center justify-center py-20 text-center">
					<div class="mb-4 rounded-full bg-muted p-4">
						<FileText class="h-8 w-8 text-muted-foreground" />
					</div>
					<h2 class="text-xl font-bold">Content not found</h2>
					<p class="text-sm text-muted-foreground">
						The content you're looking for doesn't exist or has been removed.
					</p>
					<Button href="/content" variant="outline" class="mt-4">Back to Knowledge Base</Button>
				</div>
			{:else}
				<!-- Breadcrumb Context -->
				<div class="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
					<a
						href={item.topic === 'Current Affairs' ? '/content?news=true' : '/content'}
						class="hover:text-foreground hover:underline"
					>
						{item.topic === 'Current Affairs' ? 'Current Affairs' : 'Knowledge Base'}
					</a>
					{#if item.subject}
						<ChevronRight class="h-3.5 w-3.5" />
						<a
							href="/content?subject={item.subject._id}"
							class="hover:text-foreground hover:underline"
						>
							{item.subject.name}
						</a>
					{/if}
					<ChevronRight class="h-3.5 w-3.5" />
					<span class="line-clamp-1 max-w-[200px] text-foreground">{item.title}</span>
				</div>

				<article class="space-y-6">
					<!-- Header -->
					<header class="space-y-4">
						<!-- Tags Row -->
						<div class="flex flex-wrap items-center gap-2">
							{#if item.subject}
								<Badge
									variant="outline"
									class="border-primary/20 bg-primary/5 text-[10px] font-bold text-primary uppercase"
								>
									GS-{item.subject.gsPaper} | {item.subject.name}
								</Badge>
							{/if}
							<Badge variant="secondary" class="flex items-center gap-1 text-[10px] uppercase">
								<Tag class="h-3 w-3" />
								{item.topic}
							</Badge>
							{#if progressQuery.data?.[item._id]}
								<Badge
									variant="outline"
									class="border-green-500/20 bg-green-500/5 text-[10px] font-bold text-green-600 uppercase"
								>
									<Check class="mr-1 h-3 w-3" />
									Completed
								</Badge>
							{/if}
						</div>

						<!-- Title -->
						<h1 class="text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-4xl">
							{item.title}
						</h1>

						<!-- Meta Row -->
						<div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
							{#if item.newsDate}
								<div class="flex items-center gap-1.5">
									<Calendar class="h-4 w-4 text-primary" />
									<span class="font-medium">{item.newsDate}</span>
								</div>
							{/if}

							{#if item.source}
								<div class="flex items-center gap-1.5">
									<Book class="h-4 w-4" />
									<span>{item.source}</span>
								</div>
							{/if}

							{#if page.data.currentUser}
								<div class="ml-auto">
									<MarkCompleteToggle contentId={item._id} />
								</div>
							{/if}
						</div>

						<!-- Reactions Bar -->
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
									variant="secondary"
									size="sm"
									class="h-9 gap-2 px-4 font-bold"
									onclick={handleShareToGroup}
								>
									<Share2 class="h-4 w-4" />
									Share to Group
								</Button>
							</div>
						</div>

						<!-- Entities -->
						{#if item.entities && item.entities.length > 0}
							<div class="flex flex-wrap items-center gap-2 border-t pt-4">
								<span class="text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
									>Related:</span
								>
								{#each item.entities as ent}
									{@const Icon = getEntityIcon(ent.type)}
									<a
										href="/content/report?view=entity&type={encodeURIComponent(
											ent.type
										)}&slug={ent.slug}"
										class="group flex items-center gap-1.5 rounded-full border bg-muted/30 px-2.5 py-1 text-xs font-medium transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
									>
										<Icon class="h-3.5 w-3.5" />
										{ent.name}
										<ChevronRight
											class="h-3 w-3 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
										/>
									</a>
								{/each}
							</div>
						{/if}
					</header>

					<!-- Flashcards CTA -->
					{#if page.data.currentUser && flashcardsQuery.data && flashcardsQuery.data.length > 0}
						<div
							class="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 p-4"
						>
							<div class="flex items-center gap-3">
								<div class="rounded-full bg-primary/10 p-2 text-primary">
									<Brain class="h-5 w-5" />
								</div>
								<div>
									<p class="text-sm font-semibold">{flashcardsQuery.data.length} Flashcards</p>
									<p class="text-xs text-muted-foreground">Test your knowledge</p>
								</div>
							</div>
							<Button href="/flashcards/study?contentId={item._id}" size="sm" class="gap-2">
								Study Now
								<ChevronRight class="h-4 w-4" />
							</Button>
						</div>
					{/if}

					<!-- Content Body -->
					<HighlightWrapper
						{highlights}
						{currentUserId}
						onAddHighlight={handleAddHighlight}
						onRemoveHighlight={handleRemoveHighlight}
						onAddComment={(id) => (activeCommentId = id)}
					>
						<div class="rounded-lg border bg-card p-6 shadow-sm">
							<div class="prose prose-zinc dark:prose-invert max-w-none">
								<Markdown content={item.body} />
							</div>
						</div>
					</HighlightWrapper>

					<!-- Footer -->
					{#if item.subject}
						<footer
							class="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3"
						>
							<p class="text-xs text-muted-foreground">
								Part of <span class="font-semibold text-foreground">{item.subject.name}</span>
							</p>
							<Button
								variant="ghost"
								size="sm"
								href="/content?subject={item.subject._id}"
								class="h-8 gap-1 text-xs"
							>
								View all {item.subject.name}
								<ChevronRight class="h-3.5 w-3.5" />
							</Button>
						</footer>
					{/if}

					<div id="comments">
						<CommentsSection
							{comments}
							isLoading={commentsQuery.isLoading}
							{isAuthenticated}
							{currentUserId}
							{currentUserInitial}
							{contentId}
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

<FloatingToolbar {authors} />

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
