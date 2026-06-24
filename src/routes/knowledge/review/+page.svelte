<script lang="ts">
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Loader2, RefreshCcw, RotateCcw } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	const client = useConvexClient();
	const dueQuery = useQuery((api as any).knowledge.getDueReviews, {});
	const due = $derived((dueQuery.data ?? []) as any[]);

	let currentIdx = $state(0);
	let showAnswer = $state(false);
	let loading = $state(false);

	const current = $derived(due[currentIdx] ?? null);

	function next() {
		showAnswer = false;
		if (currentIdx < due.length - 1) {
			currentIdx += 1;
		} else {
			currentIdx = 0;
		}
	}

	async function rate(quality: number) {
		if (!current) return;
		loading = true;
		try {
			await client.mutation((api as any).knowledge.completeReview, {
				cellId: current.cellId,
				quality
			});
			toast.success(quality >= 3 ? 'Good recall!' : 'Will review again soon');
			next();
		} catch (e: any) {
			toast.error(e?.message ?? 'Failed');
		} finally {
			loading = false;
		}
	}
</script>

<main class="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
	<div class="mb-6">
		<h1 class="text-2xl font-semibold tracking-tight">Spaced Repetition Review</h1>
		<p class="mt-1 text-sm text-muted-foreground">Review cells due for recall practice.</p>
	</div>

	{#if dueQuery.isLoading}
		<div class="flex justify-center py-12">
			<Loader2 class="size-6 animate-spin text-muted-foreground" />
		</div>
	{:else if due.length === 0}
		<Card
			><CardContent class="py-12 text-center">
				<RotateCcw class="mx-auto mb-3 size-8 text-muted-foreground" />
				<p class="text-sm text-muted-foreground">No reviews due right now.</p>
				<p class="mt-1 text-xs text-muted-foreground">Start learning cells to schedule reviews.</p>
			</CardContent></Card
		>
	{:else}
		<div class="mb-4 text-center text-sm text-muted-foreground">
			{currentIdx + 1} of {due.length} due
		</div>

		{#if current?.cell}
			<Card class="mb-6">
				<CardContent class="space-y-4 py-8 text-center">
					<Badge variant="outline">{current.cell.cellType}</Badge>
					<h2 class="text-xl font-semibold">{current.cell.title}</h2>

					{#if showAnswer}
						<div class="rounded-md bg-muted p-4 text-left text-sm">
							{current.cell.content || current.cell.summary}
						</div>
						<div class="flex justify-center gap-2">
							<Button variant="outline" disabled={loading} onclick={() => rate(1)}>Again</Button>
							<Button variant="outline" disabled={loading} onclick={() => rate(3)}>Good</Button>
							<Button disabled={loading} onclick={() => rate(5)}>Easy</Button>
						</div>
					{:else}
						<Button onclick={() => (showAnswer = true)}>Show Answer</Button>
					{/if}
				</CardContent>
			</Card>
		{/if}

		<Button variant="outline" class="w-full" onclick={next}>
			<RefreshCcw class="mr-1 size-4" />
			Skip
		</Button>
	{/if}
</main>
