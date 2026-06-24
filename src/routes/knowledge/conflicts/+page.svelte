<script lang="ts">
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { AlertTriangle, Loader2, CheckCircle2, XCircle, Eye } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import type { Id } from '$convex/_generated/dataModel';

	const client = useConvexClient();

	let filterStatus = $state<string>('all');
	const conflictsQuery = useQuery((api as any).knowledge.listConflicts, () =>
		filterStatus === 'all' ? {} : { status: filterStatus }
	);
	const conflicts = $derived((conflictsQuery.data ?? []) as any[]);

	let processingId = $state<string | null>(null);
	let resolveModal = $state(false);
	let resolvingId = $state<string | null>(null);
	let resolveText = $state('');

	const typeColors: Record<string, string> = {
		contradiction: 'bg-red-100 text-red-800',
		inconsistency: 'bg-amber-100 text-amber-800',
		outdated: 'bg-blue-100 text-blue-800',
		missing_context: 'bg-purple-100 text-purple-800'
	};

	const statusColors: Record<string, string> = {
		open: 'bg-red-100 text-red-800',
		investigating: 'bg-amber-100 text-amber-800',
		resolved: 'bg-green-100 text-green-800',
		dismissed: 'bg-gray-100 text-gray-800'
	};

	const statuses = ['all', 'open', 'investigating', 'resolved', 'dismissed'];

	function startResolve(conflictId: string) {
		resolvingId = conflictId;
		resolveText = '';
		resolveModal = true;
	}

	async function confirmResolve(status: 'investigating' | 'resolved' | 'dismissed') {
		if (!resolvingId) return;
		processingId = resolvingId;
		try {
			await client.mutation((api as any).knowledge.resolveConflict, {
				conflictId: resolvingId as Id<'conflict_cases'>,
				status,
				resolutionReason: resolveText.trim() || undefined
			});
			toast.success('Conflict ' + status);
			resolveModal = false;
			resolvingId = null;
		} catch (e: any) {
			toast.error(e?.message ?? 'Failed');
		} finally {
			processingId = null;
		}
	}
</script>

<main class="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
	<div class="mb-6">
		<h1 class="text-2xl font-semibold tracking-tight">Conflicts</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			Contradictions and inconsistencies detected in the knowledge graph.
		</p>
	</div>

	<div class="mb-4 flex flex-wrap gap-2">
		{#each statuses as status}
			<button
				class="rounded-md border px-3 py-1 text-xs font-medium transition-colors {filterStatus ===
				status
					? 'border-primary bg-primary text-primary-foreground'
					: 'border-border text-muted-foreground hover:bg-muted'}"
				onclick={() => (filterStatus = status)}
			>
				{status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
			</button>
		{/each}
	</div>

	{#if resolveModal}
		<Card class="mb-6 border-amber-200">
			<CardHeader>
				<CardTitle class="text-base">Resolve Conflict</CardTitle>
			</CardHeader>
			<CardContent class="space-y-3">
				<textarea
					placeholder="Resolution notes (optional)"
					bind:value={resolveText}
					rows="3"
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
				></textarea>
				<div class="flex justify-end gap-2">
					<Button variant="outline" size="sm" onclick={() => (resolveModal = false)}>Cancel</Button>
					<Button
						variant="outline"
						size="sm"
						onclick={() => confirmResolve('investigating')}
						disabled={processingId !== null}
					>
						<Eye class="mr-1 size-3" />Investigate
					</Button>
					<Button
						variant="outline"
						size="sm"
						onclick={() => confirmResolve('dismissed')}
						disabled={processingId !== null}
					>
						<XCircle class="mr-1 size-3" />Dismiss
					</Button>
					<Button
						size="sm"
						onclick={() => confirmResolve('resolved')}
						disabled={processingId !== null}
					>
						{#if processingId}
							<Loader2 class="mr-1 size-3 animate-spin" />
						{:else}
							<CheckCircle2 class="mr-1 size-3" />
						{/if}
						Resolve
					</Button>
				</div>
			</CardContent>
		</Card>
	{/if}

	{#if conflictsQuery.isLoading}
		<div class="flex justify-center py-12">
			<Loader2 class="size-6 animate-spin text-muted-foreground" />
		</div>
	{:else if conflicts.length === 0}
		<Card>
			<CardContent class="py-12 text-center text-sm text-muted-foreground">
				<AlertTriangle class="mx-auto mb-3 size-8" />
				{filterStatus === 'all' ? 'No conflicts detected.' : 'No ' + filterStatus + ' conflicts.'}
			</CardContent>
		</Card>
	{:else}
		<div class="space-y-3">
			{#each conflicts as c (c._id)}
				<div class="rounded-md border border-border p-4">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<Badge class={typeColors[c.conflictType]}>{c.conflictType}</Badge>
								<Badge class={statusColors[c.status]}>{c.status}</Badge>
							</div>
							<p class="mt-2 text-sm font-medium">{c.resolutionReason ?? 'No details'}</p>
							{#if c.resolution}
								<p class="mt-1 text-sm text-muted-foreground">Resolution: {c.resolution}</p>
							{/if}
							<p class="mt-2 text-xs text-muted-foreground">
								A: {c.cellAId} vs B: {c.cellBId}
							</p>
						</div>
						{#if c.status === 'open' || c.status === 'investigating'}
							<Button
								variant="outline"
								size="sm"
								onclick={() => startResolve(c._id)}
								disabled={processingId === c._id}
							>
								Resolve
							</Button>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</main>
