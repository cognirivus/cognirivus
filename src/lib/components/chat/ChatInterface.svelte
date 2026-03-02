<script lang="ts">
	import { tick, onDestroy } from 'svelte';
	import { fade } from 'svelte/transition';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Popover from '$lib/components/ui/popover';
	import * as Avatar from '$lib/components/ui/avatar';
	import {
		ArrowDown,
		CornerDownRight,
		Pencil,
		Reply,
		SendHorizontal,
		Trash2,
		X,
		MoreVertical,
		Check
	} from '@lucide/svelte';

	interface Message {
		_id: string;
		senderId: string;
		senderName: string;
		senderImage?: string;
		body: string;
		createdAt: number;
		replyTo?: {
			messageId: string;
			userName: string;
			body: string;
			isDeleted: boolean;
		};
		editedAt?: number;
		isDeleted?: boolean;
		reactions: Array<{
			emoji: string;
			count: number;
			reactedByMe: boolean;
			reactors: Array<{ userId: string; userName: string; userImage?: string }>;
		}>;
	}

	let {
		messages = [],
		currentUserId = '',
		onSendMessage,
		onEditMessage,
		onDeleteMessage,
		onToggleReaction,
		header,
		isLoading = false
	}: {
		messages: Message[];
		currentUserId: string;
		onSendMessage: (body: string, replyToId?: string) => Promise<void>;
		onEditMessage: (messageId: string, body: string) => Promise<void>;
		onDeleteMessage: (messageId: string) => Promise<void>;
		onToggleReaction: (messageId: string, emoji: string) => Promise<void>;
		header?: any;
		isLoading?: boolean;
	} = $props();

	const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '😢', '👀'] as const;

	let newMessage = $state('');
	let scrollContainer: HTMLDivElement | null = $state(null);
	let showScrollButton = $state(false);
	let inputEl: HTMLTextAreaElement | null = $state(null);
	let replyingToMessage = $state<Message | null>(null);
	let editingMessageId = $state<string | null>(null);
	let editingMessageBody = $state('');
	let isSavingEdit = $state(false);
	let deletingMessageId = $state<string | null>(null);
	let isDeleteDialogOpen = $state(false);
	let contextMenu = $state<{ x: number; y: number; msg: Message } | null>(null);
	let longPressTimer: ReturnType<typeof setTimeout> | null = $state(null);
	let touchStartPos = $state<{ x: number; y: number } | null>(null);
	let highlightedMessageId = $state<string | null>(null);
	let reactionDetails = $state<{
		messageId: string;
		activeEmoji: string;
		x: number;
		y: number;
	} | null>(null);

	const currentReactionMsg = $derived.by(() => {
		const details = reactionDetails;
		if (!details) return null;
		return messages.find((m) => m._id === details.messageId) || null;
	});

	const activeReactors = $derived.by(() => {
		if (!reactionDetails || !currentReactionMsg) return [];

		const reactors: Array<{
			userId: string;
			userName: string;
			userImage?: string;
			emoji: string;
		}> = [];
		const reactions = currentReactionMsg.reactions || [];

		if (reactionDetails.activeEmoji === 'all') {
			for (const reaction of reactions) {
				for (const reactor of reaction.reactors) {
					reactors.push({ ...reactor, emoji: reaction.emoji });
				}
			}
		} else {
			const reaction = reactions.find((r) => r.emoji === reactionDetails!.activeEmoji);
			if (reaction) {
				for (const reactor of reaction.reactors) {
					reactors.push({ ...reactor, emoji: reaction.emoji });
				}
			}
		}

		// Sort: current user first, then alphabetical
		return reactors.sort((a, b) => {
			if (a.userId === currentUserId && b.userId !== currentUserId) return -1;
			if (a.userId !== currentUserId && b.userId === currentUserId) return 1;
			return a.userName.localeCompare(b.userName);
		});
	});

	// Helpers
	function formatTime(ts: number) {
		return new Date(ts).toLocaleTimeString([], {
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		});
	}

	function getDayStart(ts: number) {
		const date = new Date(ts);
		return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
	}

	function groupMessagesByDate(msgs: Message[]) {
		const groups: Array<{ label: string; messages: Message[] }> = [];
		let currentLabel = '';
		const todayStart = getDayStart(Date.now());
		const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;

		for (const msg of msgs) {
			const messageDayStart = getDayStart(msg.createdAt);
			let label: string;

			if (messageDayStart === todayStart) label = 'Today';
			else if (messageDayStart === yesterdayStart) label = 'Yesterday';
			else {
				label = new Date(msg.createdAt).toLocaleDateString([], {
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

	function isConsecutive(msgs: Message[], index: number) {
		if (index === 0) return false;
		return msgs[index - 1].senderId === msgs[index].senderId;
	}

	function getInitials(name: string) {
		return (
			name
				?.split(' ')
				.map((n) => n[0])
				.join('')
				.toUpperCase()
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

	function getAvatarColor(id: string) {
		let hash = 0;
		for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
		return avatarColors[Math.abs(hash) % avatarColors.length];
	}

	function scrollToBottom() {
		if (scrollContainer)
			scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
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

	function autoResizeTextarea(e: Event) {
		const target = e.target as HTMLTextAreaElement;
		target.style.height = 'auto';
		target.style.height = Math.min(target.scrollHeight, 128) + 'px';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			send();
		}
	}

	async function send() {
		if (!newMessage.trim()) return;
		const body = newMessage.trim();
		const replyTo = replyingToMessage?._id;
		newMessage = '';
		replyingToMessage = null;
		if (inputEl) inputEl.style.height = 'auto';
		await onSendMessage(body, replyTo);
	}

	async function saveEdit() {
		if (!editingMessageId || !editingMessageBody.trim()) return;
		isSavingEdit = true;
		await onEditMessage(editingMessageId, editingMessageBody.trim());
		editingMessageId = null;
		editingMessageBody = '';
		isSavingEdit = false;
	}

	function handleEditKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			saveEdit();
		} else if (e.key === 'Escape') {
			editingMessageId = null;
		}
	}

	function handleContextMenu(e: MouseEvent | TouchEvent, msg: Message) {
		if (msg.isDeleted) return;

		// On mobile (TouchEvent), if this is called from longPressTimer,
		// e is the touchstart event. preventDefault() on a non-cancelable touchstart
		// causes a console warning.
		if (e.cancelable) {
			e.preventDefault();
		}
		e.stopPropagation();

		const x = 'clientX' in e ? e.clientX : e.touches[0].clientX;
		const y = 'clientY' in e ? e.clientY : e.touches[0].clientY;

		contextMenu = { x, y, msg };
	}

	function handleTouchStart(e: TouchEvent, msg: Message) {
		if (msg.isDeleted) return;
		const touch = e.touches[0];
		touchStartPos = { x: touch.clientX, y: touch.clientY };

		longPressTimer = setTimeout(() => {
			handleContextMenu(e, msg);
			longPressTimer = null;
		}, 500);
	}

	function handleTouchMove(e: TouchEvent) {
		if (!touchStartPos) return;
		const touch = e.touches[0];
		const dx = Math.abs(touch.clientX - touchStartPos.x);
		const dy = Math.abs(touch.clientY - touchStartPos.y);

		if (dx > 10 || dy > 10) {
			clearLongPress();
		}
	}

	function handleTouchEnd() {
		clearLongPress();
	}

	function clearLongPress() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
		touchStartPos = null;
	}

	function closeContextMenu() {
		contextMenu = null;
	}

	$effect(() => {
		if (contextMenu) {
			window.addEventListener('click', closeContextMenu);
			window.addEventListener('contextmenu', closeContextMenu);
			return () => {
				window.removeEventListener('click', closeContextMenu);
				window.removeEventListener('contextmenu', closeContextMenu);
			};
		}
	});

	function isMessageEditable(msg: Message) {
		if (msg.senderId !== currentUserId || msg.isDeleted) return false;
		return Date.now() - msg.createdAt < 60000;
	}

	function scrollToMessage(messageId: string) {
		const element = document.getElementById(`msg-${messageId}`);
		if (element) {
			element.scrollIntoView({ behavior: 'smooth', block: 'center' });
			highlightedMessageId = messageId;
			setTimeout(() => {
				highlightedMessageId = null;
			}, 2000);
		}
	}

	function handleReplyClick(e: MouseEvent, messageId: string) {
		e.preventDefault();
		e.stopPropagation();
		scrollToMessage(messageId);
	}

	function handleReplyFromMenu() {
		if (contextMenu) {
			replyingToMessage = contextMenu.msg;
			tick().then(() => inputEl?.focus());
			closeContextMenu();
		}
	}

	function handleReactionClick(e: MouseEvent, msgId: string, activeEmoji: string) {
		e.stopPropagation();
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		reactionDetails = {
			messageId: msgId,
			activeEmoji,
			x: rect.left,
			y: rect.top
		};
	}

	async function handleToggleFromMenu(emoji: string) {
		if (reactionDetails && currentReactionMsg) {
			const { messageId } = reactionDetails;
			const reactions = currentReactionMsg.reactions || [];

			// Find if this is the last reaction of this type
			const reaction = reactions.find((r) => r.emoji === emoji);
			const isLastOfThisEmoji = reaction?.count === 1 && reaction.reactedByMe;
			const isLastOverall = reactions.length === 1 && isLastOfThisEmoji;

			if (isLastOverall) {
				reactionDetails = null;
			} else if (isLastOfThisEmoji && reactionDetails.activeEmoji === emoji) {
				reactionDetails.activeEmoji = 'all';
			}

			await onToggleReaction(messageId, emoji);
		}
	}

	function handleEditFromMenu() {
		if (contextMenu) {
			editingMessageId = contextMenu.msg._id;
			editingMessageBody = contextMenu.msg.body;
			tick().then(() => inputEl?.focus());
			closeContextMenu();
		}
	}

	function handleDeleteFromMenu() {
		if (contextMenu) {
			deletingMessageId = contextMenu.msg._id;
			isDeleteDialogOpen = true;
			closeContextMenu();
		}
	}

	function handleReactFromMenu(emoji: string) {
		if (contextMenu) {
			onToggleReaction(contextMenu.msg._id, emoji);
			closeContextMenu();
		}
	}
</script>

<div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
	{@render header?.()}

	<div
		bind:this={scrollContainer}
		onscroll={handleScroll}
		class="relative flex-1 space-y-2 overflow-y-auto bg-background/95 pt-4 pb-10 sm:pt-6"
	>
		{#if isLoading}
			<div class="flex h-full items-center justify-center text-sm text-muted-foreground">
				Loading...
			</div>
		{:else if messages.length === 0}
			<div class="flex h-full items-center justify-center text-sm text-muted-foreground">
				No messages yet.
			</div>
		{:else}
			{#each groupedMessages as group (group.label)}
				<div class="space-y-0.5 pt-2 pb-4">
					<div class="relative my-6 flex items-center justify-center">
						<div class="absolute inset-0 flex items-center px-6">
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
						{#each group.messages as msg, i (msg._id)}
							{@const isMine = msg.senderId === currentUserId}
							{@const consecutive = isConsecutive(group.messages, i)}

							<div
								id="msg-{msg._id}"
								class="group relative flex w-full items-start gap-3 px-4 py-1 transition-colors hover:bg-muted/20 sm:px-6 {isMine
									? 'flex-row-reverse'
									: ''} {consecutive ? 'mt-0' : 'mt-4'}"
								in:fade={{ duration: 120 }}
								oncontextmenu={(e) => handleContextMenu(e, msg)}
								ontouchstart={(e) => handleTouchStart(e, msg)}
								ontouchmove={handleTouchMove}
								ontouchend={handleTouchEnd}
								role="none"
							>
								<div class="relative mt-0.5 flex w-9 shrink-0 justify-center">
									{#if !consecutive}
										<Avatar.Root class="size-9 ring-1 ring-border/40">
											{#if msg.senderImage}
												<Avatar.Image src={msg.senderImage} alt={msg.senderName} />
											{/if}
											<Avatar.Fallback class="text-xs {getAvatarColor(msg.senderId)}">
												{getInitials(msg.senderName)}
											</Avatar.Fallback>
										</Avatar.Root>
									{/if}
								</div>

								<div
									class="flex max-w-[85%] min-w-0 flex-col {isMine ? 'items-end' : 'items-start'}"
								>
									{#if !consecutive}
										<div class="mb-1 flex items-baseline gap-2 {isMine ? 'flex-row-reverse' : ''}">
											<span class="text-[13px] font-semibold tracking-tight text-foreground/90">
												{msg.senderName}
											</span>
										</div>
									{/if}

									<div
										class="relative rounded-2xl bg-muted/40 px-3 py-2 shadow-sm transition-all duration-500 {isMine
											? 'rounded-tr-none'
											: 'rounded-tl-none'} {highlightedMessageId === msg._id
											? 'bg-primary/10 shadow-lg ring-2 ring-primary'
											: ''}"
									>
										{#if msg.replyTo}
											<!-- svelte-ignore a11y_click_events_have_key_events -->
											<!-- svelte-ignore a11y_no_static_element_interactions -->
											<div
												onclick={(e) => handleReplyClick(e, msg.replyTo!.messageId)}
												class="mb-1.5 flex cursor-pointer items-center gap-2 overflow-hidden rounded-md border-l-4 border-primary bg-background/50 p-2 text-left transition-colors hover:bg-background/80"
											>
												<div class="min-w-0">
													<div class="truncate text-[11px] font-bold text-primary">
														{msg.replyTo.userName}
													</div>
													<div class="truncate text-xs text-muted-foreground">
														{msg.replyTo.body}
													</div>
												</div>
											</div>
										{/if}

										{#if editingMessageId === msg._id}
											<div class="flex min-w-[200px] flex-col gap-2">
												<textarea
													bind:value={editingMessageBody}
													rows={1}
													oninput={autoResizeTextarea}
													onkeydown={handleEditKeydown}
													class="w-full resize-none border-none bg-transparent p-0 text-[14px] leading-relaxed outline-none focus:ring-0"
												></textarea>
												<div class="flex justify-end gap-1.5 border-t border-border/10 pt-1.5">
													<button
														onclick={() => (editingMessageId = null)}
														class="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
														title="Cancel"
													>
														<X class="size-3.5" />
													</button>
													<button
														onclick={saveEdit}
														disabled={!editingMessageBody.trim() || isSavingEdit}
														class="flex h-6 w-6 items-center justify-center rounded-md text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
														title="Save"
													>
														{#if isSavingEdit}
															<div
																class="size-3 animate-spin rounded-full border-2 border-primary border-t-transparent"
															></div>
														{:else}
															<Check class="size-3.5" />
														{/if}
													</button>
												</div>
											</div>
										{:else}
											<div class="flex flex-wrap items-end gap-x-3 gap-y-1">
												<p
													class="min-w-0 flex-1 text-[14px] leading-relaxed whitespace-pre-wrap text-foreground/90"
												>
													{msg.body}
												</p>
												<div
													class="flex shrink-0 items-center gap-1.5 pb-0.5 whitespace-nowrap select-none"
												>
													{#if msg.editedAt}
														<span class="text-[10px] text-muted-foreground/50">(edited)</span>
													{/if}
													<span class="text-[10px] text-muted-foreground/60">
														{formatTime(msg.createdAt)}
													</span>
												</div>
											</div>
										{/if}
									</div>

									{#if msg.reactions && msg.reactions.length > 0}
										<div class="mt-1.5 flex flex-wrap gap-1 {isMine ? 'flex-row-reverse' : ''}">
											{#each msg.reactions as reaction}
												<button
													onclick={(e) => handleReactionClick(e, msg._id, reaction.emoji)}
													class="group flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] transition-all hover:scale-105 {reaction.reactedByMe
														? 'ripple-primary border-primary/30 bg-primary/10 text-primary'
														: 'border-border/40 bg-muted/30 text-muted-foreground hover:bg-muted/50'}"
												>
													<span>{reaction.emoji}</span>
													<span>{reaction.count}</span>
												</button>
											{/each}
										</div>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/each}
			<div class="h-10"></div>
		{/if}
	</div>

	{#if reactionDetails && currentReactionMsg}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="fixed inset-0 z-[110]" onclick={() => (reactionDetails = null)}></div>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="fixed z-[120] w-64 overflow-hidden rounded-xl border border-border/40 bg-background/95 shadow-xl backdrop-blur-md"
			style="left: {Math.min(
				reactionDetails.x,
				typeof window !== 'undefined' ? window.innerWidth - 270 : 0
			)}px; top: {Math.min(
				reactionDetails.y - 160,
				typeof window !== 'undefined' ? window.innerHeight - 250 : 0
			)}px"
			onclick={(e) => e.stopPropagation()}
		>
			<!-- Tabs -->
			<div class="flex items-center gap-1 border-b border-border/40 bg-muted/10 p-1">
				<button
					onclick={() => (reactionDetails!.activeEmoji = 'all')}
					class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors {reactionDetails.activeEmoji ===
					'all'
						? 'bg-background text-foreground shadow-sm'
						: 'text-muted-foreground hover:bg-background/50'}"
				>
					<span>All</span>
					<span class="text-[10px] opacity-60">
						{currentReactionMsg.reactions.reduce((acc, r) => acc + r.count, 0)}
					</span>
				</button>
				{#each currentReactionMsg.reactions as reaction}
					<button
						onclick={() => (reactionDetails!.activeEmoji = reaction.emoji)}
						class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors {reactionDetails.activeEmoji ===
						reaction.emoji
							? 'bg-background text-foreground shadow-sm'
							: 'text-muted-foreground hover:bg-background/50'}"
					>
						<span>{reaction.emoji}</span>
						<span class="text-[10px] opacity-60">{reaction.count}</span>
					</button>
				{/each}
			</div>

			<!-- Reactor List -->
			<div class="max-h-48 overflow-y-auto p-1">
				{#key activeReactors}
					{#each activeReactors as reactor (reactor.userId + reactor.emoji)}
						<button
							onclick={() =>
								reactor.userId === currentUserId && handleToggleFromMenu(reactor.emoji)}
							class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors {reactor.userId ===
							currentUserId
								? 'group/reactor hover:bg-destructive/10'
								: 'hover:bg-muted/50'}"
						>
							{#if reactor.userImage}
								<img src={reactor.userImage} alt="" class="size-6 rounded-full object-cover" />
							{:else}
								<div
									class="flex size-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary"
								>
									{reactor.userName.charAt(0).toUpperCase()}
								</div>
							{/if}
							<div class="flex min-w-0 flex-1 flex-col">
								<span class="truncate font-medium">{reactor.userName}</span>
								{#if reactionDetails.activeEmoji === 'all'}
									<span class="text-[9px] text-muted-foreground">Reacted with {reactor.emoji}</span>
								{/if}
							</div>
							{#if reactor.userId === currentUserId}
								<div class="flex flex-col items-end">
									<span
										class="shrink-0 text-[10px] font-medium text-primary group-hover/reactor:text-destructive"
									>
										(You)
									</span>
									<span class="text-[8px] font-medium text-destructive/80"> Tap to remove </span>
								</div>
							{/if}
						</button>
					{/each}
				{/key}
			</div>
		</div>
	{/if}

	{#if contextMenu}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="fixed z-[100] flex w-48 flex-col overflow-hidden rounded-xl border border-border/40 bg-background/95 p-1 shadow-xl backdrop-blur-md"
			style="left: {Math.min(
				contextMenu.x,
				typeof window !== 'undefined' ? window.innerWidth - 200 : 0
			)}px; top: {Math.min(
				contextMenu.y,
				typeof window !== 'undefined' ? window.innerHeight - 300 : 0
			)}px"
			onclick={(e) => e.stopPropagation()}
			oncontextmenu={(e) => {
				e.preventDefault();
				e.stopPropagation();
			}}
		>
			<div class="mb-1 grid grid-cols-7 gap-0.5 border-b border-border/40 p-1">
				{#each REACTION_EMOJIS as emoji}
					<button
						onclick={() => handleReactFromMenu(emoji)}
						class="flex h-7 w-7 items-center justify-center rounded-md text-base transition-transform hover:scale-125 hover:bg-muted"
					>
						{emoji}
					</button>
				{/each}
			</div>

			<button
				onclick={handleReplyFromMenu}
				class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted"
			>
				<Reply class="size-4 text-muted-foreground" />
				<span>Reply</span>
			</button>

			{#if contextMenu.msg.senderId === currentUserId && isMessageEditable(contextMenu.msg)}
				<button
					onclick={handleEditFromMenu}
					class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted"
				>
					<Pencil class="size-4 text-muted-foreground" />
					<span>Edit Message</span>
				</button>
			{/if}

			{#if contextMenu.msg.senderId === currentUserId}
				<button
					onclick={handleDeleteFromMenu}
					class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
				>
					<Trash2 class="size-4" />
					<span>Delete</span>
				</button>
			{/if}
		</div>
	{/if}

	{#if showScrollButton}
		<button
			onclick={scrollToBottom}
			class="absolute right-6 bottom-32 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-background shadow-lg ring-1 ring-border/20 transition-transform hover:scale-105"
		>
			<ArrowDown class="size-4 text-muted-foreground" />
		</button>
	{/if}

	<div class="border-t border-border/40 bg-background/95 p-4 sm:px-6">
		{#if replyingToMessage}
			<div
				class="mb-2 flex items-center justify-between gap-3 rounded-lg border bg-background/50 px-3 py-2"
			>
				<div class="flex min-w-0 items-center gap-2">
					<Reply class="size-3.5 text-primary" />
					<div class="truncate text-xs">
						<span class="font-bold text-primary">Replying to {replyingToMessage.senderName}:</span>
						{replyingToMessage.body}
					</div>
				</div>
				<button
					onclick={() => (replyingToMessage = null)}
					class="text-muted-foreground hover:text-foreground"><X class="size-4" /></button
				>
			</div>
		{/if}

		<div
			class="flex items-end gap-2 rounded-2xl border border-border/60 bg-muted/20 px-3 py-2 transition-colors focus-within:bg-background"
		>
			<textarea
				bind:this={inputEl}
				bind:value={newMessage}
				onkeydown={handleKeydown}
				oninput={autoResizeTextarea}
				placeholder="Type a message..."
				rows={1}
				class="max-h-32 flex-1 resize-none bg-transparent p-1 text-sm outline-none"
			></textarea>
			<Button
				onclick={send}
				disabled={!newMessage.trim()}
				size="icon"
				variant="ghost"
				class="h-9 w-9 text-primary hover:bg-primary/10"
			>
				<SendHorizontal class="size-5" />
			</Button>
		</div>
	</div>
</div>

<Dialog.Root bind:open={isDeleteDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Delete message?</Dialog.Title>
			<Dialog.Description>This action cannot be undone.</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (isDeleteDialogOpen = false)}>Cancel</Button>
			<Button
				variant="destructive"
				onclick={() => {
					if (deletingMessageId) onDeleteMessage(deletingMessageId);
					isDeleteDialogOpen = false;
				}}>Delete</Button
			>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<style>
	:global(.ring-primary) {
		animation: pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1);
	}

	@keyframes pulse-ring {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}
</style>
