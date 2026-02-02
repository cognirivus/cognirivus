<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import { toast } from 'svelte-sonner';
	import { Route, X, Save, Target, ArrowUpDown, Percent, Bot } from '@lucide/svelte';

	interface Props {
		open: boolean;
		rule: any;
		isNew: boolean;
		agents: any[];
		onClose: () => void;
		onSave: (data: any) => void;
	}

	let { open, rule, isNew, agents, onClose, onSave }: Props = $props();

	// Form state
	let pattern = $state('');
	let agentName = $state('');
	let priority = $state(100);
	let confidence = $state(0.8);
	let isEnabled = $state(true);

	// Validation errors
	let errors = $state<Record<string, string>>({});

	// Initialize form when rule changes
	$effect(() => {
		if (open) {
			if (rule) {
				pattern = rule.pattern || '';
				agentName = rule.agentName || '';
				priority = rule.priority ?? 100;
				confidence = rule.confidence ?? 0.8;
				isEnabled = rule.isEnabled ?? true;
			} else {
				// Reset for new rule
				pattern = '';
				agentName = agents.length > 0 ? agents[0].name : '';
				priority = 100;
				confidence = 0.8;
				isEnabled = true;
			}
			errors = {};
		}
	});

	function validate(): boolean {
		const newErrors: Record<string, string> = {};

		if (!pattern.trim()) {
			newErrors.pattern = 'Pattern is required';
		}

		if (!agentName.trim()) {
			newErrors.agentName = 'Target agent is required';
		}

		if (priority < 0 || priority > 1000) {
			newErrors.priority = 'Priority must be between 0 and 1000';
		}

		if (confidence < 0 || confidence > 1) {
			newErrors.confidence = 'Confidence must be between 0 and 1';
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
			pattern: pattern.trim(),
			agentName: agentName.trim(),
			priority,
			confidence,
			isEnabled
		};

		onSave(data);
	}

	function handleClose() {
		onClose();
	}

	// Get enabled agents only
	let enabledAgents = $derived(() => agents.filter((a) => a.isEnabled));
</script>

<Dialog.Root {open} onOpenChange={(v) => !v && handleClose()}>
	<Dialog.Content class="max-h-[85vh] max-w-lg overflow-hidden p-0">
		<Dialog.Header class="border-b px-6 py-4">
			<div class="flex items-center gap-2">
				<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
					<Route class="h-4 w-4 text-primary" />
				</div>
				<Dialog.Title class="text-lg font-semibold">
					{isNew ? 'Add Intent Rule' : 'Edit Intent Rule'}
				</Dialog.Title>
			</div>
			<Dialog.Description class="text-sm text-muted-foreground">
				{isNew
					? 'Create a new pattern-based routing rule to direct queries to agents.'
					: `Editing rule for "${rule?.pattern}"`}
			</Dialog.Description>
		</Dialog.Header>

		<div class="h-[calc(85vh-180px)] overflow-y-auto px-6 py-4">
			<div class="space-y-5">
				<!-- Pattern -->
				<div class="space-y-2">
					<Label for="pattern" class="flex items-center gap-1.5 text-sm font-medium">
						<Target class="h-4 w-4" />
						Pattern (Keyword/Phrase)
						<span class="text-destructive">*</span>
					</Label>
					<Input
						id="pattern"
						bind:value={pattern}
						placeholder="e.g., flashcard, study plan, write blog..."
						class={errors.pattern ? 'border-destructive' : ''}
					/>
					{#if errors.pattern}
						<p class="text-xs text-destructive">{errors.pattern}</p>
					{:else}
						<p class="text-xs text-muted-foreground">
							Users' queries containing this pattern will be routed to the selected agent.
							Case-insensitive matching.
						</p>
					{/if}
				</div>

				<Separator />

				<!-- Target Agent -->
				<div class="space-y-2">
					<Label for="agentName" class="flex items-center gap-1.5 text-sm font-medium">
						<Bot class="h-4 w-4" />
						Target Agent
						<span class="text-destructive">*</span>
					</Label>
					{#if enabledAgents().length === 0}
						<div class="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3">
							<p class="text-sm text-yellow-600">
								No enabled agents available. Please enable an agent first.
							</p>
						</div>
					{:else}
						<select
							id="agentName"
							bind:value={agentName}
							class="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
							class:border-destructive={errors.agentName}
						>
							{#each enabledAgents() as agent}
								<option value={agent.name}>
									{agent.displayName} ({agent.name})
								</option>
							{/each}
						</select>
					{/if}
					{#if errors.agentName}
						<p class="text-xs text-destructive">{errors.agentName}</p>
					{/if}
				</div>

				<Separator />

				<!-- Priority & Confidence -->
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="priority" class="flex items-center gap-1.5 text-sm font-medium">
							<ArrowUpDown class="h-4 w-4" />
							Priority
						</Label>
						<Input
							id="priority"
							type="number"
							bind:value={priority}
							min={0}
							max={1000}
							class={errors.priority ? 'border-destructive' : ''}
						/>
						{#if errors.priority}
							<p class="text-xs text-destructive">{errors.priority}</p>
						{:else}
							<p class="text-xs text-muted-foreground">
								Higher priority rules are checked first (0-1000)
							</p>
						{/if}
					</div>

					<div class="space-y-2">
						<Label for="confidence" class="flex items-center gap-1.5 text-sm font-medium">
							<Percent class="h-4 w-4" />
							Confidence: {(confidence * 100).toFixed(0)}%
						</Label>
						<input
							id="confidence"
							type="range"
							bind:value={confidence}
							min={0}
							max={1}
							step={0.05}
							class="w-full"
						/>
						{#if errors.confidence}
							<p class="text-xs text-destructive">{errors.confidence}</p>
						{:else}
							<p class="text-xs text-muted-foreground">
								How confident the system should be in this match
							</p>
						{/if}
					</div>
				</div>

				<Separator />

				<!-- Status -->
				<div class="flex items-center justify-between rounded-lg border border-border p-4">
					<div class="space-y-0.5">
						<Label class="text-sm font-medium">Enabled</Label>
						<p class="text-xs text-muted-foreground">Active rules are used for intent detection</p>
					</div>
					<Switch bind:checked={isEnabled} />
				</div>

				<!-- Tips -->
				<div class="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
					<h4 class="mb-2 flex items-center gap-1.5 text-sm font-medium text-blue-600">
						<Target class="h-4 w-4" />
						Tips for Good Patterns
					</h4>
					<ul class="space-y-1 text-xs text-blue-600/80">
						<li>• Use specific keywords: "flashcard" rather than "card"</li>
						<li>• Consider synonyms: add multiple rules for similar phrases</li>
						<li>• Use higher priority (200+) for very specific patterns</li>
						<li>• Keep patterns lowercase - matching is case-insensitive</li>
					</ul>
				</div>
			</div>
		</div>

		<Dialog.Footer class="border-t px-6 py-4">
			<Button variant="outline" onclick={handleClose}>Cancel</Button>
			<Button onclick={handleSave} class="gap-2" disabled={enabledAgents().length === 0}>
				<Save class="h-4 w-4" />
				{isNew ? 'Create Rule' : 'Save Changes'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
