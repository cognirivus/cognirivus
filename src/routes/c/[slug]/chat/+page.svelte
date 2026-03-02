<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import type { Id } from '$convex/_generated/dataModel';
	import { api } from '$convex/_generated/api';
	import { tick, onDestroy } from 'svelte';
	import { fade } from 'svelte/transition';
	import ChatInterface from '$lib/components/chat/ChatInterface.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Popover from '$lib/components/ui/popover';
	import * as Avatar from '$lib/components/ui/avatar';
	import {
		ArrowDown,
		Check,
		CornerDownRight,
		MessageSquare,
		Pencil,
		Reply,
		SendHorizontal,
		SmilePlus,
		Trash2,
		X,
		LoaderCircle
	} from '@lucide/svelte';
	import { authClient } from '$lib/auth-client';
	import { toast } from 'svelte-sonner';

	type ChatStatus = 'loading' | 'ready' | 'error';

	type CommunityChatMessage = {
		_id: Id<'community_chat_messages'>;
		userId: string;
		userName: string;
		userImage?: string;
		body: string;
		replyTo?: {
			messageId: Id<'community_chat_messages'>;
			userName: string;
			body: string;
			isDeleted: boolean;
		};
		editedAt?: number;
		isDeleted?: boolean;
		createdAt: number;
		reactions: Array<{
			emoji: string;
			count: number;
			reactedByMe: boolean;
			reactors: Array<{ userId: string; userName: string; userImage?: string }>;
		}>;
	};

	const slug = $derived(page.params.slug as string);
	const client = useConvexClient();
	const meQuery = useQuery(api.auth.getCurrentUser, {});
	const redirectTo = $derived(encodeURIComponent(page.url.pathname + page.url.search));
	const session = authClient.useSession();
	const currentUserId = $derived(meQuery.data?.id ?? null);
	const isAuthenticated = $derived(!!currentUserId);

	const communityQuery = useQuery((api as any).communities.getBySlug, () => ({ slug }));
	const communityResult = $derived(communityQuery.data);
	const communityId = $derived(
		(communityResult?.community._id as Id<'communities'> | undefined) ?? undefined
	);
	const isMember = $derived(communityResult?.membershipStatus === 'active');
	const canRead = $derived(communityResult?.canRead ?? false);

	const messagesQuery = useQuery((api as any).community_chat.getMessages, () =>
		communityId && isMember
			? {
					communityId,
					limit: 100
				}
			: 'skip'
	);
	const messages = $derived((messagesQuery.data ?? []) as unknown as Array<CommunityChatMessage>);

	let status = $state<ChatStatus>('loading');

	$effect(() => {
		if (!meQuery.isLoading && !meQuery.data) {
			goto(`/signin?redirectTo=${redirectTo}`);
		}
	});

	$effect(() => {
		if (communityQuery.isLoading) {
			status = 'loading';
		} else if (!communityResult || !canRead) {
			status = 'error';
		} else {
			status = 'ready';
		}
	});

	let isDeleteMessageDialogOpen = $state(false);

	function getInitials(name: string) {
		return (
			name
				?.split(' ')
				.map((n: string) => n.charAt(0).toUpperCase())
				.join('')
				.slice(0, 2) || '?'
		);
	}

	const avatarColors = [
		'bg-blue-500/15 text-blue-700 dark:text-blue-400',
		'bg-violet-500/15 text-violet-700 dark:text-violet-400',
		'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
		'bg-amber-500/15 text-amber-700 dark:text-amber-400',
		'bg-rose-500/15 text-rose-700 dark:text-rose-400',
		'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400'
	];

	function getAvatarColor(userId: string) {
		let hash = 0;
		for (let i = 0; i < userId.length; i++) {
			hash = userId.charCodeAt(i) + ((hash << 5) - hash);
		}
		return avatarColors[Math.abs(hash) % avatarColors.length];
	}

	async function requestJoin() {
		if (!communityId) return;
		if (!isAuthenticated) {
			toast.error('Sign in to join this community');
			return;
		}
		try {
			const result = await client.mutation((api as any).communities.requestJoin, {
				communityId
			});
			toast.success(
				result.status === 'active' ? 'Joined community' : 'Join request submitted for review'
			);
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to request to join');
		}
	}

	function handleDocumentClick(event: MouseEvent) {
		const target = event.target as HTMLElement | null;
		if (!target?.closest('[data-reaction-popover]')) {
			// Clicking outside a reaction popover should close any open popovers via their own logic.
		}
	}

	onDestroy(() => {
		// Cleanup listeners if we add any in the future.
	});
</script>

<svelte:window on:click={handleDocumentClick} />

<main class="mx-auto flex h-[calc(100vh-3rem)] w-full max-w-3xl flex-col">
	{#if status === 'loading'}
		<div class="flex flex-1 items-center justify-center">
			<LoaderCircle class="h-6 w-6 animate-spin text-muted-foreground" />
		</div>
	{:else if status === 'error'}
		<div class="mx-auto flex max-w-md flex-1 flex-col items-center justify-center text-center">
			<p class="text-sm font-medium text-destructive">
				Community not found or you do not have access.
			</p>
		</div>
	{:else if !communityResult}
		<div class="mx-auto flex max-w-md flex-1 flex-col items-center justify-center text-center">
			<p class="text-sm font-medium text-destructive">Community not found.</p>
		</div>
	{:else}
		<ChatInterface
			messages={messages.map((m) => ({
				_id: m._id,
				senderId: m.userId,
				senderName: m.userName,
				senderImage: m.userImage,
				body: m.body,
				createdAt: m.createdAt,
				replyTo: m.replyTo
					? {
							messageId: m.replyTo.messageId,
							userName: m.replyTo.userName,
							body: m.replyTo.body,
							isDeleted: m.replyTo.isDeleted
						}
					: undefined,
				editedAt: m.editedAt,
				isDeleted: m.isDeleted,
				reactions: m.reactions.map((r) => ({
					emoji: r.emoji,
					count: r.count,
					reactedByMe: r.reactedByMe,
					reactors: r.reactors
				}))
			}))}
			currentUserId={currentUserId ?? ''}
			isLoading={messagesQuery.isLoading}
			onSendMessage={async (body: string, replyToId?: string) => {
				if (!communityId) return;
				await client.mutation((api as any).community_chat.sendMessage, {
					communityId,
					body,
					replyTo: replyToId as Id<'community_chat_messages'>
				});
			}}
			onEditMessage={async (messageId: string, body: string) => {
				if (!communityId) return;
				await client.mutation((api as any).community_chat.editMessage, {
					communityId,
					messageId: messageId as Id<'community_chat_messages'>,
					body
				});
			}}
			onDeleteMessage={async (messageId: string) => {
				if (!communityId) return;
				await client.mutation((api as any).community_chat.deleteMessage, {
					communityId,
					messageId: messageId as Id<'community_chat_messages'>
				});
			}}
			onToggleReaction={async (messageId: string, emoji: string) => {
				if (!communityId) return;
				await client.mutation((api as any).community_chat.toggleReaction, {
					communityId,
					messageId: messageId as Id<'community_chat_messages'>,
					emoji: emoji as any
				});
			}}
		>
			{#snippet header()}
				<section
					class="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-6"
				>
					<div class="min-w-0">
						<h1
							class="truncate text-sm font-semibold tracking-[0.25em] text-muted-foreground/80 uppercase"
						>
							Community Chat
						</h1>
						<p class="mt-0.5 truncate text-sm text-muted-foreground">
							c/{communityResult.community.slug} · {communityResult.community.memberCount} members
						</p>
					</div>
					{#if !isMember}
						<Button size="sm" variant="outline" onclick={requestJoin} disabled={!isAuthenticated}>
							{communityResult.membershipStatus === 'pending' ? 'Request pending' : 'Join to chat'}
						</Button>
					{/if}
				</section>
			{/snippet}
		</ChatInterface>
	{/if}
</main>
