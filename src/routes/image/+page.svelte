<script lang="ts">
	import { ChevronDown, Download, Image, Loader2, Sparkles, Settings, X } from '@lucide/svelte';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '../../convex/_generated/api';
	import { onMount } from 'svelte';

	const client = useConvexClient();

	// Custom Modal model
	const CUSTOM_MODEL = {
		id: 'z-image-turbo',
		name: 'Tongyi-MAI/Z-Image-Turbo',
		provider: 'modal' as const
	};

	// OpenRouter image models (fetched from API)
	let openRouterModels = $state<{ id: string; name: string; provider: 'openrouter' }[]>([]);
	let modelsLoading = $state(true);

	// Fetch models on mount
	onMount(async () => {
		try {
			const models = await client.action(api.image.listImageModels, {});
			openRouterModels = models.map((m: { id: string; name: string }) => ({
				...m,
				provider: 'openrouter' as const
			}));
		} catch (e) {
			console.error('Failed to load image models:', e);
		} finally {
			modelsLoading = false;
		}
	});

	// All models: custom + OpenRouter image models
	const allModels = $derived([CUSTOM_MODEL, ...openRouterModels]);

	// State
	let selectedModelId = $state('z-image-turbo');
	let prompt = $state('');
	let aspectRatio = $state('1:1');
	let negativePrompt = $state('');
	let steps = $state(30);
	let guidance = $state(7.5);
	let seed = $state<number | undefined>(undefined);
	let showAdvanced = $state(false);
	let showModelDropdown = $state(false);

	let isGenerating = $state(false);
	let generatedUrl = $state<string | null>(null);
	let error = $state<string | null>(null);

	// Derived
	const selectedModel = $derived(allModels.find((m) => m.id === selectedModelId) || allModels[0]);
	const isModal = $derived(selectedModel?.provider === 'modal');

	// Image history
	const historyQuery = useQuery(api.image.list, {});
	const history = $derived(historyQuery?.data || []);

	const ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4'];

	async function handleGenerate() {
		if (!prompt.trim()) return;

		isGenerating = true;
		error = null;
		generatedUrl = null;

		try {
			const result = await client.action(api.image.generate, {
				provider: selectedModel.provider,
				prompt: prompt.trim(),
				aspectRatio,
				model: selectedModel.provider === 'openrouter' ? selectedModel.id : undefined,
				negativePrompt: isModal ? negativePrompt : undefined,
				steps: isModal ? steps : undefined,
				guidance: isModal ? guidance : undefined,
				seed: isModal && seed ? seed : undefined
			});

			generatedUrl = result.url;
		} catch (e: any) {
			error = e.message || 'Failed to generate image';
		} finally {
			isGenerating = false;
		}
	}

	function downloadImage() {
		if (!generatedUrl) return;
		const a = document.createElement('a');
		a.href = generatedUrl;
		a.download = `generated-${Date.now()}.png`;
		a.click();
	}
</script>

<div class="flex h-screen bg-zinc-50 dark:bg-zinc-950">
	<!-- Left Sidebar -->
	<div
		class="flex w-80 flex-shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
	>
		<!-- Header -->
		<div class="flex items-center gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
			<Image class="h-5 w-5 text-zinc-700 dark:text-zinc-300" />
			<h1 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">Image Generator</h1>
		</div>

		<!-- Scrollable Settings -->
		<div class="flex-1 space-y-4 overflow-y-auto p-4">
			<!-- Prompt Input -->
			<div>
				<label class="mb-1.5 block text-xs font-medium tracking-wide text-zinc-500 uppercase"
					>Prompt</label
				>
				<textarea
					bind:value={prompt}
					placeholder="Describe your image..."
					rows="4"
					class="w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white focus:ring-1 focus:ring-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
				></textarea>
			</div>

			<!-- Model Selector -->
			<div>
				<label class="mb-1.5 block text-xs font-medium tracking-wide text-zinc-500 uppercase"
					>Model</label
				>
				<div class="relative">
					<button
						onclick={() => (showModelDropdown = !showModelDropdown)}
						class="flex w-full items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-left text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
					>
						<div class="flex items-center gap-2">
							{#if isModal}
								<Sparkles class="h-3.5 w-3.5 text-purple-500" />
							{:else}
								<Image class="h-3.5 w-3.5 text-blue-500" />
							{/if}
							<span class="truncate text-xs">{selectedModel.name}</span>
						</div>
						<ChevronDown class="h-3.5 w-3.5 text-zinc-400" />
					</button>

					{#if showModelDropdown}
						<div
							class="absolute top-full left-0 z-50 mt-1 w-full rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
						>
							{#each allModels as model}
								<button
									onclick={() => {
										selectedModelId = model.id;
										showModelDropdown = false;
									}}
									class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-700 {selectedModelId ===
									model.id
										? 'bg-zinc-100 dark:bg-zinc-700'
										: ''}"
								>
									{#if model.provider === 'modal'}
										<Sparkles class="h-3.5 w-3.5 text-purple-500" />
									{:else}
										<Image class="h-3.5 w-3.5 text-blue-500" />
									{/if}
									<span class="text-zinc-900 dark:text-zinc-100">{model.name}</span>
									{#if model.provider === 'modal'}
										<span class="ml-auto text-[9px] font-semibold text-purple-500">CUSTOM</span>
									{/if}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			<!-- Aspect Ratio -->
			<div>
				<label class="mb-1.5 block text-xs font-medium tracking-wide text-zinc-500 uppercase"
					>Aspect Ratio</label
				>
				<div class="flex gap-1">
					{#each ASPECT_RATIOS as ratio}
						<button
							onclick={() => (aspectRatio = ratio)}
							class="flex-1 rounded-md px-1.5 py-1.5 text-[10px] font-medium transition-all {aspectRatio ===
							ratio
								? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
								: 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'}"
						>
							{ratio}
						</button>
					{/each}
				</div>
			</div>

			<!-- Advanced Settings (Modal only) -->
			{#if isModal}
				<div>
					<button
						onclick={() => (showAdvanced = !showAdvanced)}
						class="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
					>
						<Settings class="h-3 w-3" />
						Advanced
						<ChevronDown class="h-3 w-3 transition-transform {showAdvanced ? 'rotate-180' : ''}" />
					</button>

					{#if showAdvanced}
						<div class="mt-2 space-y-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
							<div>
								<label class="mb-1 block text-[10px] text-zinc-500">Negative Prompt</label>
								<input
									type="text"
									bind:value={negativePrompt}
									placeholder="What to avoid..."
									class="w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800"
								/>
							</div>
							<div class="grid grid-cols-2 gap-2">
								<div>
									<label class="mb-1 block text-[10px] text-zinc-500">Steps: {steps}</label>
									<input type="range" min="10" max="50" bind:value={steps} class="h-1 w-full" />
								</div>
								<div>
									<label class="mb-1 block text-[10px] text-zinc-500"
										>Guidance: {guidance.toFixed(1)}</label
									>
									<input
										type="range"
										min="1"
										max="20"
										step="0.5"
										bind:value={guidance}
										class="h-1 w-full"
									/>
								</div>
							</div>
							<div>
								<label class="mb-1 block text-[10px] text-zinc-500">Seed</label>
								<input
									type="number"
									bind:value={seed}
									placeholder="Random"
									class="w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800"
								/>
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Generate Button -->
			<button
				onclick={handleGenerate}
				disabled={isGenerating || !prompt.trim()}
				class="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
			>
				{#if isGenerating}
					<Loader2 class="h-4 w-4 animate-spin" />
					Generating...
				{:else}
					<Sparkles class="h-4 w-4" />
					Generate
				{/if}
			</button>

			<!-- Error -->
			{#if error}
				<div
					class="rounded-lg bg-red-50 p-3 text-xs text-red-600 dark:bg-red-950 dark:text-red-400"
				>
					{error}
				</div>
			{/if}
		</div>

		<!-- Back to Chat -->
		<div class="border-t border-zinc-200 p-3 dark:border-zinc-800">
			<a
				href="/chat"
				class="block text-center text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
			>
				← Back to Chat
			</a>
		</div>
	</div>

	<!-- Main Content: Result Display -->
	<div class="flex flex-1 flex-col overflow-hidden">
		<div class="flex-1 overflow-y-auto p-6">
			<div class="mx-auto max-w-3xl">
				{#if generatedUrl}
					<div
						class="relative overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
					>
						<!-- Overlay Buttons -->
						<div class="absolute top-3 right-3 z-10 flex gap-2">
							<button
								onclick={downloadImage}
								class="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
								title="Download"
							>
								<Download class="h-4 w-4" />
							</button>
							<button
								onclick={() => (generatedUrl = null)}
								class="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
								title="Close"
							>
								<X class="h-4 w-4" />
							</button>
						</div>
						<img src={generatedUrl} alt="Generated" class="w-full" />
						<div
							class="flex items-center justify-between border-t border-zinc-100 p-4 dark:border-zinc-800"
						>
							<span class="text-xs text-zinc-500">
								{selectedModel.name} • {aspectRatio}
							</span>
							<button
								onclick={downloadImage}
								class="flex items-center gap-1.5 rounded-lg bg-zinc-100 px-4 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
							>
								<Download class="h-3.5 w-3.5" />
								Download
							</button>
						</div>
					</div>
				{:else if isGenerating}
					<div class="flex flex-col items-center justify-center py-32">
						<Loader2 class="h-10 w-10 animate-spin text-zinc-300" />
						<p class="mt-4 text-sm text-zinc-500">Creating your image...</p>
					</div>
				{:else}
					<div class="flex flex-col items-center justify-center py-32 text-center">
						<div class="rounded-full bg-zinc-100 p-5 dark:bg-zinc-800">
							<Image class="h-10 w-10 text-zinc-300" />
						</div>
						<h3 class="mt-5 text-base font-medium text-zinc-700 dark:text-zinc-300">
							Ready to create
						</h3>
						<p class="mt-1 text-sm text-zinc-400">Enter a prompt and click Generate</p>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Right Sidebar: History -->
	<div
		class="hidden w-56 flex-shrink-0 overflow-y-auto border-l border-zinc-200 bg-white p-3 lg:block dark:border-zinc-800 dark:bg-zinc-900"
	>
		<h3 class="mb-3 text-xs font-semibold tracking-wide text-zinc-500 uppercase">History</h3>
		<div class="space-y-2">
			{#each history as img}
				<button
					onclick={() => (generatedUrl = img.url)}
					class="group w-full overflow-hidden rounded-lg border border-zinc-200 transition-all hover:border-zinc-400 dark:border-zinc-800"
				>
					<img src={img.url} alt="" class="aspect-square w-full object-cover" />
				</button>
			{/each}
			{#if history.length === 0}
				<p class="py-4 text-center text-[10px] text-zinc-400">No images yet</p>
			{/if}
		</div>
	</div>
</div>
