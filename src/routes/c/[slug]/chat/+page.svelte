<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import type { Id } from '$convex/_generated/dataModel';
	import { api } from '$convex/_generated/api';
	import { tick, onDestroy } from 'svelte';
	import { fade } from 'svelte/transition';
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

	const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '😢', '👀'] as const;
	type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

	type MessageReaction = {
		emoji: ReactionEmoji;
		count: number;
		reactedByMe: boolean;
		reactors: Array<{ userId: string; userName: string; userImage?: string }>;
	};

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
		reactions: Array<MessageReaction>;
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

	let newMessage = $state('');
	let scrollContainer: HTMLDivElement | null = $state(null);
	let showScrollButton = $state(false);
	let inputEl: HTMLTextAreaElement | null = $state(null);

	let replyingToMessage = $state<CommunityChatMessage | null>(null);

	let editingMessageId = $state<Id<'community_chat_messages'> | null>(null);
	let editingMessageBody = $state('');
	let isSavingEdit = $state(false);

	let deletingMessageId = $state<Id<'community_chat_messages'> | null>(null);
	let isDeleteMessageDialogOpen = $state(false);

	function formatTime(ts: number) {
		return new Date(ts).toLocaleTimeString([], {
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		});
	}

	function getDayStart(timestamp: number) {
		const date = new Date(timestamp);
		return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
	}

	function groupMessagesByDate(msgs: Array<CommunityChatMessage>) {
		const groups: Array<{ label: string; messages: Array<CommunityChatMessage> }> = [];
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

	function isConsecutive(msgs: Array<CommunityChatMessage>, index: number) {
		if (index === 0) return false;
		const prev = msgs[index - 1];
		const curr = msgs[index];
		return prev.userId === curr.userId;
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
		if (!isMember || !communityId) return;
		if (messages.length) {
			tick().then(() => {
				if (!showScrollButton) scrollToBottom();
			});
		}
	});

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

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	}

	function setReplyingTo(message: CommunityChatMessage) {
		replyingToMessage = message;
		tick().then(() => {
			inputEl?.focus();
		});
	}

	function cancelReplying() {
		replyingToMessage = null;
	}

	function startEditingMessage(message: CommunityChatMessage) {
		if (message.isDeleted) return;
		editingMessageId = message._id;
		editingMessageBody = message.body;
		tick().then(() => {
			inputEl?.focus();
		});
	}

	function cancelEditing() {
		editingMessageId = null;
		editingMessageBody = '';
	}

	function requestDeleteMessage(messageId: Id<'community_chat_messages'>) {
		deletingMessageId = messageId;
		isDeleteMessageDialogOpen = true;
	}

	function closeDeleteMessageDialog() {
		isDeleteMessageDialogOpen = false;
		deletingMessageId = null;
	}

	async function confirmDeleteMessage() {
		if (!communityId || !deletingMessageId) return;
		try {
			await client.mutation((api as any).community_chat.deleteMessage, {
				communityId,
				messageId: deletingMessageId
			});
			closeDeleteMessageDialog();
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to delete message');
		}
	}

	async function sendMessage() {
		if (!newMessage.trim() || !communityId || !isMember) return;
		const body = newMessage.trim();
		const replyContext = replyingToMessage;
		const replyTo = replyContext?._id;

		newMessage = '';
		cancelReplying();
		resetTextareaHeight();
		try {
			await client.mutation((api as any).community_chat.sendMessage, {
				communityId,
				body,
				replyTo
			});
			scrollToBottom();
		} catch (error: any) {
			console.error('Failed to send message:', error);
			toast.error(error?.message ?? 'Failed to send message. Please try again.');
			newMessage = body;
			replyingToMessage = replyContext;
			tick().then(() => {
				inputEl?.focus();
				if (inputEl) {
					inputEl.style.height = 'auto';
					inputEl.style.height = Math.min(inputEl.scrollHeight, 128) + 'px';
				}
			});
		}
	}

	async function saveEdit() {
		if (!editingMessageId || !communityId || !editingMessageBody.trim()) {
			cancelEditing();
			return;
		}
		isSavingEdit = true;
		try {
			await client.mutation((api as any).community_chat.editMessage, {
				communityId,
				messageId: editingMessageId,
				body: editingMessageBody.trim()
			});
			cancelEditing();
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to edit message');
		} finally {
			isSavingEdit = false;
		}
	}

	async function toggleReaction(messageId: Id<'community_chat_messages'>, emoji: ReactionEmoji) {
		if (!communityId || !currentUserId) return;

		try {
			await client.mutation(
				(api as any).community_chat.toggleReaction,
				{
					communityId,
					messageId,
					emoji
				},
				{
					optimisticUpdate: (localStore) => {
						const existingMessages =
							localStore.getQuery((api as any).community_chat.getMessages, {
								communityId,
								limit: 100
							}) ?? [];

						const messageIndex = existingMessages.findIndex(
							(m: CommunityChatMessage) => m._id === messageId
						);
						if (messageIndex === -1) return;

						const message = existingMessages[messageIndex];
						const newReactions = [...message.reactions];

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

						if (previousEmoji !== emoji) {
							let reactionIndex = newReactions.findIndex((r) => r.emoji === emoji);
							const userProfile = {
								userId: currentUserId,
								userName: $session.data?.user?.name ?? 'Me',
								userImage: $session.data?.user?.image ?? undefined
							};

							if (reactionIndex !== -1) {
								const r = newReactions[reactionIndex];
								newReactions[reactionIndex] = {
									...r,
									count: r.count + 1,
									reactedByMe: true,
									reactors: [...r.reactors, userProfile]
								};
							} else {
								newReactions.push({
									emoji,
									count: 1,
									reactedByMe: true,
									reactors: [userProfile]
								});
							}
						}

						localStore.setQuery(
							(api as any).community_chat.getMessages,
							{
								communityId,
								limit: 100
							},
							(existingMessages as CommunityChatMessage[]).map((m, idx) =>
								idx === messageIndex ? { ...m, reactions: newReactions } : m
							)
						);
					}
				}
			);
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to toggle reaction');
		}
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

		{#if !isMember}
			<div class="mx-auto flex max-w-md flex-1 flex-col items-center justify-center text-center">
				<p class="mb-2 text-sm text-muted-foreground">
					Only active members can view and participate in this community chat.
				</p>
				{#if !isAuthenticated}
					<p class="text-xs text-muted-foreground/80">
						Please sign in and join the community from the main community page.
					</p>
				{/if}
			</div>
		{:else}
			<div class="relative flex min-h-0 flex-1 flex-col gap-3">
				<div
					bind:this={scrollContainer}
					onscroll={handleScroll}
					class="relative flex-1 space-y-2 overflow-y-auto bg-background/95 pt-4 pb-10 sm:pt-6"
				>
					{#if messagesQuery.isLoading}
						<div class="flex h-full items-center justify-center">
							<LoaderCircle class="h-6 w-6 animate-spin text-muted-foreground" />
						</div>
					{:else if messages.length === 0}
						<div class="flex h-full items-center justify-center">
							<p class="text-sm text-muted-foreground">No messages yet. Start the conversation!</p>
						</div>
					{:else}
						{#each groupedMessages as group (group.label)}
							<div class="space-y-0.5 pt-2 pb-4">
								<div class="relative my-6 flex items-center justify-center">
									<div class="absolute inset-0 flex items-center">
										<div class="w-full border-t border-border/40"></div>
									</div>
									<div class="relative flex justify-center">
										<span
											class="rounded-full border border-border/40 bg-background px-3 py-0.5 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase shadow-sm"
										>
											{group.label}
										</span>
									</div>
								</div>

								<div class="flex flex-col">
									{#each group.messages as msg, index (msg._id)}
										{@const isMine = msg.userId === currentUserId}
										{@const consecutive = isConsecutive(group.messages, index)}
										<div
											class={`group relative flex w-full items-start gap-4 px-4 py-1.5 transition-colors hover:bg-muted/40 sm:px-6 ${isMine ? 'flex-row-reverse' : ''} ${consecutive ? 'inset-y-0 mt-0' : 'mt-4'}`}
											in:fade={{ duration: 120 }}
										>
											<div class="relative mt-0.5 flex w-[40px] shrink-0 justify-center">
												{#if !consecutive}
													<div
														class="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-muted/60 text-[13px] font-semibold text-foreground/90 select-none"
													>
														{#if msg.userImage}
															<Avatar.Root class="h-10 w-10">
																<Avatar.Image src={msg.userImage} alt={msg.userName} />
																<Avatar.Fallback>
																	{getInitials(msg.userName)}
																</Avatar.Fallback>
															</Avatar.Root>
														{:else}
															<span
																class={`flex h-10 w-10 items-center justify-center rounded-full ${getAvatarColor(msg.userId)}`}
															>
																{getInitials(msg.userName)}
															</span>
														{/if}
													</div>
												{:else}
													<span
														class={`absolute top-2.5 w-12 text-center text-[10px] text-muted-foreground/0 transition-colors select-none group-hover:text-muted-foreground/60 ${isMine ? '-right-1' : '-left-1'}`}
													>
														{formatTime(msg.createdAt)}
													</span>
												{/if}
											</div>

											<div
												class={`flex min-w-0 flex-1 flex-col ${isMine ? 'items-end' : 'items-start'}`}
											>
												{#if !consecutive}
													<div
														class={`mb-0.5 flex items-baseline gap-2 ${isMine ? 'flex-row-reverse' : ''}`}
													>
														<span
															class="cursor-pointer font-semibold tracking-tight text-foreground/90 hover:underline"
														>
															{msg.userName}
														</span>
														<span class="text-xs text-muted-foreground/60">
															{formatTime(msg.createdAt)}
														</span>
													</div>
												{/if}

												<div
													class={`relative text-[15px] leading-relaxed ${isMine ? 'text-right' : 'text-left'} ${msg.isDeleted ? 'text-muted-foreground italic' : 'text-foreground/90'}`}
												>
													{#if msg.replyTo}
														<div
															class={`mb-1.5 flex items-center gap-1.5 opacity-80 transition-opacity select-none hover:opacity-100 ${isMine ? 'flex-row-reverse' : ''}`}
														>
															<div
																class={`flex h-5 items-center rounded bg-muted px-1.5 ${isMine ? 'flex-row-reverse' : ''}`}
															>
																<CornerDownRight
																	class={`h-3.5 w-3.5 text-muted-foreground ${isMine ? 'ml-1' : 'mr-1'}`}
																/>
																<Avatar.Root class={`h-4 w-4 ${isMine ? 'ml-1' : 'mr-1'}`}>
																	<Avatar.Fallback class="bg-background text-[8px]">
																		{getInitials(msg.replyTo.userName)}
																	</Avatar.Fallback>
																</Avatar.Root>
																<span
																	class={`text-xs font-medium text-foreground ${isMine ? 'ml-1' : 'mr-1'}`}
																>
																	{msg.replyTo.userName}
																</span>
																<span
																	class="max-w-[200px] truncate text-xs text-muted-foreground sm:max-w-[400px]"
																>
																	{msg.replyTo.body}
																</span>
															</div>
														</div>
													{/if}

													{#if editingMessageId === msg._id}
														<textarea
															bind:value={editingMessageBody}
															rows={1}
															oninput={autoResizeTextarea}
															class="mt-1 mb-2 w-full resize-none rounded-md border border-primary/40 bg-background/90 px-3 py-2 text-[14px] leading-relaxed shadow-sm outline-none focus:ring-1 focus:ring-primary/50"
														></textarea>
														<div
															class={`flex items-center gap-2 text-xs ${isMine ? 'justify-end' : ''}`}
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
															<span class="text-muted-foreground">• enter to</span>
															<Button
																variant="link"
																size="sm"
																onclick={saveEdit}
																disabled={isSavingEdit || !editingMessageBody.trim()}
																class="h-auto p-0 text-xs text-primary hover:underline"
															>
																{#if isSavingEdit}
																	saving...
																{:else}
																	save
																{/if}
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
														class={`mt-2 flex flex-wrap items-center gap-1.5 ${isMine ? 'flex-row-reverse' : ''}`}
													>
														{#each msg.reactions as reaction (`${msg._id}-${reaction.emoji}`)}
															<button
																type="button"
																onclick={() =>
																	toggleReaction(msg._id, reaction.emoji as ReactionEmoji)}
																class={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus:ring-1 focus:ring-primary/40 focus:outline-none ${
																	reaction.reactedByMe
																		? 'border-primary/30 bg-primary/10 text-primary'
																		: 'border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted/80'
																}`}
															>
																<span class="text-[13px] leading-none">{reaction.emoji}</span>
																<span>{reaction.count}</span>
															</button>
														{/each}
													</div>
												{/if}

												{#if !msg.isDeleted}
													<div
														class={`absolute -top-3 z-10 flex items-center gap-0.5 rounded-md border border-border/50 bg-background p-0.5 opacity-0 shadow-sm transition-all duration-200 group-hover:opacity-100 ${isMine ? 'left-4' : 'right-4'}`}
													>
														<Popover.Root>
															<Popover.Trigger
																class="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:bg-muted/80"
																title="Add Reaction"
															>
																<SmilePlus class="h-[18px] w-[18px]" />
															</Popover.Trigger>
															<Popover.Content
																data-reaction-popover
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
																		class={`inline-flex h-8 w-8 items-center justify-center rounded-full text-lg transition-transform hover:scale-110 active:scale-95 ${
																			reactedByMe
																				? 'bg-primary/20 bg-blend-multiply'
																				: 'hover:bg-muted'
																		}`}
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
																onclick={() => startEditingMessage(msg)}
																title="Edit"
																class="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
															>
																<Pencil class="h-[18px] w-[18px]" />
															</button>
															<button
																type="button"
																onclick={() => requestDeleteMessage(msg._id)}
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
							</div>
						{/each}

						<div class="h-[60px]"></div>
					{/if}
				</div>

				{#if showScrollButton}
					<div
						class="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex justify-center sm:bottom-28"
					>
						<button
							type="button"
							onclick={scrollToBottom}
							class="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-background shadow-lg ring-1 ring-border/60 transition-all hover:scale-105 active:scale-95"
						>
							<ArrowDown class="h-4 w-4 text-muted-foreground" />
						</button>
					</div>
				{/if}

				<div
					class="pointer-events-none inset-x-0 bottom-0 z-30 border-t border-border/40 bg-background/90 backdrop-blur-md"
				>
					<div class="w-full px-4 pt-2 pb-4 sm:px-6">
						{#if replyingToMessage}
							<div
								class="pointer-events-auto mb-2 flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/95 px-3 py-2 shadow-sm"
							>
								<div class="flex min-w-0 items-center gap-2.5">
									<div
										class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted/80 text-muted-foreground"
									>
										<Reply class="h-3.5 w-3.5" />
									</div>
									<div class="flex min-w-0 flex-col py-0.5">
										<span
											class="text-[10px] font-semibold tracking-wider text-primary/80 uppercase"
										>
											Replying to {replyingToMessage.userName}
										</span>
										<p class="truncate text-xs text-muted-foreground/90">
											{replyingToMessage.body}
										</p>
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
								<div
									class="flex min-h-10 flex-1 items-end bg-transparent transition-colors sm:min-h-11"
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
									type="button"
									onclick={sendMessage}
									disabled={!newMessage.trim()}
									size="icon"
									class="h-10 w-10 shrink-0 rounded-none rounded-tr-xl rounded-br-xl bg-transparent text-primary transition-all hover:bg-muted/30 sm:h-11 sm:w-11 {newMessage.trim()
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
		{/if}
	{/if}
</main>

<Dialog.Root bind:open={isDeleteMessageDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Delete message?</Dialog.Title>
			<Dialog.Description>
				Are you sure you want to delete this message? This action cannot be undone.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={closeDeleteMessageDialog}>Cancel</Button>
			<Button variant="destructive" onclick={confirmDeleteMessage} disabled={!deletingMessageId}>
				Delete
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
