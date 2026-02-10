<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { page } from '$app/state';
	import { tick } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import {
		SendHorizontal,
		MessageSquare,
		ArrowDown,
		SmilePlus,
		Pencil,
		Trash2,
		Check,
		X
	} from '@lucide/svelte';
	import type { Id } from '$convex/_generated/dataModel';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';
	import { authClient } from '$lib/auth-client';

	const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '😢', '👀'] as const;
	type ReactionEmoji = (typeof REACTION_EMOJIS)[number];
	type MessageReaction = {
		emoji: ReactionEmoji;
		count: number;
		reactedByMe: boolean;
	};
	type GroupChatMessage = {
		_id: Id<'group_chat_messages'>;
		userId: string;
		userName: string;
		userImage?: string;
		body: string;
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
	let reactionPickerMessageId = $state<Id<'group_chat_messages'> | null>(null);
	let editingMessageId = $state<Id<'group_chat_messages'> | null>(null);
	let editingMessageBody = $state('');
	let isSavingEdit = $state(false);
	let deletingMessageId = $state<Id<'group_chat_messages'> | null>(null);
	let messageToDelete = $state<Id<'group_chat_messages'> | null>(null);
	let isDeleteMessageDialogOpen = $state(false);

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
		newMessage = '';
		resetTextareaHeight();
		try {
			await client.mutation(api.group_chat.sendMessage, {
				groupId,
				body
			});
			scrollToBottom();
		} catch (e) {
			console.error('Failed to send message:', e);
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

	function toggleReactionPicker(messageId: Id<'group_chat_messages'>) {
		reactionPickerMessageId = reactionPickerMessageId === messageId ? null : messageId;
	}

	function handleDocumentClick(event: MouseEvent) {
		if (!reactionPickerMessageId) return;
		const target = event.target as HTMLElement | null;
		if (!target) return;
		if (target.closest('[data-reaction-controls]')) return;
		reactionPickerMessageId = null;
	}

	async function toggleReaction(messageId: Id<'group_chat_messages'>, emoji: ReactionEmoji) {
		if (!groupId) return;
		try {
			await client.mutation(api.group_chat.toggleReaction, {
				groupId,
				messageId,
				emoji
			});
			reactionPickerMessageId = null;
		} catch (e) {
			console.error('Failed to toggle reaction:', e);
		}
	}

	function startEditingMessage(message: GroupChatMessage) {
		if (message.isDeleted) return;
		editingMessageId = message._id;
		editingMessageBody = message.body;
		reactionPickerMessageId = null;
	}

	function cancelEditingMessage() {
		editingMessageId = null;
		editingMessageBody = '';
		isSavingEdit = false;
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
			isSavingEdit = false;
		}
	}

	function requestDeleteMessage(messageId: Id<'group_chat_messages'>) {
		if (deletingMessageId) return;
		messageToDelete = messageId;
		isDeleteMessageDialogOpen = true;
		reactionPickerMessageId = null;
	}

	function closeDeleteMessageDialog() {
		isDeleteMessageDialogOpen = false;
		messageToDelete = null;
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
				<p
					class="mt-1.5 max-w-[280px] text-xs leading-relaxed text-muted-foreground sm:text-[13px]"
				>
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
							class="group flex {isMine ? 'justify-end' : 'justify-start'} {consecutive
								? 'mt-0.5'
								: 'mt-3'}"
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
									<div
										class="flex max-w-full items-end gap-2 rounded-lg px-3 py-1.5 text-[13px] leading-relaxed sm:px-3.5 sm:py-2 sm:text-[13.5px]
										{isMine ? 'bg-primary text-primary-foreground' : 'bg-muted/70 text-foreground'}"
									>
										{#if isEditing}
											<textarea
												bind:value={editingMessageBody}
												onkeydown={(event) => handleEditKeydown(event, msg._id)}
												rows={1}
												placeholder="Edit message"
												class="max-h-32 min-h-[22px] w-full resize-none bg-transparent text-[13px] leading-relaxed focus:outline-none sm:text-[13.5px]"
											></textarea>
										{:else}
											<span
												class="min-w-0 flex-1 break-words whitespace-pre-wrap {msg.isDeleted
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
										{/if}
									</div>
									{#if isEditing}
										<div class="mt-1 flex items-center gap-1.5">
											<button
												type="button"
												aria-label="Save edit"
												onclick={() => saveEditedMessage(msg._id)}
												disabled={!editingMessageBody.trim() || isSavingEdit}
												class="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border/70 bg-background text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
											>
												<Check class="h-3.5 w-3.5" />
											</button>
											<button
												type="button"
												aria-label="Cancel edit"
												onclick={cancelEditingMessage}
												class="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
											>
												<X class="h-3.5 w-3.5" />
											</button>
										</div>
									{:else}
										<div
											data-reaction-controls
											class="relative mt-1 flex max-w-full flex-wrap items-center gap-1 {isMine
												? 'justify-end'
												: 'justify-start'}"
										>
											{#if isMine}
												<div
													class="mr-1 inline-flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100"
												>
													{#if !msg.isDeleted}
														<button
															type="button"
															aria-label="Edit message"
															onclick={() => startEditingMessage(msg)}
															class="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
														>
															<Pencil class="h-3.5 w-3.5" />
														</button>
													{/if}
													<button
														type="button"
														aria-label="Delete message"
														onclick={() => requestDeleteMessage(msg._id)}
														disabled={deletingMessageId === msg._id || msg.isDeleted}
														class="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
													>
														<Trash2 class="h-3.5 w-3.5" />
													</button>
												</div>
											{/if}

											{#if !msg.isDeleted}
												{#each msg.reactions as reaction (`${msg._id}-${reaction.emoji}`)}
													{#if isMine}
														<span
															class="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background px-2 py-0.5 text-[11px] text-foreground/85 sm:text-xs"
														>
															<span>{reaction.emoji}</span>
															<span class="font-medium">{reaction.count}</span>
														</span>
													{:else}
														<button
															type="button"
															aria-label={`Toggle ${reaction.emoji} reaction`}
															onclick={() => toggleReaction(msg._id, reaction.emoji)}
															class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors sm:text-xs {reaction.reactedByMe
																? 'border-primary/40 bg-primary/10 text-primary'
																: 'border-border/70 bg-background text-foreground/85 hover:bg-muted/70'}"
														>
															<span>{reaction.emoji}</span>
															<span class="font-medium">{reaction.count}</span>
														</button>
													{/if}
												{/each}

												{#if !isMine}
													<button
														type="button"
														aria-label="Add reaction"
														onclick={() => toggleReactionPicker(msg._id)}
														class="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground sm:h-7 sm:w-7"
													>
														<SmilePlus class="h-3.5 w-3.5 sm:h-4 sm:w-4" />
													</button>
												{/if}

												{#if !isMine && reactionPickerMessageId === msg._id}
													<div
														class="absolute bottom-full z-20 mb-1.5 flex items-center gap-0.5 rounded-full border border-border/70 bg-background p-1 shadow-md {isMine
															? 'right-0'
															: 'left-0'}"
													>
														{#each REACTION_EMOJIS as emoji (emoji)}
															<button
																type="button"
																aria-label={`React with ${emoji}`}
																onclick={() => toggleReaction(msg._id, emoji)}
																class="inline-flex h-7 w-7 items-center justify-center rounded-full text-sm transition-colors hover:bg-muted sm:h-8 sm:w-8 sm:text-base"
															>
																{emoji}
															</button>
														{/each}
													</div>
												{/if}
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

	<!-- Input Area -->
	<div class="pointer-events-none absolute inset-x-0 bottom-0 z-30">
		<div class="mx-auto max-w-3xl px-3 pb-3 sm:px-6 sm:pb-4">
			<div
				class="pointer-events-auto flex items-end gap-2 rounded-xl border border-border/60 bg-background/92 shadow-[0_10px_30px_-16px_rgba(0,0,0,0.35)] backdrop-blur-md"
			>
				<div
					class="flex min-h-[40px] flex-1 items-end rounded-l-xl border-r border-border/50 bg-muted/30 transition-colors focus-within:bg-muted/40 sm:min-h-[44px]"
				>
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
					class="h-10 w-10 shrink-0 rounded-l-none rounded-r-xl transition-all sm:h-[44px] sm:w-[44px] {newMessage.trim()
						? 'bg-primary shadow-md hover:shadow-lg'
						: ''}"
				>
					<SendHorizontal class="h-[18px] w-[18px]" />
				</Button>
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
