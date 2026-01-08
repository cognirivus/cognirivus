<script lang="ts">
	import { Brain, ChevronDown, Square, SendHorizontal, Code } from '@lucide/svelte';
	import { useChatContext } from '$lib/chat-state.svelte';
	import { onMount } from 'svelte';

	const chatState = useChatContext();

	let {
		input = $bindable(),
		handleSubmit,
		chatStatus = 'idle',
		stopChat,
		models = [],
		selectedModel = $bindable(),
		includeReasoning = $bindable(),
		viewContext = null,
		totalTokens = 0,
		totalPromptTokens = 0,
		totalCompletionTokens = 0,
		totalCost = 0,
		isActuallyStreaming = false
	} = $props();

	let showModelSelector = $state(false);
	let showTokenDetail = $state(false);
	let container: HTMLElement;

	onMount(() => {
		const handleClick = (e: MouseEvent) => {
			if (showModelSelector && container && !container.contains(e.target as Node)) {
				showModelSelector = false;
			}
		};
		window.addEventListener('click', handleClick);
		return () => window.removeEventListener('click', handleClick);
	});
</script>

<div
	class="pointer-events-none fixed right-0 bottom-0 left-0 z-20 px-4 pt-8 pb-4 transition-all duration-300 {chatState.isSidebarOpen
		? 'md:left-64'
		: 'md:left-0'}"
>
	<div
		class="pointer-events-none absolute inset-0 bg-gradient-to-t from-zinc-50 via-zinc-50/95 to-transparent dark:from-zinc-950 dark:via-zinc-950/95"
	></div>
	<form onsubmit={handleSubmit} class="pointer-events-auto relative mx-auto max-w-3xl">
		<div
			class="flex flex-col rounded-2xl border border-zinc-200 bg-white/70 shadow-sm backdrop-blur-md transition-all focus-within:border-zinc-400 focus-within:ring-1 focus-within:ring-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/80 dark:focus-within:border-zinc-600 dark:focus-within:ring-zinc-600"
		>
			<textarea
				class="min-h-[80px] w-full resize-none border-0 bg-transparent px-4 pt-4 pb-2 text-sm text-zinc-900 placeholder-zinc-500 focus:ring-0 focus:outline-none dark:text-zinc-100 dark:placeholder-zinc-400"
				bind:value={input}
				placeholder="What can I help you with?"
				rows="2"
				onkeydown={(e) => {
					if (e.key === 'Enter' && !e.shiftKey) {
						e.preventDefault();
						if (input.trim()) handleSubmit(e);
					}
				}}
			></textarea>

			<div class="flex items-center justify-between gap-3 px-3 pb-3">
				<!-- Left Tools -->
				<div class="flex flex-1 items-center gap-1.5">
					<button
						type="button"
						onclick={() => (includeReasoning = !includeReasoning)}
						class="flex h-8 w-8 items-center justify-center rounded-lg transition-colors {includeReasoning
							? 'bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900'
							: 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'}"
						title="Toggle Reasoning"
					>
						<Brain class="h-4 w-4 {includeReasoning ? 'fill-current' : ''}" />
					</button>

					<div class="h-4 w-[1px] bg-zinc-200 dark:bg-zinc-800"></div>

					<div class="relative flex items-center" bind:this={container}>
						<button
							type="button"
							onclick={() => (showModelSelector = !showModelSelector)}
							class="flex max-w-[120px] items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
						>
							<span class="truncate">{models.find((m) => m.id === selectedModel)?.name}</span>
							<ChevronDown class="h-3 w-3 flex-shrink-0" />
						</button>

						{#if showModelSelector}
							<div
								class="absolute bottom-full left-0 z-50 mb-2 w-56 overflow-hidden rounded-xl border border-zinc-200 bg-white p-1 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
							>
								{#each models as model}
									<button
										type="button"
										onclick={() => {
											selectedModel = model.id;
											showModelSelector = false;
										}}
										class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[11px] font-medium transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800 {selectedModel ===
										model.id
											? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
											: 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'}"
									>
										<span>{model.name}</span>
									</button>
								{/each}
							</div>
						{/if}
					</div>

					{#if viewContext}
						<div class="h-4 w-[1px] bg-zinc-200 dark:bg-zinc-800"></div>
						<button
							type="button"
							onclick={viewContext}
							class="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
							title="View Context"
						>
							<Code class="h-4 w-4" />
						</button>
					{/if}
				</div>

				<!-- Right Actions & Stats -->
				<div class="flex items-center gap-3">
					{#if totalTokens > 0 || totalCost > 0}
						<div
							class="flex flex-col items-end gap-0.5 text-[9px] font-semibold tracking-tight text-zinc-400 sm:flex-row sm:items-center sm:gap-2 sm:text-[10px] dark:text-zinc-500"
						>
							{#if totalTokens > 0}
								<div
									class="relative flex cursor-help items-center gap-1 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
									onmouseenter={() => (showTokenDetail = true)}
									onmouseleave={() => (showTokenDetail = false)}
								>
									<span
										>{totalTokens.toLocaleString()}
										<span class="hidden sm:inline">tokens</span></span
									>
									{#if showTokenDetail}
										<div
											class="absolute right-0 bottom-full z-50 mb-3 w-48 overflow-hidden rounded-xl border border-zinc-200 bg-white/95 p-3 shadow-xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/95"
										>
											<div
												class="mb-2 text-[10px] font-bold tracking-wider text-zinc-400 uppercase"
											>
												Session Usage
											</div>
											<div class="space-y-1.5 text-xs">
												<div class="flex justify-between">
													<span class="text-zinc-500">Prompt</span>
													<span class="font-medium text-zinc-900 dark:text-zinc-100"
														>{totalPromptTokens.toLocaleString()}</span
													>
												</div>
												<div class="flex justify-between">
													<span class="text-zinc-500">Completions</span>
													<span class="font-medium text-zinc-900 dark:text-zinc-100"
														>{totalCompletionTokens.toLocaleString()}</span
													>
												</div>
												<div class="my-1 h-[1px] bg-zinc-100 dark:bg-zinc-800"></div>
												<div class="flex justify-between font-bold">
													<span class="text-zinc-700 dark:text-zinc-300">Net Cost</span>
													<span class="text-zinc-900 dark:text-zinc-100"
														>${totalCost.toFixed(6)}</span
													>
												</div>
											</div>
										</div>
									{/if}
								</div>
							{/if}
							{#if totalCost > 0}
								<span class="hidden text-zinc-300 sm:inline dark:text-zinc-700">|</span>
								<span class="font-bold text-zinc-500 dark:text-zinc-400"
									>${totalCost.toFixed(6)}</span
								>
							{/if}
						</div>
					{/if}

					{#if chatStatus === 'streaming'}
						<button
							type="button"
							onclick={stopChat}
							class="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 text-zinc-900 transition-all hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-700"
						>
							{#if isActuallyStreaming}
								<Square class="h-4 w-4" fill="currentColor" />
							{:else}
								<div
									class="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-800 dark:border-zinc-700 dark:border-t-zinc-200"
								></div>
							{/if}
						</button>
					{:else}
						<button
							type="submit"
							disabled={!input.trim()}
							class="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 text-white shadow-lg transition-all hover:scale-105 hover:bg-zinc-800 active:scale-95 disabled:scale-100 disabled:opacity-30 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-50"
						>
							<SendHorizontal class="h-4 w-4" />
						</button>
					{/if}
				</div>
			</div>
		</div>
	</form>
	<div class="mt-2 text-center text-[10px] text-zinc-400 dark:text-zinc-600">
		AI can make mistakes. Check important info.
	</div>
</div>
