<script lang="ts">
	import { X, FileText, ExternalLink as ExternalLinkIcon } from '@lucide/svelte';
	import { browser } from '$app/environment';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import type { Id } from '../../../convex/_generated/dataModel';
	import { page } from '$app/state';
	import { useChatContext } from '$lib/chat-state.svelte';
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';

	import MessageItem from '$lib/components/MessageItem.svelte';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Terminal, CheckCircle2, Layers, Search, Database, Sparkles } from '@lucide/svelte';
	import LLMTraceView from '$lib/components/LLMTraceView.svelte';
	import HighlightToggle from '$lib/components/HighlightToggle.svelte';

	const chatState = useChatContext();
	const client = useConvexClient();
	const threadId = $derived(page.params.id as Id<'threads'>);

	let viewingContextId = $state<string | null>(null);
	let viewingContextMode = $state<'full' | 'rag'>('full');
	let viewport = $state<HTMLElement>();
	let mounted = $state(false);

	onMount(() => {
		mounted = true;
	});

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

	// Consolidated context query for faster initial load
	const contextQuery = useQuery(api.threads.getContext, () => ({ id: threadId }));
	const threadDetails = $derived(contextQuery?.data?.thread);

	// Fetch messages for selected thread (paginated)
	let numItems = $state(50);
	const messagesQuery = useQuery(api.messages.list, () => ({
		threadId: threadId,
		paginationOpts: { numItems, cursor: null }
	}));

	const messages = $derived(
		contextQuery?.data?.messages && !messagesQuery?.data
			? contextQuery.data.messages
			: [...(messagesQuery?.data?.page || [])].reverse()
	);

	// Auto-scroll when messages update
	$effect(() => {
		if (messages.length > 0) {
			// Accessing messages to track dependency
			messages[messages.length - 1];
			scrollToBottom();
		}
	});

	// Redirect if thread is not found or unauthorized
	$effect(() => {
		if (mounted && contextQuery?.data === null && !contextQuery.isLoading) {
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
			// Chat generation with integrated multi-agent routing
			await client.action(api.chat.generate, {
				threadId,
				model: chatState.selectedModel,
				includeReasoning: chatState.includeReasoning,
				generateImage: chatState.generateImage,
				imageAspectRatio: chatState.generateImage ? chatState.imageAspectRatio : undefined,
				useMemory: chatState.useMemory,
				useRag: chatState.useRag,
				useWebSearch: chatState.useWebSearch
			});
		} catch (e: any) {
			if ((chatState.status as string) === 'ready') {
				console.log('Cognirivus: Generation stopped by user.');
			} else {
				console.error('Failed to generate response:', e);
				toast.error('Failed to generate response. Please try again.');
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
		chatState.viewContext = () => {
			viewingContextId = messages[lastMessageIndex]?._id;
			viewingContextMode = 'full';
		};

		// Sync totals from backend thread metadata
		chatState.totalTokens = threadDetails?.totalTokens || 0;
		chatState.totalPromptTokens = threadDetails?.totalPromptTokens || 0;
		chatState.totalCompletionTokens = threadDetails?.totalCompletionTokens || 0;
		chatState.totalCost = threadDetails?.totalCost || 0;

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

<!-- Top right fixed -->
<div class="fixed top-10 right-1 z-50 flex items-center md:top-2 md:right-12">
	<HighlightToggle />
</div>
<!-- Scrollable Message Area -->
<div bind:this={viewport} class="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
	{#if messagesQuery?.isLoading && messages.length === 0}
		<div class="flex h-full items-center justify-center">
			<Loader variant="circular" size="lg" />
		</div>
	{:else}
		<div class="mx-auto flex max-w-3xl flex-col space-y-8 px-4 pt-16 pb-48 md:px-0 md:pt-20">
			{#if messagesQuery?.data && !messagesQuery.data.isDone}
				<div class="flex justify-center pt-4">
					<Button
						variant="ghost"
						size="sm"
						class="text-xs text-muted-foreground"
						onclick={() => (numItems += 50)}
					>
						Load older messages
					</Button>
				</div>
			{/if}

			{#each messages as message, messageIndex (message._id)}
				<MessageItem
					{message}
					isLast={messageIndex === lastMessageIndex}
					isStreaming={chatState.status === 'streaming'}
					onViewContext={(id: string, mode: 'full' | 'rag') => {
						viewingContextId = id;
						viewingContextMode = mode;
					}}
				/>
			{/each}

			{#if chatState.status === 'streaming'}
				{@const latestMessage = messages[lastMessageIndex]}
				{@const showLoader =
					latestMessage?.role === 'user' ||
					(latestMessage?.role === 'assistant' &&
						!latestMessage.body &&
						!latestMessage.reasoning &&
						!latestMessage.metadata?.agentWork?.agentResponse)}

				{#if showLoader}
					{@const status =
						latestMessage?.role === 'assistant' ? latestMessage.metadata?.status : null}
					<div class="flex w-full items-center px-4 py-6">
						{#if status === 'searching'}
							<div class="flex h-6 items-center gap-2 rounded-full bg-muted/50 px-3">
								<span class="relative flex h-2 w-2">
									<span
										class="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"
									></span>
									<span class="relative inline-flex h-2 w-2 rounded-full bg-primary"></span>
								</span>
								<span
									class="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase"
								>
									Searching knowledge base...
								</span>
							</div>
						{:else if status === 'highlighting'}
							<div class="flex h-6 items-center gap-2 rounded-full bg-primary/5 px-3">
								<span class="relative flex h-2 w-2">
									<span
										class="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"
									></span>
									<span class="relative inline-flex h-2 w-2 rounded-full bg-primary"></span>
								</span>
								<span class="text-[10px] font-semibold tracking-wide text-primary uppercase">
									Identifying relevant segments...
								</span>
							</div>
						{:else}
							<Loader variant="typing" />
						{/if}
					</div>
				{/if}
			{/if}
		</div>
	{/if}
</div>

{#if viewingContextId}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
	>
		<div
			class="flex h-[85vh] w-full max-w-4xl animate-in flex-col overflow-hidden rounded-xl border bg-card shadow-2xl duration-200 zoom-in-95 fade-in"
		>
			<div class="flex flex-row items-center justify-between border-b px-6 py-4">
				{#if messages.find((m) => m._id === viewingContextId)}
					{@const selectedMessage = messages.find((m) => m._id === viewingContextId)}
					<h3 class="text-sm font-semibold">
						{#if viewingContextMode === 'rag'}
							Referenced Sources
						{:else if selectedMessage?.metadata?.agentWork?.llmCalls?.length > 0}
							Agent Execution Trace
						{:else}
							Context Sent to AI
						{/if}
					</h3>
				{:else}
					<h3 class="text-sm font-semibold">
						{viewingContextMode === 'rag' ? 'Referenced Sources' : 'Context Sent to AI'}
					</h3>
				{/if}
				<Button
					variant="ghost"
					size="icon"
					onclick={() => (viewingContextId = null)}
					class="h-8 w-8 rounded-full"
				>
					<X class="h-4 w-4" />
				</Button>
			</div>
			<div class="flex-1 overflow-auto p-6 font-mono text-xs">
				{#if messages.find((m) => m._id === viewingContextId)}
					{@const selectedMessage = messages.find((m) => m._id === viewingContextId)!}
					{#if viewingContextMode === 'rag'}
						<div class="space-y-6">
							<p class="text-sm text-muted-foreground">
								The AI used the following knowledge sources to generate this response:
							</p>
							{#if selectedMessage.metadata?.requestPayload?.ragResults?.length > 0}
								<div class="grid gap-4">
									{#each selectedMessage.metadata.requestPayload.ragResults as entry}
										<div
											class="rounded-xl border bg-card p-5 shadow-sm transition-all hover:border-primary/20"
										>
											<div class="mb-3 flex items-center gap-2 text-sm font-semibold">
												<span
													class="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
													>SOURCE</span
												>
												{#if entry.key}
													<a
														href="/blogs/{entry.key}"
														target="_blank"
														rel="noopener noreferrer"
														class="inline-flex items-center gap-1 text-primary transition-colors hover:text-primary/80 hover:underline"
													>
														{entry.title || 'Untitled Source'}
														<ExternalLinkIcon class="h-3.5 w-3.5 shrink-0" />
													</a>
												{:else}
													<span class="text-foreground">Unknown Source</span>
												{/if}
												{#if entry._score}
													<Badge variant="secondary" class="ml-auto text-[10px] font-medium">
														{(entry._score * 100).toFixed(0)}% Match
													</Badge>
												{/if}
											</div>
											<div
												class="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground"
											>
												{#if entry.key === 'ai-highlights'}
													{#each entry.text.split('\n') as line}
														{@const match = line.match(/^\*\*\[(\d+)%\]\*\*\s*(.*)/)}
														{#if match}
															<div class="mb-2 flex items-start gap-2 rounded-lg bg-muted/30 p-2">
																<Badge
																	variant="outline"
																	class="h-5 shrink-0 border-primary/20 bg-primary/5 px-1.5 py-0 text-[10px] font-bold text-primary"
																>
																	{match[1]}%
																</Badge>
																<span>{match[2]}</span>
															</div>
														{:else}
															<div class="min-h-[1em]">{line}</div>
														{/if}
													{/each}
												{:else}
													{entry.text}
												{/if}
											</div>
										</div>
									{/each}
								</div>
							{:else}
								<div
									class="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center"
								>
									<p class="text-muted-foreground">
										No specific sources were retrieved for this response.
									</p>
								</div>
							{/if}
						</div>
					{:else if selectedMessage.metadata?.agentWork?.llmCalls?.length > 0}
						<!-- AGENT TRACE VIEW -->
						<div class="space-y-6 font-sans">
							<div class="flex items-center gap-3 border-b pb-4">
								<div
									class="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary"
								>
									<Layers class="h-5 w-5" />
								</div>
								<div>
									<h2 class="text-lg font-bold text-foreground">Multi-Agent Execution Trace</h2>
									<p class="text-xs text-muted-foreground">
										Detailed step-by-step reasoning and tool usage for this response.
									</p>
								</div>
							</div>

							<LLMTraceView
								llmCalls={selectedMessage.metadata.agentWork.llmCalls}
								toolExecutions={selectedMessage.metadata.agentWork.toolExecutions}
							/>
						</div>
					{:else if selectedMessage.metadata?.requestPayload}
						<!-- LEGACY PIPELINE VIEW -->
						{@const payload = selectedMessage.metadata.requestPayload}
						<div class="space-y-8">
							<!-- Step 1: Query Formulation -->
							<div class="relative border-l-2 border-primary/20 pb-4 pl-8">
								<div
									class="absolute top-0 -left-[11px] flex h-5 w-5 items-center justify-center rounded-full border-2 border-primary bg-background text-[10px] font-bold text-primary shadow-sm"
								>
									1
								</div>

								<div class="space-y-3">
									<div>
										<h3 class="text-xs font-bold tracking-wider text-primary uppercase">
											Query Reformulation
										</h3>
										<p class="text-[10px] text-muted-foreground">
											Rewriting user query to be standalone based on chat history.
										</p>
									</div>

									<div class="rounded-lg border bg-card p-4">
										<div
											class="mb-2 text-[10px] font-bold text-muted-foreground uppercase opacity-70"
										>
											Interpreted Intent
										</div>
										<div class="text-sm font-medium text-foreground">
											"{payload?.memorySearchQuery || 'Original query used'}"
										</div>
									</div>
								</div>
							</div>

							<!-- Step 2: Retrieval -->
							<div class="relative border-l-2 border-primary/20 pb-4 pl-8">
								<div
									class="absolute top-0 -left-[11px] flex h-5 w-5 items-center justify-center rounded-full border-2 border-primary bg-background text-[10px] font-bold text-primary shadow-sm"
								>
									2
								</div>

								<div class="space-y-3">
									<div>
										<h3 class="text-xs font-bold tracking-wider text-primary uppercase">
											Context Retrieval
										</h3>
										<p class="text-[10px] text-muted-foreground">
											Vector search using {payload?.embeddingModel || 'qwen/qwen3-embedding-8b'}.
										</p>
									</div>

									{#if payload?.retrievedMemories?.length > 0}
										<div class="space-y-2">
											<div class="text-[10px] font-bold text-muted-foreground uppercase opacity-70">
												User Memories Found
											</div>
											{#each payload.retrievedMemories as mem}
												<div class="flex items-start gap-3 rounded-lg border bg-card p-3 text-xs">
													<div class="flex-1 text-muted-foreground">{mem.text}</div>
													<Badge variant="secondary" class="shrink-0 px-1.5 py-0 text-[9px]"
														>{(mem._score * 100).toFixed(0)}%</Badge
													>
												</div>
											{/each}
										</div>
									{/if}

									{#if payload?.ragResults?.length > 0}
										<div class="space-y-2 pt-2">
											<div class="text-[10px] font-bold text-muted-foreground uppercase opacity-70">
												Knowledge Base Articles
											</div>
											{#each payload.ragResults.slice(0, 3) as entry}
												<div
													class="flex items-center justify-between rounded-lg border bg-card p-2 px-3 text-xs"
												>
													<span class="truncate font-medium"
														>{entry.title || 'Untitled Article'}</span
													>
													<Badge variant="outline" class="ml-2 shrink-0 px-1.5 py-0 text-[9px]">
														{(entry._score * 100).toFixed(0)}%
													</Badge>
												</div>
											{/each}
											{#if payload.ragResults.length > 3}
												<div class="pl-1 text-[10px] text-muted-foreground italic">
													+ {payload.ragResults.length - 3} more sources...
												</div>
											{/if}
										</div>
									{/if}
								</div>
							</div>

							<!-- Step 3: Final Generation -->
							<div class="relative border-l-0 pl-8">
								<div
									class="absolute top-0 -left-[11px] flex h-5 w-5 animate-pulse items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-sm"
								>
									3
								</div>

								<div class="space-y-3">
									<div>
										<h3 class="text-xs font-bold tracking-wider text-primary uppercase">
											Response Generation
										</h3>
										<p class="text-[10px] text-muted-foreground">
											Synthesizing final answer with {payload?.model}.
										</p>
									</div>

									{#if payload?.messages?.length > 0 && payload?.messages[0].role === 'system'}
										<div class="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
											<div class="mb-2 text-[10px] font-bold text-amber-600 uppercase opacity-70">
												System Prompt (Injected)
											</div>
											<div
												class="max-h-40 overflow-y-auto text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground"
											>
												{payload?.messages[0].content}
											</div>
										</div>
									{/if}
								</div>
							</div>
						</div>
					{/if}
				{:else}
					<div class="flex flex-col items-center justify-center py-20 text-center">
						<div class="mb-4 rounded-full bg-muted p-4">
							<FileText class="h-8 w-8 text-muted-foreground opacity-50" />
						</div>
						<p class="text-muted-foreground">No debug metadata available for this message.</p>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
