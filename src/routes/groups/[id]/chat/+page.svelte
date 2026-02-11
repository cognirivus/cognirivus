<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { page } from '$app/state';
	import { tick, onDestroy } from 'svelte';
	import { fade } from 'svelte/transition';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Popover from '$lib/components/ui/popover';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as Avatar from '$lib/components/ui/avatar';
	import {
		SendHorizontal,
		MessageSquare,
		ArrowDown,
		SmilePlus,
		Pencil,
		Trash2,
		Check,
		X,
		Reply,
		CornerDownRight
	} from '@lucide/svelte';
	import type { Id } from '$convex/_generated/dataModel';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';
	import { authClient } from '$lib/auth-client';
	import { toast } from 'svelte-sonner';

	const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '😢', '👀'] as const;
	type ReactionEmoji = (typeof REACTION_EMOJIS)[number];
	type MessageReaction = {
		emoji: ReactionEmoji;
		count: number;
		reactedByMe: boolean;
		reactors: Array<{ userId: string; userName: string; userImage?: string }>;
	};
	type GroupChatMessage = {
		_id: Id<'group_chat_messages'>;
		userId: string;
		userName: string;
		userImage?: string;
		body: string;
		replyTo?: {
			messageId: Id<'group_chat_messages'>;
			userName: string;
			body: string;
			isDeleted: boolean;
		};
		editedAt?: number;
		isDeleted?: boolean;
		createdAt: number;
		reactions: Array<MessageReaction>;
	};

	const groupId = $derived(page.params.id as Id<'groups'>);
	const client = useConvexClient();

	const session = authClient.useSession();
	const currentUserId = $derived($session.data?.user?.id);

	let newMessage = $state('');
	let scrollContainer: HTMLElement | null = $state(null);
	let showScrollButton = $state(false);
	let inputEl: HTMLTextAreaElement | null = $state(null);
	let editingMessageId = $state<Id<'group_chat_messages'> | null>(null);
	let editingMessageBody = $state('');
	let isSavingEdit = $state(false);
	let editingBubbleWidth: number | null = $state(null);
	let deletingMessageId = $state<Id<'group_chat_messages'> | null>(null);
	let messageToDelete = $state<Id<'group_chat_messages'> | null>(null);
	let isDeleteMessageDialogOpen = $state(false);
	let longPressMessageId = $state<Id<'group_chat_messages'> | null>(null);
	let highlightedMessageId = $state<Id<'group_chat_messages'> | null>(null);
	let highlightTimer: ReturnType<typeof setTimeout> | null = null;
	let longPressTimer: ReturnType<typeof setTimeout> | null = null;
	let suppressNextClick = false;

	let replyingToMessage = $state<GroupChatMessage | null>(null);

	function setReplyingTo(message: GroupChatMessage) {
		replyingToMessage = message;
		tick().then(() => {
			inputEl?.focus();
		});
	}

	function cancelReplying() {
		replyingToMessage = null;
	}

	function startLongPress(messageId: Id<'group_chat_messages'>) {
		cancelLongPress();
		longPressTimer = setTimeout(() => {
			longPressMessageId = longPressMessageId === messageId ? null : messageId;
			suppressNextClick = true;
			longPressTimer = null;
		}, 500);
	}

	function cancelLongPress() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	}

	onDestroy(cancelLongPress);

	function dismissLongPressMenu(event: MouseEvent | TouchEvent) {
		if (!longPressMessageId) return;
		const target = event.target as HTMLElement | null;
		if (target?.closest('[data-longpress-actions]')) return;
		longPressMessageId = null;
	}

	const messagesQuery = useQuery(api.group_chat.getMessages, () =>
		groupId ? { groupId } : 'skip'
	);
	const messages = $derived((messagesQuery.data ?? []) as Array<GroupChatMessage>);

	function getDayStart(timestamp: number) {
		const date = new Date(timestamp);
		return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
	}

	function groupMessagesByDate(msgs: Array<GroupChatMessage>) {
		const groups: Array<{ label: string; messages: Array<GroupChatMessage> }> = [];
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

	function isConsecutive(msgs: Array<GroupChatMessage>, index: number) {
		if (index === 0) return false;
		const prev = msgs[index - 1];
		const curr = msgs[index];
		return prev.userId === curr.userId;
	}

	async function sendMessage() {
		if (!newMessage.trim() || !groupId) return;
		const body = newMessage.trim();
		const replyTo = replyingToMessage?._id;

		newMessage = '';
		cancelReplying();
		resetTextareaHeight();
		try {
			await client.mutation(api.group_chat.sendMessage, {
				groupId,
				body,
				replyTo
			});
			scrollToBottom();
		} catch (e) {
			console.error('Failed to send message:', e);
			toast.error('Failed to send message. Please try again.');
		}
	}

	function scrollToBottom() {
		if (scrollContainer) {
			scrollContainer.scrollTo({
				top: scrollContainer.scrollHeight,
				behavior: 'smooth'
			});
		}
	}

	function handleScroll() {
		if (!scrollContainer) return;
		const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
		showScrollButton = scrollHeight - scrollTop - clientHeight > 120;
	}

	$effect(() => {
		if (messages.length) {
			tick().then(() => {
				if (!showScrollButton) scrollToBottom();
			});
		}
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	}

	function autoResizeTextarea(e: Event) {
		const target = e.target as HTMLTextAreaElement;
		target.style.height = 'auto';
		target.style.height = Math.min(target.scrollHeight, 128) + 'px';
	}

	function resetTextareaHeight() {
		if (inputEl) {
			inputEl.style.height = 'auto';
		}
	}

	function formatTime(ts: number) {
		return new Date(ts).toLocaleTimeString([], {
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		});
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

	function handleDocumentClick(event: MouseEvent) {
		if (suppressNextClick) {
			suppressNextClick = false;
			return;
		}
		dismissLongPressMenu(event);
	}

	async function toggleReaction(messageId: Id<'group_chat_messages'>, emoji: ReactionEmoji) {
		if (!groupId || !currentUserId) return;

		// Use optimistic update for instant feedback
		try {
			await client.mutation(
				api.group_chat.toggleReaction,
				{
					groupId,
					messageId,
					emoji
				},
				{
					optimisticUpdate: (localStore) => {
						const existingMessages = localStore.getQuery(api.group_chat.getMessages, { groupId });
						if (!existingMessages) return;

						const messageIndex = existingMessages.findIndex(
							(m: GroupChatMessage) => m._id === messageId
						);
						if (messageIndex === -1) return;

						const message = existingMessages[messageIndex];
						const newReactions = [...message.reactions];

						// 1. Find and remove any existing reaction by the current user (single reaction rule)
						let previousEmoji: ReactionEmoji | null = null;
						for (let i = 0; i < newReactions.length; i++) {
							const r = newReactions[i];
							const reactorIndex = r.reactors.findIndex(
								(u: { userId: string }) => u.userId === currentUserId
							);
							if (reactorIndex !== -1) {
								previousEmoji = r.emoji as ReactionEmoji;
								const updatedReactors = [...r.reactors];
								updatedReactors.splice(reactorIndex, 1);

								if (updatedReactors.length === 0) {
									newReactions.splice(i, 1);
								} else {
									newReactions[i] = {
										...r,
										count: r.count - 1,
										reactedByMe: false,
										reactors: updatedReactors
									};
								}
								break;
							}
						}

						// 2. Add the new reaction if it's different from the previous one (toggle behavior)
						if (previousEmoji !== emoji) {
							let reactionIndex = newReactions.findIndex((r) => r.emoji === emoji);
							const userProfile = {
								userId: currentUserId,
								userName: $session.data?.user?.name ?? 'Me',
								userImage: $session.data?.user?.image ?? undefined
							};

							if (reactionIndex !== -1) {
								// Emoji group already exists, add to it
								const r = newReactions[reactionIndex];
								newReactions[reactionIndex] = {
									...r,
									count: r.count + 1,
									reactedByMe: true,
									reactors: [...r.reactors, userProfile]
								};
							} else {
								// Create new emoji group
								newReactions.push({
									emoji,
									count: 1,
									reactedByMe: true,
									reactors: [userProfile]
								});
							}
						}

						// 3. Update the local cache
						const newMessages = [...existingMessages];
						newMessages[messageIndex] = {
							...message,
							reactions: newReactions
						};
						localStore.setQuery(api.group_chat.getMessages, { groupId }, newMessages);
					}
				}
			);
		} catch (e) {
			console.error('Failed to toggle reaction:', e);
			toast.error('Failed to update reaction. Please try again.');
		}
	}

	function autoSizeTextarea(node: HTMLTextAreaElement) {
		function resize() {
			node.style.height = 'auto';
			node.style.height = Math.min(node.scrollHeight, 128) + 'px';
		}
		function onInput() {
			resize();
		}
		requestAnimationFrame(() => {
			resize();
			node.focus();
		});
		node.addEventListener('input', onInput);
		return {
			destroy() {
				node.removeEventListener('input', onInput);
			}
		};
	}

	function startEditingMessage(message: GroupChatMessage, bubbleEl?: HTMLElement) {
		if (message.isDeleted) return;
		if (bubbleEl) {
			editingBubbleWidth = bubbleEl.offsetWidth;
		}
		editingMessageId = message._id;
		editingMessageBody = message.body;
	}

	function cancelEditingMessage() {
		editingMessageId = null;
		editingMessageBody = '';
		isSavingEdit = false;
		editingBubbleWidth = null;
	}

	async function saveEditedMessage(messageId: Id<'group_chat_messages'>) {
		if (!groupId || isSavingEdit) return;
		const body = editingMessageBody.trim();
		if (!body) return;

		isSavingEdit = true;
		try {
			await client.mutation(api.group_chat.editMessage, {
				groupId,
				messageId,
				body
			});
			cancelEditingMessage();
		} catch (e) {
			console.error('Failed to edit message:', e);
			toast.error('Failed to save changes. Please try again.');
			isSavingEdit = false;
		}
	}

	function requestDeleteMessage(messageId: Id<'group_chat_messages'>) {
		if (deletingMessageId) return;
		messageToDelete = messageId;
		isDeleteMessageDialogOpen = true;
	}

	function closeDeleteMessageDialog() {
		isDeleteMessageDialogOpen = false;
		messageToDelete = null;
	}

	function scrollToMessage(messageId: Id<'group_chat_messages'>) {
		const el = document.getElementById(`msg-${messageId}`);
		if (el && scrollContainer) {
			const containerRect = scrollContainer.getBoundingClientRect();
			const elRect = el.getBoundingClientRect();
			const relativeTop = elRect.top - containerRect.top + scrollContainer.scrollTop;

			scrollContainer.scrollTo({
				top: relativeTop - 100, // Offset for context
				behavior: 'smooth'
			});

			// Highlight effect
			if (highlightTimer) clearTimeout(highlightTimer);
			highlightedMessageId = messageId;
			highlightTimer = setTimeout(() => {
				highlightedMessageId = null;
			}, 2000);
		} else {
			toast.error('Message not found in current view');
		}
	}

	async function confirmDeleteMessage() {
		if (!groupId || !messageToDelete || deletingMessageId) return;

		const targetMessageId = messageToDelete;
		deletingMessageId = targetMessageId;
		try {
			await client.mutation(api.group_chat.deleteMessage, {
				groupId,
				messageId: targetMessageId
			});
			if (editingMessageId === targetMessageId) {
				cancelEditingMessage();
			}
			closeDeleteMessageDialog();
		} catch (e) {
			console.error('Failed to delete message:', e);
			toast.error('Failed to delete message. Please try again.');
		} finally {
			deletingMessageId = null;
		}
	}

	function handleEditKeydown(event: KeyboardEvent, messageId: Id<'group_chat_messages'>) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			saveEditedMessage(messageId);
		}
	}
</script>

{#snippet ReactorList(reactors: any[], showEmoji = false, currentEmoji = '')}
	<div class="space-y-1">
		{#each reactors as reactor}
			<div
				class="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/40"
			>
				<Avatar.Root class="h-7 w-7 border border-border/40">
					{#if reactor.userImage}
						<Avatar.Image src={reactor.userImage} alt={reactor.userName} />
					{/if}
					<Avatar.Fallback class="text-[9px] font-bold {getAvatarColor(reactor.userId)}">
						{getInitials(reactor.userName)}
					</Avatar.Fallback>
				</Avatar.Root>
				<div class="flex flex-1 items-center justify-between gap-2 overflow-hidden">
					<span class="truncate text-xs font-medium">
						{reactor.userName}
						{#if reactor.userId === currentUserId}
							<span class="ml-0.5 text-[10px] font-normal text-muted-foreground/70">(You)</span>
						{/if}
					</span>
					{#if showEmoji}
						<span class="text-xs">{reactor.reactingWith || currentEmoji}</span>
					{/if}
				</div>
			</div>
		{/each}
	</div>
{/snippet}

<svelte:document onclick={handleDocumentClick} />

<div class="relative flex h-full max-h-full flex-col overflow-hidden">
	<!-- Messages Area -->
	<div
		bind:this={scrollContainer}
		onscroll={handleScroll}
		class="relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
	>
		{#if messagesQuery.isLoading}
			<div class="flex h-full items-center justify-center">
				<Loader variant="circular" size="lg" />
			</div>
		{:else if messages.length === 0}
			<div class="flex h-full flex-col items-center justify-center px-6 text-center">
				<div
					class="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60 sm:h-16 sm:w-16"
				>
					<MessageSquare class="h-6 w-6 text-muted-foreground/60 sm:h-7 sm:w-7" />
				</div>
				<h3 class="text-sm font-semibold text-foreground sm:text-base">Start the conversation</h3>
				<p class="mt-1.5 max-w-70 text-xs leading-relaxed text-muted-foreground sm:text-[13px]">
					Be the first to send a message to your group.
				</p>
			</div>
		{:else}
			<div class="mx-auto max-w-3xl px-3 py-3 pb-20 sm:px-6 sm:py-4 sm:pb-24">
				{#each groupedMessages as group (group.label)}
					<!-- Date Separator -->
					<div class="sticky top-0 z-10 flex justify-center py-2 sm:py-3">
						<span
							class="rounded-full bg-background/90 px-3 py-1 text-[10px] font-medium text-muted-foreground shadow-sm ring-1 ring-border/50 backdrop-blur-sm sm:text-[11px]"
						>
							{group.label}
						</span>
					</div>

					{#each group.messages as msg, i (msg._id)}
						{@const isMine = msg.userId === currentUserId}
						{@const consecutive = isConsecutive(group.messages, i)}
						{@const showAvatar = !isMine && !consecutive}
						{@const showName = !isMine && !consecutive}
						{@const isEditing = editingMessageId === msg._id}

						<div
							id={`msg-${msg._id}`}
							class="group flex {isMine ? 'justify-end' : 'justify-start'} {consecutive
								? 'mt-0.5'
								: 'mt-3'} {highlightedMessageId === msg._id ? 'z-20' : ''}"
						>
							<div class="flex max-w-[85%] items-start gap-1.5 sm:max-w-[75%] sm:gap-2">
								<!-- Avatar -->
								{#if !isMine}
									<div class="w-7 shrink-0 pt-0.5 sm:w-8">
										{#if showAvatar}
											{#if msg.userImage}
												<img
													src={msg.userImage}
													alt={msg.userName}
													class="h-7 w-7 rounded-full object-cover ring-2 ring-background sm:h-8 sm:w-8"
												/>
											{:else}
												<div
													class="flex h-7 w-7 items-center justify-center rounded-full text-[9px] font-semibold ring-2 ring-background sm:h-8 sm:w-8 sm:text-[10px] {getAvatarColor(
														msg.userId
													)}"
												>
													{getInitials(msg.userName)}
												</div>
											{/if}
										{/if}
									</div>
								{/if}

								<!-- Sender and bubble -->
								<div class="flex min-w-0 flex-col {isMine ? 'items-end' : 'items-start'}">
									{#if showName}
										<span
											class="mb-0.5 px-2 text-[10px] font-medium text-muted-foreground sm:mb-1 sm:text-[11px]"
										>
											{msg.userName}
										</span>
									{/if}
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<div
										data-msg-bubble
										class="flex max-w-full flex-col rounded-lg px-3 py-1.5 text-[13px] leading-relaxed transition-all duration-500 sm:px-3.5 sm:py-2 sm:text-[13.5px]
										{isMine ? 'bg-primary text-primary-foreground' : 'bg-muted/70 text-foreground'}
										{highlightedMessageId === msg._id ? 'ring-2 ring-primary ring-offset-2 ring-offset-background dark:ring-offset-background shadow-lg scale-[1.02]' : ''}"
										style={isEditing && editingBubbleWidth
											? `min-width:${editingBubbleWidth}px`
											: ''}
										ontouchstart={() => {
											if (!msg.isDeleted && !editingMessageId) startLongPress(msg._id);
										}}
										ontouchend={cancelLongPress}
										ontouchmove={cancelLongPress}
										ontouchcancel={cancelLongPress}
										oncontextmenu={(e) => {
											if (!msg.isDeleted && !editingMessageId) {
												e.preventDefault();
												cancelLongPress();
												longPressMessageId = longPressMessageId === msg._id ? null : msg._id;
												suppressNextClick = true;
											}
										}}
									>
										{#if msg.replyTo && !isEditing}
											<button
												type="button"
												onclick={() => scrollToMessage(msg.replyTo!.messageId)}
												class="mb-1.5 flex flex-col gap-0.5 rounded-md border-l-2 border-primary/30 bg-black/5 px-2 py-1 text-left text-[11px] leading-tight transition-colors hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10
												{isMine ? 'border-white/40 text-primary-foreground/90' : 'border-primary/40 text-muted-foreground'}"
											>
												<span class="font-semibold">{msg.replyTo.userName}</span>
												<span class="truncate opacity-80">{msg.replyTo.body}</span>
											</button>
										{/if}
										{#if isEditing}
											<textarea
												bind:value={editingMessageBody}
												onkeydown={(event) => handleEditKeydown(event, msg._id)}
												use:autoSizeTextarea
												placeholder="Edit message"
												class="max-h-32 w-full resize-none overflow-hidden bg-transparent text-[13px] leading-relaxed focus:outline-none sm:text-[13.5px]"
											></textarea>
											<div class="mt-1.5 flex items-center justify-end gap-1.5">
												<button
													type="button"
													aria-label="Save edit"
													onclick={() => saveEditedMessage(msg._id)}
													disabled={!editingMessageBody.trim() || isSavingEdit}
													class="inline-flex h-6 w-6 items-center justify-center rounded-full border border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground transition-colors hover:bg-primary-foreground/20 disabled:cursor-not-allowed disabled:opacity-50"
												>
													<Check class="h-3.5 w-3.5" />
												</button>
												<button
													type="button"
													aria-label="Cancel edit"
													onclick={cancelEditingMessage}
													class="inline-flex h-6 w-6 items-center justify-center rounded-full border border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground/70 transition-colors hover:bg-primary-foreground/20 hover:text-primary-foreground"
												>
													<X class="h-3.5 w-3.5" />
												</button>
											</div>
										{:else}
											<div class="flex items-end gap-2">
												<span
													class="min-w-0 flex-1 wrap-break-word whitespace-pre-wrap {msg.isDeleted
														? 'italic opacity-80'
														: ''}"
												>
													{msg.body}
												</span>
												<div class="shrink-0 text-[9px] leading-none opacity-60 sm:text-[10px]">
													{#if msg.editedAt && !msg.isDeleted}
														<span class="mr-1">Edited</span>
													{/if}
													<span>{formatTime(msg.createdAt)}</span>
												</div>
											</div>
										{/if}
									</div>
									{#if !isEditing}
										<div
											data-reaction-controls
											class="relative mt-1 flex max-w-full flex-wrap items-center gap-1 {isMine
												? 'justify-end'
												: 'justify-start'}"
										>
											{#if longPressMessageId === msg._id}
												<div
													data-longpress-actions
													class="mr-1 inline-flex animate-in items-center gap-1 duration-150 zoom-in-95 fade-in"
												>
													{#if !msg.isDeleted}
														<button
															type="button"
															aria-label="Reply to message"
															onclick={() => {
																setReplyingTo(msg);
																longPressMessageId = null;
															}}
															class="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95"
														>
															<Reply class="h-3.5 w-3.5" />
														</button>
														{#if isMine}
															<button
																type="button"
																aria-label="Edit message"
																onclick={(e) => {
																	const bubbleEl = (e.currentTarget as HTMLElement)
																		.closest('[data-reaction-controls]')
																		?.parentElement?.querySelector(
																			'[data-msg-bubble]'
																		) as HTMLElement | null;
																	startEditingMessage(msg, bubbleEl ?? undefined);
																	longPressMessageId = null;
																}}
																class="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95"
															>
																<Pencil class="h-3.5 w-3.5" />
															</button>
														{/if}
													{/if}
													{#if isMine}
														<button
															type="button"
															aria-label="Delete message"
															onclick={() => {
																requestDeleteMessage(msg._id);
																longPressMessageId = null;
															}}
															class="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-destructive active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
														>
															<Trash2 class="h-3.5 w-3.5" />
														</button>
													{/if}
												</div>
											{/if}

											{#if !msg.isDeleted}
												{#each msg.reactions as reaction (`${msg._id}-${reaction.emoji}`)}
													<Popover.Root>
														<Popover.Trigger
															class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors sm:text-xs {reaction.reactedByMe
																? 'border-primary/40 bg-primary/10 text-primary'
																: 'border-border/70 bg-background text-foreground/85 hover:bg-muted/70'}"
														>
															<span>{reaction.emoji}</span>
															<span class="font-medium">{reaction.count}</span>
														</Popover.Trigger>
														<Popover.Content
															class="w-64 border-border/50 bg-background/80 p-0 shadow-xl backdrop-blur-md sm:w-80"
															sideOffset={8}
															align="start"
														>
															<Tabs.Root value={reaction.emoji} class="w-full">
																<Tabs.List
																	class="flex h-10 w-full justify-start gap-1 rounded-none border-b border-border/40 bg-transparent px-1 py-1"
																>
																	{#if msg.reactions.length > 1}
																		<Tabs.Trigger
																			value="all"
																			class="relative h-8 rounded-md px-3 text-xs font-medium transition-all data-[state=active]:bg-muted/60 data-[state=active]:text-foreground"
																		>
																			All
																			<span class="ml-1 text-[10px] opacity-60"
																				>{msg.reactions.reduce((acc, r) => acc + r.count, 0)}</span
																			>
																		</Tabs.Trigger>
																	{/if}
																	{#each msg.reactions as r}
																		<Tabs.Trigger
																			value={r.emoji}
																			class="relative h-8 rounded-md px-3 text-xs font-medium transition-all data-[state=active]:bg-muted/60 data-[state=active]:text-foreground"
																		>
																			{r.emoji}
																			<span class="ml-1 text-[10px] opacity-60">{r.count}</span>
																		</Tabs.Trigger>
																	{/each}
																</Tabs.List>

																{#if msg.reactions.length > 1}
																	<Tabs.Content value="all" class="max-h-64 overflow-y-auto p-2">
																		{@render ReactorList(
																			msg.reactions.flatMap((r) =>
																				r.reactors.map((u) => ({ ...u, reactingWith: r.emoji }))
																			),
																			true
																		)}
																	</Tabs.Content>
																{/if}

																{#each msg.reactions as r}
																	<Tabs.Content
																		value={r.emoji}
																		class="max-h-64 overflow-y-auto p-2"
																	>
																		{@render ReactorList(r.reactors, false, r.emoji)}
																	</Tabs.Content>
																{/each}
															</Tabs.Root>
														</Popover.Content>
													</Popover.Root>
												{/each}

												<Popover.Root>
													<Popover.Trigger
														class="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground sm:h-7 sm:w-7"
													>
														<SmilePlus class="h-3.5 w-3.5 sm:h-4 sm:w-4" />
													</Popover.Trigger>
													<Popover.Content
														class="w-auto rounded-full border border-border/70 bg-background p-1 shadow-md"
														sideOffset={8}
														align={isMine ? 'end' : 'start'}
													>
														<div class="flex items-center gap-0.5" in:fade={{ duration: 150 }}>
															{#each REACTION_EMOJIS as emoji (emoji)}
																{@const reactedByMe = msg.reactions.find(
																	(r) => r.emoji === emoji
																)?.reactedByMe}
																<button
																	type="button"
																	aria-label={`React with ${emoji}`}
																	onclick={() => toggleReaction(msg._id, emoji)}
																	class="inline-flex h-7 w-7 items-center justify-center rounded-full text-sm transition-colors sm:h-8 sm:w-8 sm:text-base {reactedByMe
																		? 'bg-primary/10 text-primary'
																		: 'hover:bg-muted'}"
																>
																	{emoji}
																</button>
															{/each}
														</div>
													</Popover.Content>
												</Popover.Root>
											{/if}
										</div>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				{/each}

				<div class="h-1"></div>
			</div>
		{/if}
	</div>

	<!-- Scroll to bottom FAB -->
	{#if showScrollButton}
		<div
			class="pointer-events-none absolute inset-x-0 bottom-20 z-20 flex justify-center sm:bottom-24"
		>
			<button
				onclick={scrollToBottom}
				class="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-background shadow-lg ring-1 ring-border/60 transition-all hover:scale-105 active:scale-95"
			>
				<ArrowDown class="h-4 w-4 text-muted-foreground" />
			</button>
		</div>
	{/if}

	<div class="pointer-events-none absolute inset-x-0 bottom-0 z-30">
		<div class="mx-auto max-w-3xl px-3 pb-3 sm:px-6 sm:pb-4">
			{#if replyingToMessage}
				<div
					class="pointer-events-auto mb-2 flex animate-in items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/95 px-3 py-2 shadow-sm slide-in-from-bottom-2"
				>
					<div class="flex min-w-0 items-center gap-2.5">
						<div
							class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted/80 text-muted-foreground"
						>
							<Reply class="h-3.5 w-3.5" />
						</div>
						<div class="flex min-w-0 flex-col py-0.5">
							<span class="text-[10px] font-semibold tracking-wider text-primary/80 uppercase"
								>Replying to {replyingToMessage.userName}</span
							>
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
				class="pointer-events-auto flex flex-col rounded-xl border border-border/60 bg-background/92 shadow-[0_10px_30px_-16px_rgba(0,0,0,0.35)] backdrop-blur-md"
			>
				<div class="flex items-end gap-2">
					<div class="flex min-h-10 flex-1 items-end bg-transparent transition-colors sm:min-h-11">
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
						onclick={sendMessage}
						disabled={!newMessage.trim()}
						size="icon"
						class="rounded-br-lx rounded-tr-lx h-10 w-10 shrink-0 rounded-none bg-transparent text-primary transition-all hover:bg-muted/30 sm:h-11 sm:w-11 {newMessage.trim()
							? 'text-primary'
							: 'text-muted-foreground/40'}"
					>
						<SendHorizontal class="h-4.5 w-4.5" />
					</Button>
				</div>
			</div>
		</div>
	</div>
</div>

<Dialog.Root bind:open={isDeleteMessageDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Delete Message?</Dialog.Title>
			<Dialog.Description>
				Are you sure you want to delete this message? This action cannot be undone.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={closeDeleteMessageDialog}>Cancel</Button>
			<Button variant="destructive" onclick={confirmDeleteMessage} disabled={!messageToDelete}>
				Delete Message
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
