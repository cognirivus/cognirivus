<script lang="ts">
	import { ThumbsUp, ThumbsDown, MessageCircle } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';

	interface Props {
		likes: number;
		dislikes: number;
		commentCount: number;
		userReaction: 'like' | 'dislike' | null;
		isAuthenticated: boolean;
		onLike: () => void;
		onDislike: () => void;
		onScrollToComments?: () => void;
	}

	let {
		likes,
		dislikes,
		commentCount,
		userReaction,
		isAuthenticated,
		onLike,
		onDislike,
		onScrollToComments
	}: Props = $props();
</script>

<div class="flex items-center gap-6">
	<div class="flex items-center gap-2">
		{#if isAuthenticated}
			<Button
				variant={userReaction === 'like' ? 'default' : 'outline'}
				size="sm"
				class="gap-2"
				onclick={onLike}
			>
				<ThumbsUp class="h-4 w-4" />
				{likes}
			</Button>
			<Button
				variant={userReaction === 'dislike' ? 'default' : 'outline'}
				size="sm"
				class="gap-2"
				onclick={onDislike}
			>
				<ThumbsDown class="h-4 w-4" />
				{dislikes}
			</Button>
		{:else}
			<Button variant="outline" size="sm" class="gap-2" href="/signin" title="Sign in to like">
				<ThumbsUp class="h-4 w-4" />
				{likes}
			</Button>
			<Button variant="outline" size="sm" class="gap-2" href="/signin" title="Sign in to dislike">
				<ThumbsDown class="h-4 w-4" />
				{dislikes}
			</Button>
		{/if}
	</div>
	{#if onScrollToComments}
		<button
			class="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
			onclick={onScrollToComments}
		>
			<MessageCircle class="h-4 w-4" />
			<span class="text-sm">{commentCount} comments</span>
		</button>
	{/if}
</div>
