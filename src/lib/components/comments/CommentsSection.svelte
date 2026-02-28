<script lang="ts">
	import { LoaderCircle, MessageCircle, Send } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription } from '$lib/components/ui/card';
	import { Textarea } from '$lib/components/ui/textarea';
	import CommentItem from './CommentItem.svelte';

	type FlatComment = {
		_id: string;
		parentId?: string;
		authorAuthId: string;
		authorName: string;
		authorUsername: string | null;
		body: string;
		score: number;
		likes: number;
		dislikes: number;
		createdAt: number;
		updatedAt: number;
		userVote: -1 | 1 | null;
	};

	type CommentNode = {
		_id: string;
		parentId?: string;
		authorAuthId: string;
		authorName: string;
		authorUsername: string | null;
		body: string;
		score: number;
		likes: number;
		dislikes: number;
		createdAt: number;
		updatedAt: number;
		userVote: -1 | 1 | null;
		children: Array<CommentNode>;
	};

	interface Props {
		comments: Array<FlatComment>;
		isLoading: boolean;
		isAuthenticated: boolean;
		signInHref: string;
		currentUserInitial?: string;
		onAddComment: (body: string, parentId?: string) => Promise<void>;
		onCommentLike: (commentId: string) => Promise<void>;
		onCommentDislike: (commentId: string) => Promise<void>;
	}

	let {
		comments,
		isLoading,
		isAuthenticated,
		signInHref,
		currentUserInitial = 'U',
		onAddComment,
		onCommentLike,
		onCommentDislike
	}: Props = $props();

	let commentText = $state('');
	let isSubmitting = $state(false);

	const commentTree = $derived.by(() => {
		const map = new Map<string, CommentNode>();
		const roots: Array<CommentNode> = [];

		for (const c of comments) {
			map.set(c._id, { ...c, children: [] });
		}

		for (const c of comments) {
			const node = map.get(c._id);
			if (!node) continue;
			if (c.parentId && map.has(c.parentId)) {
				const parent = map.get(c.parentId);
				if (parent) parent.children.push(node);
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
			e.preventDefault();
			handleSubmitComment();
		}
	}
</script>

<div id="comments" class="mt-10 border-t border-border pt-8">
	<h2 class="mb-6 text-xl font-bold">Comments ({comments.length})</h2>

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
					<div class="flex flex-wrap items-center justify-between gap-2">
						<span class="text-xs text-muted-foreground">Tip: Press Ctrl/Cmd+Enter to post</span>
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
		<Card class="mb-8 border-dashed py-6">
			<CardContent class="flex flex-col items-center justify-center text-center">
				<MessageCircle class="mb-3 h-10 w-10 text-muted-foreground/50" />
				<p class="mb-1 text-sm font-medium text-foreground">Join the conversation</p>
				<CardDescription class="mb-4 max-w-xs">
					Sign in to share your thoughts and engage with the community.
				</CardDescription>
				<Button href={signInHref} size="sm">Sign in to comment</Button>
			</CardContent>
		</Card>
	{/if}

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
					{signInHref}
					onLike={onCommentLike}
					onDislike={onCommentDislike}
					onReply={handleReply}
				/>
			{/each}
		</div>
	{:else}
		<p class="text-center text-sm text-muted-foreground">No comments yet. Be the first to comment.</p>
	{/if}
</div>
