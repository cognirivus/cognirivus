<script lang="ts">
	import { Chat } from '@ai-sdk/svelte';
	import { Brain, ChevronDown, ChevronRight, Code, X } from '@lucide/svelte';
	import { browser } from '$app/environment';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import type { Id } from '../../../convex/_generated/dataModel';
	import { page } from '$app/state';
	import { useChatContext } from '$lib/chat-state.svelte';

	import { tick } from 'svelte';
	import { goto } from '$app/navigation';

	const threadId = $derived(page.params.id as Id<'threads'>);
	let lastSyncedThreadId = $state<Id<'threads'> | null>(null);

	const client = useConvexClient();
	const chatState = useChatContext();
	let expandedReasoningIds = $state<Record<string, boolean>>({});
	let viewingContextId = $state<string | null>(null);
	let viewport = $state<HTMLElement>();

	const scrollToBottom = async () => {
		await tick();
		if (viewport) {
			requestAnimationFrame(() => {
				viewport?.scrollTo({
					top: viewport.scrollHeight,
					behavior: 'auto'
				});
			});
		}
	};

	// Auto-scroll when messages update
	$effect(() => {
		// This ensures we track deep changes in message parts and status changes
		chat.status;
		if (chat.messages.length > 0) {
			chat.messages[chat.messages.length - 1].parts;
			scrollToBottom();
		}
	});

	const chat = new Chat({
		onFinish: async ({ message }) => {
			if (threadId) {
				const body = message.parts
					.filter((p) => p.type === 'text')
					.map((p) => p.text)
					.join('');
				const reasoning = message.parts
					.filter((p) => p.type === 'reasoning')
					.map((p) => p.text)
					.join('');
				await client.mutation(api.messages.send, {
					body,
					reasoning: reasoning || undefined,
					threadId: threadId,
					role: 'assistant'
				});
			}
		}
	});

	// Fetch messages for selected thread
	const historicalMessages = $derived.by(() => {
		if (!threadId) return null;
		return useQuery(api.messages.list, { threadId: threadId });
	});

	// Verify thread ownership and existence
	const threadDetails = $derived.by(() => {
		if (!threadId) return null;
		return useQuery(api.threads.get, { id: threadId });
	});

	// Redirect if thread is not found or unauthorized
	$effect(() => {
		if (browser && threadDetails?.data === null && !threadDetails.isLoading) {
			console.warn('Cognirivus: Thread not found or unauthorized, redirecting...');
			goto('/chat');
		}
	});

	// Track message count to detect new messages from Convex
	let lastMessageCount = $state(0);

	// Sync historical messages to chat object
	$effect(() => {
		if (!threadId || !historicalMessages?.data) return;

		const isThreadChange = lastSyncedThreadId !== threadId;
		const hasNewMessages = historicalMessages.data.length !== lastMessageCount;
		const isLocallyStreaming = chat.status === 'streaming' || chat.status === 'submitted';

		// Sync history when thread changes OR new remote messages arrive
		if (isThreadChange || (hasNewMessages && !isLocallyStreaming)) {
			chat.messages = historicalMessages.data.map((m) => {
				const parts: any[] = [{ type: 'text', text: m.body }];
				if (m.reasoning) {
					parts.unshift({ type: 'reasoning', text: m.reasoning });
				}
				return {
					id: m._id,
					role: m.role,
					content: m.body, // Added for compatibility
					parts
				};
			});
			lastSyncedThreadId = threadId;
			lastMessageCount = historicalMessages.data.length;
			scrollToBottom();
		}
	});

	// Trigger AI response for new chats
	$effect(() => {
		const lastMessage = chat.messages[chat.messages.length - 1];
		if (
			chatState.shouldTrigger &&
			chat.messages.length > 0 &&
			lastMessage?.role === 'user' &&
			chat.status === 'ready'
		) {
			console.log('Cognirivus: Found new chat trigger, initializing AI response...');
			chatState.shouldTrigger = false;

			const options = {
				body: {
					model: chatState.selectedModel,
					includeReasoning: chatState.includeReasoning
				}
			};

			// Use regenerate() as confirmed by user, casting to any for type safety
			const chatAny = chat as any;
			if (typeof chatAny.regenerate === 'function') {
				chatAny.regenerate(options);
			} else if (typeof chatAny.reload === 'function') {
				chatAny.reload(options);
			} else {
				console.error('Cognirivus: No suitable AI trigger method found on chat object');
			}
		}
	});

	async function handleSubmit(event?: Event) {
		event?.preventDefault();
		if (!chatState.input.trim()) return;

		const currentInput = chatState.input;
		chatState.input = '';

		// Save user message to Convex
		client.mutation(api.messages.send, {
			body: currentInput,
			threadId: threadId,
			role: 'user'
		});

		// Send to AI
		chat.sendMessage(
			{ text: currentInput },
			{
				body: {
					model: chatState.selectedModel,
					includeReasoning: chatState.includeReasoning
				}
			}
		);
		scrollToBottom();
	}

	$effect(() => {
		chatState.handleSubmit = handleSubmit;
		chatState.stopChat = () => chat.stop();
		chatState.viewContext = () => (viewingContextId = chat.messages[chat.messages.length - 1]?.id);
	});
</script>

{#if browser}
	<!-- Scrollable Message Area -->
	<div bind:this={viewport} class="flex-1 overflow-y-auto px-4">
		{#if historicalMessages?.isLoading && chat.messages.length === 0}
			<div class="flex h-full items-center justify-center">
				<div class="flex flex-col items-center gap-4">
					<div
						class="h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-800 dark:border-zinc-800 dark:border-t-zinc-200"
					></div>
					<div class="animate-pulse text-sm text-zinc-500 dark:text-zinc-400">
						Initializing chat...
					</div>
				</div>
			</div>
		{:else}
			<div class="mx-auto flex max-w-3xl flex-col space-y-8 pt-20 pb-48">
				{#each chat.messages as message, messageIndex (message.id)}
					<div
						class="group flex w-full {message.role === 'user' ? 'justify-end' : 'justify-start'}"
					>
						<div class="flex flex-col gap-1">
							<div
								class="{message.role === 'user'
									? 'rounded-2xl rounded-tr-sm bg-zinc-900 px-5 py-3 text-zinc-50 shadow-md dark:bg-zinc-100 dark:text-zinc-900'
									: 'bg-transparent px-1 py-1 text-zinc-800 dark:text-zinc-200'} text-[0.95rem] leading-relaxed"
							>
								{#if message.role === 'assistant'}
									<div class="flex items-start gap-3">
										<div
											class="prose prose-zinc dark:prose-invert prose-headings:font-semibold prose-p:leading-7 max-w-none"
										>
											{#each message.parts as part}
												{#if part.type === 'reasoning'}
													<div
														class="mb-4 flex flex-col gap-2 text-sm text-zinc-500 dark:text-zinc-400"
													>
														<button
															onclick={() =>
																(expandedReasoningIds[message.id] =
																	!expandedReasoningIds[message.id])}
															class="flex items-center gap-2 font-medium transition-colors hover:text-zinc-700 dark:hover:text-zinc-300"
														>
															<Brain class="h-3.5 w-3.5" />
															<span>Reasoning</span>
															{#if expandedReasoningIds[message.id] || (messageIndex === chat.messages.length - 1 && chat.status === 'streaming')}
																<ChevronDown class="h-3.5 w-3.5" />
															{:else}
																<ChevronRight class="h-3.5 w-3.5" />
															{/if}
														</button>
														{#if expandedReasoningIds[message.id] || (messageIndex === chat.messages.length - 1 && chat.status === 'streaming')}
															<div
																class="ml-1.5 border-l-2 border-zinc-200 py-1 pl-4 whitespace-pre-wrap text-zinc-600 italic dark:border-zinc-800 dark:text-zinc-400"
															>
																{part.text}
															</div>
														{/if}
													</div>
												{:else if part.type === 'text'}
													<div>{part.text}</div>
												{/if}
											{/each}
										</div>
									</div>
								{:else}
									<div class="whitespace-pre-wrap">
										{#each message.parts as part}
											{#if part.type === 'text'}
												{part.text}
											{/if}
										{/each}
									</div>
								{/if}
							</div>

							{#if message.role === 'user'}
								<div class="flex justify-end px-1">
									<button
										onclick={() => (viewingContextId = message.id)}
										class="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] font-medium text-zinc-400 opacity-0 transition-all group-hover:opacity-100 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-400"
										title="View context sent to AI"
									>
										<Code class="h-3 w-3" />
									</button>
								</div>
							{/if}
						</div>
					</div>
				{/each}

				{#if chat.status === 'streaming' || chat.status === 'submitted'}
					{@const latestMessage = chat.messages[chat.messages.length - 1]}
					{@const showDots =
						latestMessage?.role === 'user' ||
						(latestMessage?.role === 'assistant' &&
							!latestMessage.parts.some((p: any) => p.text?.trim() || p.type === 'reasoning'))}
					{#if showDots}
						<div
							class="flex w-full animate-in justify-start duration-300 fade-in slide-in-from-bottom-2"
						>
							<div class="flex items-center gap-2 px-2 py-6">
								<div class="flex gap-2">
									<div
										class="h-2 w-2 animate-bounce rounded-full bg-zinc-400 dark:bg-zinc-600"
									></div>
									<div
										class="h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:0.2s] dark:bg-zinc-600"
									></div>
									<div
										class="h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:0.4s] dark:bg-zinc-600"
									></div>
								</div>
							</div>
						</div>
					{/if}
				{/if}
			</div>
		{/if}
	</div>
{/if}

{#if viewingContextId}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/20 p-4 backdrop-blur-sm dark:bg-zinc-950/50"
	>
		<div
			class="flex h-[80vh] w-full max-w-4xl animate-in flex-col rounded-2xl border border-zinc-200 bg-white shadow-2xl duration-200 zoom-in-95 fade-in dark:border-zinc-800 dark:bg-zinc-900"
		>
			<div
				class="flex items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-800"
			>
				<h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Context Sent to AI</h3>
				<button
					onclick={() => (viewingContextId = null)}
					class="rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
				>
					<X class="h-4 w-4" />
				</button>
			</div>
			<div class="flex-1 overflow-auto p-6 font-mono text-xs">
				<pre class="rounded-xl bg-zinc-50 p-4 text-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-300">
{JSON.stringify(
						chat.messages
							.slice(0, chat.messages.findIndex((m) => m.id === viewingContextId) + 1)
							.map((m) => ({
								role: m.role,
								content: m.parts
									.filter((p) => p.type === 'text')
									.map((p) => p.text)
									.join('')
							})),
						null,
						2
					)}
				</pre>
			</div>
		</div>
	</div>
{/if}
