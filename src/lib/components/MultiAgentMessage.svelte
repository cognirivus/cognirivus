<script lang="ts">
	import { ChevronDown, ChevronRight, Bot, Wrench, DollarSign, Check } from '@lucide/svelte';
	import { slide } from 'svelte/transition';
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';

	interface Props {
		message: any;
		isStreaming?: boolean;
	}

	let { message, isStreaming = false }: Props = $props();

	let expanded = $state(false);
	let toolExpanded = $state<Record<string, boolean>>({});

	// Get agent sessions for this message
	const sessionsQuery = useQuery(api.agents.agent_sessions.listByMessage, () => ({
		promptMessageId: message._id
	}));

	const sessions = $derived(sessionsQuery?.data || []);
	const hasSubagents = $derived(sessions.length > 1);
	const totalCost = $derived(sessions.reduce((sum: number, s: any) => sum + (s.cost || 0), 0));

	// Get tool executions for sessions
	const toolExecutionsMap = $derived.by(() => {
		const map: Record<string, any[]> = {};
		for (const session of sessions) {
			map[session._id] = session.toolCalls || [];
		}
		return map;
	});

	function toggleTool(toolId: string) {
		toolExpanded[toolId] = !toolExpanded[toolId];
	}

	function formatCost(cost: number): string {
		return cost.toFixed(4);
	}

	function getAgentDisplayName(agentName: string): string {
		const names: Record<string, string> = {
			chat: 'Chat',
			researcher: 'Researcher',
			'content-creator': 'Content Creator',
			'flashcard-tutor': 'Flashcard Tutor',
			'syllabus-planner': 'Syllabus Planner',
			'memory-curator': 'Memory Curator',
			'system-admin': 'System Admin',
			'data-curator': 'Data Curator',
			'model-tuner': 'Model Tuner'
		};
		return names[agentName] || agentName;
	}
</script>

<div class="group relative space-y-3">
	<!-- Agent Header -->
	<div class="flex items-center gap-2">
		<Bot class="h-4 w-4 text-primary" />
		<span class="text-sm font-medium">
			{getAgentDisplayName(message.metadata?.agentName || 'chat')}
		</span>
		{#if hasSubagents}
			<span class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
				+{sessions.length - 1} subagents
			</span>
		{/if}

		<!-- Cost Display (hover to see) -->
		<div class="ml-auto opacity-0 transition-opacity group-hover:opacity-100">
			<div
				class="flex cursor-help items-center gap-1 text-xs text-muted-foreground"
				title="Cost for this AI response"
			>
				<DollarSign class="h-3 w-3" />
				<span>${formatCost(totalCost)}</span>
			</div>
		</div>
	</div>

	<!-- Main Content -->
	<div class="prose prose-sm max-w-none">
		{@html message.body}
	</div>

	<!-- Expandable Details -->
	{#if hasSubagents || sessions.some((s: any) => s.toolCalls && s.toolCalls.length > 0)}
		<button
			class="mt-2 flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
			onclick={() => (expanded = !expanded)}
		>
			{#if expanded}
				<ChevronDown class="h-3 w-3" />
			{:else}
				<ChevronRight class="h-3 w-3" />
			{/if}
			{expanded ? 'Hide processing details' : 'Show processing details'}
		</button>

		{#if expanded}
			<div class="mt-3 space-y-3 border-l-2 border-muted pl-3" transition:slide>
				<!-- Agent Hierarchy -->
				{#each sessions as session, idx}
					<div class="space-y-2" style="margin-left: {idx * 8}px">
						<div class="flex items-center gap-2 text-sm">
							<div class="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10">
								<span class="text-xs font-medium text-primary">{idx + 1}</span>
							</div>
							<span class="font-medium">{getAgentDisplayName(session.agentName)}</span>
							{#if session.depth > 0}
								<span class="text-xs text-muted-foreground"> (subagent) </span>
							{/if}
							<span class="ml-auto text-xs text-muted-foreground">
								${formatCost(session.cost || 0)}
							</span>
							{#if session.status === 'completed'}
								<Check class="h-3 w-3 text-green-500" />
							{:else if session.status === 'error'}
								<span class="text-xs text-red-500">error</span>
							{:else if session.status === 'running'}
								<span class="animate-pulse text-xs text-yellow-500">running</span>
							{/if}
						</div>

						<!-- Tool Executions -->
						{#if session.toolCalls && session.toolCalls.length > 0}
							<div class="mt-2 space-y-1 pl-7">
								{#each session.toolCalls as tool, toolIdx}
									<div class="flex items-center gap-2 text-xs">
										<Wrench class="h-3 w-3 text-muted-foreground" />
										<span class="text-muted-foreground">{tool.toolName}</span>
										{#if tool.status === 'running'}
											<span class="animate-pulse text-yellow-500">running</span>
										{:else if tool.status === 'completed'}
											<Check class="h-3 w-3 text-green-500" />
										{:else if tool.status === 'error'}
											<span class="text-red-500" title={tool.errorMessage}>error</span>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/each}

				<!-- Total Cost Summary -->
				<div class="mt-2 border-t border-muted pt-2">
					<div class="flex items-center justify-between text-xs">
						<span class="text-muted-foreground">Total Response Cost:</span>
						<span class="flex items-center gap-1 font-medium">
							<DollarSign class="h-3 w-3" />
							{formatCost(totalCost)}
						</span>
					</div>
				</div>
			</div>
		{/if}
	{/if}
</div>
