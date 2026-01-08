<script lang="ts">
	import { Brain, ChevronDown, ChevronRight, Code, Terminal, X, Square } from '@lucide/svelte';
	import { browser } from '$app/environment';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import type { Id } from '../../../convex/_generated/dataModel';
	import { page } from '$app/state';
	import { useChatContext } from '$lib/chat-state.svelte';

	import { tick } from 'svelte';
	import { goto } from '$app/navigation';

	const threadId = $derived(page.params.id as Id<'threads'>);

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

	// Fetch messages for selected thread
	const messagesQuery = $derived.by(() => {
		if (!threadId) return null;
		return useQuery(api.messages.list, { threadId: threadId });
	});

	const messages = $derived(messagesQuery?.data || []);

	// Auto-scroll when messages update
	$effect(() => {
		if (messages.length > 0) {
			// Accessing messages to track dependency
			messages[messages.length - 1];
			scrollToBottom();
		}
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

	// Trigger AI response for new chats
	$effect(() => {
		if (messages.length === 0) return;
		const lastMessage = messages[messages.length - 1];

		if (
			chatState.shouldTrigger &&
			messages.length > 0 &&
			lastMessage?.role === 'user' &&
			chatState.status !== 'streaming'
		) {
			chatState.shouldTrigger = false;
			triggerResponse();
		}
	});

	async function triggerResponse() {
		chatState.status = 'streaming';
		try {
			await client.action(api.chat.generate, {
				threadId,
				model: chatState.selectedModel,
				includeReasoning: chatState.includeReasoning
			});
		} catch (e: any) {
			// If status is ready, it means the user manually clicked "Stop"
			// which often triggers a 'Connection lost' or 'Action in flight' error.
			// We ignore those for a cleaner experience.
			if ((chatState.status as string) === 'ready') {
				console.log('Cognirivus: Generation stopped by user.');
			} else {
				console.error('Failed to generate response:', e);
				chatState.status = 'error';
			}
		} finally {
			if (chatState.status === 'streaming') {
				chatState.status = 'ready';
			}
		}
	}

	async function handleSubmit(event?: Event) {
		event?.preventDefault();
		if (!chatState.input.trim()) return;

		const currentInput = chatState.input;
		chatState.input = '';

		// Save user message to Convex
		await client.mutation(api.messages.send, {
			body: currentInput,
			threadId: threadId,
			role: 'user'
		});

		// Generate AI response
		triggerResponse();
		scrollToBottom();
	}

	$effect(() => {
		chatState.handleSubmit = handleSubmit;
		chatState.stopChat = async () => {
			// 1. Set local state to stop spinner
			chatState.status = 'ready';

			// 2. Find the last assistant message (the one being generated)
			const lastMessage = messages[messages.length - 1];
			if (lastMessage && lastMessage.role === 'assistant') {
				// 3. Call cancel mutation
				await client.mutation(api.messages.cancel, { messageId: lastMessage._id });
			}
		};
		chatState.viewContext = () => (viewingContextId = messages[messages.length - 1]?._id);

		// Calculate totals
		let tokens = 0;
		let promptTokens = 0;
		let completionTokens = 0;
		let cost = 0;
		for (const m of messages) {
			if (m.usage?.totalTokens) tokens += m.usage.totalTokens;
			if (m.usage?.promptTokens) promptTokens += m.usage.promptTokens;
			if (m.usage?.completionTokens) completionTokens += m.usage.completionTokens;
			if (m.cost) cost += m.cost;
		}
		chatState.totalTokens = tokens;
		chatState.totalPromptTokens = promptTokens;
		chatState.totalCompletionTokens = completionTokens;
		chatState.totalCost = cost;

		// Sync isActuallyStreaming
		if (chatState.status === 'streaming') {
			const lastMessage = messages[messages.length - 1];
			chatState.isActuallyStreaming =
				!!lastMessage &&
				lastMessage.role === 'assistant' &&
				(!!lastMessage.body || !!lastMessage.reasoning);
		} else {
			chatState.isActuallyStreaming = false;
		}
	});

	function getParts(message: any) {
		const parts = [{ type: 'text', text: message.body }];
		if (message.reasoning) {
			parts.unshift({ type: 'reasoning', text: message.reasoning });
		}
		return parts;
	}
</script>

{#if browser}
	<!-- Scrollable Message Area -->
	<div bind:this={viewport} class="flex-1 overflow-y-auto px-4">
		{#if messagesQuery?.isLoading && messages.length === 0}
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
				{#each messages as message, messageIndex (message._id)}
					{@const parts = getParts(message)}
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
											{#each parts as part}
												{#if part.type === 'reasoning'}
													<div
														class="mb-4 flex flex-col gap-2 text-sm text-zinc-500 dark:text-zinc-400"
													>
														<button
															onclick={() =>
																(expandedReasoningIds[message._id] =
																	!expandedReasoningIds[message._id])}
															class="flex items-center gap-2 font-medium transition-colors hover:text-zinc-700 dark:hover:text-zinc-300"
														>
															<Brain class="h-3.5 w-3.5" />
															<span>Reasoning</span>
															{#if expandedReasoningIds[message._id] || (messageIndex === messages.length - 1 && chatState.status === 'streaming')}
																<ChevronDown class="h-3.5 w-3.5" />
															{:else}
																<ChevronRight class="h-3.5 w-3.5" />
															{/if}
														</button>
														{#if expandedReasoningIds[message._id] || (messageIndex === messages.length - 1 && chatState.status === 'streaming')}
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
										{#each parts as part}
											{#if part.type === 'text'}
												{part.text}
											{/if}
										{/each}
									</div>
								{/if}
							</div>

							{#if message.role === 'assistant' && message.usage}
								<div class="px-1 opacity-0 transition-opacity group-hover:opacity-100">
									<div class="flex flex-col gap-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">
										<div class="flex items-center gap-2">
											<span class="font-medium text-zinc-500 dark:text-zinc-400"
												>{message.model || 'Unknown Model'}</span
											>
											<span class="text-zinc-400 dark:text-zinc-600">•</span>
											<span>{new Date(message.createdAt).toLocaleString()}</span>
										</div>
										<div class="flex items-center gap-2">
											<span>Prompt: {message.usage.promptTokens}</span>
											<span>Compl: {message.usage.completionTokens}</span>
											{#if message.cost !== undefined}
												<span class="font-medium text-zinc-600 dark:text-zinc-300">
													${message.cost.toFixed(6)}
												</span>
											{/if}
											{#if message.isCancelled || message.metadata?.cancelled}
												<div
													class="flex items-center gap-1 text-[9px] font-semibold tracking-tight text-red-500/80 uppercase"
												>
													<Square class="h-2 w-2" fill="currentColor" />
													<span>Cancelled</span>
												</div>
											{/if}
										</div>
									</div>
								</div>
							{/if}

							{#if message.role === 'user'}
								<div
									class="flex items-center justify-end gap-2 px-1 opacity-0 transition-opacity group-hover:opacity-100"
								>
									<span class="text-[10px] text-zinc-400 dark:text-zinc-500">
										{new Date(message.createdAt).toLocaleString()}
									</span>
									<button
										onclick={() => (viewingContextId = message._id)}
										class="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] font-medium text-zinc-400 transition-all hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-400"
										title="View context sent to AI"
									>
										<Terminal class="h-3 w-3" />
									</button>
								</div>
							{/if}
						</div>
					</div>
				{/each}

				{#if chatState.status === 'streaming'}
					{@const latestMessage = messages[messages.length - 1]}
					{@const showDots =
						latestMessage?.role === 'user' ||
						(latestMessage?.role === 'assistant' && !latestMessage.body)}

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
						messages
							.slice(0, messages.findIndex((m) => m._id === viewingContextId) + 1)
							.map((m) => ({
								role: m.role,
								content: m.body
							})),
						null,
						2
					)}
				</pre>
			</div>
		</div>
	</div>
{/if}
