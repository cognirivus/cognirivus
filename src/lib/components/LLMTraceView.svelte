<script lang="ts">
	import { Copy, Check, Clock } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	interface TruncatedText {
		text: string;
		originalLength: number;
		truncated: boolean;
	}

	interface LLMToolCallTrace {
		id: string;
		name: string;
		arguments: TruncatedText;
	}

	interface LLMCallTrace {
		step: number;
		startedAt: number;
		completedAt: number;
		model: string;
		temperature?: number;
		prompt: {
			messageCount: number;
			messages: Array<{ role: string; content: TruncatedText }>;
		};
		response: {
			content: TruncatedText;
			toolCalls?: LLMToolCallTrace[];
		};
		tokens: { prompt: number; completion: number };
		cost: number;
	}

	interface ToolExecution {
		toolName: string;
		status: string;
		input?: Record<string, unknown>;
		output?: unknown;
		errorMessage?: string;
		step?: number;
		startedAt: number;
		completedAt: number;
	}

	interface Props {
		llmCalls: LLMCallTrace[];
		toolExecutions: ToolExecution[];
	}

	let { llmCalls, toolExecutions }: Props = $props();

	const toolsByStep = $derived.by(() => {
		const grouped: Record<number, ToolExecution[]> = {};

		for (const tool of toolExecutions || []) {
			if (tool.step === undefined) continue;
			if (!grouped[tool.step]) grouped[tool.step] = [];
			grouped[tool.step].push(tool);
		}

		return grouped;
	});

	function formatToolName(name: string): string {
		return name
			.replace(/([A-Z])/g, ' $1')
			.replace(/^./, (s) => s.toUpperCase())
			.trim();
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

	let copiedId = $state<string | null>(null);

	async function copyToClipboard(text: string, id: string) {
		try {
			await navigator.clipboard.writeText(text);
			copiedId = id;
			toast.success('Copied to clipboard');
			setTimeout(() => {
				if (copiedId === id) copiedId = null;
			}, 2000);
		} catch (err) {
			toast.error('Failed to copy');
		}
	}

	function getStepTiming(step: number) {
		const llmCall = llmCalls.find((c) => c.step === step);
		const tools = toolsByStep[step] || [];

		const llmDuration = llmCall ? llmCall.completedAt - llmCall.startedAt : 0;
		const toolDuration = tools.reduce(
			(acc, t) => acc + (t.completedAt && t.startedAt ? t.completedAt - t.startedAt : 0),
			0
		);

		return {
			llm: (llmDuration / 1000).toFixed(2),
			tools: (toolDuration / 1000).toFixed(2),
			total: ((llmDuration + toolDuration) / 1000).toFixed(2)
		};
	}
</script>

<div class="space-y-4">
	{#each llmCalls as llmCall}
		{@const timing = getStepTiming(llmCall.step)}
		<div class="rounded-lg border border-border/70 bg-muted/10 p-4">
			<div class="mb-4 flex flex-wrap items-center gap-3 border-b border-border/50 pb-3 text-xs">
				<span class="rounded bg-primary/10 px-1.5 py-0.5 font-bold text-primary uppercase">
					Step {llmCall.step + 1}
				</span>
				<span class="font-medium text-foreground/80">{llmCall.model}</span>
				<span class="text-muted-foreground">•</span>
				<span class="text-muted-foreground"
					>Tokens: {llmCall.tokens.prompt} in, {llmCall.tokens.completion} out</span
				>
				<span class="text-muted-foreground">•</span>
				<span class="font-semibold text-foreground/90">${formatCost(llmCall.cost)}</span>
				<span class="text-muted-foreground">•</span>
				<div class="flex items-center gap-1 text-muted-foreground" title="LLM + Tool Timing">
					<Clock class="h-3 w-3" />
					<span
						>{timing.total}s ({timing.llm}s LLM {#if parseFloat(timing.tools) > 0}+ {timing.tools}s
							tools{/if})</span
					>
				</div>
				{#if llmCall.temperature !== undefined}
					<span class="text-muted-foreground">•</span>
					<span class="text-muted-foreground">temp {llmCall.temperature}</span>
				{/if}

				<div class="ml-auto flex gap-2">
					<button
						onclick={() =>
							copyToClipboard(JSON.stringify(llmCall, null, 2), `step-${llmCall.step}`)}
						class="flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted-foreground hover:text-muted"
					>
						{#if copiedId === `step-${llmCall.step}`}
							<Check class="h-2.5 w-2.5" />
							<span>Copied</span>
						{:else}
							<Copy class="h-2.5 w-2.5" />
							<span>Copy JSON</span>
						{/if}
					</button>
				</div>
			</div>

			<div class="grid gap-4 lg:grid-cols-2">
				<!-- Prompt Side -->
				<div class="space-y-3">
					<div class="flex items-center justify-between">
						<h4 class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
							Prompt Messages
						</h4>
						<span class="text-[10px] text-muted-foreground"
							>{llmCall.prompt.messages.length}/{llmCall.prompt.messageCount}</span
						>
					</div>
					<div class="space-y-2">
						{#each llmCall.prompt.messages as message, idx}
							<div class="rounded-md border border-border/40 bg-background/50 p-2">
								<div class="mb-1 text-[9px] font-bold text-muted-foreground uppercase">
									{idx + 1}. {message.role}
								</div>
								<pre
									class="max-h-48 overflow-auto text-[11px] leading-relaxed whitespace-pre-wrap">{message
										.content.text}</pre>
								<div class="mt-1 text-[9px] text-muted-foreground opacity-70">
									{formatTruncatedLabel(message.content)}
								</div>
							</div>
						{/each}
					</div>
				</div>

				<!-- Response Side -->
				<div class="space-y-3">
					<h4 class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
						LLM Response
					</h4>
					<div class="space-y-4">
						<!-- Content -->
						{#if llmCall.response.content.text}
							<div class="rounded-md border border-primary/20 bg-primary/5 p-3">
								<pre
									class="max-h-48 overflow-auto text-[11px] leading-relaxed whitespace-pre-wrap">{llmCall
										.response.content.text}</pre>
								<div class="mt-1 text-[9px] text-muted-foreground opacity-70">
									{formatTruncatedLabel(llmCall.response.content)}
								</div>
							</div>
						{/if}

						<!-- Tool Calls -->
						{#if llmCall.response.toolCalls && llmCall.response.toolCalls.length > 0}
							<div class="space-y-2">
								<h5 class="text-[9px] font-bold text-primary/70 uppercase">Tool Calls Triggered</h5>
								{#each llmCall.response.toolCalls as toolCall}
									<div
										class="rounded-md border border-amber-200/50 bg-amber-50/30 p-2 dark:border-amber-500/20 dark:bg-amber-950/20"
									>
										<div class="text-[11px] font-bold text-amber-700 dark:text-amber-400">
											{toolCall.name}
										</div>
										<pre
											class="mt-1 max-h-32 overflow-auto text-[10px] leading-tight whitespace-pre-wrap">{toolCall
												.arguments.text}</pre>
									</div>
								{/each}
							</div>
						{/if}

						<!-- Tool Executions Results -->
						{#if toolsByStep[llmCall.step] && toolsByStep[llmCall.step].length > 0}
							<div class="space-y-2 pt-2">
								<h5 class="text-[9px] font-bold text-emerald-600 uppercase dark:text-emerald-400">
									Tool Execution Results
								</h5>
								{#each toolsByStep[llmCall.step] as tool}
									<div
										class="rounded-md border border-emerald-200/50 bg-emerald-50/20 p-3 dark:border-emerald-500/20 dark:bg-emerald-950/10"
									>
										<div class="mb-2 flex items-center justify-between gap-2">
											<span class="text-xs font-bold">{formatToolName(tool.toolName)}</span>
											<span
												class="text-[9px] font-medium tracking-wide uppercase {statusColor(
													tool.status
												)}">{tool.status}</span
											>
										</div>
										<div class="space-y-2">
											{#if tool.status === 'error'}
												<div class="text-[10px] font-medium text-destructive">
													{tool.errorMessage || 'Unknown error'}
												</div>
											{:else}
												<div>
													<div
														class="mb-1 text-[9px] font-bold text-muted-foreground uppercase opacity-70"
													>
														Result Data
													</div>
													<pre
														class="max-h-60 overflow-auto text-[10px] leading-tight whitespace-pre-wrap">{formatJson(
															tool.output
														)}</pre>
												</div>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>
	{/each}
</div>
