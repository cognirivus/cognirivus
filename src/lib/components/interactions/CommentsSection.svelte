<script lang="ts">
	import { MessageCircle, Send, LoaderCircle, Users } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import GroupSelectionList from '$lib/components/GroupSelectionList.svelte';
	import CommentItem from './CommentItem.svelte';
	import type { Comment, FlatComment } from './types.js';
	import type { Id } from '$convex/_generated/dataModel';

	interface Props {
		comments: FlatComment[];
		isLoading: boolean;
		isAuthenticated: boolean;
		currentUserId?: string;
		currentUserInitial?: string;
		contentId?: Id<'content'>;
		blogId?: Id<'blogs'>;
		showTabs?: boolean;
		groupName?: string;
		onAddComment: (body: string, parentId?: string) => Promise<void>;
		onDeleteComment: (commentId: string) => void;
		onCommentLike: (commentId: string) => void;
		onCommentDislike: (commentId: string) => void;
	}

	let {
		comments,
		isLoading,
		isAuthenticated,
		currentUserId,
		currentUserInitial = 'U',
		contentId,
		blogId,
		showTabs = true,
		groupName,
		onAddComment,
		onDeleteComment,
		onCommentLike,
		onCommentDislike
	}: Props = $props();

	let commentText = $state('');
	let isSubmitting = $state(false);
	let activeTab = $state('comments');

	// Build tree structure from flat comments
	const commentTree = $derived.by(() => {
		const map = new Map<string, Comment>();
		const roots: Comment[] = [];

		// First pass: create all nodes
		for (const c of comments) {
			map.set(c._id, { ...c, children: [] });
		}

		// Second pass: build tree
		for (const c of comments) {
			const node = map.get(c._id)!;
			if (c.parentId && map.has(c.parentId)) {
				map.get(c.parentId)!.children!.push(node);
			} else {
				roots.push(node);
			}
		}

		return roots;
	});

	async function handleSubmitComment() {
		if (!commentText.trim() || isSubmitting) return;
		isSubmitting = true;
		try {
			await onAddComment(commentText.trim());
			commentText = '';
		} finally {
			isSubmitting = false;
		}
	}

	async function handleReply(body: string, parentId: string) {
		await onAddComment(body, parentId);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			handleSubmitComment();
		}
	}
</script>

<div id="comments" class="mt-10 border-t border-border pt-8">
	{#if showTabs}
		<Tabs.Root value={activeTab} class="w-full">
			<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<Tabs.List class="grid w-full grid-cols-2 sm:w-[400px]">
					<Tabs.Trigger value="comments" class="gap-2">
						<MessageCircle class="h-4 w-4" />
						Comments ({comments.length})
					</Tabs.Trigger>
					<Tabs.Trigger value="groups" class="gap-2">
						<Users class="h-4 w-4" />
						Groups
					</Tabs.Trigger>
				</Tabs.List>
			</div>

			<Tabs.Content value="comments" class="mt-0">
				{@render commentsContent()}
			</Tabs.Content>

			<Tabs.Content value="groups" class="mt-0">
				{#if isAuthenticated}
					{#if contentId || blogId}
						<GroupSelectionList {contentId} {blogId} />
					{:else}
						<p class="py-8 text-center text-sm text-muted-foreground">
							This content cannot be discussed in groups.
						</p>
					{/if}
				{:else}
					<Card.Root class="mb-8 border-dashed">
						<Card.Content class="flex flex-col items-center justify-center py-10 text-center">
							<Users class="mb-3 h-10 w-10 text-muted-foreground/50" />
							<p class="mb-1 text-sm font-medium text-foreground">Sign in to use Groups</p>
							<Card.Description class="mb-4 max-w-xs">
								Private group discussions are exclusive to registered members.
							</Card.Description>
							<Button href="/signin" size="sm">Sign in</Button>
						</Card.Content>
					</Card.Root>
				{/if}
			</Tabs.Content>
		</Tabs.Root>
	{:else}
		<div class="mb-6">
			<h2 class="text-xl font-bold">
				Comments {#if groupName}in <span class="text-primary">{groupName}</span>{/if} ({comments.length})
			</h2>
		</div>
		{@render commentsContent()}
	{/if}
</div>

{#snippet commentsContent()}
	<!-- Add Comment Form -->
	{#if isAuthenticated}
		<div class="mb-8">
			<div class="flex gap-3">
				<div
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary"
				>
					{currentUserInitial}
				</div>
				<div class="flex-1 space-y-3">
					<Textarea
						bind:value={commentText}
						placeholder="Share your thoughts..."
						class="min-h-24 resize-none border-muted-foreground/20 bg-muted/30 transition-colors focus:border-primary focus:bg-background"
						onkeydown={handleKeydown}
					/>
					<div class="flex items-center justify-between">
						<span class="text-xs text-muted-foreground">
							Tip: Press {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+Enter to post
						</span>
						<Button
							onclick={handleSubmitComment}
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
	{#if isLoading}
		<div class="flex justify-center py-8">
			<LoaderCircle class="h-6 w-6 animate-spin text-muted-foreground" />
		</div>
	{:else if commentTree.length > 0}
		<div class="space-y-0">
			{#each commentTree as comment (comment._id)}
				<CommentItem
					{comment}
					depth={0}
					{isAuthenticated}
					{currentUserId}
					onLike={onCommentLike}
					onDislike={onCommentDislike}
					onReply={handleReply}
					onDelete={onDeleteComment}
				/>
			{/each}
		</div>
	{:else}
		<p class="text-center text-sm text-muted-foreground">
			No comments yet. Be the first to comment!
		</p>
	{/if}
{/snippet}
