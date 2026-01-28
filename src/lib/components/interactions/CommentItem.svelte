<script lang="ts">
	import {
		ThumbsUp,
		ThumbsDown,
		Reply,
		Trash2,
		ChevronDown,
		ChevronRight,
		CircleMinus,
		PlusCircle
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import type { Comment } from './types.js';
	import CommentItem from './CommentItem.svelte';

	interface Props {
		comment: Comment;
		depth?: number;
		isAuthenticated: boolean;
		currentUserId?: string;
		onLike: (commentId: string) => void;
		onDislike: (commentId: string) => void;
		onReply: (body: string, parentId: string) => Promise<void>;
		onDelete: (commentId: string) => void;
	}

	let {
		comment,
		depth = 0,
		isAuthenticated,
		currentUserId,
		onLike,
		onDislike,
		onReply,
		onDelete
	}: Props = $props();

	let isReplying = $state(false);
	let replyText = $state('');
	let isSubmitting = $state(false);
	let isCollapsed = $state(false);

	const hasChildren = $derived(comment.children && comment.children.length > 0);
	const canDelete = $derived(currentUserId === comment.userId);

	// Recursively count all nested descendants
	function countAllReplies(c: Comment): number {
		if (!c.children || c.children.length === 0) return 0;
		return c.children.reduce((sum, child) => sum + 1 + countAllReplies(child), 0);
	}

	const totalReplies = $derived(countAllReplies(comment));

	function formatDate(timestamp: number) {
		const now = Date.now();
		const diff = now - timestamp;
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) return 'just now';
		if (minutes < 60) return `${minutes}m ago`;
		if (hours < 24) return `${hours}h ago`;
		if (days < 7) return `${days}d ago`;

		return new Intl.DateTimeFormat('en-US', {
			month: 'short',
			day: 'numeric'
		}).format(timestamp);
	}

	async function handleSubmitReply() {
		if (!replyText.trim() || isSubmitting) return;
		isSubmitting = true;
		try {
			await onReply(replyText.trim(), comment._id);
			replyText = '';
			isReplying = false;
		} finally {
			isSubmitting = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			handleSubmitReply();
		}
	}
</script>

<div class="group flex flex-col py-1 {depth === 0 ? 'mt-4 border-t border-border/50 pt-4' : ''}">
	<!-- Comment header -->
	<div class="mb-1 flex items-center gap-2 text-xs">
		<button
			class="flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
			onclick={() => (isCollapsed = !isCollapsed)}
			aria-label={isCollapsed ? 'Expand comment' : 'Collapse comment'}
		>
			{#if isCollapsed}
				<PlusCircle class="h-3.5 w-3.5" />
			{:else}
				<CircleMinus class="h-3.5 w-3.5" />
			{/if}
		</button>

		<Avatar.Root class="h-6 w-6">
			<Avatar.Fallback class="bg-primary/10 text-[10px] text-primary">
				{(comment.userName || 'Anonymous').substring(0, 2).toUpperCase()}
			</Avatar.Fallback>
		</Avatar.Root>
		<span class="font-bold text-foreground">{comment.userName || 'Anonymous'}</span>
		<span class="text-muted-foreground/60">·</span>
		<span class="text-muted-foreground">{formatDate(comment.createdAt)}</span>

		{#if isCollapsed}
			<span class="ml-1 text-primary">
				({totalReplies + 1}
				{totalReplies === 0 ? 'comment' : 'comments'} hidden)
			</span>
		{/if}
	</div>

	{#if !isCollapsed}
		<div class="flex">
			<!-- Indentation space (no visible line) -->
			<div class="w-7 shrink-0"></div>

			<div class="flex-1 pb-1">
				<!-- Comment body -->
				<div class="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
					{comment.body}
				</div>

				<!-- Comment actions -->
				<div class="mt-1 flex items-center gap-1">
					{#if isAuthenticated}
						<Button
							variant="ghost"
							size="sm"
							class="h-7 gap-1 px-1.5 text-xs text-muted-foreground hover:text-foreground {comment.userReaction ===
							'like'
								? 'text-primary'
								: ''}"
							onclick={() => onLike(comment._id)}
						>
							<ThumbsUp class="h-3.5 w-3.5" />
							{#if comment.likes > 0}
								<span>{comment.likes}</span>
							{/if}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							class="h-7 gap-1 px-1.5 text-xs text-muted-foreground hover:text-foreground {comment.userReaction ===
							'dislike'
								? 'text-destructive'
								: ''}"
							onclick={() => onDislike(comment._id)}
						>
							<ThumbsDown class="h-3.5 w-3.5" />
							{#if comment.dislikes > 0}
								<span>{comment.dislikes}</span>
							{/if}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							class="h-7 gap-1 px-1.5 text-xs text-muted-foreground hover:text-foreground"
							onclick={() => (isReplying = !isReplying)}
						>
							<Reply class="h-3.5 w-3.5" />
							Reply
						</Button>
						{#if canDelete}
							<Button
								variant="ghost"
								size="sm"
								class="h-7 gap-1 px-1.5 text-xs text-muted-foreground hover:text-destructive"
								onclick={() => onDelete(comment._id)}
							>
								<Trash2 class="h-3.5 w-3.5" />
							</Button>
						{/if}
					{:else}
						<Button
							variant="ghost"
							size="sm"
							class="h-7 gap-1 px-1.5 text-xs text-muted-foreground"
							href="/signin"
						>
							<ThumbsUp class="h-3.5 w-3.5" />
							{#if comment.likes > 0}
								<span>{comment.likes}</span>
							{/if}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							class="h-7 gap-1 px-1.5 text-xs text-muted-foreground"
							href="/signin"
						>
							<ThumbsDown class="h-3.5 w-3.5" />
							{#if comment.dislikes > 0}
								<span>{comment.dislikes}</span>
							{/if}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							class="h-7 gap-1 px-1.5 text-xs text-muted-foreground"
							href="/signin"
						>
							<Reply class="h-3.5 w-3.5" />
							Reply
						</Button>
					{/if}
				</div>

				<!-- Reply form -->
				{#if isReplying}
					<div class="mt-3 space-y-2">
						<Textarea
							bind:value={replyText}
							placeholder="Write a reply..."
							class="min-h-20 resize-none text-sm"
							onkeydown={handleKeydown}
						/>
						<div class="flex items-center gap-2">
							<Button
								size="sm"
								class="h-7 text-xs"
								onclick={handleSubmitReply}
								disabled={isSubmitting || !replyText.trim()}
							>
								{isSubmitting ? 'Posting...' : 'Reply'}
							</Button>
							<Button
								variant="ghost"
								size="sm"
								class="h-7 text-xs"
								onclick={() => {
									isReplying = false;
									replyText = '';
								}}
							>
								Cancel
							</Button>
						</div>
					</div>
				{/if}

				<!-- Nested children -->
				{#if hasChildren}
					<div class="mt-2">
						{#each comment.children as child (child._id)}
							<CommentItem
								comment={child}
								depth={depth + 1}
								{isAuthenticated}
								{currentUserId}
								{onLike}
								{onDislike}
								{onReply}
								{onDelete}
							/>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
