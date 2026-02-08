<script lang="ts">
	import {
		ChevronUp,
		ChevronDown,
		Search,
		BookOpen,
		Database,
		Brain,
		FileText,
		Globe,
		Zap,
		Activity
	} from '@lucide/svelte';
	import { slide } from 'svelte/transition';

	interface TruncatedText {
		text: string;
		originalLength: number;
		truncated: boolean;
	}

	interface ToolExecution {
		toolName: string;
		status: string;
		input?: Record<string, unknown>;
		output?: unknown;
		errorMessage?: string;
		step?: number;
	}

	interface AgentWork {
		agentName: string;
		agentDisplayName: string;
		intentConfidence: number;
		intentReasoning: string;
		toolExecutions: ToolExecution[];
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
		const result: Array<{
			text: string;
			status: 'done' | 'running' | 'error';
			icon?: any;
			query?: string;
		}> = [];

		// Initial intent step
		result.push({
			text: `Selecting agent: ${agentWork.agentDisplayName}`,
			status: 'done',
			icon: Zap
		});

		// Tool execution steps
		for (const tool of agentWork.toolExecutions || []) {
			const toolLabel = formatToolName(tool.toolName);
			const query = (tool.input as any)?.query || (tool.input as any)?.queryText || '';

			let icon = Activity;
			if (tool.toolName === 'webSearch') icon = Globe;
			if (tool.toolName === 'searchBlogs') icon = BookOpen;
			if (tool.toolName === 'searchMemories' || tool.toolName === 'extractMemories')
				icon = Database;
			if (tool.toolName === 'analyzeContent') icon = FileText;

			if (tool.status === 'running') {
				result.push({
					text: `Running ${toolLabel}...`,
					status: 'running',
					icon,
					query
				});
			} else if (tool.status === 'error') {
				result.push({
					text: `${toolLabel} failed`,
					status: 'error',
					icon
				});
			} else {
				// Completed - show result summary
				const summary = formatToolOutput(tool.toolName, tool.output);
				result.push({
					text: summary,
					status: 'done',
					icon,
					query
				});
			}
		}

		// Final step when complete
		if (!isStreaming && agentWork.agentResponse) {
			result.push({
				text: 'Response generated',
				status: 'done',
				icon: Brain
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

	function formatToolOutput(toolName: string, output: unknown): string {
		if (!output) return `${formatToolName(toolName)} completed`;

		// Handle specific tools with human-readable output
		if (toolName === 'searchMemories') {
			const toolData = output as { data?: { count?: number }; count?: number };
			const count = toolData?.data?.count ?? toolData?.count ?? 0;
			return `Found ${count} memories`;
		}
		if (toolName === 'searchBlogs' || toolName === 'searchKnowledge') {
			const toolData = output as { results?: unknown[]; count?: number };
			const count = toolData?.results?.length ?? toolData?.count ?? 0;
			return `Found ${count} results`;
		}
		if (toolName === 'webSearch') {
			const toolData = output as {
				data?: { answer?: string; count?: number; results?: unknown[] };
				results?: unknown[];
			};
			const hasAnswer = !!(toolData?.data?.answer || (toolData as any)?.answer);
			const count =
				toolData?.data?.count ?? toolData?.data?.results?.length ?? toolData?.results?.length ?? 0;

			if (hasAnswer) {
				return count > 0 ? `Answered with ${count} web results` : 'Answered from web';
			}
			return `Found ${count} web results`;
		}
		if (toolName === 'analyzeContent') {
			return 'Content analyzed';
		}
		if (toolName === 'storeMemory' || toolName === 'saveMemory' || toolName === 'extractMemories') {
			return 'Memory saved';
		}
		if (toolName === 'deleteMemory') {
			return 'Memory deleted';
		}

		// Default: just show tool completed
		return `${formatToolName(toolName)} completed`;
	}

	function formatDuration(startedAt: number, completedAt: number): string {
		const elapsedMs = Math.max(0, completedAt - startedAt);
		return `${(elapsedMs / 1000).toFixed(2)}s`;
	}

	function formatCost(cost: number): string {
		return cost.toFixed(6);
	}

	function formatTruncatedLabel(value: TruncatedText): string {
		return value.truncated
			? `Stored ${value.text.length} chars of ${value.originalLength}`
			: `${value.originalLength} chars`;
	}

	function formatJson(value: unknown, maxChars = 2000): string {
		if (value === null || value === undefined) return '';

		let text = '';
		if (typeof value === 'string') {
			text = value;
		} else {
			try {
				text = JSON.stringify(value, null, 2);
			} catch {
				text = String(value);
			}
		}

		if (text.length <= maxChars) return text;
		return `${text.slice(0, maxChars)}\n...(truncated)`;
	}

	function statusColor(status: string): string {
		if (status === 'running') return 'text-muted-foreground';
		if (status === 'error') return 'text-destructive';
		return 'text-foreground/80';
	}
</script>

<div class="mb-3">
	<button
		onclick={() => (expanded = !expanded)}
		class="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground transition-colors hover:text-foreground"
	>
		<div
			class="flex h-5 w-5 items-center justify-center rounded-full bg-muted/50 text-muted-foreground"
		>
			{#if isStreaming}
				<div
					class="h-2 w-2 animate-spin rounded-full border border-muted-foreground/30 border-t-muted-foreground"
				></div>
			{:else}
				<Zap class="h-3 w-3 fill-current opacity-70" />
			{/if}
		</div>
		<span class="uppercase">Agent run: {agentWork.agentDisplayName}</span>
		{#if expanded}
			<ChevronUp class="h-3 w-3" />
		{:else}
			<ChevronDown class="h-3 w-3" />
		{/if}
	</button>

	{#if expanded}
		<div class="mt-2 space-y-3 border-l border-muted-foreground/30 pl-4" transition:slide>
			<div class="space-y-1.5">
				{#each steps as step}
					<div class="flex items-start gap-2.5 text-sm {statusColor(step.status)}">
						{#if step.icon}
							<div class="mt-0.5 opacity-60">
								<step.icon class="h-3.5 w-3.5" />
							</div>
						{/if}
						<div class="flex flex-col">
							<div class="flex items-center gap-2">
								{#if step.status === 'running'}
									<span class="animate-pulse">{step.text}</span>
								{:else if step.status === 'done' && step === steps[steps.length - 1]}
									<span class="font-medium">{step.text}</span>
								{:else}
									{step.text}
								{/if}
							</div>
							{#if step.query}
								<span class="mt-0.5 text-[10px] leading-none text-muted-foreground/70 italic"
									>"{step.query}"</span
								>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
