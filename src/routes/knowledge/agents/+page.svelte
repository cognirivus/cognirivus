<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Badge } from '$lib/components/ui/badge';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Loader2, Bot } from '@lucide/svelte';

	const runsQuery = useQuery((api as any).knowledge.listAgentRuns, { limit: 50 });
	const runs = $derived((runsQuery.data ?? []) as any[]);

	const statusColors: Record<string, string> = {
		pending: 'bg-amber-100 text-amber-800',
		running: 'bg-blue-100 text-blue-800',
		completed: 'bg-green-100 text-green-800',
		failed: 'bg-red-100 text-red-800'
	};

	function formatDuration(ms?: number): string {
		if (!ms) return '-';
		if (ms < 1000) return `${ms}ms`;
		if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
		return `${(ms / 60000).toFixed(1)}m`;
	}

	function formatCost(cost?: number): string {
		if (!cost) return '-';
		return `$${cost.toFixed(4)}`;
	}
</script>

<main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
	<div class="mb-6">
		<h1 class="text-2xl font-semibold tracking-tight">Agent Dashboard</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			Monitor background agent runs, workflows, and performance.
		</p>
	</div>

	<div class="grid gap-6 lg:grid-cols-3">
		<div class="lg:col-span-2">
			<Card>
				<CardHeader>
					<CardTitle>Recent Runs</CardTitle>
					<CardDescription>Latest agent execution history.</CardDescription>
				</CardHeader>
				<CardContent>
					{#if runsQuery.isLoading}
						<div class="flex justify-center py-8">
							<Loader2 class="size-6 animate-spin text-muted-foreground" />
						</div>
					{:else if runs.length === 0}
						<p class="py-8 text-center text-sm text-muted-foreground">
							<Bot class="mx-auto mb-3 size-8" />No agent runs yet.
						</p>
					{:else}
						<div class="space-y-2">
							{#each runs as run (run._id)}
								<div class="flex items-center gap-3 rounded-md border border-border p-3">
									<Badge class={statusColors[run.status]}>{run.status}</Badge>
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-medium">{run.agentType}</p>
										{#if run.outputSummary}
											<p class="truncate text-xs text-muted-foreground">{run.outputSummary}</p>
										{/if}
									</div>
									<div class="text-right text-xs text-muted-foreground">
										<p>{formatDuration(run.durationMs)}</p>
										<p>{formatCost(run.cost)}</p>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</CardContent>
			</Card>
		</div>

		<div class="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle class="text-base">Summary</CardTitle>
				</CardHeader>
				<CardContent class="space-y-2 text-sm">
					<div class="flex justify-between">
						<span class="text-muted-foreground">Total Runs</span>
						<span>{runs.length}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-muted-foreground">Completed</span>
						<span>{runs.filter((r) => r.status === 'completed').length}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-muted-foreground">Failed</span>
						<span>{runs.filter((r) => r.status === 'failed').length}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-muted-foreground">Total Cost</span>
						<span>{formatCost(runs.reduce((sum, r) => sum + (r.cost ?? 0), 0))}</span>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle class="text-base">Agent Types</CardTitle>
				</CardHeader>
				<CardContent class="space-y-2">
					{#each [...new Set(runs.map((r) => r.agentType))] as agentType}
						<div class="flex items-center justify-between text-sm">
							<span>{agentType}</span>
							<Badge variant="outline">{runs.filter((r) => r.agentType === agentType).length}</Badge
							>
						</div>
					{/each}
					{#if runs.length === 0}
						<p class="text-sm text-muted-foreground">No runs yet.</p>
					{/if}
				</CardContent>
			</Card>
		</div>
	</div>
</main>
