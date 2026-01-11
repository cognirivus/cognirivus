<script lang="ts">
	import {
		Brain,
		ChevronDown,
		Square,
		SendHorizontal,
		Code,
		Image,
		Plus,
		Activity,
		Database
	} from '@lucide/svelte';
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
		viewContext = null,
		totalTokens = 0,
		totalPromptTokens = 0,
		totalCompletionTokens = 0,
		totalCost = 0,
		isActuallyStreaming = false,
		isLoadingModels = false
	} = $props();

	let showModelSelector = $state(false);
	let showToolsMenu = $state(false);
	let showTokenDetail = $state(false);
	let searchQuery = $state('');

	let filteredModels = $derived(
		models.filter((m) => {
			const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase());
			const matchesImage = chatState.generateImage ? m.output_modalities.includes('image') : true;
			return matchesSearch && matchesImage;
		})
	);
	let container: HTMLElement;

	onMount(() => {
		const handleClick = (e: MouseEvent) => {
			if (container && !container.contains(e.target as Node)) {
				showModelSelector = false;
				showToolsMenu = false;
				showTokenDetail = false;
			}
		};
		window.addEventListener('click', handleClick);
		return () => window.removeEventListener('click', handleClick);
	});

	function toggleImageGen() {
		chatState.generateImage = !chatState.generateImage;
		if (chatState.generateImage) {
			const currentM = models.find((m) => m.id === selectedModel);
			if (currentM && !currentM.output_modalities.includes('image')) {
				const firstImageModel = models.find((m) => m.output_modalities.includes('image'));
				if (firstImageModel) {
					selectedModel = firstImageModel.id;
				}
			}
		}
	}
</script>

<div
	class="pointer-events-none fixed right-0 bottom-0 left-0 z-20 px-2 pt-4 pb-2 md:px-4 md:pt-8 md:pr-[calc(1rem+var(--scrollbar-width))] md:pb-4 md:pl-4 {chatState.isSidebarOpen
		? 'md:left-80'
		: 'md:left-0'}"
>
	<div
		class="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/95 to-transparent"
	></div>
	<form onsubmit={handleSubmit} class="pointer-events-auto relative mx-auto max-w-3xl">
		<div
			class="flex flex-col rounded-2xl border border-border bg-card/70 shadow-sm backdrop-blur-md"
		>
			<textarea
				class="min-h-[60px] w-full resize-none border-0 bg-transparent px-3 pt-3 pb-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:ring-0 focus:outline-none disabled:opacity-50 sm:min-h-[80px] sm:px-4 sm:pt-4 sm:pb-2"
				bind:value={input}
				placeholder="What can I help you with?"
				rows="2"
				disabled={chatStatus === 'streaming'}
				onkeydown={(e) => {
					if (e.key === 'Enter' && !e.shiftKey) {
						e.preventDefault();
						if (input.trim() && chatStatus !== 'streaming') handleSubmit(e);
					}
				}}
			></textarea>

			<div class="flex items-center gap-2 px-2 pb-2 sm:px-3 sm:pb-3" bind:this={container}>
				<!-- Mobile Unified Toolbar (Radio-like Pill) -->
				<div
					class="flex min-w-0 flex-1 items-center gap-0 rounded-xl border border-border/50 bg-muted/30 p-0.5 sm:hidden"
				>
					<button
						type="button"
						onclick={() => (chatState.includeReasoning = !chatState.includeReasoning)}
						disabled={chatStatus === 'streaming'}
						class="flex h-8 w-9 flex-shrink-0 items-center justify-center rounded-l-[10px] transition-all {chatState.includeReasoning
							? 'bg-primary text-primary-foreground shadow-sm'
							: 'text-muted-foreground hover:bg-muted/80'}"
						title="Toggle Reasoning"
					>
						<Brain class="h-3.5 w-3.5" />
					</button>

					<div class="h-4 w-[1px] bg-border/50"></div>

					<button
						type="button"
						onclick={() => (chatState.useMemory = !chatState.useMemory)}
						disabled={chatStatus === 'streaming'}
						class="flex h-8 w-9 flex-shrink-0 items-center justify-center transition-all {chatState.useMemory
							? 'bg-primary text-primary-foreground shadow-sm'
							: 'text-muted-foreground hover:bg-muted/80'}"
						title="Use Memory"
					>
						<Database class="h-3.5 w-3.5" />
					</button>

					<div class="h-4 w-[1px] bg-border/50"></div>

					<button
						type="button"
						onclick={toggleImageGen}
						disabled={chatStatus === 'streaming'}
						class="flex h-8 w-9 flex-shrink-0 items-center justify-center transition-all {chatState.generateImage
							? 'bg-primary text-primary-foreground shadow-sm'
							: 'text-muted-foreground hover:bg-muted/80'}"
						title="Generate Image"
					>
						<Image class="h-3.5 w-3.5" />
					</button>

					{#if chatState.generateImage}
						<select
							bind:value={chatState.imageAspectRatio}
							disabled={chatStatus === 'streaming'}
							class="h-8 border-0 bg-transparent px-1 text-[9px] font-extrabold text-muted-foreground outline-none focus:ring-0"
						>
							<option value="1:1">1:1</option>
							<option value="16:9">16:9</option>
							<option value="9:16">9:16</option>
							<option value="4:3">4:3</option>
							<option value="3:4">3:4</option>
							<option value="3:2">3:2</option>
							<option value="2:3">2:3</option>
						</select>
					{/if}

					<div class="h-4 w-[1px] bg-border/50"></div>

					<div class="relative flex min-w-0 flex-1 items-center">
						<button
							type="button"
							onclick={() => {
								showModelSelector = !showModelSelector;
								if (showModelSelector) showTokenDetail = false;
							}}
							disabled={chatStatus === 'streaming' || isLoadingModels}
							class="flex w-full items-center justify-between gap-1 px-2 py-1.5 text-[10px] font-bold text-muted-foreground transition-all hover:bg-muted/80 disabled:opacity-50"
						>
							<span class="truncate">
								{#if isLoadingModels}
									<div class="flex items-center gap-1.5">
										<div
											class="h-3 w-3 animate-spin rounded-full border-[1.5px] border-muted-foreground/30 border-t-muted-foreground"
										></div>
										<span>Loading...</span>
									</div>
								{:else}
									{models
										.find((m) => m.id === selectedModel)
										?.name.split('/')
										.pop()}
								{/if}
							</span>
							<ChevronDown class="h-3 w-3 flex-shrink-0" />
						</button>

						{#if showModelSelector}
							<div
								class="fixed inset-x-4 bottom-28 z-50 mb-2 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-2xl"
							>
								<div class="flex items-center gap-2 border-b border-border p-2">
									<input
										type="text"
										bind:value={searchQuery}
										placeholder="Search models..."
										disabled={chatStatus === 'streaming'}
										class="w-full rounded-lg bg-muted px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:ring-0 focus:outline-none disabled:opacity-50"
									/>
								</div>
								<div class="max-h-[300px] overflow-y-auto p-1">
									{#each filteredModels as model}
										<button
											type="button"
											disabled={chatStatus === 'streaming'}
											onclick={() => {
												selectedModel = model.id;
												showModelSelector = false;
												searchQuery = '';
											}}
											class="flex w-full flex-col items-start gap-1 rounded-lg px-3 py-2.5 text-left transition-all hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 {selectedModel ===
											model.id
												? 'bg-muted shadow-sm ring-1 ring-border'
												: ''}"
										>
											<div class="flex w-full items-center justify-between">
												<span
													class="text-[11px] font-bold tracking-tight {selectedModel === model.id
														? 'text-primary'
														: 'text-foreground/90'}">{model.name}</span
												>
											</div>
										</button>
									{/each}
									{#if filteredModels.length === 0}
										<div class="py-12 text-center text-xs text-muted-foreground italic">
											No models found
										</div>
									{/if}
								</div>
							</div>
						{/if}
					</div>

					<div class="h-4 w-[1px] bg-border/50"></div>

					<div class="relative flex items-center">
						<button
							type="button"
							class="flex h-8 w-9 flex-shrink-0 items-center justify-center rounded-r-[10px] transition-all {showTokenDetail
								? 'bg-muted text-primary'
								: 'text-muted-foreground hover:bg-muted/80'}"
							onclick={() => {
								showTokenDetail = !showTokenDetail;
								if (showTokenDetail) showModelSelector = false;
							}}
							title="Session Usage"
						>
							<Activity class="h-3.5 w-3.5" />
						</button>

						{#if showTokenDetail}
							<div
								class="fixed inset-x-4 bottom-28 z-50 mb-2 overflow-hidden rounded-xl border border-border bg-popover/95 p-4 shadow-2xl backdrop-blur-md sm:absolute sm:inset-x-auto sm:right-0 sm:bottom-full sm:w-52"
							>
								<div
									class="mb-3 text-[9px] font-extrabold tracking-widest text-muted-foreground uppercase"
								>
									Session Usage
								</div>
								<div class="space-y-2 text-xs">
									<div class="flex justify-between">
										<span class="font-medium text-muted-foreground">Tokens</span>
										<span class="font-bold text-foreground">{totalTokens.toLocaleString()}</span>
									</div>
									<div class="mt-1 ml-1 flex flex-col gap-1 border-l border-border/50 pl-2">
										<div class="flex justify-between text-[10px]">
											<span class="text-muted-foreground/70">Prompt</span>
											<span class="font-medium text-muted-foreground/90"
												>{totalPromptTokens.toLocaleString()}</span
											>
										</div>
										<div class="flex justify-between text-[10px]">
											<span class="text-muted-foreground/70">Completions</span>
											<span class="font-medium text-muted-foreground/90"
												>{totalCompletionTokens.toLocaleString()}</span
											>
										</div>
									</div>
									<div class="my-2 h-[1px] bg-border"></div>
									<div class="flex items-center justify-between pt-1">
										<span
											class="text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
											>Net Cost</span
										>
										<span class="text-sm font-black text-primary">${totalCost.toFixed(6)}</span>
									</div>
								</div>
							</div>
						{/if}
					</div>
				</div>

				<!-- Desktop Tools (Original) -->
				<div class="hidden min-w-0 flex-1 items-center gap-1 sm:flex">
					<button
						type="button"
						onclick={() => (chatState.includeReasoning = !chatState.includeReasoning)}
						disabled={chatStatus === 'streaming'}
						class="flex h-8 w-8 items-center justify-center rounded-lg transition-all disabled:cursor-not-allowed disabled:opacity-50 {chatState.includeReasoning
							? 'bg-primary text-primary-foreground shadow-sm'
							: 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
						title="Toggle Reasoning"
					>
						<Brain class="h-4 w-4 {chatState.includeReasoning ? 'fill-current' : ''}" />
					</button>

					<button
						type="button"
						onclick={() => (chatState.useMemory = !chatState.useMemory)}
						disabled={chatStatus === 'streaming'}
						class="flex h-8 w-8 items-center justify-center rounded-lg transition-all disabled:cursor-not-allowed disabled:opacity-50 {chatState.useMemory
							? 'bg-primary text-primary-foreground shadow-sm'
							: 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
						title="Use Memory"
					>
						<Database class="h-4 w-4" />
					</button>

					<button
						type="button"
						onclick={toggleImageGen}
						disabled={chatStatus === 'streaming'}
						class="flex h-8 w-8 items-center justify-center rounded-lg transition-all disabled:cursor-not-allowed disabled:opacity-50 {chatState.generateImage
							? 'bg-primary text-primary-foreground shadow-sm'
							: 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
						title="Generate Image"
					>
						<Image class="h-4 w-4" />
					</button>

					{#if chatState.generateImage}
						<select
							bind:value={chatState.imageAspectRatio}
							disabled={chatStatus === 'streaming'}
							class="h-8 rounded-lg border-0 bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground outline-none focus:ring-1 focus:ring-border disabled:opacity-50"
							title="Image Aspect Ratio"
						>
							<option value="1:1">1:1</option>
							<option value="16:9">16:9</option>
							<option value="9:16">9:16</option>
							<option value="4:3">4:3</option>
							<option value="3:4">3:4</option>
							<option value="3:2">3:2</option>
							<option value="2:3">2:3</option>
						</select>
					{/if}

					<div class="mx-1 h-4 w-[1px] bg-border"></div>

					<div class="relative flex min-w-0 flex-1 items-center sm:flex-initial">
						<button
							type="button"
							onclick={() => {
								showModelSelector = !showModelSelector;
								if (showModelSelector) {
									showToolsMenu = false;
									showTokenDetail = false;
								}
							}}
							disabled={chatStatus === 'streaming' || isLoadingModels}
							class="flex w-full items-center justify-between gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-bold text-muted-foreground transition-all hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
						>
							<span class="truncate">
								{#if isLoadingModels}
									<div class="flex items-center gap-1.5">
										<div
											class="h-3 w-3 animate-spin rounded-full border-[1.5px] border-muted-foreground/30 border-t-muted-foreground"
										></div>
										<span>Loading...</span>
									</div>
								{:else}
									{models
										.find((m) => m.id === selectedModel)
										?.name.split('/')
										.pop()}
								{/if}
							</span>
							<ChevronDown class="h-3 w-3 flex-shrink-0" />
						</button>

						{#if showModelSelector}
							<div
								class="absolute bottom-full left-0 z-50 mb-2 w-96 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-2xl"
							>
								<div class="flex items-center gap-2 border-b border-border p-2">
									<input
										type="text"
										bind:value={searchQuery}
										placeholder="Search models..."
										disabled={chatStatus === 'streaming'}
										class="w-full rounded-lg bg-muted px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:ring-0 focus:outline-none disabled:opacity-50"
									/>
									<button
										type="button"
										onclick={toggleImageGen}
										class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg transition-all {chatState.generateImage
											? 'bg-primary text-primary-foreground shadow-sm'
											: 'bg-muted text-muted-foreground hover:bg-muted/80'}"
										title="Show Image Generation Models Only"
									>
										<Image class="h-3.5 w-3.5" />
									</button>
								</div>
								<div class="max-h-[300px] overflow-y-auto p-1">
									{#each filteredModels as model}
										<button
											type="button"
											disabled={chatStatus === 'streaming'}
											onclick={() => {
												selectedModel = model.id;
												showModelSelector = false;
												searchQuery = '';
											}}
											class="flex w-full flex-col items-start gap-1 rounded-lg px-3 py-2.5 text-left transition-all hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 {selectedModel ===
											model.id
												? 'bg-muted shadow-sm ring-1 ring-border'
												: ''}"
										>
											<div class="flex w-full items-center justify-between">
												<span
													class="text-[11px] font-bold tracking-tight {selectedModel === model.id
														? 'text-primary'
														: 'text-foreground/90'}">{model.name}</span
												>
												{#if model.context_length}
													<span
														class="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground/70"
														>{Math.round(model.context_length / 1000)}k ctx</span
													>
												{/if}
											</div>
											{#if model.pricing}
												<div
													class="flex w-full items-center gap-3 text-[9px] font-medium tracking-tight text-muted-foreground/60"
												>
													<span
														>IN: ${parseFloat(model.pricing.prompt) * 1000000 < 0.01
															? (parseFloat(model.pricing.prompt) * 1000000).toPrecision(2)
															: (parseFloat(model.pricing.prompt) * 1000000).toFixed(2)} / 1M</span
													>
													<span
														>OUT: ${parseFloat(model.pricing.completion) * 1000000 < 0.01
															? (parseFloat(model.pricing.completion) * 1000000).toPrecision(2)
															: (parseFloat(model.pricing.completion) * 1000000).toFixed(2)} / 1M</span
													>
												</div>
											{/if}
										</button>
									{/each}
									{#if filteredModels.length === 0}
										<div class="py-12 text-center text-xs text-muted-foreground italic">
											No models found
										</div>
									{/if}
								</div>
							</div>
						{/if}
					</div>
				</div>

				<!-- Right Actions & Stats -->
				<div class="flex items-center gap-1.5 sm:gap-3">
					<div class="hidden items-center sm:flex">
						{#if totalTokens > 0 || totalCost > 0}
							<div
								class="flex flex-row items-center gap-2 text-[10px] font-bold tracking-tight text-muted-foreground/70"
							>
								{#if totalTokens > 0}
									<div
										role="button"
										tabindex="0"
										class="relative flex cursor-help items-center gap-1 transition-colors hover:text-foreground"
										onmouseenter={() => (showTokenDetail = true)}
										onmouseleave={() => (showTokenDetail = false)}
									>
										<span
											>{totalTokens.toLocaleString()}
											<span class="hidden sm:inline">tokens</span></span
										>
										{#if showTokenDetail}
											<div
												class="absolute right-0 bottom-full z-50 mb-3 w-52 overflow-hidden rounded-xl border border-border bg-popover/95 p-4 shadow-2xl backdrop-blur-md"
											>
												<div
													class="mb-3 text-[9px] font-extrabold tracking-widest text-muted-foreground uppercase"
												>
													Session Usage
												</div>
												<div class="space-y-2 text-xs">
													<div class="flex justify-between">
														<span class="font-medium text-muted-foreground">Tokens</span>
														<span class="font-bold text-foreground"
															>{totalTokens.toLocaleString()}</span
														>
													</div>
													<div class="mt-1 ml-1 flex flex-col gap-1 border-l border-border/50 pl-2">
														<div class="flex justify-between text-[10px]">
															<span class="text-muted-foreground/70">Prompt</span>
															<span class="font-medium text-muted-foreground/90"
																>{totalPromptTokens.toLocaleString()}</span
															>
														</div>
														<div class="flex justify-between text-[10px]">
															<span class="text-muted-foreground/70">Completions</span>
															<span class="font-medium text-muted-foreground/90"
																>{totalCompletionTokens.toLocaleString()}</span
															>
														</div>
													</div>
													<div class="my-2 h-[1px] bg-border"></div>
													<div class="flex items-center justify-between pt-1">
														<span
															class="text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
															>Net Cost</span
														>
														<span class="text-sm font-black text-primary"
															>${totalCost.toFixed(6)}</span
														>
													</div>
												</div>
											</div>
										{/if}
									</div>
								{/if}
								{#if totalCost > 0}
									<span class="hidden font-normal text-border sm:inline">|</span>
									<span class="font-black tracking-tighter text-foreground/80"
										>${totalCost.toFixed(6)}</span
									>
								{/if}
							</div>
						{/if}
					</div>

					{#if chatStatus === 'streaming'}
						<button
							type="button"
							onclick={stopChat}
							class="hover:text-destructive-foreground flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-foreground shadow-sm transition-all hover:bg-destructive"
						>
							{#if isActuallyStreaming}
								<Square class="h-3.5 w-3.5" fill="currentColor" />
							{:else}
								<div
									class="h-4 w-4 animate-spin rounded-full border-2 border-primary/20 border-t-primary"
								></div>
							{/if}
						</button>
					{:else}
						<button
							type="submit"
							disabled={!input.trim()}
							class="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-105 hover:shadow-xl active:scale-95 disabled:scale-100 disabled:opacity-20 disabled:grayscale"
						>
							<SendHorizontal class="h-4 w-4" />
						</button>
					{/if}
				</div>
			</div>
		</div>
	</form>
	<div
		class="pointer-events-auto relative mt-2 text-center text-[10px] font-medium tracking-wide text-muted-foreground/80"
	>
		AI-generated content may contain errors. Please verify important information.
	</div>
</div>
