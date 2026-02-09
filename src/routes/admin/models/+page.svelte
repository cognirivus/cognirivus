<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Tabs from '$lib/components/ui/tabs';
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

	const systemTasks = [
		{
			id: 'extraction',
			name: 'General Extraction',
			description: 'Unified extraction jobs (concepts, topics, etc.)',
			icon: Sparkles,
			category: 'extraction'
		},
		{
			id: 'flashcards',
			name: 'Flashcard Generation',
			description: 'Generating study cards from content',
			icon: Brain,
			category: 'extraction'
		},
		{
			id: 'synthesis',
			name: 'UPSC Synthesis',
			description: 'Synthesizing news facts into GS articles',
			icon: FileText,
			category: 'extraction'
		},
		{
			id: 'current_affairs',
			name: 'Current Affairs',
			description: 'Extracting news stories from raw analysis',
			icon: Zap,
			category: 'extraction'
		},
		{
			id: 'locations',
			name: 'Mapping / Locations',
			description: 'Extracting geographical facts',
			icon: Search,
			category: 'extraction'
		},
		{
			id: 'chat_primary',
			name: 'Primary Chat',
			description: 'Default model for standard chat conversations',
			icon: Zap,
			category: 'chat'
		},
		{
			id: 'multi_agent',
			name: 'Multi-Agent Orchestrator',
			description: 'The primary agent that orchestrates sub-agents',
			icon: Bot,
			category: 'agents'
		},
		{
			id: 'intent_router',
			name: 'Intent Router',
			description: 'Classifies user intent and routes to specialized agents',
			icon: Zap,
			category: 'agents'
		},
		{
			id: 'memory_extraction',
			name: 'Memory Extraction',
			description: 'Extracting factual info from chat messages',
			icon: Brain,
			category: 'agents'
		},
		{
			id: 'embeddings',
			name: 'Vector Embeddings',
			description: 'Model for generating memory embeddings',
			icon: Settings2,
			category: 'embeddings'
		},
		{
			id: 'memory_judge',
			name: 'Memory Judge',
			description: 'Deduplicating and comparing memories',
			icon: Shield,
			category: 'agents'
		},
		{
			id: 'standalone_query',
			name: 'Query Re-writer',
			description: 'Turning follow-up chats into standalone queries',
			icon: RefreshCw,
			category: 'agents'
		},
		{
			id: 'rag_embeddings',
			name: 'RAG Embeddings',
			description: 'Embedding model for vector search (typically OpenAI)',
			icon: Settings2,
			category: 'embeddings'
		},
		{
			id: 'web_search_tool',
			name: 'Web Search',
			description: 'Model for agent web search tool (uses :online suffix)',
			icon: Search,
			category: 'agents'
		}
	];

	const embeddingTasks = ['embeddings', 'rag_embeddings'];

	const categories = [
		{ id: 'all', label: 'All Tasks' },
		{ id: 'extraction', label: 'Extraction' },
		{ id: 'chat', label: 'Chat' },
		{ id: 'agents', label: 'Agents' },
		{ id: 'embeddings', label: 'Embeddings' }
	];

	const configsQuery = useQuery(api.tasks.listConfigs, {});
	const chatModelsQuery = useQuery(api.models.list, { type: 'chat' });
	const embeddingModelsQuery = useQuery(api.models.list, { type: 'embedding' });

	let taskSettings = $state<
		Record<string, { modelId: string; temperature?: number; maxTokens?: number }>
	>({});
	let isSaving = $state<Record<string, boolean>>({});
	let isSyncing = $state(false);
	let modelSearchQueries = $state<Record<string, string>>({});
	let openPopovers = $state<Record<string, boolean>>({});
	let triggerWidths = $state<Record<string, number>>({});
	let activeTab = $state('all');
	let searchFilter = $state('');

	systemTasks.forEach((t) => {
		taskSettings[t.id] = { modelId: '', temperature: 0.3, maxTokens: 1000 };
		isSaving[t.id] = false;
		modelSearchQueries[t.id] = '';
		openPopovers[t.id] = false;
		triggerWidths[t.id] = 0;
	});

	let filteredTasks = $derived(() => {
		let tasks = systemTasks;
		if (activeTab !== 'all') {
			tasks = tasks.filter((t) => t.category === activeTab);
		}
		if (searchFilter.trim()) {
			const q = searchFilter.toLowerCase();
			tasks = tasks.filter(
				(t) =>
					t.name.toLowerCase().includes(q) ||
					t.description.toLowerCase().includes(q) ||
					t.id.toLowerCase().includes(q)
			);
		}
		return tasks;
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
	<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div class="space-y-1">
			<div class="flex items-center gap-2">
				<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
					<Cpu class="h-4 w-4 text-primary" />
				</div>
				<h1 class="text-2xl font-semibold tracking-tight">System Model Settings</h1>
			</div>
			<p class="text-sm text-muted-foreground">
				Assign AI models to background tasks and system processes.
			</p>
		</div>
		<div class="flex gap-2">
			<Button onclick={syncModels} variant="outline" size="sm" class="gap-2" disabled={isSyncing}>
				{#if isSyncing}
					<RefreshCw class="h-3.5 w-3.5 animate-spin" />
				{:else}
					<RefreshCw class="h-3.5 w-3.5" />
				{/if}
				Sync Models
			</Button>
		</div>
	</div>

	<!-- Search + Filter Tabs Row -->
	<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<Tabs.Root bind:value={activeTab}>
			<Tabs.List class="h-9">
				{#each categories as cat}
					<Tabs.Trigger value={cat.id} class="text-xs px-3">
						{cat.label}
						{#if cat.id !== 'all'}
							<span class="ml-1 text-[10px] text-muted-foreground">
								({systemTasks.filter((t) => t.category === cat.id).length})
							</span>
						{/if}
					</Tabs.Trigger>
				{/each}
			</Tabs.List>
		</Tabs.Root>
		<div class="relative w-full sm:w-64">
			<Search class="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
			<Input
				placeholder="Search tasks..."
				bind:value={searchFilter}
				class="h-9 pl-8 text-sm"
			/>
		</div>
	</div>

	{#if configsQuery.isLoading || chatModelsQuery.isLoading || embeddingModelsQuery.isLoading}
		<div class="rounded-lg border bg-card">
			<div class="space-y-0">
				{#each Array(6) as _}
					<div class="flex items-center gap-4 border-b px-4 py-3 last:border-b-0">
						<Skeleton class="h-8 w-8 shrink-0 rounded-md" />
						<Skeleton class="h-4 w-28" />
						<Skeleton class="h-4 w-48" />
						<div class="flex-1" />
						<Skeleton class="h-8 w-48" />
						<Skeleton class="h-8 w-20" />
						<Skeleton class="h-8 w-24" />
						<Skeleton class="h-8 w-20" />
					</div>
				{/each}
			</div>
		</div>
	{:else}
		<div class="rounded-lg border bg-card shadow-sm">
			<!-- Table Header -->
			<div
				class="grid grid-cols-[2.5rem_10rem_1fr_5rem_minmax(12rem,2fr)_4.5rem_5rem_2.5rem] items-center gap-3 border-b bg-muted/40 px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
			>
				<span></span>
				<span>Task</span>
				<span>Description</span>
				<span>Status</span>
				<span>Model</span>
				<span>Temp</span>
				<span>Max Tokens</span>
				<span></span>
			</div>

			<!-- Table Body -->
			{#if filteredTasks().length === 0}
				<div class="flex items-center justify-center py-12 text-sm text-muted-foreground">
					No tasks match the current filter.
				</div>
			{:else}
				{#each filteredTasks() as task (task.id)}
					{@const isConfigured = !!configsQuery.data?.find((c) => c.task === task.id)}
					<div
						class="group grid grid-cols-[2.5rem_10rem_1fr_5rem_minmax(12rem,2fr)_4.5rem_5rem_2.5rem] items-center gap-3 border-b px-4 py-2.5 transition-colors last:border-b-0 hover:bg-muted/30"
					>
						<!-- Icon -->
						<div
							class="flex h-8 w-8 items-center justify-center rounded-md bg-primary/5 text-primary"
						>
							<task.icon class="h-4 w-4" />
						</div>

						<!-- Name -->
						<div class="min-w-0 overflow-hidden">
							<span class="block truncate text-sm font-medium">{task.name}</span>
						</div>

						<!-- Description -->
						<div class="min-w-0 overflow-hidden">
							<span class="block truncate text-xs text-muted-foreground">{task.description}</span>
						</div>

						<!-- Status -->
						<div>
							{#if isConfigured}
								<Badge
									variant="outline"
									class="border-emerald-500/20 bg-emerald-500/5 text-[10px] text-emerald-600"
								>
									Set
								</Badge>
							{:else}
								<Badge variant="secondary" class="text-[10px]">Default</Badge>
							{/if}
						</div>

						<!-- Model Selector -->
						<div class="min-w-0">
							{#if taskSettings[task.id]}
								<div class="w-full" bind:clientWidth={triggerWidths[task.id]}>
									<Popover bind:open={openPopovers[task.id]}>
										<PopoverPrimitive.Trigger class="w-full">
											{#snippet child({ props })}
												<Button
													variant="outline"
													role="combobox"
													aria-expanded={openPopovers[task.id]}
													class="h-8 w-full justify-between text-xs font-normal"
													{...props}
												>
													<span class="flex-1 truncate text-left">
														{taskSettings[task.id].modelId
															? getModelName(task.id, taskSettings[task.id].modelId)
															: 'Select model...'}
													</span>
													<ChevronsUpDown class="ml-1 h-3 w-3 shrink-0 opacity-50" />
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
													<Search class="mr-2 h-3.5 w-3.5 shrink-0 opacity-50" />
													<input
														class="flex h-8 w-full rounded-md bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
														placeholder="Search models..."
														bind:value={modelSearchQueries[task.id]}
													/>
												</div>
												<div class="max-h-[300px] overflow-y-auto p-1">
													{#if getFilteredModels(task.id, modelSearchQueries[task.id]).length === 0}
														<div
															class="px-2 py-4 text-center text-sm text-muted-foreground"
														>
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
																	if (
																		model.attributes?.top_provider
																			?.max_completion_tokens
																	) {
																		taskSettings[task.id].maxTokens =
																			model.attributes.top_provider.max_completion_tokens;
																	}
																	openPopovers[task.id] = false;
																}}
															>
																<Check
																	class={cn(
																		'mr-2 h-3.5 w-3.5 shrink-0',
																		taskSettings[task.id].modelId === model.modelId
																			? 'opacity-100'
																			: 'opacity-0'
																	)}
																/>
																<div
																	class="flex min-w-0 flex-1 flex-col items-start gap-0.5"
																>
																	<span class="truncate font-medium"
																		>{model.name}</span
																	>
																	<span
																		class="truncate text-[10px] text-muted-foreground"
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

						<!-- Temperature -->
						<div>
							{#if taskSettings[task.id]}
								<Input
									type="number"
									step="0.1"
									min="0"
									max="2"
									placeholder="0.3"
									bind:value={taskSettings[task.id].temperature}
									class="h-8 w-full text-xs"
								/>
							{/if}
						</div>

						<!-- Max Tokens -->
						<div>
							{#if taskSettings[task.id]}
								<Input
									type="number"
									step="100"
									placeholder="2048"
									bind:value={taskSettings[task.id].maxTokens}
									class="h-8 w-full text-xs"
								/>
							{/if}
						</div>

						<!-- Save -->
						<div class="flex justify-end">
							<Button
								variant="ghost"
								size="icon"
								class="h-8 w-8"
								onclick={() => updateTaskConfig(task.id)}
								disabled={isSaving[task.id]}
							>
								{#if isSaving[task.id]}
									<RefreshCw class="h-3.5 w-3.5 animate-spin" />
								{:else}
									<Save class="h-3.5 w-3.5" />
								{/if}
							</Button>
						</div>
					</div>
				{/each}
			{/if}
		</div>

		<!-- Info Section -->
		<div class="mt-6 rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3">
			<div class="flex items-center gap-3">
				<Info class="h-4 w-4 shrink-0 text-blue-600" />
				<p class="text-xs leading-relaxed text-blue-800/80 dark:text-blue-200/80">
					These settings override hardcoded defaults. Unconfigured tasks use internal defaults.
					Models must be synced to appear in the selector.
				</p>
			</div>
		</div>
	{/if}
</div>
