<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { toast } from 'svelte-sonner';
	import {
		Cpu,
		RefreshCw,
		Save,
		Settings2,
		Sparkles,
		Brain,
		FileText,
		Search,
		Zap,
		Info,
		Bot,
		Shield,
		ChevronsUpDown,
		Check
	} from '@lucide/svelte';
	import { Popover, PopoverContent } from '$lib/components/ui/popover';
	import { Popover as PopoverPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils';

	const client = useConvexClient();

	// Define standard system tasks
	const systemTasks = [
		{
			id: 'extraction',
			name: 'General Extraction',
			description: 'Unified extraction jobs (concepts, topics, etc.)',
			icon: Sparkles
		},
		{
			id: 'flashcards',
			name: 'Flashcard Generation',
			description: 'Generating study cards from content',
			icon: Brain
		},
		{
			id: 'synthesis',
			name: 'UPSC Synthesis',
			description: 'Synthesizing news facts into GS articles',
			icon: FileText
		},
		{
			id: 'current_affairs',
			name: 'Current Affairs',
			description: 'Extracting news stories from raw analysis',
			icon: Zap
		},
		{
			id: 'locations',
			name: 'Mapping / Locations',
			description: 'Extracting geographical facts',
			icon: Search
		},
		{
			id: 'chat_primary',
			name: 'Primary Chat',
			description: 'Default model for standard chat conversations',
			icon: Zap
		},
		{
			id: 'multi_agent',
			name: 'Multi-Agent Orchestrator',
			description: 'The primary agent that orchestrates sub-agents',
			icon: Bot
		},
		{
			id: 'intent_router',
			name: 'Intent Router',
			description: 'Classifies user intent and routes to specialized agents',
			icon: Zap
		},
		{
			id: 'memory_extraction',
			name: 'Memory Extraction',
			description: 'Extracting factual info from chat messages',
			icon: Brain
		},
		{
			id: 'embeddings',
			name: 'Vector Embeddings',
			description: 'Model for generating memory embeddings',
			icon: Settings2
		},
		{
			id: 'memory_judge',
			name: 'Memory Judge',
			description: 'Deduplicating and comparing memories',
			icon: Shield
		},
		{
			id: 'standalone_query',
			name: 'Query Re-writer',
			description: 'Turning follow-up chats into standalone queries',
			icon: RefreshCw
		},
		{
			id: 'rag_embeddings',
			name: 'RAG Embeddings',
			description: 'Embedding model for vector search (typically OpenAI)',
			icon: Settings2
		},
		{
			id: 'web_search_tool',
			name: 'Web Search',
			description: 'Model for agent web search tool (uses :online suffix)',
			icon: Search
		}
	];

	// Define which tasks use embedding models
	const embeddingTasks = ['embeddings', 'rag_embeddings'];

	// Queries
	const configsQuery = useQuery(api.tasks.listConfigs, {});
	const chatModelsQuery = useQuery(api.models.list, { type: 'chat' });
	const embeddingModelsQuery = useQuery(api.models.list, { type: 'embedding' });

	// State
	let taskSettings = $state<
		Record<string, { modelId: string; temperature?: number; maxTokens?: number }>
	>({});
	let isSaving = $state<Record<string, boolean>>({});
	let isSyncing = $state(false);
	let modelSearchQueries = $state<Record<string, string>>({});
	let openPopovers = $state<Record<string, boolean>>({});
	let triggerWidths = $state<Record<string, number>>({});

	// Pre-populate settings object to avoid undefined errors during render
	systemTasks.forEach((t) => {
		taskSettings[t.id] = { modelId: '', temperature: 0.3, maxTokens: 1000 };
		isSaving[t.id] = false;
		modelSearchQueries[t.id] = '';
		openPopovers[t.id] = false;
		triggerWidths[t.id] = 0;
	});

	function getModelsForTask(taskId: string) {
		const isEmbeddingTask = embeddingTasks.includes(taskId);
		return isEmbeddingTask ? embeddingModelsQuery.data : chatModelsQuery.data;
	}

	function getFilteredModels(taskId: string, query: string) {
		const models = getModelsForTask(taskId);
		if (!models) return [];
		if (!query) return models;
		const lowQuery = query.toLowerCase();
		return models.filter(
			(m) => m.name.toLowerCase().includes(lowQuery) || m.modelId.toLowerCase().includes(lowQuery)
		);
	}

	function getModelName(taskId: string, modelId: string) {
		const models = getModelsForTask(taskId);
		return models?.find((m) => m.modelId === modelId)?.name || modelId;
	}

	async function syncModels() {
		isSyncing = true;
		try {
			const result = await client.action(api.models.syncFromOpenRouter, {});
			toast.success(
				`Synced ${result.chatCount} chat models and ${result.embeddingCount} embedding models`
			);
		} catch (e: any) {
			toast.error(e.message || 'Failed to sync models');
		} finally {
			isSyncing = false;
		}
	}

	// Initialize state when data loads from DB
	$effect(() => {
		if (configsQuery.data) {
			configsQuery.data.forEach((config) => {
				if (!taskSettings[config.task]) {
					taskSettings[config.task] = {
						modelId: config.modelId,
						temperature: config.temperature,
						maxTokens: config.maxTokens
					};
				} else {
					taskSettings[config.task].modelId = config.modelId;
					taskSettings[config.task].temperature = config.temperature;
					taskSettings[config.task].maxTokens = config.maxTokens;
				}
			});
		}
	});

	async function updateTaskConfig(taskId: string) {
		const settings = taskSettings[taskId];
		if (!settings?.modelId) {
			toast.error('Please select a model');
			return;
		}

		isSaving[taskId] = true;
		try {
			await client.mutation(api.tasks.updateConfig, {
				task: taskId,
				modelId: settings.modelId,
				temperature: settings.temperature,
				maxTokens: settings.maxTokens
			});
			toast.success(`${taskId} configuration updated`);
		} catch (e: any) {
			toast.error(e.message || 'Failed to update configuration');
		} finally {
			isSaving[taskId] = false;
		}
	}
</script>

<div class="container mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
	<!-- Header -->
	<div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div class="space-y-2">
			<div class="flex items-center gap-2">
				<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
					<Cpu class="h-4 w-4 text-primary" />
				</div>
				<h1 class="text-3xl font-semibold tracking-tight">System Model Settings</h1>
			</div>
			<p class="text-muted-foreground">
				Assign specific AI models to various background tasks and system processes.
			</p>
		</div>
		<div class="flex gap-2">
			<Button onclick={syncModels} variant="outline" size="sm" class="gap-2" disabled={isSyncing}>
				{#if isSyncing}
					<RefreshCw class="h-4 w-4 animate-spin" />
				{:else}
					<RefreshCw class="h-4 w-4" />
				{/if}
				Sync Models
			</Button>
			<Button
				onclick={() => {
					// Convex queries are live
				}}
				variant="outline"
				size="sm"
				class="gap-2"
			>
				<RefreshCw class="h-4 w-4" />
				Refresh
			</Button>
		</div>
	</div>

	{#if configsQuery.isLoading || chatModelsQuery.isLoading || embeddingModelsQuery.isLoading}
		<div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
			{#each Array(6) as _}
				<div class="rounded-xl border bg-card p-6 shadow-sm">
					<div class="mb-4 flex items-center gap-3">
						<Skeleton class="h-10 w-10 rounded-lg" />
						<div class="space-y-2">
							<Skeleton class="h-5 w-32" />
							<Skeleton class="h-3 w-48" />
						</div>
					</div>
					<div class="space-y-4">
						<Skeleton class="h-10 w-full" />
						<div class="grid grid-cols-2 gap-4">
							<Skeleton class="h-10 w-full" />
							<Skeleton class="h-10 w-full" />
						</div>
						<Skeleton class="h-10 w-full" />
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
			{#each systemTasks as task}
				<div
					class="flex flex-col rounded-xl border bg-card p-6 shadow-sm transition-all hover:shadow-md"
				>
					<div class="mb-6 flex items-start justify-between">
						<div class="flex items-center gap-3">
							<div
								class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/5 text-primary"
							>
								<task.icon class="h-5 w-5" />
							</div>
							<div>
								<h3 class="leading-none font-semibold">{task.name}</h3>
								<p class="mt-1.5 line-clamp-1 text-xs text-muted-foreground">{task.description}</p>
							</div>
						</div>
						{#if configsQuery.data?.find((c) => c.task === task.id)}
							<Badge
								variant="outline"
								class="border-emerald-500/20 bg-emerald-500/5 text-[10px] text-emerald-600"
								>Configured</Badge
							>
						{:else}
							<Badge variant="secondary" class="text-[10px]">Default</Badge>
						{/if}
					</div>

					<div class="flex-1 space-y-4">
						<div class="space-y-2">
							<Label class="text-xs font-medium">Model</Label>
							{#if taskSettings[task.id]}
								<div class="w-full" bind:clientWidth={triggerWidths[task.id]}>
									<Popover bind:open={openPopovers[task.id]}>
										<PopoverPrimitive.Trigger class="w-full">
											{#snippet child({ props })}
												<Button
													variant="outline"
													role="combobox"
													aria-expanded={openPopovers[task.id]}
													class="w-full justify-between font-normal"
													{...props}
												>
													<span class="flex-1 truncate text-left">
														{taskSettings[task.id].modelId
															? getModelName(task.id, taskSettings[task.id].modelId)
															: 'Select a model...'}
													</span>
													<ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
												</Button>
											{/snippet}
										</PopoverPrimitive.Trigger>
										<PopoverContent
											class="!w-full p-0"
											style="width: {triggerWidths[task.id]}px"
											align="start"
											sideOffset={4}
										>
											<div
												class="flex flex-col overflow-hidden rounded-md border bg-popover shadow-md"
											>
												<div class="flex items-center border-b px-3 py-2">
													<Search class="mr-2 h-4 w-4 shrink-0 opacity-50" />
													<input
														class="flex h-9 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
														placeholder="Search models..."
														bind:value={modelSearchQueries[task.id]}
													/>
												</div>
												<div class="max-h-[300px] overflow-y-auto p-1">
													{#if getFilteredModels(task.id, modelSearchQueries[task.id]).length === 0}
														<div class="px-2 py-4 text-center text-sm text-muted-foreground">
															No models found.
														</div>
													{:else}
														{#each getFilteredModels(task.id, modelSearchQueries[task.id]) as model}
															<button
																class={cn(
																	'flex w-full cursor-default items-center rounded-sm px-2 py-1.5 text-sm transition-colors outline-none hover:bg-accent hover:text-accent-foreground',
																	taskSettings[task.id].modelId === model.modelId &&
																		'bg-accent text-accent-foreground'
																)}
																onclick={() => {
																	taskSettings[task.id].modelId = model.modelId;
																	if (model.attributes?.top_provider?.max_completion_tokens) {
																		taskSettings[task.id].maxTokens =
																			model.attributes.top_provider.max_completion_tokens;
																	}
																	openPopovers[task.id] = false;
																}}
															>
																<Check
																	class={cn(
																		'mr-2 h-4 w-4 shrink-0',
																		taskSettings[task.id].modelId === model.modelId
																			? 'opacity-100'
																			: 'opacity-0'
																	)}
																/>
																<div class="flex min-w-0 flex-1 flex-col items-start gap-0.5">
																	<span class="truncate font-medium">{model.name}</span>
																	<span class="truncate text-[10px] text-muted-foreground"
																		>{model.modelId}</span
																	>
																	<div
																		class="flex flex-wrap gap-x-2 text-[10px] text-muted-foreground"
																	>
																		{#if model.attributes?.context_length}
																			<span
																				>ctx: {(model.attributes.context_length / 1000).toFixed(0)}k</span
																			>
																		{/if}
																		{#if model.attributes?.top_provider?.max_completion_tokens}
																			<span
																				>out: {(model.attributes.top_provider.max_completion_tokens / 1000).toFixed(0)}k</span
																			>
																		{/if}
																		{#if model.attributes?.pricing?.prompt || model.attributes?.pricing?.completion}
																			<span class="text-emerald-600"
																				>${(parseFloat(model.attributes.pricing?.prompt || '0') * 1_000_000).toFixed(2)}/${(parseFloat(model.attributes.pricing?.completion || '0') * 1_000_000).toFixed(2)}</span
																			>
																		{/if}
																	</div>
																</div>
															</button>
														{/each}
													{/if}
												</div>
											</div>
										</PopoverContent>
									</Popover>
								</div>
							{/if}
						</div>

						<div class="grid grid-cols-2 gap-4">
							<div class="space-y-2">
								<Label class="text-xs font-medium">Temp</Label>
								{#if taskSettings[task.id]}
									<Input
										type="number"
										step="0.1"
										min="0"
										max="2"
										placeholder="0.3"
										bind:value={taskSettings[task.id].temperature}
									/>
								{/if}
							</div>
							<div class="space-y-2">
								<Label class="text-xs font-medium">Max Tokens</Label>
								{#if taskSettings[task.id]}
									<Input
										type="number"
										step="100"
										placeholder="2048"
										bind:value={taskSettings[task.id].maxTokens}
									/>
								{/if}
							</div>
						</div>
					</div>

					<div class="mt-6 border-t pt-6">
						<Button
							class="w-full gap-2"
							onclick={() => updateTaskConfig(task.id)}
							disabled={isSaving[task.id]}
						>
							{#if isSaving[task.id]}
								<RefreshCw class="h-4 w-4 animate-spin" />
							{:else}
								<Save class="h-4 w-4" />
							{/if}
							Save Changes
						</Button>
					</div>
				</div>
			{/each}
		</div>

		<!-- Info Section -->
		<div class="mt-12 rounded-xl border border-blue-500/20 bg-blue-500/5 p-6">
			<div class="flex items-start gap-4">
				<div
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-blue-600"
				>
					<Info class="h-5 w-5" />
				</div>
				<div class="space-y-1">
					<h4 class="font-semibold text-blue-900 dark:text-blue-100">About Model Configuration</h4>
					<p class="text-sm leading-relaxed text-blue-800/80 dark:text-blue-200/80">
						These settings override hardcoded defaults used across the platform. If a task is not
						specifically configured here, the system will fallback to its internal defaults. Models
						must be enabled in the general <a
							href="/admin/models"
							class="font-medium underline underline-offset-4">Model Sync</a
						> list to appear here.
					</p>
				</div>
			</div>
		</div>
	{/if}
</div>
