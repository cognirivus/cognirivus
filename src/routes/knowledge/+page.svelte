<script lang="ts">
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
	import {
		Check,
		ExternalLink,
		Loader2,
		NotebookText,
		RefreshCcw,
		Trash2,
		X,
		Square,
		Lightbulb,
		BookOpen,
		Brain,
		Star,
		Puzzle,
		HelpCircle
	} from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	type PendingChange = {
		_id: Id<'knowledge_extracted_candidates'>;
		sourceId: Id<'information_sources'>;
		resolvedSourceItemId?: string;
		cellType: 'FACT' | 'CONCEPT' | 'PRINCIPLE' | 'PROCEDURE' | 'HEURISTIC' | 'QUESTION';
		title: string;
		summary: string;
		content: string;
		status: 'pending' | 'approved' | 'rejected' | 'merged';
		createdAt: number;
		updatedAt: number;
	};

	type SynthesisJob = {
		_id: Id<'knowledge_extraction_jobs'>;
		sourceId: Id<'information_sources'>;
		status: 'pending' | 'running' | 'completed' | 'failed';
		stage?: 'queued' | 'loading_source' | 'synthesizing' | 'saving' | 'completed' | 'failed';
		model: string;
		promptVersion: string;
		outputSummary?: string;
		error?: string;
		startedAt: number;
		completedAt?: number;
	};

	type CellSummary = {
		_id: Id<'knowledge_cells'>;
		title: string;
		summary: string;
		cellType: 'FACT' | 'CONCEPT' | 'PRINCIPLE' | 'PROCEDURE' | 'HEURISTIC' | 'QUESTION';
		topicId: Id<'knowledge_cell_topics'>;
		source: 'llm_extracted' | 'human_created' | 'community';
		createdAt: number;
		updatedAt: number;
	};

	type NoteSummary = {
		_id: Id<'knowledge_notes'>;
		title: string;
		summary: string;
		status: 'draft' | 'review' | 'published' | 'archived';
		version: number;
		cellCount: number;
		createdAt: number;
		updatedAt: number;
	};

	const client = useConvexClient();
	const pendingChangesQuery = useQuery((api as any).knowledgeNotes.listPendingChanges, {
		status: 'pending',
		limit: 50
	});
	const jobsQuery = useQuery((api as any).knowledgeNotes.listSynthesisJobs, { limit: 20 });
	const cellsQuery = useQuery((api as any).knowledgeNotes.listCells, { limit: 20 });
	const notesQuery = useQuery((api as any).knowledgeNotes.listNotes, { limit: 20 });
	const handledChangesQuery = useQuery((api as any).knowledgeNotes.listHandledChanges, {
		limit: 20
	});

	let busyId = $state<string | null>(null);
	let expandedJobId = $state<string | null>(null);
	let expandedStepIdx = $state<number | null>(null);
	let activeTab = $state<'review' | 'cells' | 'notes' | 'processing'>('review');

	const pendingChanges = $derived((pendingChangesQuery.data ?? []) as Array<PendingChange>);
	const jobs = $derived((jobsQuery.data ?? []) as Array<SynthesisJob>);
	const activeJobs = $derived(
		jobs.filter((job) => job.status === 'pending' || job.status === 'running')
	);
	const failedJobs = $derived(jobs.filter((job) => job.status === 'failed'));
	const cells = $derived((cellsQuery.data ?? []) as Array<CellSummary>);
	const notes = $derived((notesQuery.data ?? []) as Array<NoteSummary>);
	const handledChanges = $derived((handledChangesQuery.data ?? []) as Array<PendingChange>);

	const cellTypeColors: Record<string, string> = {
		FACT: 'bg-blue-100 text-blue-800',
		CONCEPT: 'bg-green-100 text-green-800',
		PRINCIPLE: 'bg-purple-100 text-purple-800',
		PROCEDURE: 'bg-amber-100 text-amber-800',
		HEURISTIC: 'bg-rose-100 text-rose-800',
		QUESTION: 'bg-cyan-100 text-cyan-800'
	};

	const cellTypeIcons: Record<string, typeof Lightbulb> = {
		FACT: Lightbulb,
		CONCEPT: Brain,
		PRINCIPLE: Star,
		PROCEDURE: BookOpen,
		HEURISTIC: Puzzle,
		QUESTION: HelpCircle
	};

	async function approve(change: PendingChange) {
		busyId = change._id;
		try {
			await client.action((api as any).knowledgeNotes.approvePendingChange, {
				pendingChangeId: change._id,
				editedContent: change.content
			});
			toast.success('Cell created');
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to approve suggestion');
		} finally {
			busyId = null;
		}
	}

	async function reject(change: PendingChange) {
		busyId = change._id;
		try {
			await client.mutation((api as any).knowledgeNotes.rejectPendingChange, {
				pendingChangeId: change._id
			});
			toast.success('Suggestion rejected');
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to reject suggestion');
		} finally {
			busyId = null;
		}
	}

	async function retry(job: SynthesisJob) {
		busyId = job._id;
		try {
			await client.mutation((api as any).knowledgeNotes.retrySynthesisJob, { jobId: job._id });
			toast.success('Retry queued');
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to retry job');
		} finally {
			busyId = null;
		}
	}

	async function cancelJob(job: SynthesisJob) {
		busyId = job._id;
		try {
			await client.mutation((api as any).knowledgeNotes.cancelSynthesisJob, { jobId: job._id });
			toast.success('Job cancelled');
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to cancel job');
		} finally {
			busyId = null;
		}
	}

	async function deleteJob(job: SynthesisJob) {
		busyId = job._id;
		try {
			await client.mutation((api as any).knowledgeNotes.deleteSynthesisJob, { jobId: job._id });
			toast.success('Job deleted');
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to delete job');
		} finally {
			busyId = null;
		}
	}

	const stages = [
		{ key: 'queued', label: 'Queued', icon: '1' },
		{ key: 'loading_source', label: 'Loading Source', icon: '2' },
		{ key: 'synthesizing', label: 'AI Synthesis', icon: '3' },
		{ key: 'saving', label: 'Saving Results', icon: '4' },
		{ key: 'completed', label: 'Done', icon: '5' }
	] as const;

	function getStageIndex(stage?: string): number {
		if (!stage) return 0;
		const idx = stages.findIndex((s) => s.key === stage);
		return idx >= 0 ? idx : 0;
	}

	function formatDuration(startedAt: number, completedAt?: number): string {
		const ms = (completedAt ?? Date.now()) - startedAt;
		if (ms < 1000) return ms + 'ms';
		if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
		return (ms / 60000).toFixed(1) + 'm';
	}

	function toggleJobDetails(jobId: string, stepIdx: number) {
		if (expandedJobId === jobId && expandedStepIdx === stepIdx) {
			expandedJobId = null;
			expandedStepIdx = null;
		} else {
			expandedJobId = jobId;
			expandedStepIdx = stepIdx;
		}
	}

	function renderContent(text: string): string {
		let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		html = html.replace(
			/`([^`]+)`/g,
			'<code class="inline-block rounded-md bg-blue-50 px-1.5 py-0.5 font-mono text-xs text-blue-700">$1</code>'
		);
		html = html.replace(/\n/g, '<br>');
		return html;
	}

	const stageDetails: Record<string, { title: string; description: string }> = {
		queued: {
			title: 'Queued',
			description: 'Job created and waiting to be picked up by the background processor.'
		},
		loading_source: {
			title: 'Loading Source',
			description:
				'Fetching the source content from storage. This may take a moment for large files.'
		},
		synthesizing: {
			title: 'AI Synthesis',
			description:
				'The AI model is analyzing the source content and extracting knowledge cells, citations, and entities.'
		},
		saving: {
			title: 'Saving Results',
			description: 'Writing extracted knowledge cells, relationships, and metadata to the database.'
		},
		completed: {
			title: 'Completed',
			description:
				'All knowledge has been extracted and saved. Review the suggestions in the Review tab.'
		},
		failed: {
			title: 'Failed',
			description: 'An error occurred during processing. Check the error message and retry.'
		}
	};
</script>

<main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
	<div class="mb-6">
		<h1 class="text-2xl font-semibold tracking-tight">Knowledge</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			Manage knowledge cells, review AI suggestions, and browse synthesized notes.
		</p>
	</div>

	<div class="mb-6 flex gap-1 rounded-lg border border-border p-1">
		<button
			class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors {activeTab ===
			'review'
				? 'bg-primary text-primary-foreground'
				: 'text-muted-foreground hover:bg-muted'}"
			onclick={() => (activeTab = 'review')}
		>
			Review ({pendingChanges.length})
		</button>
		<button
			class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors {activeTab ===
			'cells'
				? 'bg-primary text-primary-foreground'
				: 'text-muted-foreground hover:bg-muted'}"
			onclick={() => (activeTab = 'cells')}
		>
			Cells ({cells.length})
		</button>
		<button
			class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors {activeTab ===
			'notes'
				? 'bg-primary text-primary-foreground'
				: 'text-muted-foreground hover:bg-muted'}"
			onclick={() => (activeTab = 'notes')}
		>
			Notes ({notes.length})
		</button>
		<button
			class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors {activeTab ===
			'processing'
				? 'bg-primary text-primary-foreground'
				: 'text-muted-foreground hover:bg-muted'}"
			onclick={() => (activeTab = 'processing')}
		>
			Processing ({activeJobs.length})
		</button>
	</div>

	{#if activeTab === 'review'}
		<section>
			<div class="mb-4 flex items-center justify-between">
				<div>
					<h2 class="text-xl font-semibold tracking-tight">Ready for Review</h2>
					<p class="mt-0.5 text-sm text-muted-foreground">
						Review and approve changes before they go live.
					</p>
				</div>
				<div class="flex items-center gap-2">
					<span
						class="inline-flex size-7 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground"
					>
						{pendingChanges.length}
					</span>
					<span class="text-sm text-muted-foreground">Items</span>
				</div>
			</div>
			{#if pendingChangesQuery.isLoading}
				<div class="flex justify-center py-12">
					<Loader2 class="size-6 animate-spin text-muted-foreground" />
				</div>
			{:else if pendingChanges.length === 0}
				<div class="rounded-lg border border-dashed border-border py-12 text-center">
					<NotebookText class="mx-auto mb-3 size-8 text-muted-foreground" />
					<p class="text-sm text-muted-foreground">No suggestions waiting for review.</p>
					<p class="mt-1 text-xs text-muted-foreground">Consume a source item to get started.</p>
				</div>
			{:else}
				<div class="divide-y divide-border rounded-lg border border-border">
					{#each pendingChanges as change, idx (change._id)}
						{@const TypeIcon = cellTypeIcons[change.cellType] ?? Lightbulb}
						<div class="px-5 py-5">
							<div class="flex items-start gap-4">
								<span
									class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
								>
									{idx + 1}
								</span>
								<div class="min-w-0 flex-1">
									<div class="flex items-start justify-between gap-3">
										<div class="min-w-0 flex-1">
											<h3 class="text-base leading-snug font-semibold">
												{change.title || 'Untitled suggestion'}
											</h3>
											<p class="mt-0.5 text-sm text-muted-foreground">
												{change.summary}
											</p>
										</div>
										<div class="flex shrink-0 items-center gap-2">
											<span
												class="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium {cellTypeColors[
													change.cellType
												]}"
											>
												<TypeIcon class="size-3.5" />
												{change.cellType}
											</span>
											<span
												class="inline-flex items-center gap-1.5 rounded-md border border-border bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700"
											>
												<span class="size-1.5 rounded-full bg-amber-500"></span>
												Pending
											</span>
										</div>
									</div>

									<div class="mt-4 text-sm leading-relaxed text-foreground">
										{@html renderContent(change.content)}
									</div>

									<div class="mt-4 flex items-center justify-between">
										<Button
											size="sm"
											variant="ghost"
											class="h-8 gap-1.5 text-muted-foreground"
											href="/source/{change.resolvedSourceItemId ?? change.sourceId}"
										>
											<ExternalLink class="size-3.5" />
											Open Source
										</Button>
										<div class="flex gap-2">
											<Button
												size="sm"
												variant="outline"
												class="h-8 gap-1.5"
												disabled={busyId === change._id}
												onclick={() => reject(change)}
											>
												{#if busyId === change._id}
													<Loader2 class="size-3.5 animate-spin" />
												{:else}
													<X class="size-3.5" />
												{/if}
												Reject
											</Button>
											<Button
												size="sm"
												class="h-8 gap-1.5"
												disabled={busyId === change._id}
												onclick={() => approve(change)}
											>
												{#if busyId === change._id}
													<Loader2 class="size-3.5 animate-spin" />
												{:else}
													<Check class="size-3.5" />
												{/if}
												Approve
											</Button>
										</div>
									</div>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{:else if activeTab === 'cells'}
		<section>
			<div class="mb-3 flex items-center justify-between gap-3">
				<h2 class="text-lg font-semibold">Knowledge Cells</h2>
				<Badge variant="secondary">{cells.length}</Badge>
			</div>
			{#if cellsQuery.isLoading}
				<p class="text-sm text-muted-foreground">Loading cells...</p>
			{:else if cells.length === 0}
				<Card>
					<CardContent class="py-8 text-sm text-muted-foreground">
						No cells yet. Approve a suggestion above to create your first cell.
					</CardContent>
				</Card>
			{:else}
				<div class="grid gap-3 md:grid-cols-2">
					{#each cells as cell (cell._id)}
						<a
							href="/knowledge/cells/{cell._id}"
							class="block rounded-md border border-border p-4 transition-colors hover:bg-muted/50"
						>
							<div class="flex items-start justify-between gap-3">
								<div class="min-w-0 flex-1">
									<h3 class="truncate font-medium">{cell.title}</h3>
									<p class="mt-1 line-clamp-2 text-sm text-muted-foreground">{cell.summary}</p>
								</div>
								<Badge variant="outline" class={cellTypeColors[cell.cellType]}>
									{cell.cellType}
								</Badge>
							</div>
							<div class="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
								<span>{cell.source.replace('_', ' ')}</span>
								<span>{new Date(cell.updatedAt).toLocaleString()}</span>
							</div>
						</a>
					{/each}
				</div>
			{/if}
		</section>
	{:else if activeTab === 'notes'}
		<section>
			<div class="mb-3 flex items-center justify-between gap-3">
				<h2 class="text-lg font-semibold">Synthesized Notes</h2>
				<Badge variant="secondary">{notes.length}</Badge>
			</div>
			{#if notesQuery.isLoading}
				<p class="text-sm text-muted-foreground">Loading notes...</p>
			{:else if notes.length === 0}
				<Card>
					<CardContent class="py-8 text-sm text-muted-foreground">
						No notes yet. Approved cell suggestions will appear here.
					</CardContent>
				</Card>
			{:else}
				<div class="grid gap-3 md:grid-cols-2">
					{#each notes as note (note._id)}
						<a
							href="/knowledge/notes/{note._id}"
							class="block rounded-md border border-border p-4 transition-colors hover:bg-muted/50"
						>
							<div class="flex items-start justify-between gap-3">
								<div class="min-w-0 flex-1">
									<h3 class="truncate font-medium">{note.title}</h3>
									<p class="mt-1 line-clamp-2 text-sm text-muted-foreground">{note.summary}</p>
								</div>
								<Badge variant="outline">v{note.version}</Badge>
							</div>
							<div class="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
								<Badge variant={note.status === 'published' ? 'default' : 'secondary'}>
									{note.status}
								</Badge>
								<span>{note.cellCount} cells</span>
								<span>{new Date(note.updatedAt).toLocaleString()}</span>
							</div>
						</a>
					{/each}
				</div>
			{/if}
		</section>
	{:else if activeTab === 'processing'}
		<section class="grid gap-4 lg:grid-cols-2">
			<Card>
				<CardHeader>
					<CardTitle>Active Jobs</CardTitle>
					<CardDescription>Background synthesis jobs currently running.</CardDescription>
				</CardHeader>
				<CardContent class="space-y-4">
					{#if jobsQuery.isLoading}
						<p class="text-sm text-muted-foreground">Loading...</p>
					{:else if activeJobs.length === 0}
						<p class="text-sm text-muted-foreground">No active jobs.</p>
					{:else}
						{#each activeJobs as job (job._id)}
							{@const currentIdx = getStageIndex(job.stage)}
							<div class="rounded-md border border-border p-4">
								<div class="mb-3 flex items-center justify-between">
									<div class="flex items-center gap-2">
										<Badge variant={job.status === 'pending' ? 'secondary' : 'default'}>
											{job.status === 'pending' ? 'Queued' : 'Processing'}
										</Badge>
										<span class="text-xs text-muted-foreground">{job.model}</span>
									</div>
									<Button
										size="sm"
										variant="outline"
										disabled={busyId === job._id}
										onclick={() => cancelJob(job)}
									>
										{#if busyId === job._id}
											<Loader2 class="mr-1 size-3 animate-spin" />
										{:else}
											<Square class="mr-1 size-3" />
										{/if}
										Cancel
									</Button>
								</div>

								<div class="mb-3 flex items-center gap-1">
									{#each stages as step, i}
										{@const isDone = i < currentIdx}
										{@const isCurrent =
											i === currentIdx && job.status !== 'completed' && job.status !== 'failed'}
										<button
											class="flex size-6 cursor-pointer items-center justify-center rounded-full text-xs font-medium transition-all
										{isDone
												? 'bg-primary text-primary-foreground hover:bg-primary/80'
												: isCurrent
													? 'animate-pulse bg-primary/20 text-primary ring-2 ring-primary hover:bg-primary/30'
													: 'bg-muted text-muted-foreground hover:bg-muted/80'}"
											onclick={() => toggleJobDetails(job._id, i)}
										>
											{isDone ? '✓' : step.icon}
										</button>
										{#if i < stages.length - 1}
											<div class="h-0.5 w-4 {isDone ? 'bg-primary' : 'bg-muted'}"></div>
										{/if}
									{/each}
								</div>

								{#if expandedJobId === job._id && expandedStepIdx !== null}
									{@const stepKey = stages[expandedStepIdx].key}
									{@const detail = stageDetails[stepKey]}
									<div class="mb-3 rounded-md bg-muted/50 p-3 text-sm">
										<p class="font-medium">{detail.title}</p>
										<p class="mt-1 text-muted-foreground">{detail.description}</p>
										{#if expandedStepIdx === currentIdx && job.error}
											<p class="mt-2 rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">
												{job.error}
											</p>
										{/if}
									</div>
								{/if}

								<div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
									<span>Started {new Date(job.startedAt).toLocaleTimeString()}</span>
									<span>Running {formatDuration(job.startedAt)}</span>
									<span>v{job.promptVersion}</span>
								</div>
								{#if job.error}
									<p class="mt-2 rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">
										{job.error}
									</p>
								{/if}
							</div>
						{/each}
					{/if}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Recent Failures</CardTitle>
					<CardDescription>Retry items that could not be processed.</CardDescription>
				</CardHeader>
				<CardContent class="space-y-3">
					{#if failedJobs.length === 0}
						<p class="text-sm text-muted-foreground">No failed jobs.</p>
					{:else}
						{#each failedJobs as job (job._id)}
							<div class="rounded-md border border-destructive/30 bg-destructive/5 p-3">
								<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
									<div class="min-w-0 flex-1">
										<div class="flex items-center gap-2">
											<Badge variant="destructive">Failed</Badge>
											<span class="text-xs text-muted-foreground">{job.model}</span>
										</div>
										<p class="mt-2 text-sm">{job.error ?? 'Unknown error'}</p>
										<div class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
											<span>Failed at: {job.stage ?? 'unknown'}</span>
											<span>{new Date(job.startedAt).toLocaleString()}</span>
											{#if job.completedAt}
												<span>Took {formatDuration(job.startedAt, job.completedAt)}</span>
											{/if}
											<span>v{job.promptVersion}</span>
										</div>
									</div>
									<div class="flex gap-2">
										<Button
											size="sm"
											variant="outline"
											disabled={busyId === job._id}
											onclick={() => retry(job)}
										>
											{#if busyId === job._id}
												<Loader2 class="mr-1 size-4 animate-spin" />
											{:else}
												<RefreshCcw class="mr-1 size-4" />
											{/if}
											Retry
										</Button>
										<Button
											size="sm"
											variant="ghost"
											disabled={busyId === job._id}
											onclick={() => deleteJob(job)}
										>
											{#if busyId === job._id}
												<Loader2 class="size-4 animate-spin" />
											{:else}
												<Trash2 class="size-4 text-muted-foreground" />
											{/if}
										</Button>
									</div>
								</div>
							</div>
						{/each}
					{/if}
				</CardContent>
			</Card>
		</section>
	{/if}
</main>
