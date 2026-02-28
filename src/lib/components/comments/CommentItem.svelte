<script lang="ts">
	import { CircleMinus, PlusCircle, Reply, ThumbsDown, ThumbsUp } from '@lucide/svelte';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import CommentItemSelf from './CommentItem.svelte';

	type CommentNode = {
		_id: string;
		authorAuthId: string;
		authorName: string;
		authorUsername: string | null;
		body: string;
		likes: number;
		dislikes: number;
		createdAt: number;
		userVote: -1 | 1 | null;
		children: Array<CommentNode>;
	};

	interface Props {
		comment: CommentNode;
		depth?: number;
		isAuthenticated: boolean;
		signInHref: string;
		onLike: (commentId: string) => Promise<void>;
		onDislike: (commentId: string) => Promise<void>;
		onReply: (body: string, parentId: string) => Promise<void>;
	}

	let {
		comment,
		depth = 0,
		isAuthenticated,
		signInHref,
		onLike,
		onDislike,
		onReply
	}: Props = $props();

	let isReplying = $state(false);
	let replyText = $state('');
	let isSubmitting = $state(false);
	let isCollapsed = $state(false);

	const hasChildren = $derived(comment.children.length > 0);
	const displayName = $derived(comment.authorUsername ?? comment.authorName ?? 'anonymous');
	const authorProfileHref = $derived(
		comment.authorUsername ? `/u/${comment.authorUsername}` : null
	);

	function countAllReplies(node: CommentNode): number {
		if (node.children.length === 0) return 0;
		return node.children.reduce((sum, child) => sum + 1 + countAllReplies(child), 0);
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
			e.preventDefault();
			handleSubmitReply();
		}
	}
</script>

<div class="group flex flex-col py-1 {depth === 0 ? 'mt-4 border-t border-border/50 pt-4' : ''}">
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
				{displayName.substring(0, 2).toUpperCase()}
			</Avatar.Fallback>
		</Avatar.Root>
		{#if authorProfileHref}
			<a href={authorProfileHref} class="font-bold text-foreground hover:underline">
				u/{displayName}
			</a>
		{:else}
			<span class="font-bold text-foreground">{displayName}</span>
		{/if}
		<span class="text-muted-foreground/60">|</span>
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
			<div class="w-7 shrink-0"></div>

			<div class="flex-1 pb-1">
				<div class="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
					{comment.body}
				</div>

				<div class="mt-1 flex items-center gap-1.5">
					{#if isAuthenticated}
						<Button
							variant={comment.userVote === 1 ? 'secondary' : 'ghost'}
							size="icon-sm"
							class={comment.userVote === 1
								? 'border-primary/40 text-primary [&_svg_path]:!fill-current'
								: 'text-muted-foreground hover:text-foreground'}
							onclick={() => onLike(comment._id)}
							aria-label="Like comment"
						>
							<ThumbsUp class="size-4" />
						</Button>
						<span class="min-w-4 text-xs text-muted-foreground">{comment.likes}</span>
						<Button
							variant={comment.userVote === -1 ? 'secondary' : 'ghost'}
							size="icon-sm"
							class={comment.userVote === -1
								? 'border-destructive/40 text-destructive [&_svg_path]:!fill-current'
								: 'text-muted-foreground hover:text-foreground'}
							onclick={() => onDislike(comment._id)}
							aria-label="Dislike comment"
						>
							<ThumbsDown class="size-4" />
						</Button>
						<span class="min-w-4 text-xs text-muted-foreground">{comment.dislikes}</span>
						<Button
							variant="ghost"
							size="sm"
							class="h-7 gap-1 px-1.5 text-xs text-muted-foreground hover:text-foreground"
							onclick={() => (isReplying = !isReplying)}
						>
							<Reply class="h-3.5 w-3.5" />
							Reply
						</Button>
					{:else}
						<Button
							variant="ghost"
							size="icon-sm"
							class="text-muted-foreground"
							href={signInHref}
							aria-label="Like comment"
						>
							<ThumbsUp class="size-4" />
						</Button>
						<span class="min-w-4 text-xs text-muted-foreground">{comment.likes}</span>
						<Button
							variant="ghost"
							size="icon-sm"
							class="text-muted-foreground"
							href={signInHref}
							aria-label="Dislike comment"
						>
							<ThumbsDown class="size-4" />
						</Button>
						<span class="min-w-4 text-xs text-muted-foreground">{comment.dislikes}</span>
						<Button
							variant="ghost"
							size="sm"
							class="h-7 gap-1 px-1.5 text-xs text-muted-foreground"
							href={signInHref}
						>
							<Reply class="h-3.5 w-3.5" />
							Reply
						</Button>
					{/if}
				</div>

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

				{#if hasChildren}
					<div class="mt-2">
						{#each comment.children as child (child._id)}
							<CommentItemSelf
								comment={child}
								depth={depth + 1}
								{isAuthenticated}
								{signInHref}
								{onLike}
								{onDislike}
								{onReply}
							/>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
