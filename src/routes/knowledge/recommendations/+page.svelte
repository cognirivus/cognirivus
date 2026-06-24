<script lang="ts">
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Loader2, Sparkles, Check, X } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import type { Id } from '$convex/_generated/dataModel';

	const client = useConvexClient();
	const recsQuery = useQuery((api as any).knowledge.listKnowledgeRecommendations, {});
	const recs = $derived((recsQuery.data ?? []) as any[]);

	let processingId = $state<string | null>(null);

	const statusColors: Record<string, string> = {
		pending: 'bg-amber-100 text-amber-800',
		accepted: 'bg-green-100 text-green-800',
		dismissed: 'bg-gray-100 text-gray-800'
	};

	const priorityLabels: Record<number, string> = {
		1: 'Low',
		2: 'Medium',
		3: 'High',
		4: 'Critical'
	};

	const priorityColors: Record<number, string> = {
		1: 'bg-gray-100 text-gray-800',
		2: 'bg-blue-100 text-blue-800',
		3: 'bg-amber-100 text-amber-800',
		4: 'bg-red-100 text-red-800'
	};

	async function acceptRec(recId: Id<'knowledge_recommendations'>) {
		processingId = recId;
		try {
			await client.mutation((api as any).knowledge.acceptRecommendation, {
				recommendationId: recId
			});
			toast.success('Recommendation accepted');
		} catch (e: any) {
			toast.error(e?.message ?? 'Failed');
		} finally {
			processingId = null;
		}
	}

	async function dismissRec(recId: Id<'knowledge_recommendations'>) {
		processingId = recId;
		try {
			await client.mutation((api as any).knowledge.dismissRecommendation, {
				recommendationId: recId
			});
			toast.success('Recommendation dismissed');
		} catch (e: any) {
			toast.error(e?.message ?? 'Failed');
		} finally {
			processingId = null;
		}
	}
</script>

<main class="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
	<div class="mb-6">
		<h1 class="text-2xl font-semibold tracking-tight">Recommendations</h1>
		<p class="mt-1 text-sm text-muted-foreground">AI-powered suggestions for what to learn next.</p>
	</div>

	{#if recsQuery.isLoading}
		<div class="flex justify-center py-12">
			<Loader2 class="size-6 animate-spin text-muted-foreground" />
		</div>
	{:else if recs.length === 0}
		<Card>
			<CardContent class="py-12 text-center text-sm text-muted-foreground">
				<Sparkles class="mx-auto mb-3 size-8" />No recommendations yet. Start learning to get
				personalized suggestions.
			</CardContent>
		</Card>
	{:else}
		<div class="space-y-3">
			{#each recs as rec (rec._id)}
				<div class="rounded-md border border-border p-4">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<a href={'/knowledge/cells/' + rec.cellId} class="font-medium hover:underline">
									{rec.cellId}
								</a>
								<Badge class={statusColors[rec.status]}>{rec.status}</Badge>
								<Badge class={priorityColors[rec.priority]}>
									P{rec.priority} - {priorityLabels[rec.priority]}
								</Badge>
							</div>
							<p class="mt-1 text-sm text-muted-foreground">{rec.reason}</p>
						</div>
						{#if rec.status === 'pending'}
							<div class="flex gap-1">
								<Button
									variant="outline"
									size="icon"
									class="size-8"
									onclick={() => acceptRec(rec._id)}
									disabled={processingId === rec._id}
								>
									<Check class="size-4 text-green-600" />
								</Button>
								<Button
									variant="outline"
									size="icon"
									class="size-8"
									onclick={() => dismissRec(rec._id)}
									disabled={processingId === rec._id}
								>
									<X class="size-4 text-muted-foreground" />
								</Button>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</main>
