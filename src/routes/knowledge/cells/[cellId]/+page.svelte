<script lang="ts">
	import { page } from '$app/state';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Textarea } from '$lib/components/ui/textarea';
	import { ArrowLeft, BookOpen, Check, ExternalLink, Loader2, Target, X } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	const cellId = $derived(page.params.cellId as Id<'knowledge_cells'>);
	const client = useConvexClient();

	const cellQuery = useQuery((api as any).knowledge.getKnowledgeCell, () =>
		cellId ? { cellId } : 'skip'
	);
	const citationsQuery = useQuery((api as any).knowledge.getCellCitations, () =>
		cellId ? { cellId } : 'skip'
	);
	const relationshipsQuery = useQuery((api as any).knowledge.getCellRelationships, () =>
		cellId ? { cellId } : 'skip'
	);
	const qualityQuery = useQuery((api as any).knowledge.getCellQuality, () =>
		cellId ? { cellId } : 'skip'
	);
	const masteryQuery = useQuery((api as any).knowledge.getMastery, () =>
		cellId ? { cellId } : 'skip'
	);
	const viewsQuery = useQuery((api as any).knowledge.getViews, () =>
		cellId ? { cellId } : 'skip'
	);
	const claimsQuery = useQuery((api as any).knowledge.listClaims, () =>
		cellId ? { cellId } : 'skip'
	);

	const cell = $derived(cellQuery.data);
	const citations = $derived((citationsQuery.data ?? []) as any[]);
	const relationships = $derived((relationshipsQuery.data ?? []) as any[]);
	const quality = $derived(qualityQuery.data);
	const mastery = $derived(masteryQuery.data);
	const views = $derived((viewsQuery.data ?? []) as any[]);
	const claims = $derived((claimsQuery.data ?? []) as any[]);

	let learningLoading = $state(false);
	let activePerspective = $state<string>('general');

	const cellTypeColors: Record<string, string> = {
		FACT: 'bg-blue-100 text-blue-800',
		CONCEPT: 'bg-green-100 text-green-800',
		PRINCIPLE: 'bg-purple-100 text-purple-800',
		PROCEDURE: 'bg-amber-100 text-amber-800',
		HEURISTIC: 'bg-rose-100 text-rose-800',
		QUESTION: 'bg-cyan-100 text-cyan-800'
	};

	const relationshipLabels: Record<string, string> = {
		prerequisite_for: 'Prerequisite',
		contradicts: 'Contradicts',
		supports: 'Supports',
		related_to: 'Related',
		part_of: 'Part of',
		example_of: 'Example'
	};

	async function startLearning() {
		if (!cellId) return;
		learningLoading = true;
		try {
			await client.mutation((api as any).knowledge.addUserKnowledgeCell, {
				cellId,
				relationship: 'learning'
			});
			toast.success('Started learning this cell');
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to start learning');
		} finally {
			learningLoading = false;
		}
	}

	async function updateMasteryLevel(level: string, value: boolean) {
		if (!cellId) return;
		try {
			await client.mutation((api as any).knowledge.updateMastery, {
				cellId,
				[level]: value
			});
			toast.success('Mastery updated');
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to update mastery');
		}
	}

	function getScoreColor(score: number): string {
		if (score >= 0.7) return 'text-green-600';
		if (score >= 0.4) return 'text-amber-600';
		return 'text-red-600';
	}
</script>

<main class="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
	<div class="mb-4">
		<Button variant="ghost" size="sm" href="/knowledge">
			<ArrowLeft class="mr-1 size-4" />
			Back to Knowledge
		</Button>
	</div>

	{#if cellQuery.isLoading}
		<div class="flex items-center justify-center py-12">
			<Loader2 class="size-6 animate-spin text-muted-foreground" />
		</div>
	{:else if !cell}
		<Card>
			<CardContent class="py-12 text-center text-sm text-muted-foreground">
				Cell not found.
			</CardContent>
		</Card>
	{:else}
		<header class="mb-6">
			<div class="flex flex-wrap items-start gap-3">
				<h1 class="text-2xl font-semibold tracking-tight">{cell.title}</h1>
				<Badge variant="outline" class={cellTypeColors[cell.cellType]}>
					{cell.cellType}
				</Badge>
			</div>
			<p class="mt-2 text-muted-foreground">{cell.summary}</p>
			<div class="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
				<span>Source: {cell.source.replace('_', ' ')}</span>
				<span>Created: {new Date(cell.createdAt).toLocaleDateString()}</span>
				<span>Updated: {new Date(cell.updatedAt).toLocaleDateString()}</span>
			</div>
		</header>

		<div class="grid gap-6 lg:grid-cols-3">
			<div class="space-y-6 lg:col-span-2">
				<Card>
					<CardHeader>
						<CardTitle>Content</CardTitle>
					</CardHeader>
					<CardContent>
						<div class="prose prose-sm max-w-none dark:prose-invert">
							{cell.content || cell.summary}
						</div>
					</CardContent>
				</Card>

				{#if views.length > 0}
					<Card>
						<CardHeader>
							<CardTitle>Perspectives</CardTitle>
							<CardDescription>Explanations tailored for different audiences</CardDescription>
						</CardHeader>
						<CardContent class="space-y-3">
							<div class="flex flex-wrap gap-2">
								{#each views as view}
									<button
										class="rounded-md border px-3 py-1 text-xs font-medium transition-colors {activePerspective ===
										view.audience
											? 'border-primary bg-primary text-primary-foreground'
											: 'border-border text-muted-foreground hover:bg-muted'}"
										onclick={() => (activePerspective = view.audience)}
									>
										{view.audience}
									</button>
								{/each}
							</div>
							{#each views.filter((v) => v.audience === activePerspective) as view}
								<p class="text-sm">{view.explanation}</p>
								{#if view.simplifiedContent}
									<div class="rounded-md bg-muted p-3 text-sm">
										{view.simplifiedContent}
									</div>
								{/if}
							{/each}
						</CardContent>
					</Card>
				{/if}

				{#if claims.length > 0}
					<Card>
						<CardHeader>
							<CardTitle>Claims</CardTitle>
						</CardHeader>
						<CardContent class="space-y-3">
							{#each claims as claim}
								<div class="rounded-md border border-border p-3">
									<div class="flex items-start justify-between gap-2">
										<p class="text-sm font-medium">{claim.statement}</p>
										<Badge variant={claim.status === 'active' ? 'default' : 'secondary'}>
											{claim.status}
										</Badge>
									</div>
									<p class="mt-1 text-xs text-muted-foreground">
										{claim.source.replace('_', ' ')} · {new Date(
											claim.createdAt
										).toLocaleDateString()}
									</p>
								</div>
							{/each}
						</CardContent>
					</Card>
				{/if}

				{#if relationships.length > 0}
					<Card>
						<CardHeader>
							<CardTitle>Relationships</CardTitle>
						</CardHeader>
						<CardContent class="space-y-2">
							{#each relationships as rel}
								<div class="flex items-center gap-2 text-sm">
									<Badge variant="outline" class="text-xs">
										{relationshipLabels[rel.relationshipType] ?? rel.relationshipType}
									</Badge>
									<span class="text-muted-foreground">
										{rel.sourceCellId === cellId ? '→' : '←'}
										{rel.sourceCellId === cellId ? rel.targetCellId : rel.sourceCellId}
									</span>
									<span class="text-xs text-muted-foreground">
										({Math.round(rel.confidence * 100)}%)
									</span>
								</div>
							{/each}
						</CardContent>
					</Card>
				{/if}
			</div>

			<div class="space-y-6">
				<Card>
					<CardHeader>
						<CardTitle class="text-base">Actions</CardTitle>
					</CardHeader>
					<CardContent class="space-y-3">
						<Button class="w-full" disabled={learningLoading} onclick={startLearning}>
							{#if learningLoading}
								<Loader2 class="mr-1 size-4 animate-spin" />
							{:else}
								<BookOpen class="mr-1 size-4" />
							{/if}
							Start Learning
						</Button>
					</CardContent>
				</Card>

				{#if quality}
					<Card>
						<CardHeader>
							<CardTitle class="text-base">Quality</CardTitle>
						</CardHeader>
						<CardContent class="space-y-2">
							<div class="flex items-center justify-between text-sm">
								<span>Score</span>
								<span class="font-medium {getScoreColor(quality.score)}">
									{Math.round(quality.score * 100)}%
								</span>
							</div>
							<div class="flex items-center justify-between text-sm">
								<span>Citations</span>
								<span>{quality.citationCount}</span>
							</div>
							<div class="flex items-center justify-between text-sm">
								<span>Contradictions</span>
								<span>{quality.contradictionCount}</span>
							</div>
							<div class="flex items-center justify-between text-sm">
								<span>Verification</span>
								<Badge
									variant={quality.verificationStatus === 'fresh'
										? 'default'
										: quality.verificationStatus === 'needs_review'
											? 'destructive'
											: 'secondary'}
								>
									{quality.verificationStatus}
								</Badge>
							</div>
						</CardContent>
					</Card>
				{/if}

				<Card>
					<CardHeader>
						<CardTitle class="text-base">Mastery</CardTitle>
						<CardDescription>Your Bloom's taxonomy levels</CardDescription>
					</CardHeader>
					<CardContent class="space-y-2">
						{#each ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'] as level}
							<label class="flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									checked={mastery?.[level] ?? false}
									onchange={(e) =>
										updateMasteryLevel(level, (e.target as HTMLInputElement).checked)}
									class="size-4 rounded border-gray-300"
								/>
								<span class="capitalize">{level}</span>
							</label>
						{/each}
					</CardContent>
				</Card>
			</div>
		</div>
	{/if}
</main>
