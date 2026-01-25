<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { X, Send, LoaderCircle, MessageSquare, Trash2 } from '@lucide/svelte';
	import { fade, slide, fly } from 'svelte/transition';
	import CommentItem from '$lib/components/interactions/CommentItem.svelte';
	import { authClient } from '$lib/auth-client';
	import { toast } from 'svelte-sonner';

	let { highlightId, onClose } = $props<{
		highlightId: Id<'highlights'>;
		onClose: () => void;
	}>();

	$effect(() => {
		console.log('Opening InlineCommentPane for:', highlightId);
	});

	const client = useConvexClient();
	const session = authClient.useSession();
	const user = $derived(session.value?.data?.user);

	const commentsQuery = useQuery(api.highlights.getInlineComments, () => ({ highlightId }));
	const comments = $derived(commentsQuery.data ?? []);
	const highlightQuery = useQuery(api.highlights.getHighlight, () => ({ id: highlightId }));
	const highlight = $derived(highlightQuery.data);

	let newCommentText = $state('');
	let isSubmitting = $state(false);

	// Build tree structure (similar to CommentsSection.svelte)
	const commentTree = $derived.by(() => {
		const map = new Map<string, any>();
		const roots: any[] = [];
		for (const c of comments) map.set(c._id, { ...c, children: [] });
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

	async function handleSubmit() {
		if (!newCommentText.trim() || isSubmitting) return;
		isSubmitting = true;
		try {
			await client.mutation(api.highlights.addInlineComment, {
				highlightId,
				body: newCommentText.trim()
			});
			newCommentText = '';
			toast.success('Comment posted');
		} catch (e: any) {
			console.error('Submit comment failed:', e);
			toast.error(e.message || 'Failed to add comment');
		} finally {
			isSubmitting = false;
		}
	}

	async function handleReply(body: string, parentId: string) {
		await client.mutation(api.highlights.addInlineComment, {
			highlightId,
			body,
			parentId: parentId as Id<'inline_comments'>
		});
	}

	async function handleLike(commentId: string) {
		await client.mutation(api.highlights.toggleInlineCommentReaction, {
			commentId: commentId as Id<'inline_comments'>,
			reaction: 1
		});
	}

	async function handleDislike(commentId: string) {
		await client.mutation(api.highlights.toggleInlineCommentReaction, {
			commentId: commentId as Id<'inline_comments'>,
			reaction: -1
		});
	}

	async function handleDelete(commentId: string) {
		try {
			await client.mutation(api.highlights.removeInlineComment, {
				id: commentId as Id<'inline_comments'>
			});
			toast.success('Comment deleted');
		} catch (e: any) {
			toast.error(e.message || 'Failed to delete comment');
		}
	}

	async function handleDeleteHighlight() {
		if (!confirm('Are you sure you want to delete this highlight?')) return;
		try {
			await client.mutation(api.highlights.removeHighlight, { id: highlightId });
			toast.success('Highlight removed');
			onClose();
		} catch (e: any) {
			console.error('Delete highlight failed:', e);
			toast.error(e.message || 'Failed to remove highlight');
		}
	}

	function getHighlightColorClass(color: string) {
		const map: Record<string, string> = {
			yellow: 'bg-yellow-200/50 dark:bg-yellow-500/20 border-yellow-500/50',
			green: 'bg-green-200/50 dark:bg-green-500/20 border-green-500/50',
			blue: 'bg-blue-200/50 dark:bg-blue-500/20 border-blue-500/50',
			pink: 'bg-pink-200/50 dark:bg-pink-500/20 border-pink-500/50'
		};
		return map[color] || map.yellow;
	}
</script>

<div
	class="fixed inset-y-0 right-0 z-[100] w-full max-w-sm border-l bg-background shadow-2xl sm:max-w-md"
	transition:fly={{ x: 400, duration: 300 }}
>
	<div class="flex h-full flex-col">
		<div class="flex items-center justify-between border-b p-4">
			<h3 class="font-bold">Inline Comments</h3>
			<Button variant="ghost" size="icon" onclick={onClose}>
				<X class="h-4 w-4" />
			</Button>
		</div>

		<div class="flex-1 overflow-y-auto p-4">
			{#if highlight}
				<div class="mb-2 flex items-center justify-between">
					<div class="text-xs font-semibold text-muted-foreground">
						{#if user && highlight.userId === user.id}
							Your Highlight
						{:else}
							Highlighted by {highlight.userName || 'Unknown'}
						{/if}
					</div>
					{#if user && highlight.userId === user.id}
						<Button
							variant="ghost"
							size="icon"
							class="h-6 w-6 text-muted-foreground hover:text-destructive"
							onclick={handleDeleteHighlight}
							title="Delete Highlight"
						>
							<Trash2 class="h-3.5 w-3.5" />
						</Button>
					{/if}
				</div>
				<div
					class={`mb-6 rounded-md border-l-4 p-3 text-sm italic ${getHighlightColorClass(highlight.color)}`}
				>
					"{highlight.text}"
				</div>
			{/if}

			{#if commentsQuery.isLoading}
				<div class="flex justify-center py-8">
					<LoaderCircle class="h-6 w-6 animate-spin text-muted-foreground" />
				</div>
			{:else if commentTree.length > 0}
				<div class="space-y-4">
					{#each commentTree as comment (comment._id)}
						<CommentItem
							{comment}
							depth={0}
							isAuthenticated={!!user}
							currentUserId={user?.id}
							onLike={handleLike}
							onDislike={handleDislike}
							onReply={handleReply}
							onDelete={handleDelete}
						/>
					{/each}
				</div>
			{:else}
				<div
					class="flex flex-col items-center justify-center py-12 text-center text-muted-foreground"
				>
					<MessageSquare class="mb-2 h-8 w-8 opacity-20" />
					<p class="text-sm">No comments yet.</p>
				</div>
			{/if}
		</div>

		<div class="border-t p-4">
			{#if user}
				<div class="space-y-3">
					<Textarea
						bind:value={newCommentText}
						placeholder="Add a comment..."
						class="min-h-[100px] resize-none"
					/>
					<div class="flex justify-end">
						<Button onclick={handleSubmit} disabled={isSubmitting || !newCommentText.trim()}>
							{#if isSubmitting}
								<LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
							{/if}
							Post
						</Button>
					</div>
				</div>
			{:else}
				<div class="rounded-lg bg-muted p-4 text-center">
					<p class="mb-2 text-sm text-muted-foreground">Sign in to join the conversation</p>
					<Button href="/signin" size="sm" variant="outline" class="w-full">Sign In</Button>
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- Backdrop -->
<div
	class="fixed inset-0 z-[95] bg-background/20 backdrop-blur-sm"
	onclick={onClose}
	transition:fade
	role="button"
	tabindex="0"
	onkeydown={(e) => {
		if (e.key === 'Escape') onClose();
	}}
></div>
