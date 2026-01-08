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

	import MessageItem from '$lib/components/MessageItem.svelte';
	import SkeletonLoader from '$lib/components/SkeletonLoader.svelte';

	const threadId = $derived(page.params.id as Id<'threads'>);

	const client = useConvexClient();
	const chatState = useChatContext();
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
	const messagesQuery = useQuery(api.messages.list, () => ({ threadId: threadId }));

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
	const threadDetails = useQuery(api.threads.get, () => ({ id: threadId }));

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
		const lastMessage = messages[lastMessageIndex];

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

	const lastMessageIndex = $derived(messages.length - 1);

	async function triggerResponse() {
		chatState.status = 'streaming';
		try {
			await client.action(api.chat.generate, {
				threadId,
				model: chatState.selectedModel,
				includeReasoning: chatState.includeReasoning
			});
		} catch (e: any) {
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
			chatState.status = 'ready';
			const lastMessage = messages[lastMessageIndex];
			if (lastMessage && lastMessage.role === 'assistant') {
				await client.mutation(api.messages.cancel, { messageId: lastMessage._id });
			}
		};
		chatState.viewContext = () => (viewingContextId = messages[lastMessageIndex]?._id);

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
			const lastMessage = messages[lastMessageIndex];
			chatState.isActuallyStreaming =
				!!lastMessage &&
				lastMessage.role === 'assistant' &&
				(!!lastMessage.body || !!lastMessage.reasoning);
		} else {
			chatState.isActuallyStreaming = false;
		}
	});
</script>

{#if browser}
	<!-- Scrollable Message Area -->
	<div bind:this={viewport} class="flex-1 overflow-y-auto px-4 [scrollbar-gutter:stable]">
		{#if messagesQuery?.isLoading && messages.length === 0}
			<SkeletonLoader />
		{:else}
			<div class="mx-auto flex max-w-3xl flex-col space-y-8 pt-8 pb-48 md:pt-20">
				{#each messages as message, messageIndex (message._id)}
					<MessageItem
						{message}
						isLast={messageIndex === lastMessageIndex}
						isStreaming={chatState.status === 'streaming'}
						onViewContext={(id) => (viewingContextId = id)}
					/>
				{/each}

				{#if chatState.status === 'streaming'}
					{@const latestMessage = messages[lastMessageIndex]}
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
				<pre
					class="rounded-xl bg-zinc-50 p-4 break-words whitespace-pre-wrap text-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-300">
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
