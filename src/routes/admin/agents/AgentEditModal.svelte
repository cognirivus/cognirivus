<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { Badge } from '$lib/components/ui/badge';

	import { Separator } from '$lib/components/ui/separator';
	import { toast } from 'svelte-sonner';
	import { Bot, X, Save, Wrench, Shield, Thermometer, Hash } from '@lucide/svelte';

	interface Props {
		open: boolean;
		agent: any;
		isNew: boolean;
		onClose: () => void;
		onSave: (data: any) => void;
	}

	let { open, agent, isNew, onClose, onSave }: Props = $props();

	// Form state
	let displayName = $state('');
	let description = $state('');
	let name = $state('');
	let mode: 'primary' | 'subagent' = $state('primary');
	let model = $state('openai/gpt-4o');
	let temperature = $state(0.7);
	let maxSteps = $state(10);
	let instructions = $state('');
	let isEnabled = $state(true);
	let isAdminOnly = $state(false);
	let selectedTools = $state<string[]>([]);

	// Validation errors
	let errors = $state<Record<string, string>>({});

	// Available tools (placeholder - in production, fetch from API)
	const availableTools = [
		{ name: 'searchMemories', description: 'Search user memories', category: 'Memory' },
		{ name: 'extractMemories', description: 'Extract and store memories', category: 'Memory' },
		{
			name: 'analyzeContent',
			description: 'Analyze content and extract insights',
			category: 'Content'
		},
		{ name: 'writeContent', description: 'Write blog posts and articles', category: 'Content' },
		{ name: 'generateCards', description: 'Generate flashcards', category: 'Learning' },
		{ name: 'createSyllabus', description: 'Create study plans and syllabi', category: 'Learning' },
		{ name: 'searchBlogs', description: 'Search blog content', category: 'Search' },
		{ name: 'webSearch', description: 'Search the web', category: 'Search' },
		{ name: 'generateImage', description: 'Generate images', category: 'Media' },
		{
			name: 'bulkOperations',
			description: 'Perform bulk data operations',
			category: 'Admin',
			isAdminOnly: true
		},
		{ name: 'userManagement', description: 'Manage users', category: 'Admin', isAdminOnly: true },
		{
			name: 'systemConfig',
			description: 'Configure system settings',
			category: 'Admin',
			isAdminOnly: true
		}
	];

	const modelOptions = [
		{ value: 'openai/gpt-4o', label: 'GPT-4O' },
		{ value: 'openai/gpt-4o-mini', label: 'GPT-4O Mini' },
		{ value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
		{ value: 'google/gemini-2.0-flash-exp:free', label: 'Gemini 2.0 Flash' },
		{ value: 'deepseek/deepseek-chat', label: 'DeepSeek Chat' },
		{ value: 'qwen/qwen-2.5-72b-instruct', label: 'Qwen 2.5 72B' },
		{ value: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B' }
	];

	// Initialize form when agent changes
	$effect(() => {
		if (open) {
			if (agent) {
				displayName = agent.displayName || '';
				description = agent.description || '';
				name = agent.name || '';
				mode = agent.mode || 'primary';
				model = agent.model || 'openai/gpt-4o';
				temperature = agent.temperature ?? 0.7;
				maxSteps = agent.maxSteps ?? 10;
				instructions = agent.instructions || '';
				isEnabled = agent.isEnabled ?? true;
				isAdminOnly = agent.isAdminOnly ?? false;
				selectedTools = agent.availableTools || [];
			} else {
				// Reset for new agent
				displayName = '';
				description = '';
				name = '';
				mode = 'primary';
				model = 'openai/gpt-4o';
				temperature = 0.7;
				maxSteps = 10;
				instructions = '';
				isEnabled = true;
				isAdminOnly = false;
				selectedTools = [];
			}
			errors = {};
		}
	});

	function validate(): boolean {
		const newErrors: Record<string, string> = {};

		if (!name.trim()) {
			newErrors.name = 'Name is required';
		} else if (!/^[a-z0-9-]+$/.test(name)) {
			newErrors.name = 'Name must be lowercase alphanumeric with hyphens only';
		}

		if (!displayName.trim()) {
			newErrors.displayName = 'Display name is required';
		}

		if (!description.trim()) {
			newErrors.description = 'Description is required';
		}

		if (!model.trim()) {
			newErrors.model = 'Model is required';
		}

		if (temperature < 0 || temperature > 2) {
			newErrors.temperature = 'Temperature must be between 0 and 2';
		}

		if (maxSteps < 1 || maxSteps > 50) {
			newErrors.maxSteps = 'Max steps must be between 1 and 50';
		}

		if (!instructions.trim()) {
			newErrors.instructions = 'Instructions are required';
		}

		errors = newErrors;
		return Object.keys(newErrors).length === 0;
	}

	function handleSave() {
		if (!validate()) {
			toast.error('Please fix the errors before saving');
			return;
		}

		const data = {
			name: name.trim(),
			displayName: displayName.trim(),
			description: description.trim(),
			mode,
			model,
			temperature,
			maxSteps,
			instructions: instructions.trim(),
			isEnabled,
			isAdminOnly,
			availableTools: selectedTools
		};

		onSave(data);
	}

	function toggleTool(toolName: string) {
		if (selectedTools.includes(toolName)) {
			selectedTools = selectedTools.filter((t) => t !== toolName);
		} else {
			selectedTools = [...selectedTools, toolName];
		}
	}

	function handleClose() {
		onClose();
	}

	// Group tools by category
	let toolsByCategory = $derived.by(() => {
		const grouped: Record<string, typeof availableTools> = {};
		for (const tool of availableTools) {
			if (!grouped[tool.category]) {
				grouped[tool.category] = [];
			}
			grouped[tool.category].push(tool);
		}
		return grouped;
	});

	const categories = ['Memory', 'Content', 'Learning', 'Search', 'Media', 'Admin'];
</script>

<Dialog.Root {open} onOpenChange={(v) => !v && handleClose()}>
	<Dialog.Content class="max-h-[90vh] max-w-2xl overflow-hidden p-0">
		<Dialog.Header class="border-b px-6 py-4">
			<div class="flex items-center gap-2">
				<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
					<Bot class="h-4 w-4 text-primary" />
				</div>
				<Dialog.Title class="text-lg font-semibold">
					{isNew ? 'Add New Agent' : 'Edit Agent'}
				</Dialog.Title>
			</div>
			<Dialog.Description class="text-sm text-muted-foreground">
				{isNew
					? 'Create a new AI agent with custom configuration and capabilities.'
					: `Editing "${agent?.displayName || agent?.name}"`}
			</Dialog.Description>
		</Dialog.Header>

		<div class="h-[calc(90vh-200px)] overflow-y-auto px-6 py-4">
			<div class="space-y-6">
				<!-- Basic Info -->
				<div class="space-y-4">
					<h3 class="text-sm font-semibold text-foreground">Basic Information</h3>

					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="name" class="text-xs font-medium">
								System Name
								<span class="text-destructive">*</span>
							</Label>
							<Input
								id="name"
								bind:value={name}
								placeholder="e.g., research-assistant"
								disabled={!isNew}
								class={errors.name ? 'border-destructive' : ''}
							/>
							{#if errors.name}
								<p class="text-xs text-destructive">{errors.name}</p>
							{:else}
								<p class="text-xs text-muted-foreground">
									Unique identifier, lowercase with hyphens
								</p>
							{/if}
						</div>

						<div class="space-y-2">
							<Label for="displayName" class="text-xs font-medium">
								Display Name
								<span class="text-destructive">*</span>
							</Label>
							<Input
								id="displayName"
								bind:value={displayName}
								placeholder="e.g., Research Assistant"
								class={errors.displayName ? 'border-destructive' : ''}
							/>
							{#if errors.displayName}
								<p class="text-xs text-destructive">{errors.displayName}</p>
							{/if}
						</div>
					</div>

					<div class="space-y-2">
						<Label for="description" class="text-xs font-medium">
							Description
							<span class="text-destructive">*</span>
						</Label>
						<textarea
							id="description"
							bind:value={description}
							placeholder="Brief description of what this agent does..."
							rows={2}
							class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
							class:border-destructive={errors.description}
						></textarea>
						{#if errors.description}
							<p class="text-xs text-destructive">{errors.description}</p>
						{/if}
					</div>
				</div>

				<Separator />

				<!-- Configuration -->
				<div class="space-y-4">
					<h3 class="text-sm font-semibold text-foreground">Configuration</h3>

					<div class="grid gap-4 sm:grid-cols-3">
						<div class="space-y-2">
							<Label for="mode" class="text-xs font-medium">Mode</Label>
							<select
								id="mode"
								bind:value={mode}
								class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
							>
								<option value="primary">Primary</option>
								<option value="subagent">Subagent</option>
							</select>
						</div>

						<div class="space-y-2">
							<Label for="model" class="text-xs font-medium">
								Model
								<span class="text-destructive">*</span>
							</Label>
							<select
								id="model"
								bind:value={model}
								class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
								class:border-destructive={errors.model}
							>
								{#each modelOptions as opt}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
							{#if errors.model}
								<p class="text-xs text-destructive">{errors.model}</p>
							{/if}
						</div>

						<div class="space-y-2">
							<Label for="maxSteps" class="flex items-center gap-1 text-xs font-medium">
								<Hash class="h-3 w-3" />
								Max Steps
							</Label>
							<Input
								id="maxSteps"
								type="number"
								bind:value={maxSteps}
								min={1}
								max={50}
								class={errors.maxSteps ? 'border-destructive' : ''}
							/>
							{#if errors.maxSteps}
								<p class="text-xs text-destructive">{errors.maxSteps}</p>
							{/if}
						</div>
					</div>

					<div class="space-y-2">
						<Label for="temperature" class="flex items-center gap-1 text-xs font-medium">
							<Thermometer class="h-3 w-3" />
							Temperature: {temperature.toFixed(1)}
						</Label>
						<input
							id="temperature"
							type="range"
							bind:value={temperature}
							min={0}
							max={2}
							step={0.1}
							class="w-full"
						/>
						<div class="flex justify-between text-xs text-muted-foreground">
							<span>Precise (0)</span>
							<span>Balanced (1)</span>
							<span>Creative (2)</span>
						</div>
						{#if errors.temperature}
							<p class="text-xs text-destructive">{errors.temperature}</p>
						{/if}
					</div>
				</div>

				<Separator />

				<!-- Instructions -->
				<div class="space-y-2">
					<Label for="instructions" class="text-xs font-medium">
						System Instructions
						<span class="text-destructive">*</span>
					</Label>
					<textarea
						id="instructions"
						bind:value={instructions}
						placeholder="Detailed instructions for how this agent should behave..."
						rows={6}
						class="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm leading-relaxed ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
						class:border-destructive={errors.instructions}
					></textarea>
					{#if errors.instructions}
						<p class="text-xs text-destructive">{errors.instructions}</p>
					{:else}
						<p class="text-xs text-muted-foreground">
							These instructions define the agent's behavior, personality, and capabilities.
						</p>
					{/if}
				</div>

				<Separator />

				<!-- Tools -->
				<div class="space-y-4">
					<h3 class="flex items-center gap-2 text-sm font-semibold text-foreground">
						<Wrench class="h-4 w-4" />
						Available Tools
					</h3>

					<div class="space-y-4">
						{#each categories as category}
							{@const tools = toolsByCategory[category] || []}
							{#if tools.length > 0}
								<div>
									<h4
										class="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase"
									>
										{category}
									</h4>
									<div class="grid gap-2 sm:grid-cols-2">
										{#each tools as tool}
											{@const isSelected = selectedTools.includes(tool.name)}
											{@const isAdminOnly = tool.isAdminOnly || false}
											<button
												type="button"
												onclick={() => toggleTool(tool.name)}
												class="flex items-start gap-3 rounded-lg border p-3 text-left transition-all hover:border-primary/30 hover:bg-muted/50 {isSelected
													? 'border-primary bg-primary/5 ring-1 ring-primary/20'
													: 'border-border'}"
											>
												<div
													class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border {isSelected
														? 'border-primary bg-primary'
														: 'border-input'}"
												>
													{#if isSelected}
														<svg
															class="h-3 w-3 text-primary-foreground"
															fill="none"
															viewBox="0 0 24 24"
															stroke="currentColor"
														>
															<path
																stroke-linecap="round"
																stroke-linejoin="round"
																stroke-width={3}
																d="M5 13l4 4L19 7"
															/>
														</svg>
													{/if}
												</div>
												<div class="min-w-0 flex-1">
													<div class="flex items-center gap-1.5">
														<span class="truncate text-sm font-medium">{tool.name}</span>
														{#if isAdminOnly}
															<Shield class="h-3 w-3 shrink-0 text-amber-500" />
														{/if}
													</div>
													<p class="line-clamp-1 text-xs text-muted-foreground">
														{tool.description}
													</p>
												</div>
											</button>
										{/each}
									</div>
								</div>
							{/if}
						{/each}
					</div>

					{#if selectedTools.length > 0}
						<div class="flex flex-wrap gap-1.5 pt-2">
							<span class="mr-1 text-xs text-muted-foreground">Selected:</span>
							{#each selectedTools as toolName}
								<Badge variant="secondary" class="gap-1 text-xs">
									{toolName}
									<button
										type="button"
										onclick={() => toggleTool(toolName)}
										class="ml-1 hover:text-destructive"
									>
										<X class="h-3 w-3" />
									</button>
								</Badge>
							{/each}
						</div>
					{/if}
				</div>

				<Separator />

				<!-- Access Control -->
				<div class="space-y-4">
					<h3 class="text-sm font-semibold text-foreground">Access Control</h3>

					<div class="flex flex-col gap-4 sm:flex-row">
						<div
							class="flex items-center justify-between rounded-lg border border-border p-3 sm:flex-1"
						>
							<div class="space-y-0.5">
								<Label class="text-sm font-medium">Enabled</Label>
								<p class="text-xs text-muted-foreground">Allow users to interact with this agent</p>
							</div>
							<Switch bind:checked={isEnabled} />
						</div>

						<div
							class="flex items-center justify-between rounded-lg border border-border p-3 sm:flex-1"
						>
							<div class="space-y-0.5">
								<div class="flex items-center gap-1.5">
									<Label class="text-sm font-medium">Admin Only</Label>
									<Shield class="h-3 w-3 text-amber-500" />
								</div>
								<p class="text-xs text-muted-foreground">Restrict to admin users only</p>
							</div>
							<Switch bind:checked={isAdminOnly} />
						</div>
					</div>
				</div>
			</div>
		</div>

		<Dialog.Footer class="border-t px-6 py-4">
			<Button variant="outline" onclick={handleClose}>Cancel</Button>
			<Button onclick={handleSave} class="gap-2">
				<Save class="h-4 w-4" />
				{isNew ? 'Create Agent' : 'Save Changes'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
