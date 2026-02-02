<script lang="ts">
	import { ChevronUp, ChevronDown } from '@lucide/svelte';
	import { slide } from 'svelte/transition';

	interface AgentWork {
		agentName: string;
		agentDisplayName: string;
		intentConfidence: number;
		intentReasoning: string;
		toolExecutions: Array<{
			toolName: string;
			status: string;
			input?: any;
			output?: any;
			errorMessage?: string;
		}>;
		agentResponse: string;
		cost: number;
		isStreaming?: boolean;
	}

	interface Props {
		agentWork: AgentWork;
	}

	let { agentWork }: Props = $props();

	let expanded = $state(false);

	const isStreaming = $derived(agentWork.isStreaming ?? false);

	// Generate human-readable log steps from agent work
	const steps = $derived.by(() => {
		const result: Array<{ text: string; status: 'done' | 'running' | 'error' }> = [];

		// Intent step
		if (agentWork.intentReasoning) {
			result.push({
				text: `Selecting agent: ${agentWork.agentDisplayName}`,
				status: 'done'
			});
		}

		// Tool execution steps
		for (const tool of agentWork.toolExecutions || []) {
			const toolLabel = formatToolName(tool.toolName);

			if (tool.status === 'running') {
				result.push({
					text: `Running ${toolLabel}...`,
					status: 'running'
				});
			} else if (tool.status === 'error') {
				result.push({
					text: `${toolLabel} failed`,
					status: 'error'
				});
			} else {
				// Completed - show result summary
				const summary = formatToolOutput(tool.toolName, tool.output);
				result.push({
					text: summary,
					status: 'done'
				});
			}
		}

		// Final step when complete
		if (!isStreaming && agentWork.agentResponse) {
			result.push({
				text: 'Response generated',
				status: 'done'
			});
		}

		return result;
	});

	function formatToolName(name: string): string {
		// Convert camelCase to readable format
		return name
			.replace(/([A-Z])/g, ' $1')
			.replace(/^./, (s) => s.toUpperCase())
			.trim();
	}

	function formatToolOutput(toolName: string, output: any): string {
		if (!output) return `${formatToolName(toolName)} completed`;

		// Handle specific tools with human-readable output
		if (toolName === 'searchMemories') {
			const count = output?.data?.count ?? output?.count ?? 0;
			return `Found ${count} memories`;
		}
		if (toolName === 'searchBlogs' || toolName === 'searchKnowledge') {
			const count = output?.results?.length ?? output?.count ?? 0;
			return `Found ${count} results`;
		}
		if (toolName === 'webSearch') {
			const count = output?.results?.length ?? 0;
			return `Found ${count} web results`;
		}
		if (toolName === 'analyzeContent') {
			return 'Content analyzed';
		}
		if (toolName === 'storeMemory' || toolName === 'saveMemory') {
			return 'Memory saved';
		}
		if (toolName === 'deleteMemory') {
			return 'Memory deleted';
		}

		// Default: just show tool completed
		return `${formatToolName(toolName)} completed`;
	}
</script>

<div class="mb-3">
	<button
		class="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
		onclick={() => (expanded = !expanded)}
	>
		<span>Agent run: {agentWork.agentDisplayName}</span>
		{#if expanded}
			<ChevronUp class="h-3.5 w-3.5" />
		{:else}
			<ChevronDown class="h-3.5 w-3.5" />
		{/if}
	</button>

	{#if expanded}
		<div class="mt-2 space-y-0.5 border-l border-muted-foreground/30 pl-4" transition:slide>
			{#each steps as step}
				<div
					class="text-sm {step.status === 'running'
						? 'text-muted-foreground'
						: step.status === 'error'
							? 'text-destructive'
							: 'text-foreground/80'}"
				>
					{#if step.status === 'running'}
						<span class="animate-pulse">{step.text}</span>
					{:else if step.status === 'done' && step === steps[steps.length - 1]}
						<span class="font-medium">{step.text}</span>
					{:else}
						{step.text}
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
