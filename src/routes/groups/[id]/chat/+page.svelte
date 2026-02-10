<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { page } from '$app/state';
	import { tick } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { SendHorizontal, MessageSquare, ArrowDown } from '@lucide/svelte';
	import type { Id } from '$convex/_generated/dataModel';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';

	const groupId = $derived(page.params.id as Id<'groups'>);
	const client = useConvexClient();

	const currentUser = $derived(page.data.currentUser as any);
	const currentUserId = $derived(currentUser?.id ?? currentUser?._id);

	let newMessage = $state('');
	let scrollContainer: HTMLElement | null = $state(null);
	let showScrollButton = $state(false);
	let inputEl: HTMLTextAreaElement | null = $state(null);

	const messagesQuery = useQuery((api as any).group_chat.getMessages, () =>
		groupId ? { groupId } : 'skip'
	);
	const messages = $derived(messagesQuery.data ?? []);

	function groupMessagesByDate(msgs: any[]) {
		const groups: { label: string; messages: any[] }[] = [];
		let currentLabel = '';

		for (const msg of msgs) {
			const date = new Date(msg.createdAt);
			const today = new Date();
			const yesterday = new Date(today);
			yesterday.setDate(yesterday.getDate() - 1);

			let label: string;
			if (date.toDateString() === today.toDateString()) {
				label = 'Today';
			} else if (date.toDateString() === yesterday.toDateString()) {
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

	function isConsecutive(msgs: any[], index: number) {
		if (index === 0) return false;
		const prev = msgs[index - 1];
		const curr = msgs[index];
		return (
			prev.userId === curr.userId && curr.createdAt - prev.createdAt < 120000
		);
	}

	async function sendMessage() {
		if (!newMessage.trim() || !groupId) return;
		const body = newMessage.trim();
		newMessage = '';
		resetTextareaHeight();
		try {
			await client.mutation((api as any).group_chat.sendMessage, {
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
			second: '2-digit'
		});
	}

	function getInitials(name: string) {
		return name
			?.split(' ')
			.map((n: string) => n.charAt(0).toUpperCase())
			.join('')
			.slice(0, 2) || '?';
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
</script>

<div class="flex h-full flex-col">
	<!-- Messages Area -->
	<div
		bind:this={scrollContainer}
		onscroll={handleScroll}
		class="relative flex-1 overflow-y-auto"
	>
		{#if messagesQuery.isLoading}
			<div class="flex h-full items-center justify-center">
				<Loader variant="circular" size="lg" />
			</div>
		{:else if messages.length === 0}
			<div
				class="flex h-full flex-col items-center justify-center px-6 text-center"
			>
				<div
					class="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/60"
				>
					<MessageSquare class="h-7 w-7 text-muted-foreground/60" />
				</div>
				<h3 class="text-base font-semibold text-foreground">
					Start the conversation
				</h3>
				<p
					class="mt-1.5 max-w-[280px] text-[13px] leading-relaxed text-muted-foreground"
				>
					Be the first to send a message to your group.
				</p>
			</div>
		{:else}
			<div class="mx-auto max-w-3xl px-4 py-4 sm:px-6">
				{#each groupedMessages as group}
					<!-- Date Separator -->
					<div class="sticky top-0 z-10 flex justify-center py-3">
						<span
							class="rounded-full bg-background/90 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm ring-1 ring-border/50 backdrop-blur-sm"
						>
							{group.label}
						</span>
					</div>

					{#each group.messages as msg, i (msg._id)}
						{@const isMine = msg.userId === currentUserId}
						{@const consecutive = isConsecutive(group.messages, i)}
						{@const showAvatar = !isMine && !consecutive}
						{@const showName = !isMine && !consecutive}

						<div
							class="flex {isMine ? 'justify-end' : 'justify-start'} {consecutive ? 'mt-0.5' : 'mt-3'}"
						>
							<div
								class="flex max-w-[75%] gap-2 {isMine
									? 'flex-row-reverse'
									: 'flex-row'} items-end"
							>
								<!-- Avatar -->
								{#if !isMine}
									<div class="w-7 shrink-0">
										{#if showAvatar}
											{#if msg.userImage}
												<img
													src={msg.userImage}
													alt={msg.userName}
													class="h-7 w-7 rounded-full object-cover ring-2 ring-background"
												/>
											{:else}
												<div
													class="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ring-background {getAvatarColor(msg.userId)}"
												>
													{getInitials(msg.userName)}
												</div>
											{/if}
										{/if}
									</div>
								{/if}

								<!-- Bubble -->
								<div
									class="flex flex-col {isMine
										? 'items-end'
										: 'items-start'}"
								>
									{#if showName}
										<span
											class="mb-1 px-2 text-[11px] font-medium text-muted-foreground"
										>
											{msg.userName}
										</span>
									{/if}
									<div class="group relative">
										<div
											class="whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed
											{isMine
												? consecutive
													? 'rounded-2xl'
													: 'rounded-br-md'
												: consecutive
													? 'rounded-2xl'
													: 'rounded-bl-md'}
											{isMine
												? 'bg-primary text-primary-foreground'
												: 'bg-muted/70 text-foreground'}"
										>
											{msg.body}
										</div>
										<span
											class="mt-0.5 block px-1 text-[10px] text-muted-foreground/50 {isMine
												? 'text-right'
												: 'text-left'}"
										>
											{formatTime(msg.createdAt)}
										</span>
									</div>
								</div>
							</div>
						</div>
					{/each}
				{/each}

				<!-- Bottom spacer -->
				<div class="h-2"></div>
			</div>
		{/if}

		<!-- Scroll to bottom FAB -->
		{#if showScrollButton}
			<button
				onclick={scrollToBottom}
				class="absolute bottom-4 left-1/2 z-20 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full bg-background shadow-lg ring-1 ring-border/60 transition-all hover:scale-105 hover:shadow-xl active:scale-95"
			>
				<ArrowDown class="h-4 w-4 text-muted-foreground" />
			</button>
		{/if}
	</div>

	<!-- Input Area -->
	<div class="border-t bg-background/80 px-4 py-3 backdrop-blur-sm">
		<div class="mx-auto flex max-w-3xl items-end gap-2">
			<div
				class="flex min-h-[44px] flex-1 items-end rounded-xl border border-border/60 bg-muted/30 transition-colors focus-within:border-primary/30 focus-within:bg-muted/40"
			>
				<textarea
					bind:this={inputEl}
					bind:value={newMessage}
					onkeydown={handleKeydown}
					oninput={autoResizeTextarea}
					placeholder="Write a message..."
					rows={1}
					class="max-h-32 w-full resize-none bg-transparent px-4 py-2.5 text-[13.5px] leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
				></textarea>
			</div>
			<Button
				onclick={sendMessage}
				disabled={!newMessage.trim()}
				size="icon"
				class="h-[44px] w-[44px] shrink-0 rounded-xl transition-all {newMessage.trim()
					? 'bg-primary shadow-md hover:shadow-lg'
					: ''}"
			>
				<SendHorizontal class="h-[18px] w-[18px]" />
			</Button>
		</div>
	</div>
</div>
