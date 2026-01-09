<script lang="ts">
	import {
		ChevronDown,
		Download,
		Image,
		Loader2,
		Sparkles,
		Settings,
		Trash2,
		X,
		MessageSquare
	} from '@lucide/svelte';
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
	let showModelDropdown = $state(false);

	let isGenerating = $state(false);
	let generatedUrl = $state<string | null>(null);
	let error = $state<string | null>(null);
	let selectedHistoryImage = $state<(typeof history)[number] | null>(null);

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

	async function deleteImage() {
		if (!selectedHistoryImage) return;
		if (!confirm('Are you sure you want to delete this image? This cannot be undone.')) return;

		try {
			await client.mutation(api.image.remove, { id: selectedHistoryImage.id });
			generatedUrl = null;
			selectedHistoryImage = null;
		} catch (e: any) {
			alert('Failed to delete image: ' + e.message);
		}
	}
</script>

<div class="flex h-dvh bg-background">
	<!-- Left Sidebar -->
	<div class="flex w-80 shrink-0 flex-col border-r border-border bg-sidebar">
		<!-- Scrollable Settings -->
		<div class="flex-1 space-y-4 overflow-y-auto p-4">
			<!-- Prompt Input -->
			<div>
				<label
					for="prompt"
					class="mb-1.5 block text-xs font-medium tracking-wide text-muted-foreground uppercase"
					>Prompt</label
				>
				<textarea
					id="prompt"
					bind:value={prompt}
					placeholder="Describe your image..."
					rows="4"
					class="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
				></textarea>
			</div>

			<!-- Model Selector -->
			<div>
				<label
					for="model-selector"
					class="mb-1.5 block text-xs font-medium tracking-wide text-muted-foreground uppercase"
					>Model</label
				>
				<div class="relative">
					<button
						id="model-selector"
						onclick={() => (showModelDropdown = !showModelDropdown)}
						class="flex w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent"
					>
						<div class="flex min-w-0 flex-1 items-center gap-2">
							{#if isModal}
								<Sparkles class="size-3.5 shrink-0 text-purple-500" />
							{:else}
								<Image class="size-3.5 shrink-0 text-blue-500" />
							{/if}
							<span class="truncate text-xs">{selectedModel.name}</span>
						</div>
						<ChevronDown class="size-3.5 shrink-0 text-muted-foreground" />
					</button>

					{#if showModelDropdown}
						<div
							class="absolute top-full left-0 z-50 mt-1 w-full rounded-lg border border-border bg-popover py-1 shadow-lg"
						>
							{#each allModels as model}
								<button
									onclick={() => {
										selectedModelId = model.id;
										showModelDropdown = false;
									}}
									class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-accent {selectedModelId ===
									model.id
										? 'bg-accent'
										: ''}"
								>
									{#if model.provider === 'modal'}
										<Sparkles class="size-3.5 text-purple-500" />
									{:else}
										<Image class="size-3.5 text-blue-500" />
									{/if}
									<span class="text-popover-foreground">{model.name}</span>
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
				<span class="mb-1.5 block text-xs font-medium tracking-wide text-muted-foreground uppercase"
					>Aspect Ratio</span
				>
				<div class="flex gap-1" role="group" aria-label="Aspect Ratio Selection">
					{#each ASPECT_RATIOS as ratio}
						<button
							onclick={() => (aspectRatio = ratio)}
							class="flex-1 rounded-md px-1.5 py-1.5 text-[10px] font-medium transition-all {aspectRatio ===
							ratio
								? 'bg-primary text-primary-foreground'
								: 'bg-secondary text-secondary-foreground hover:bg-accent'}"
						>
							{ratio}
						</button>
					{/each}
				</div>
			</div>

			<!-- Advanced Settings (Modal only) -->
			{#if isModal}
				<div class="space-y-3 rounded-lg bg-muted p-3">
					<div class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
						<Settings class="size-3" />
						Advanced
					</div>
					<div>
						<label for="negative-prompt" class="mb-1 block text-[10px] text-muted-foreground"
							>Negative Prompt</label
						>
						<input
							id="negative-prompt"
							type="text"
							bind:value={negativePrompt}
							placeholder="What to avoid..."
							class="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
						/>
					</div>
					<div class="grid grid-cols-2 gap-2">
						<div>
							<label for="steps-range" class="mb-1 block text-[10px] text-muted-foreground"
								>Steps: {steps}</label
							>
							<input
								id="steps-range"
								type="range"
								min="10"
								max="50"
								bind:value={steps}
								class="h-1 w-full"
							/>
						</div>
						<div>
							<label for="guidance-range" class="mb-1 block text-[10px] text-muted-foreground"
								>Guidance: {guidance.toFixed(1)}</label
							>
							<input
								id="guidance-range"
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
						<label for="seed-input" class="mb-1 block text-[10px] text-muted-foreground">Seed</label
						>
						<input
							id="seed-input"
							type="number"
							bind:value={seed}
							placeholder="Random"
							class="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
						/>
					</div>
				</div>
			{/if}

			<!-- Generate Button -->
			<button
				onclick={handleGenerate}
				disabled={isGenerating || !prompt.trim()}
				class="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{#if isGenerating}
					<Loader2 class="size-4 animate-spin" />
					Generating...
				{:else}
					<Sparkles class="size-4" />
					Generate
				{/if}
			</button>

			<!-- Error -->
			{#if error}
				<div class="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
					{error}
				</div>
			{/if}
		</div>

		<!-- Mode Switcher -->
		<div class="border-t border-border p-2">
			<div class="flex rounded-lg bg-muted p-1">
				<a
					href="/chat"
					class="flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
				>
					<MessageSquare class="size-4" />
					Chat
				</a>
				<a
					href="/image"
					class="flex flex-1 items-center justify-center gap-2 rounded-md bg-background py-2 text-xs font-medium text-foreground shadow-sm transition-colors"
				>
					<Image class="size-4" />
					Image
				</a>
			</div>
		</div>
	</div>

	<!-- Main Content: Result Display -->
	<div class="flex flex-1 flex-col overflow-hidden">
		<div class="flex flex-1 items-center justify-center overflow-y-auto p-6">
			<div class="w-full max-w-3xl">
				{#if generatedUrl}
					<div
						class="relative flex max-h-[85dvh] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm"
					>
						<!-- Overlay Buttons -->
						<div class="absolute top-3 right-3 z-10 flex gap-2">
							<button
								onclick={downloadImage}
								class="flex size-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
								title="Download"
							>
								<Download class="size-4" />
							</button>
							{#if selectedHistoryImage}
								<button
									onclick={deleteImage}
									class="flex size-9 items-center justify-center rounded-full bg-destructive/80 text-white backdrop-blur-sm transition-colors hover:bg-destructive"
									title="Delete"
								>
									<Trash2 class="size-4" />
								</button>
							{/if}
							<button
								onclick={() => {
									generatedUrl = null;
									selectedHistoryImage = null;
								}}
								class="flex size-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
								title="Close"
							>
								<X class="size-4" />
							</button>
						</div>
						<img src={generatedUrl} alt="Generated" class="min-h-0 flex-1 object-contain" />
						{#if !selectedHistoryImage}
							<div class="flex items-center justify-between border-t border-border p-4">
								<span class="text-xs text-muted-foreground">
									{selectedModel.name} • {aspectRatio}
								</span>
								<button
									onclick={downloadImage}
									class="flex items-center gap-1.5 rounded-lg bg-secondary px-4 py-2 text-xs font-medium text-secondary-foreground transition-colors hover:bg-accent"
								>
									<Download class="size-3.5" />
									Download
								</button>
							</div>
						{/if}
					</div>
				{:else if isGenerating}
					<div class="flex flex-col items-center justify-center py-32">
						<Loader2 class="size-10 animate-spin text-muted-foreground" />
						<p class="mt-4 text-sm text-muted-foreground">Creating your image...</p>
					</div>
				{:else}
					<div class="flex flex-col items-center justify-center py-32 text-center">
						<div class="rounded-full bg-muted p-5">
							<Image class="size-10 text-muted-foreground" />
						</div>
						<h3 class="mt-5 text-base font-medium text-foreground">Ready to create</h3>
						<p class="mt-1 text-sm text-muted-foreground">Enter a prompt and click Generate</p>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Right Sidebar: History -->
	<div class="hidden w-64 shrink-0 flex-col border-l border-border bg-sidebar/50 lg:flex">
		<div class="flex-1 overflow-y-auto p-3">
			<h3 class="mb-3 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
				History
			</h3>
			<div class="grid grid-cols-2 gap-2">
				{#each history as img}
					<button
						onclick={() => {
							generatedUrl = img.url;
							selectedHistoryImage = img;
							// Update left sidebar parameters from selected image
							prompt = img.prompt;
							aspectRatio = img.aspectRatio;
							negativePrompt = img.negativePrompt || '';
							if (img.provider === 'modal') {
								selectedModelId = 'z-image-turbo';
							} else if (img.model) {
								selectedModelId = img.model;
							}
						}}
						class="group relative overflow-hidden rounded-lg border-2 transition-all hover:border-primary/50 hover:shadow-md {selectedHistoryImage?.id ===
						img.id
							? 'border-primary ring-2 ring-primary/20'
							: 'border-border'}"
					>
						<img
							src={img.url}
							alt={img.prompt || 'Generated image'}
							class="aspect-square w-full object-cover transition-transform group-hover:scale-105"
							loading="lazy"
							decoding="async"
							width="112"
							height="112"
						/>
						{#if img.source === 'chat'}
							<span
								class="absolute bottom-1 left-1 rounded bg-background/80 px-1 py-0.5 text-[8px] font-medium text-foreground backdrop-blur-sm"
							>
								Chat
							</span>
						{/if}
					</button>
				{/each}
				{#if history.length === 0}
					<p class="col-span-2 py-4 text-center text-[10px] text-muted-foreground italic">
						No images yet
					</p>
				{/if}
			</div>
		</div>

		<!-- Metadata Panel -->
		{#if selectedHistoryImage}
			<div class="border-t border-border bg-muted/30 p-3">
				<h4 class="mb-2 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
					Details
				</h4>
				<div class="space-y-3 text-[11px]">
					<!-- Prompt -->
					<div>
						<span class="font-medium text-muted-foreground">Prompt</span>
						<p class="mt-0.5 line-clamp-4 leading-relaxed text-foreground">
							{selectedHistoryImage.prompt}
						</p>
					</div>

					{#if selectedHistoryImage.negativePrompt}
						<div>
							<span class="font-medium text-muted-foreground">Negative</span>
							<p class="mt-0.5 line-clamp-2 leading-relaxed text-foreground/80 italic">
								{selectedHistoryImage.negativePrompt}
							</p>
						</div>
					{/if}

					<!-- Grid of metadata -->
					<div class="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border pt-3">
						<div>
							<span class="text-muted-foreground">Provider</span>
							<p class="font-medium text-foreground capitalize">
								{selectedHistoryImage.provider}
							</p>
						</div>
						<div>
							<span class="text-muted-foreground">Source</span>
							<p class="font-medium text-foreground capitalize">
								{selectedHistoryImage.source}
							</p>
						</div>
						{#if selectedHistoryImage.model}
							<div class="col-span-2">
								<span class="text-muted-foreground">Model</span>
								<p class="truncate font-medium text-foreground">
									{selectedHistoryImage.model}
								</p>
							</div>
						{/if}
						<div>
							<span class="text-muted-foreground">Ratio</span>
							<p class="font-medium text-foreground">
								{selectedHistoryImage.aspectRatio}
							</p>
						</div>
						<div>
							<span class="text-muted-foreground">Size</span>
							<p class="font-medium text-foreground">
								{selectedHistoryImage.width}×{selectedHistoryImage.height}
							</p>
						</div>
						<div class="col-span-2">
							<span class="text-muted-foreground">Created</span>
							<p class="font-medium text-foreground">
								{new Date(selectedHistoryImage.createdAt).toLocaleString()}
							</p>
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
