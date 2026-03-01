<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import type { Id } from '$convex/_generated/dataModel';
	import { api } from '$convex/_generated/api';
	import { tick, onDestroy } from 'svelte';
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

	const REACTION_EMOJIS = [
		'\u{1F44D}',
		'\u2764\uFE0F',
		'\u{1F602}',
		'\u{1F389}',
		'\u{1F62E}',
		'\u{1F622}',
		'\u{1F440}'
	] as const;
	type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

	type MessageReaction = {
		emoji: ReactionEmoji;
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
	let newMessage = $state('');
	let scrollContainer: HTMLDivElement | null = $state(null);
	let showScrollButton = $state(false);
	let inputEl: HTMLTextAreaElement | null = $state(null);
	let replyingToMessage = $state<DmMessage | null>(null);
	let editingMessageId = $state<Id<'dm_messages'> | null>(null);
	let editingMessageBody = $state('');
	let isSavingEdit = $state(false);
	let deletingMessageId = $state<Id<'dm_messages'> | null>(null);
	let isDeleteDialogOpen = $state(false);
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

	// Auto-scroll
	$effect(() => {
		if (messages.length) {
			tick().then(() => {
				if (!showScrollButton) scrollToBottom();
			});
		}
	});

	// Helpers
	function formatTime(ts: number) {
		return new Date(ts).toLocaleTimeString([], {
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		});
	}

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

	function getDayStart(timestamp: number) {
		const date = new Date(timestamp);
		return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
	}

	function groupMessagesByDate(msgs: Array<DmMessage>) {
		const groups: Array<{ label: string; messages: Array<DmMessage> }> = [];
		let currentLabel = '';
		const todayStart = getDayStart(Date.now());
		const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;

		for (const msg of msgs) {
			const date = new Date(msg.createdAt);
			const messageDayStart = getDayStart(msg.createdAt);

			let label: string;
			if (messageDayStart === todayStart) {
				label = 'Today';
			} else if (messageDayStart === yesterdayStart) {
				label = 'Yesterday';
			} else {
				label = date.toLocaleDateString([], {
					weekday: 'short',
					month: 'short',
					day: 'numeric'
				});
			}

			if (label !== currentLabel) {
				groups.push({ label, messages: [] });
				currentLabel = label;
			}
			groups[groups.length - 1].messages.push(msg);
		}
		return groups;
	}

	const groupedMessages = $derived(groupMessagesByDate(messages));

	function isConsecutive(msgs: Array<DmMessage>, index: number) {
		if (index === 0) return false;
		const prev = msgs[index - 1];
		const curr = msgs[index];
		return prev.senderAuthId === curr.senderAuthId;
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

	function scrollToBottom() {
		if (scrollContainer) {
			scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
		}
	}

	function handleScroll() {
		if (!scrollContainer) return;
		const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
		showScrollButton = scrollHeight - scrollTop - clientHeight > 120;
	}

	function autoResizeTextarea(e: Event) {
		const target = e.target as HTMLTextAreaElement;
		target.style.height = 'auto';
		target.style.height = Math.min(target.scrollHeight, 128) + 'px';
	}

	function resetTextareaHeight() {
		if (inputEl) inputEl.style.height = 'auto';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	}

	// Actions
	function selectConversation(id: Id<'dm_conversations'>) {
		activeConversationId = id;
		showMobileChat = true;
		replyingToMessage = null;
		editingMessageId = null;
	}

	function goBackToList() {
		showMobileChat = false;
	}

	async function sendMessage() {
		if (!newMessage.trim() || !activeConversationId) return;
		const body = newMessage.trim();
		newMessage = '';
		resetTextareaHeight();

		try {
			await client.mutation((api as any).dm.sendMessage, {
				conversationId: activeConversationId,
				body,
				replyTo: replyingToMessage?._id
			});
			replyingToMessage = null;
		} catch (err: any) {
			toast.error(err?.message ?? 'Failed to send message');
			newMessage = body;
		}
	}

	function setReplyingTo(message: DmMessage) {
		replyingToMessage = message;
		editingMessageId = null;
		tick().then(() => inputEl?.focus());
	}

	function cancelReplying() {
		replyingToMessage = null;
	}

	function startEditing(message: DmMessage) {
		if (message.isDeleted) return;
		editingMessageId = message._id;
		editingMessageBody = message.body;
		replyingToMessage = null;
	}

	function cancelEditing() {
		editingMessageId = null;
		editingMessageBody = '';
	}

	async function saveEdit() {
		if (!editingMessageId || !editingMessageBody.trim()) return;
		isSavingEdit = true;
		try {
			await client.mutation((api as any).dm.editMessage, {
				messageId: editingMessageId,
				body: editingMessageBody.trim()
			});
			editingMessageId = null;
			editingMessageBody = '';
		} catch (err: any) {
			toast.error(err?.message ?? 'Failed to edit message');
		} finally {
			isSavingEdit = false;
		}
	}

	function handleEditKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			saveEdit();
		} else if (e.key === 'Escape') {
			cancelEditing();
		}
	}

	function requestDelete(messageId: Id<'dm_messages'>) {
		deletingMessageId = messageId;
		isDeleteDialogOpen = true;
	}

	async function confirmDelete() {
		if (!deletingMessageId) return;
		try {
			await client.mutation((api as any).dm.deleteMessage, {
				messageId: deletingMessageId
			});
		} catch (err: any) {
			toast.error(err?.message ?? 'Failed to delete message');
		} finally {
			isDeleteDialogOpen = false;
			deletingMessageId = null;
		}
	}

	function closeDeleteDialog() {
		isDeleteDialogOpen = false;
		deletingMessageId = null;
	}

	async function toggleReaction(messageId: Id<'dm_messages'>, emoji: ReactionEmoji) {
		try {
			await client.mutation((api as any).dm.toggleReaction, { messageId, emoji });
		} catch (err: any) {
			toast.error(err?.message ?? 'Failed to toggle reaction');
		}
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
											class="text-destructive-foreground flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-white"
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

			<div class="flex min-h-0 flex-1 flex-col">
				<div
					class="relative min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,hsl(var(--muted)/0.2)_0%,transparent_25%)] px-4 py-4 sm:px-6"
					bind:this={scrollContainer}
					onscroll={handleScroll}
				>
					{#if messages.length === 0}
						<div class="flex h-full flex-col items-center justify-center py-12 text-center">
							<p class="text-sm text-muted-foreground">No messages yet. Say hello.</p>
						</div>
					{:else}
						{#each groupedMessages as group (group.label)}
							<div class="mb-4">
								<div class="my-4 flex items-center justify-center">
									<div
										class="rounded-full border border-border/60 bg-background/90 px-3 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase shadow-sm"
									>
										{group.label}
									</div>
								</div>

								{#each group.messages as msg, i (msg._id)}
									{@const isMine = msg.senderAuthId === currentUserId}
									{@const consecutive = isConsecutive(group.messages, i)}

									<div
										class="group relative flex items-start gap-2.5 {isMine
											? 'flex-row-reverse'
											: ''} {consecutive ? 'mt-0.5' : 'mt-3'}"
									>
										{#if !consecutive}
											<Avatar.Root class="mt-1 size-8 shrink-0 ring-1 ring-border/35">
												{#if msg.senderImage}
													<Avatar.Image src={msg.senderImage} alt={msg.senderName} />
												{/if}
												<Avatar.Fallback class="text-[10px] {getAvatarColor(msg.senderAuthId)}">
													{getInitials(msg.senderName)}
												</Avatar.Fallback>
											</Avatar.Root>
										{:else}
											<div class="size-8 shrink-0"></div>
										{/if}

										<div
											class="max-w-[80%] min-w-0 {isMine
												? 'items-end'
												: 'items-start'} flex flex-col sm:max-w-[72%]"
										>
											{#if !consecutive}
												<div
													class="mb-0.5 flex items-center gap-2 {isMine ? 'flex-row-reverse' : ''}"
												>
													<span class="text-xs font-semibold">{msg.senderName}</span>
													<span class="text-[10px] text-muted-foreground"
														>{formatTime(msg.createdAt)}</span
													>
												</div>
											{/if}

											<div
												class="rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed shadow-sm {msg.isDeleted
													? 'bg-muted/40 text-muted-foreground italic'
													: isMine
														? 'bg-primary text-primary-foreground'
														: 'bg-background ring-1 ring-border/55'}"
											>
												{#if msg.replyTo}
													<div
														class="mb-1.5 flex items-center gap-1.5 rounded-lg border-l-2 border-primary/40 bg-background/45 px-2 py-1 text-[11px] {isMine
															? 'text-primary-foreground/80'
															: ''}"
													>
														<CornerDownRight class="size-3 shrink-0 text-muted-foreground" />
														<span class="font-medium text-primary/80">{msg.replyTo.userName}</span>
														<span class="truncate text-muted-foreground">
															{msg.replyTo.isDeleted ? 'message deleted' : msg.replyTo.body}
														</span>
													</div>
												{/if}

												{#if editingMessageId === msg._id}
													<textarea
														bind:value={editingMessageBody}
														rows={1}
														oninput={autoResizeTextarea}
														onkeydown={handleEditKeydown}
														class="mt-1 mb-2 w-full resize-none rounded-md border border-primary/40 bg-background/90 px-3 py-2 text-[14px] leading-relaxed shadow-sm outline-none focus:ring-1 focus:ring-primary/50"
													></textarea>
													<div
														class="flex items-center gap-2 text-xs {isMine ? 'justify-end' : ''}"
													>
														<span class="text-muted-foreground">escape to</span>
														<Button
															variant="link"
															size="sm"
															onclick={cancelEditing}
															class="h-auto p-0 text-xs text-primary hover:underline"
														>
															cancel
														</Button>
														<span class="text-muted-foreground">&middot; enter to</span>
														<Button
															variant="link"
															size="sm"
															onclick={saveEdit}
															disabled={isSavingEdit || !editingMessageBody.trim()}
															class="h-auto p-0 text-xs text-primary hover:underline"
														>
															{#if isSavingEdit}saving...{:else}save{/if}
														</Button>
													</div>
												{:else}
													<p class="whitespace-pre-wrap">
														{msg.body}
														{#if msg.editedAt}
															<span class="ml-1 text-[10px] text-muted-foreground/50 select-none"
																>(edited)</span
															>
														{/if}
													</p>
												{/if}
											</div>

											{#if msg.reactions.length > 0}
												<div
													class="mt-2 flex flex-wrap items-center gap-1.5 {isMine
														? 'flex-row-reverse'
														: ''}"
												>
													{#each msg.reactions as reaction (`${msg._id}-${reaction.emoji}`)}
														<button
															type="button"
															onclick={() =>
																toggleReaction(msg._id, reaction.emoji as ReactionEmoji)}
															class="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus:ring-1 focus:ring-primary/40 focus:outline-none {reaction.reactedByMe
																? 'border-primary/30 bg-primary/10 text-primary'
																: 'border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted/80'}"
														>
															<span class="text-[13px] leading-none">{reaction.emoji}</span>
															<span>{reaction.count}</span>
														</button>
													{/each}
												</div>
											{/if}

											{#if !msg.isDeleted}
												<div
													class="absolute -top-3 z-10 flex items-center gap-0.5 rounded-md border border-border/50 bg-background p-0.5 opacity-0 shadow-sm transition-all duration-200 group-hover:opacity-100 {isMine
														? 'left-4'
														: 'right-4'}"
												>
													<Popover.Root>
														<Popover.Trigger
															class="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:bg-muted/80"
															title="Add reaction"
														>
															<SmilePlus class="h-[18px] w-[18px]" />
														</Popover.Trigger>
														<Popover.Content
															class="flex w-auto items-center gap-1 rounded-full border border-border/50 bg-background p-1.5 shadow-md"
															sideOffset={8}
															align={isMine ? 'start' : 'end'}
														>
															{#each REACTION_EMOJIS as emoji (emoji)}
																{@const reactedByMe = msg.reactions.find(
																	(r) => r.emoji === emoji
																)?.reactedByMe}
																<button
																	type="button"
																	aria-label={`React with ${emoji}`}
																	onclick={() => toggleReaction(msg._id, emoji as ReactionEmoji)}
																	class="inline-flex h-8 w-8 items-center justify-center rounded-full text-lg transition-transform hover:scale-110 active:scale-95 {reactedByMe
																		? 'bg-primary/20 bg-blend-multiply'
																		: 'hover:bg-muted'}"
																>
																	{emoji}
																</button>
															{/each}
														</Popover.Content>
													</Popover.Root>

													<button
														type="button"
														onclick={() => setReplyingTo(msg)}
														title="Reply"
														class="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
													>
														<Reply class="h-[18px] w-[18px]" />
													</button>

													{#if isMine}
														<button
															type="button"
															onclick={() => startEditing(msg)}
															title="Edit"
															class="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
														>
															<Pencil class="h-[18px] w-[18px]" />
														</button>
														<button
															type="button"
															onclick={() => requestDelete(msg._id)}
															title="Delete"
															class="inline-flex h-7 w-7 items-center justify-center rounded text-destructive/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
														>
															<Trash2 class="h-[18px] w-[18px]" />
														</button>
													{/if}
												</div>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						{/each}
						<div class="h-4"></div>
					{/if}

					{#if showScrollButton}
						<div class="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center">
							<button
								type="button"
								onclick={scrollToBottom}
								class="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-background shadow-lg ring-1 ring-border/60 transition-all hover:scale-105 active:scale-95"
							>
								<ArrowDown class="h-4 w-4 text-muted-foreground" />
							</button>
						</div>
					{/if}
				</div>

				<div
					class="border-t border-border/45 bg-background/95 px-4 pt-2 pb-4 backdrop-blur sm:px-6"
				>
					{#if replyingToMessage}
						<div
							class="mb-2 flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background px-3 py-2 shadow-sm"
						>
							<div class="flex min-w-0 items-center gap-2.5">
								<div
									class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted/80 text-muted-foreground"
								>
									<Reply class="h-3.5 w-3.5" />
								</div>
								<div class="flex min-w-0 flex-col py-0.5">
									<span class="text-[10px] font-semibold tracking-wide text-primary/80 uppercase">
										Replying to {replyingToMessage.senderName}
									</span>
									<p class="truncate text-xs text-muted-foreground/90">{replyingToMessage.body}</p>
								</div>
							</div>
							<button
								type="button"
								onclick={cancelReplying}
								class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/80"
							>
								<X class="h-4 w-4" />
							</button>
						</div>
					{/if}

					<div
						class="flex flex-col rounded-xl border border-border/60 bg-background shadow-[0_12px_28px_-18px_rgba(0,0,0,0.42)]"
					>
						<div class="flex items-end gap-2">
							<div class="flex min-h-10 flex-1 items-end bg-transparent sm:min-h-11">
								<textarea
									bind:this={inputEl}
									bind:value={newMessage}
									onkeydown={handleKeydown}
									oninput={autoResizeTextarea}
									placeholder="Write a message..."
									rows={1}
									class="max-h-32 w-full resize-none bg-transparent px-3 py-2 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:outline-none sm:px-4 sm:py-2.5 sm:text-[13.5px]"
								></textarea>
							</div>
							<Button
								type="button"
								onclick={sendMessage}
								disabled={!newMessage.trim()}
								size="icon"
								class="h-10 w-10 shrink-0 rounded-none rounded-tr-xl rounded-br-xl bg-transparent text-primary transition-all hover:bg-muted/30 sm:h-11 sm:w-11 {newMessage.trim()
									? 'text-primary'
									: 'text-muted-foreground/40'}"
							>
								<SendHorizontal class="h-4 w-4" />
							</Button>
						</div>
					</div>
				</div>
			</div>
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

<!-- Delete Confirmation Dialog -->
<Dialog.Root bind:open={isDeleteDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Delete message?</Dialog.Title>
			<Dialog.Description>
				Are you sure you want to delete this message? This action cannot be undone.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={closeDeleteDialog}>Cancel</Button>
			<Button variant="destructive" onclick={confirmDelete} disabled={!deletingMessageId}>
				Delete
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
