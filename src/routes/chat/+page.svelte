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
	import { Input } from '$lib/components/ui/input';
	import {
		ArrowDown,
		ArrowLeft,
		CornerDownRight,
		MessageSquare,
		Pencil,
		PenSquare,
		Reply,
		Search,
		SendHorizontal,
		SmilePlus,
		Trash2,
		X
	} from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	type MessageReaction = {
		emoji: string;
		count: number;
		reactedByMe: boolean;
		reactors: Array<{ userId: string; userName: string; userImage?: string }>;
	};

	type DmMessage = {
		_id: Id<'dm_messages'>;
		senderAuthId: string;
		senderName: string;
		senderImage?: string;
		body: string;
		replyTo?: {
			messageId: Id<'dm_messages'>;
			userName: string;
			body: string;
			isDeleted: boolean;
		};
		editedAt?: number;
		isDeleted?: boolean;
		createdAt: number;
		reactions: Array<MessageReaction>;
	};

	type Conversation = {
		conversationId: Id<'dm_conversations'>;
		otherUser: {
			authId: string;
			username?: string;
			name: string;
			image?: string | null;
		};
		lastMessage: { body: string; createdAt: number; senderAuthId: string } | null;
		unreadCount: number;
	};

	type SearchUser = {
		authId: string;
		username: string;
		name: string;
		image?: string | null;
	};

	const client = useConvexClient();
	const meQuery = useQuery(api.auth.getCurrentUser, {});
	const currentUserId = $derived(meQuery.data?.id ?? null);
	const isAuthenticated = $derived(!meQuery.isLoading && !!meQuery.data?.id);
	const redirectTo = $derived(encodeURIComponent(page.url.pathname + page.url.search));

	let activeConversationId = $state<Id<'dm_conversations'> | null>(null);
	let showMobileChat = $state(false);
	let searchQuery = $state('');
	let debouncedSearch = $state('');
	let isNewChatOpen = $state(false);

	// Handle ?active= query param
	$effect(() => {
		const active = page.url.searchParams.get('active');
		if (active) {
			activeConversationId = active as Id<'dm_conversations'>;
			showMobileChat = true;
		}
	});

	$effect(() => {
		if (!meQuery.isLoading && !meQuery.data) {
			goto(`/signin?redirectTo=${redirectTo}`);
		}
	});

	// Queries
	const conversationsQuery = useQuery((api as any).dm.listConversations, () =>
		isAuthenticated ? {} : 'skip'
	);
	const conversations = $derived((conversationsQuery.data ?? []) as Array<Conversation>);

	const messagesQuery = useQuery((api as any).dm.getMessages, () =>
		activeConversationId && isAuthenticated
			? { conversationId: activeConversationId, limit: 100 }
			: 'skip'
	);
	const messages = $derived((messagesQuery.data ?? []) as Array<DmMessage>);

	const searchUsersQuery = useQuery((api as any).dm.searchUsers, () =>
		isAuthenticated && debouncedSearch.trim().length >= 2
			? { query: debouncedSearch.trim() }
			: 'skip'
	);
	const searchResults = $derived((searchUsersQuery.data ?? []) as Array<SearchUser>);

	const otherUserIds = $derived(conversations.map((c) => c.otherUser.authId));
	const onlineQuery = useQuery((api as any).presence.getOnlineUsers, () =>
		isAuthenticated && otherUserIds.length > 0 ? { userAuthIds: otherUserIds } : 'skip'
	);
	const onlineUsers = $derived(new Set((onlineQuery.data ?? []) as Array<string>));

	const activeConversation = $derived(
		conversations.find((c) => c.conversationId === activeConversationId) ?? null
	);

	$effect(() => {
		if (!currentUserId) return;
		const sendHeartbeat = () =>
			client.mutation((api as any).presence.heartbeat, {}).catch(() => {});
		sendHeartbeat();
		const timer = setInterval(sendHeartbeat, 20_000);
		return () => clearInterval(timer);
	});

	// Mark as read
	$effect(() => {
		if (isAuthenticated && activeConversationId && messages.length > 0) {
			client
				.mutation((api as any).dm.markAsRead, {
					conversationId: activeConversationId
				})
				.catch(() => {});
		}
	});

	// Helpers
	function relativeTime(ts: number) {
		const diff = Date.now() - ts;
		const mins = Math.floor(diff / 60000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins}m`;
		const hours = Math.floor(mins / 60);
		if (hours < 24) return `${hours}h`;
		const days = Math.floor(hours / 24);
		if (days === 1) return 'Yesterday';
		if (days < 7) return new Date(ts).toLocaleDateString([], { weekday: 'short' });
		return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
	}

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

	function selectConversation(id: Id<'dm_conversations'>) {
		activeConversationId = id;
		showMobileChat = true;
	}

	function goBackToList() {
		showMobileChat = false;
	}

	async function startNewChat(user: SearchUser) {
		try {
			const conversationId = await client.mutation((api as any).dm.createOrGetConversation, {
				targetAuthId: user.authId
			});
			activeConversationId = conversationId;
			showMobileChat = true;
			isNewChatOpen = false;
			searchQuery = '';
			debouncedSearch = '';
		} catch (err: any) {
			toast.error(err?.message ?? 'Failed to start conversation');
		}
	}

	let searchTimeout: ReturnType<typeof setTimeout> | null = null;

	function handleSearchInput(e: Event) {
		const value = (e.target as HTMLInputElement).value;
		searchQuery = value;
		if (searchTimeout) clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			debouncedSearch = value;
		}, 300);
	}

	onDestroy(() => {
		if (searchTimeout) clearTimeout(searchTimeout);
	});
</script>

<main
	class="relative flex h-[calc(100dvh-3rem)] min-h-0 overflow-hidden bg-[radial-gradient(circle_at_12%_8%,hsl(var(--primary)/0.06),transparent_30%),radial-gradient(circle_at_90%_20%,hsl(var(--muted-foreground)/0.08),transparent_35%)]"
>
	<div class="pointer-events-none absolute inset-0 bg-background/75"></div>

	<div
		class="relative z-10 flex w-full flex-col border-r border-border/50 bg-background/95 backdrop-blur-md lg:w-[22rem] lg:shrink-0 xl:w-[24rem] {showMobileChat
			? 'hidden lg:flex'
			: 'flex'}"
	>
		<div class="border-b border-border/60 px-4 py-3.5">
			<div class="flex items-center justify-between">
				<div>
					<h2 class="text-lg font-semibold tracking-tight">Direct Messages</h2>
					<p class="text-xs text-muted-foreground">
						{conversations.length} conversation{conversations.length === 1 ? '' : 's'}
					</p>
				</div>
				<Button variant="outline" size="icon" class="size-9" onclick={() => (isNewChatOpen = true)}>
					<PenSquare class="size-4" />
					<span class="sr-only">New chat</span>
				</Button>
			</div>
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto p-2">
			{#if conversations.length === 0}
				<div
					class="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-12 text-center"
				>
					<MessageSquare class="size-10 text-muted-foreground/40" />
					<div>
						<p class="text-sm font-medium text-muted-foreground">No conversations yet</p>
						<p class="mt-1 text-xs text-muted-foreground/70">Start one from New chat.</p>
					</div>
				</div>
			{:else}
				<div class="space-y-1.5">
					{#each conversations as conv (conv.conversationId)}
						{@const isActive = conv.conversationId === activeConversationId}
						{@const isOnline = onlineUsers.has(conv.otherUser.authId)}
						<button
							type="button"
							onclick={() => selectConversation(conv.conversationId)}
							class="group relative flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all duration-200 {isActive
								? 'border-primary/35 bg-primary/[0.09] shadow-sm'
								: 'border-transparent hover:border-border/70 hover:bg-muted/45'}"
						>
							<div class="relative shrink-0">
								<Avatar.Root class="size-10 ring-1 ring-border/40">
									{#if conv.otherUser.image}
										<Avatar.Image src={conv.otherUser.image} alt={conv.otherUser.name} />
									{/if}
									<Avatar.Fallback class="text-xs {getAvatarColor(conv.otherUser.authId)}">
										{getInitials(conv.otherUser.name)}
									</Avatar.Fallback>
								</Avatar.Root>
								{#if isOnline}
									<span
										class="absolute right-0 bottom-0 size-3 rounded-full border-2 border-background bg-emerald-500"
									></span>
								{/if}
							</div>
							<div class="min-w-0 flex-1">
								<div class="flex items-center justify-between gap-2">
									<span class="truncate text-sm font-semibold">
										{conv.otherUser.username ?? conv.otherUser.name}
									</span>
									{#if conv.lastMessage}
										<span class="shrink-0 text-[10px] text-muted-foreground">
											{relativeTime(conv.lastMessage.createdAt)}
										</span>
									{/if}
								</div>
								<div class="mt-0.5 flex items-center justify-between gap-2">
									<p class="truncate text-xs text-muted-foreground">
										{#if conv.lastMessage}
											{conv.lastMessage.senderAuthId === currentUserId ? 'You: ' : ''}{conv
												.lastMessage.body}
										{:else}
											No messages yet
										{/if}
									</p>
									{#if conv.unreadCount > 0}
										<span
											class="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-destructive-foreground text-white"
										>
											{conv.unreadCount > 99 ? '99+' : conv.unreadCount}
										</span>
									{/if}
								</div>
							</div>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<div
		class="relative z-10 flex min-w-0 flex-1 flex-col {showMobileChat ? 'flex' : 'hidden lg:flex'}"
	>
		{#if activeConversation}
			{@const otherUser = activeConversation.otherUser}
			{@const isOnline = onlineUsers.has(otherUser.authId)}

			<ChatInterface
				messages={messages.map((m) => ({
					_id: m._id,
					senderId: m.senderAuthId,
					senderName: m.senderName,
					senderImage: m.senderImage,
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
				onSendMessage={async (body: string, replyToId?: string) => {
					const convId = activeConversationId;
					if (!convId) return;
					try {
						await client.mutation(
							api.dm.sendMessage,
							{
								conversationId: convId,
								body,
								replyTo: replyToId as Id<'dm_messages'> | undefined
							},
							{
								optimisticUpdate: (localStore, args) => {
									const me = localStore.getQuery(api.auth.getCurrentUser, {});
									if (!me) return;

									const queryArgs = { conversationId: convId, limit: 100 };
									const existingMessages = localStore.getQuery(api.dm.getMessages, queryArgs);
									if (!existingMessages) return;

									let replyToContext = undefined;
									if (args.replyTo) {
										const parent = existingMessages.find((m: any) => m._id === args.replyTo);
										if (parent) {
											replyToContext = {
												messageId: args.replyTo,
												userName: parent.senderName,
												body: parent.isDeleted ? 'message deleted' : parent.body,
												isDeleted: !!parent.isDeleted
											};
										}
									}

									const newMessage: any = {
										_id: `temp-${Math.random()}` as any,
										_creationTime: Date.now(),
										conversationId: convId,
										senderAuthId: me.id,
										senderName: me.name,
										senderImage: me.image ?? undefined,
										body: args.body,
										replyTo: replyToContext,
										createdAt: Date.now(),
										reactions: [],
										isDeleted: false
									};

									localStore.setQuery(api.dm.getMessages, queryArgs, [
										...existingMessages,
										newMessage
									]);
								}
							}
						);
					} catch (error) {
						console.error('Failed to send message:', error);
						toast.error('Failed to send message');
					}
				}}
				onEditMessage={async (messageId: string, body: string) => {
					try {
						await client.mutation(api.dm.editMessage, {
							messageId: messageId as Id<'dm_messages'>,
							body
						});
					} catch (error) {
						console.error('Failed to edit message:', error);
						toast.error('Failed to edit message');
					}
				}}
				onDeleteMessage={async (messageId: string) => {
					try {
						await client.mutation(api.dm.deleteMessage, {
							messageId: messageId as Id<'dm_messages'>
						});
					} catch (error) {
						console.error('Failed to delete message:', error);
						toast.error('Failed to delete message');
					}
				}}
				onToggleReaction={async (messageId: string, emoji: string) => {
					const convId = activeConversationId;
					if (!convId) return;
					try {
						await client.mutation(
							api.dm.toggleReaction,
							{
								messageId: messageId as Id<'dm_messages'>,
								emoji: emoji as any
							},
							{
								optimisticUpdate: (localStore, args) => {
									const me = localStore.getQuery(api.auth.getCurrentUser, {});
									if (!me) return;

									const queryArgs = { conversationId: convId, limit: 100 };
									const existingMessages = localStore.getQuery(api.dm.getMessages, queryArgs);
									if (!existingMessages) return;

									const messageIndex = existingMessages.findIndex((m) => m._id === args.messageId);
									if (messageIndex === -1) return;

									const message = existingMessages[messageIndex];
									const newReactions = JSON.parse(
										JSON.stringify(message.reactions || [])
									) as MessageReaction[];

									// Check if I already had this specific reaction
									const alreadyHadThisEmoji = newReactions.some(
										(r) => r.emoji === args.emoji && r.reactedByMe
									);

									// 1. Remove me from all reactions
									for (let i = 0; i < newReactions.length; i++) {
										if (newReactions[i].reactedByMe) {
											const updatedReactors = newReactions[i].reactors.filter(
												(r) => r.userId !== me.id
											);
											newReactions[i] = {
												...newReactions[i],
												count: newReactions[i].count - 1,
												reactedByMe: false,
												reactors: updatedReactors
											};
										}
									}

									// 2. Add me to the new reaction if I didn't already have it
									if (!alreadyHadThisEmoji) {
										const reactionIndex = newReactions.findIndex((r) => r.emoji === args.emoji);
										if (reactionIndex !== -1) {
											newReactions[reactionIndex] = {
												...newReactions[reactionIndex],
												count: newReactions[reactionIndex].count + 1,
												reactedByMe: true,
												reactors: [
													...newReactions[reactionIndex].reactors,
													{
														userId: me.id as string,
														userName: me.name,
														userImage: me.image ?? undefined
													}
												]
											};
										} else {
											newReactions.push({
												emoji: args.emoji,
												count: 1,
												reactedByMe: true,
												reactors: [
													{
														userId: me.id as string,
														userName: me.name,
														userImage: me.image ?? undefined
													}
												]
											});
										}
									}

									// 3. Filter out empty reactions and update store
									const filteredReactions = newReactions.filter((r) => r.count > 0);
									const newMessages = [...existingMessages];
									newMessages[messageIndex] = {
										...message,
										reactions: filteredReactions
									} as any;

									localStore.setQuery(api.dm.getMessages, queryArgs, newMessages as any);
								}
							}
						);
					} catch (error) {
						console.error('Failed to update reaction:', error);
						toast.error('Failed to update reaction');
					}
				}}
			>
				{#snippet header()}
					<div
						class="flex h-[3.75rem] items-center gap-3 border-b border-border/60 bg-background/96 px-4 backdrop-blur"
					>
						<Button variant="ghost" size="icon" class="size-9 lg:hidden" onclick={goBackToList}>
							<ArrowLeft class="size-4" />
						</Button>
						<div class="relative">
							<Avatar.Root class="size-9 ring-1 ring-border/40">
								{#if otherUser.image}
									<Avatar.Image src={otherUser.image} alt={otherUser.name} />
								{/if}
								<Avatar.Fallback class="text-xs {getAvatarColor(otherUser.authId)}">
									{getInitials(otherUser.name)}
								</Avatar.Fallback>
							</Avatar.Root>
							{#if isOnline}
								<span
									class="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-background bg-emerald-500"
								></span>
							{/if}
						</div>
						<div class="min-w-0 flex-1">
							{#if otherUser.username}
								<a href="/u/{otherUser.username}" class="text-sm font-semibold hover:underline">
									{otherUser.username}
								</a>
							{:else}
								<span class="text-sm font-semibold">{otherUser.name}</span>
							{/if}
							<p class="text-[11px] text-muted-foreground">{isOnline ? 'Online now' : 'Offline'}</p>
						</div>
					</div>
				{/snippet}
			</ChatInterface>
		{:else}
			<div class="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
				<div
					class="flex size-14 items-center justify-center rounded-full border border-border/70 bg-muted/30"
				>
					<MessageSquare class="size-7 text-muted-foreground/45" />
				</div>
				<div>
					<p class="text-base font-semibold text-foreground/90">Select a conversation</p>
					<p class="mt-1 text-sm text-muted-foreground">
						Pick a chat on the left to start messaging.
					</p>
				</div>
				<Button variant="outline" class="lg:hidden" onclick={() => (showMobileChat = false)}>
					Back to conversations
				</Button>
			</div>
		{/if}
	</div>
</main>

<!-- New Chat Dialog -->
<Dialog.Root bind:open={isNewChatOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>New Chat</Dialog.Title>
			<Dialog.Description>Search for a user to start a conversation.</Dialog.Description>
		</Dialog.Header>
		<div class="space-y-4">
			<div class="relative">
				<Search class="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					placeholder="Search by username or name..."
					value={searchQuery}
					oninput={handleSearchInput}
					class="pl-9"
				/>
			</div>
			<div class="max-h-64 overflow-y-auto">
				{#if searchQuery.trim().length < 2}
					<p class="py-4 text-center text-xs text-muted-foreground">
						Type at least 2 characters to search
					</p>
				{:else if searchResults.length === 0}
					<p class="py-4 text-center text-xs text-muted-foreground">No users found</p>
				{:else}
					{#each searchResults as user (user.authId)}
						<button
							type="button"
							onclick={() => startNewChat(user)}
							class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
						>
							<Avatar.Root class="size-9">
								{#if user.image}
									<Avatar.Image src={user.image} alt={user.name} />
								{/if}
								<Avatar.Fallback class="text-xs {getAvatarColor(user.authId)}">
									{getInitials(user.name)}
								</Avatar.Fallback>
							</Avatar.Root>
							<div class="min-w-0">
								<p class="text-sm font-medium">{user.username}</p>
								<p class="truncate text-xs text-muted-foreground">{user.name}</p>
							</div>
						</button>
					{/each}
				{/if}
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>
