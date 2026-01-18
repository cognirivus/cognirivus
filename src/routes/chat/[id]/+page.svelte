<script lang="ts">
	import { ExternalLinkIcon, X } from '@lucide/svelte';
	import { browser } from '$app/environment';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import type { Id } from '../../../convex/_generated/dataModel';
	import { page } from '$app/state';
	import { useChatContext } from '$lib/chat-state.svelte';
	import { onMount } from 'svelte';

	import { tick } from 'svelte';
	import { goto } from '$app/navigation';

	import MessageItem from '$lib/components/MessageItem.svelte';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { toast } from 'svelte-sonner';
	import HighlightToggle from '$lib/components/HighlightToggle.svelte';

	const threadId = $derived(page.params.id as Id<'threads'>);

	const client = useConvexClient();
	const chatState = useChatContext();
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
		if (mounted && threadDetails?.data === null && !threadDetails.isLoading) {
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
			// @ts-ignore - useRag might not be in generated types yet
			await client.action(api.chat.generate, {
				threadId,
				model: chatState.selectedModel,
				includeReasoning: chatState.includeReasoning,
				generateImage: chatState.generateImage,
				imageAspectRatio: chatState.generateImage ? chatState.imageAspectRatio : undefined,
				useMemory: chatState.useMemory,
				// @ts-ignore
				useRag: chatState.useRag
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
					(latestMessage?.role === 'assistant' && !latestMessage.body && !latestMessage.reasoning)}

				{#if showLoader}
					{@const status =
						latestMessage?.role === 'assistant' ? latestMessage.metadata?.status : null}
					<div class="flex w-full items-center px-2 py-4">
						{#if status === 'searching'}
							<div class="flex h-5 items-center">
								<span
									class="animate-pulse text-[10px] font-medium tracking-wide text-muted-foreground uppercase"
								>
									🔍 Searching knowledge base...
								</span>
							</div>
						{:else if status === 'highlighting'}
							<div class="flex h-5 items-center">
								<span
									class="animate-pulse text-[10px] font-medium tracking-wide text-primary uppercase"
								>
									✨ Identifying relevant segments...
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
		<Card.Root
			class="flex h-[80vh] w-full max-w-4xl animate-in flex-col shadow-2xl duration-200 zoom-in-95 fade-in"
		>
			<Card.Header class="flex flex-row items-center justify-between space-y-0 border-b px-6 py-4">
				<Card.Title class="text-sm font-semibold">
					{viewingContextMode === 'rag' ? 'Referenced Blog Sources' : 'Context Sent to AI'}
				</Card.Title>
				<Button
					variant="ghost"
					size="icon"
					onclick={() => (viewingContextId = null)}
					class="rounded-full"
				>
					<X class="h-4 w-4" />
				</Button>
			</Card.Header>
			<Card.Content class="flex-1 overflow-auto p-6 font-mono text-xs">
				{#if messages.find((m) => m._id === viewingContextId)?.metadata?.requestPayload}
					{@const payload = messages.find((m) => m._id === viewingContextId)?.metadata
						?.requestPayload}

					{#if viewingContextMode === 'rag'}
						<div class="space-y-4">
							<p class="text-sm text-muted-foreground">
								The AI used the following blog posts to generate this response:
							</p>
							{#if payload?.ragResults?.length > 0}
								<div class="grid gap-4">
									{#each payload.ragResults as entry}
										<div class="rounded-lg border bg-card p-4 shadow-sm">
											<div class="mb-2 flex items-center gap-1.5 text-sm font-bold">
												<span class="text-muted-foreground">Blog:</span>
												{#if entry.key}
													<a
														href="/blogs/{entry.key}"
														target="_blank"
														rel="noopener noreferrer"
														class="inline-flex items-center gap-1 text-primary transition-colors hover:text-primary/80 hover:underline"
													>
														{entry.title || 'Untitled'}
														<ExternalLinkIcon class="h-3.5 w-3.5 shrink-0" />
													</a>
												{:else}
													<span class="text-primary">Unknown</span>
												{/if}
											</div>
											<div class="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
												{#if entry.key === 'ai-highlights'}
													{#each entry.text.split('\n') as line}
														{@const match = line.match(/^\*\*\[(\d+)%\]\*\*\s*(.*)/)}
														{#if match}
															<div class="mb-1.5 flex items-start gap-2">
																<Badge
																	variant="secondary"
																	class="h-5 shrink-0 px-1.5 py-0 text-[10px] font-bold"
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
											{#if entry._score}
												<Badge variant="secondary" class="mt-2 text-[10px]">
													Relevance: {(entry._score * 100).toFixed(0)}%
												</Badge>
											{/if}
										</div>
									{/each}
								</div>
							{:else}
								<div class="rounded-lg bg-muted p-8 text-center text-muted-foreground">
									No blog sources were found or used for this response.
								</div>
							{/if}
						</div>
					{:else}
						<!-- PIEPLINE START -->
						<div class="space-y-6">
							<!-- Step 1: Query Formulation -->
							<div class="relative border-l-2 border-primary/20 pb-2 pl-8">
								<Badge
									class="absolute top-0 -left-[11px] flex h-5 w-5 items-center justify-center rounded-full p-0 font-bold shadow-sm"
									>1</Badge
								>
								<div class="mb-3">
									<h3 class="text-[10px] font-bold tracking-wider text-primary uppercase">
										Step 1: Standalone Query Formulation
									</h3>
									<p class="mb-3 text-[10px] text-muted-foreground italic">
										Rewriting follow-up query based on conversation history.
									</p>
									{#if payload?.memoryFormulationPayload}
										<div class="mb-3 rounded-lg border border-border/50 bg-black/5 p-3">
											<div
												class="mb-2 text-[9px] font-bold text-muted-foreground uppercase opacity-70"
											>
												Rewriter Input (LLM Prompt)
											</div>
											<div class="custom-scrollbar max-h-40 space-y-1 overflow-auto pr-2">
												{#each payload.memoryFormulationPayload as msg}
													<div class="flex gap-2 text-[9px]">
														<span class="min-w-[50px] font-bold text-primary uppercase"
															>{msg.role}:</span
														>
														<span class="break-words text-foreground/80">{msg.content}</span>
													</div>
												{/each}
											</div>
										</div>
									{/if}
									<div class="rounded-lg border border-primary/20 bg-primary/5 p-3">
										<div class="mb-1 text-[9px] font-bold text-primary uppercase opacity-70">
											Output: Interpreted Query
										</div>
										<div class="font-semibold text-foreground italic">
											"{payload?.memorySearchQuery || 'Original query used'}"
										</div>
									</div>
								</div>
							</div>

							<!-- Step 2: Memory Retrieval -->
							<div class="relative border-l-2 border-primary/20 pb-2 pl-8">
								<Badge
									class="absolute top-0 -left-[11px] flex h-5 w-5 items-center justify-center rounded-full p-0 font-bold shadow-sm"
									>2</Badge
								>
								<div>
									<h3 class="text-[10px] font-bold tracking-wider text-primary uppercase">
										Step 2: Contextual Memory Retrieval
									</h3>
									<p class="mb-3 text-[10px] text-muted-foreground italic">
										Vector search using {payload?.embeddingModel || 'qwen/qwen3-embedding-8b'}.
									</p>
									{#if payload?.retrievedMemories?.length > 0}
										<div class="space-y-2">
											<div
												class="mb-1 text-[9px] font-bold text-muted-foreground uppercase opacity-70"
											>
												Top Matches Found:
											</div>
											{#each payload.retrievedMemories as mem}
												<div
													class="flex items-start gap-2 rounded-lg border border-primary/10 bg-primary/5 p-2 text-[10px]"
												>
													<div class="flex-1 text-foreground/90">{mem.text}</div>
													<Badge
														variant="secondary"
														class="h-4 shrink-0 px-1.5 py-0 text-[8px] font-bold"
														>{(mem._score * 100).toFixed(0)}%</Badge
													>
												</div>
											{/each}
										</div>
									{:else}
										<div class="rounded-lg bg-muted p-3 text-[10px] text-muted-foreground italic">
											No relevant memories found for this query.
										</div>
									{/if}
								</div>
							</div>

							<!-- Step 2b: RAG Retrieval -->
							{#if payload?.ragResults?.length > 0}
								<div class="relative border-l-2 border-primary/20 pb-2 pl-8">
									<Badge
										class="absolute top-0 -left-[11px] flex h-5 w-5 items-center justify-center rounded-full p-0 font-bold shadow-sm"
										>2b</Badge
									>
									<div>
										<h3 class="text-[10px] font-bold tracking-wider text-primary uppercase">
											Step 2b: Blog RAG Retrieval
										</h3>
										<p class="mb-3 text-[10px] text-muted-foreground italic">
											Found relevant blog posts using vector search.
										</p>
										<div class="space-y-2">
											{#each payload.ragResults as entry}
												<div
													class="rounded-lg border border-primary/10 bg-primary/5 p-2 text-[10px]"
												>
													<div class="mb-1 flex items-center gap-1 font-bold">
														<span class="text-muted-foreground">Blog:</span>
														{#if entry.key}
															<a
																href="/blogs/{entry.key}"
																target="_blank"
																rel="noopener noreferrer"
																class="inline-flex items-center gap-0.5 text-foreground/90 transition-colors hover:text-primary hover:underline"
															>
																{entry.title || 'Untitled'}
																<ExternalLinkIcon class="h-3 w-3 shrink-0" />
															</a>
														{:else}
															<span class="text-foreground/90">Unknown</span>
														{/if}
													</div>
													<div
														class="max-h-60 overflow-y-auto whitespace-pre-wrap text-foreground/80"
													>
														{#if entry.key === 'ai-highlights'}
															<div class="space-y-1">
																{#each entry.text.split('\n') as line}
																	{@const match = line.match(/^\*\*\[(\d+)%\]\*\*\s*(.*)/)}
																	{#if match}
																		<div class="flex items-start gap-2 text-[10px]">
																			<Badge
																				variant="secondary"
																				class="h-4 shrink-0 px-1 py-0 text-[9px] font-bold"
																			>
																				{match[1]}%
																			</Badge>
																			<span>{match[2]}</span>
																		</div>
																	{:else}
																		<div class="min-h-[1em]">{line}</div>
																	{/if}
																{/each}
															</div>
														{:else}
															{entry.text}
														{/if}
													</div>
												</div>
											{/each}
										</div>
									</div>
								</div>
							{/if}

							<!-- Step 3: Final Generation -->
							<div class="relative border-l-0 pb-2 pl-8">
								<Badge
									class="absolute top-0 -left-[11px] flex h-5 w-5 animate-pulse items-center justify-center rounded-full p-0 font-bold shadow-sm"
									>3</Badge
								>
								<div>
									<h3 class="text-[10px] font-bold tracking-wider text-primary uppercase">
										Step 3: Final Response Generation
									</h3>
									<p class="mb-3 text-[10px] text-muted-foreground italic">
										Injecting memories into the system prompt for {payload?.model}.
									</p>
									{#if payload?.messages?.length > 0 && payload?.messages[0].role === 'system'}
										<div class="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
											<div class="mb-1 text-[9px] font-bold text-amber-500 uppercase opacity-70">
												Step 3a: Final System Prompt (Injected)
											</div>
											<div class="leading-relaxed whitespace-pre-wrap text-foreground">
												{payload?.messages[0].content}
											</div>
										</div>
									{/if}
									{#if payload?.messages?.length > 2}
										<div class="mb-3 rounded-lg border border-muted bg-muted/30 p-3">
											<div
												class="mb-2 text-[9px] font-bold text-muted-foreground uppercase opacity-70"
											>
												Step 3b: Conversation Context (History)
											</div>
											<div class="custom-scrollbar max-h-40 space-y-2 overflow-auto pr-2">
												{#each payload.messages.slice(1, -1) as msg}
													<div class="rounded bg-black/5 p-2 text-[9px]">
														<span class="font-bold text-muted-foreground uppercase"
															>{msg.role}:</span
														>
														<span class="text-foreground/70">{msg.content}</span>
													</div>
												{/each}
											</div>
										</div>
									{/if}
									{#if payload?.messages?.length > 1}
										<div class="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
											<div class="mb-1 text-[9px] font-bold text-blue-500 uppercase opacity-70">
												Step 3c: Final User Query
											</div>
											<div class="leading-relaxed whitespace-pre-wrap text-foreground">
												{payload?.messages[payload?.messages.length - 1].content}
											</div>
										</div>
									{/if}
								</div>
							</div>
						</div>
					{/if}
				{:else}
					<div class="rounded-lg bg-muted p-8 text-center text-muted-foreground">
						No request payload metadata found.
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>
{/if}
