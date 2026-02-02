<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Loader2, Bot, Wrench } from '@lucide/svelte';
	import type { Id } from '$convex/_generated/dataModel';

	interface Props {
		threadId: string;
		messageId: string;
	}

	let { threadId, messageId }: Props = $props();

	// Use a closure to ensure reactivity and cast string to Id<"messages">
	const sessions = useQuery(api.agents.agent_sessions.listByMessage, () => ({
		promptMessageId: messageId as Id<'messages'>
	}));

	const runningSessions = $derived(
		sessions?.data?.filter((s: any) => s.status === 'running') || []
	);

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

{#if runningSessions.length > 0}
	<div class="flex flex-col gap-3 py-4">
		{#each runningSessions as session}
			<div class="flex items-center gap-3 rounded-lg bg-primary/5 px-4 py-3">
				<div class="animate-spin">
					<Loader2 class="h-4 w-4 text-primary" />
				</div>
				<div class="flex-1">
					<div class="flex items-center gap-2">
						<Bot class="h-4 w-4 text-muted-foreground" />
						<span class="text-sm font-medium">{getAgentDisplayName(session.agentName)}</span>
						{#if session.depth > 0}
							<span class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
								subagent
							</span>
						{/if}
					</div>

					<!-- Show running tools -->
					{#if session.toolCalls && session.toolCalls.length > 0}
						<div class="mt-2 space-y-1">
							{#each session.toolCalls.filter((t: any) => t.status === 'running') as tool}
								<div class="flex items-center gap-2 text-xs text-muted-foreground">
									<Wrench class="h-3 w-3" />
									<span>Using {tool.toolName}...</span>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>
{/if}
