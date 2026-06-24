<script lang="ts">
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import {
		Loader2,
		BookOpen,
		CheckCircle2,
		GraduationCap,
		Target,
		RotateCcw,
		TrendingUp
	} from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	import type { Id } from '$convex/_generated/dataModel';

	const client = useConvexClient();
	const cellsQuery = useQuery((api as any).knowledgeNotes.listCells, { limit: 100 });
	const cells = $derived((cellsQuery.data ?? []) as any[]);

	const goalsQuery = useQuery((api as any).knowledge.listLearningGoals, {});
	const goals = $derived((goalsQuery.data ?? []) as any[]);

	let activeTab = $state<'overview' | 'cells' | 'goals'>('overview');
	let loadingId = $state<string | null>(null);

	const cellTypeColors: Record<string, string> = {
		FACT: 'bg-blue-100 text-blue-800',
		CONCEPT: 'bg-green-100 text-green-800',
		PRINCIPLE: 'bg-purple-100 text-purple-800',
		PROCEDURE: 'bg-amber-100 text-amber-800',
		HEURISTIC: 'bg-rose-100 text-rose-800',
		QUESTION: 'bg-cyan-100 text-cyan-800'
	};

	const cellTypeCounts = $derived(() => {
		const counts: Record<string, number> = {};
		for (const c of cells) {
			counts[c.cellType] = (counts[c.cellType] || 0) + 1;
		}
		return counts;
	});

	async function startLearning(cellId: Id<'knowledge_cells'>) {
		loadingId = cellId;
		try {
			await client.mutation((api as any).knowledge.updateMastery, {
				cellId,
				remember: true,
				understand: false,
				apply: false,
				analyze: false,
				evaluate: false,
				create: false
			});
			toast.success('Started learning');
		} catch (e: any) {
			toast.error(e?.message ?? 'Failed');
		} finally {
			loadingId = null;
		}
	}

	const goalStatusColors: Record<string, string> = {
		active: 'bg-blue-100 text-blue-800',
		completed: 'bg-green-100 text-green-800',
		paused: 'bg-gray-100 text-gray-800'
	};
</script>

<main class="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
	<div class="mb-6">
		<h1 class="text-2xl font-semibold tracking-tight">My Learning</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			Track your progress across the knowledge graph.
		</p>
	</div>

	<div class="mb-4 flex gap-1 rounded-lg border border-border p-1">
		<button
			class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors {activeTab ===
			'overview'
				? 'bg-primary text-primary-foreground'
				: 'text-muted-foreground hover:bg-muted'}"
			onclick={() => (activeTab = 'overview')}
		>
			<TrendingUp class="mr-1 inline-block size-4" />Overview
		</button>
		<button
			class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors {activeTab ===
			'cells'
				? 'bg-primary text-primary-foreground'
				: 'text-muted-foreground hover:bg-muted'}"
			onclick={() => (activeTab = 'cells')}
		>
			<BookOpen class="mr-1 inline-block size-4" />Cells ({cells.length})
		</button>
		<button
			class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors {activeTab ===
			'goals'
				? 'bg-primary text-primary-foreground'
				: 'text-muted-foreground hover:bg-muted'}"
			onclick={() => (activeTab = 'goals')}
		>
			<Target class="mr-1 inline-block size-4" />Goals ({goals.length})
		</button>
	</div>

	{#if cellsQuery.isLoading || goalsQuery.isLoading}
		<div class="flex justify-center py-12">
			<Loader2 class="size-6 animate-spin text-muted-foreground" />
		</div>
	{:else if activeTab === 'overview'}
		<div class="grid gap-4 md:grid-cols-2">
			<Card>
				<CardHeader>
					<CardTitle class="text-base">Cell Summary</CardTitle>
				</CardHeader>
				<CardContent class="space-y-2">
					<div class="flex justify-between text-sm">
						<span class="text-muted-foreground">Total Cells</span>
						<span class="font-medium">{cells.length}</span>
					</div>
					{#each Object.entries(cellTypeCounts()) as [type, count]}
						<div class="flex justify-between text-sm">
							<span class="text-muted-foreground">{type}</span>
							<Badge variant="outline">{count}</Badge>
						</div>
					{/each}
					{#if cells.length === 0}
						<p class="text-sm text-muted-foreground">No cells yet.</p>
					{/if}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle class="text-base">Goals</CardTitle>
				</CardHeader>
				<CardContent class="space-y-2">
					<div class="flex justify-between text-sm">
						<span class="text-muted-foreground">Total Goals</span>
						<span class="font-medium">{goals.length}</span>
					</div>
					<div class="flex justify-between text-sm">
						<span class="text-muted-foreground">Active</span>
						<Badge variant="outline">{goals.filter((g) => g.status === 'active').length}</Badge>
					</div>
					<div class="flex justify-between text-sm">
						<span class="text-muted-foreground">Completed</span>
						<Badge variant="outline">{goals.filter((g) => g.status === 'completed').length}</Badge>
					</div>
					{#if goals.length === 0}
						<p class="text-sm text-muted-foreground">No goals yet.</p>
					{/if}
				</CardContent>
			</Card>
		</div>
	{:else if activeTab === 'cells'}
		{#if cells.length === 0}
			<Card>
				<CardContent class="py-12 text-center text-sm text-muted-foreground">
					<GraduationCap class="mx-auto mb-3 size-8" />No cells yet. Start by consuming a source
					item.
				</CardContent>
			</Card>
		{:else}
			<div class="grid gap-3 md:grid-cols-2">
				{#each cells as cell (cell._id)}
					<a
						href={'/knowledge/cells/' + cell._id}
						class="block rounded-md border border-border p-4 transition-colors hover:bg-muted/50"
					>
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0 flex-1">
								<h3 class="truncate font-medium">{cell.title}</h3>
								<p class="mt-1 line-clamp-2 text-sm text-muted-foreground">{cell.summary}</p>
								<div class="mt-2 flex items-center gap-2">
									<Badge variant="outline" class={cellTypeColors[cell.cellType]}
										>{cell.cellType}</Badge
									>
									{#if cell.importance}
										<span class="text-xs text-muted-foreground"
											>Importance: {cell.importance}/5</span
										>
									{/if}
								</div>
							</div>
							<Button
								variant="ghost"
								size="icon"
								class="size-8 shrink-0"
								onclick={(e) => {
									e.preventDefault();
									startLearning(cell._id);
								}}
								disabled={loadingId === cell._id}
							>
								{#if loadingId === cell._id}
									<Loader2 class="size-4 animate-spin" />
								{:else}
									<RotateCcw class="size-4" />
								{/if}
							</Button>
						</div>
					</a>
				{/each}
			</div>
		{/if}
	{:else if activeTab === 'goals'}
		{#if goals.length === 0}
			<Card>
				<CardContent class="py-12 text-center text-sm text-muted-foreground">
					<Target class="mx-auto mb-3 size-8" />No goals yet. Create a learning goal to track
					progress.
				</CardContent>
			</Card>
		{:else}
			<div class="space-y-3">
				{#each goals as goal (goal._id)}
					<div class="rounded-md border border-border p-4">
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<h3 class="font-medium">{goal.title}</h3>
									<Badge class={goalStatusColors[goal.status]}>{goal.status}</Badge>
								</div>
								{#if goal.description}
									<p class="mt-1 text-sm text-muted-foreground">{goal.description}</p>
								{/if}
								{#if goal.targetDate}
									<p class="mt-2 text-xs text-muted-foreground">
										Target: {new Date(goal.targetDate).toLocaleDateString()}
									</p>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</main>
