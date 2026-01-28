<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import type { Id } from '../../../convex/_generated/dataModel';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import {
		Play,
		RefreshCw,
		XCircle,
		CheckCircle2,
		AlertCircle,
		Clock,
		Loader2,
		Database,
		Sparkles,
		ListChecks,
		ChevronDown
	} from '@lucide/svelte';

	const client = useConvexClient();

	// Queries
	const statsQuery = useQuery(api.extraction.getStats, {});
	const jobsQuery = useQuery(api.extraction.listJobs, { limit: 20 });
	const extractionTypesQuery = useQuery(api.extraction.listExtractionTypes, {});

	// Form state
	let sourceType = $state<string>('news');
	let selectedExtractionTypes = $state<string[]>([]);
	let selectedFields = $state<string[]>(['body']);
	let batchSize = $state(10);
	let isSubmitting = $state(false);
	let error = $state('');

	// Source type options
	const sourceTypes = [
		{ value: 'news', label: 'News' },
		{ value: 'syllabus', label: 'Syllabus' },
		{ value: 'blog', label: 'Blogs' },
		{ value: 'content', label: 'Content (Re-extract)' }
	];

	// Field options per source type
	const fieldsBySource: Record<string, { key: string; label: string }[]> = {
		news: [
			{ key: 'body', label: 'Content' },
			{ key: 'date', label: 'Date' }
		],
		syllabus: [
			{ key: 'title', label: 'Title' },
			{ key: 'body', label: 'Content' },
			{ key: 'topic', label: 'Topic' }
		],
		blog: [
			{ key: 'title', label: 'Title' },
			{ key: 'body', label: 'Content' }
		],
		content: [
			{ key: 'title', label: 'Title' },
			{ key: 'body', label: 'Content' },
			{ key: 'topic', label: 'Topic' }
		]
	};

	// Get available fields for current source type
	let availableFields = $derived(fieldsBySource[sourceType] ?? []);

	// Source item count query (reactive)
	const sourceCountQuery = useQuery(api.extraction.getSourceItemCount, () => ({
		sourceType
	}));

	// Toggle extraction type selection
	function toggleExtractionType(type: string) {
		if (selectedExtractionTypes.includes(type)) {
			selectedExtractionTypes = selectedExtractionTypes.filter((t) => t !== type);
		} else {
			selectedExtractionTypes = [...selectedExtractionTypes, type];
		}
	}

	// Toggle field selection
	function toggleField(field: string) {
		if (selectedFields.includes(field)) {
			if (selectedFields.length > 1) {
				selectedFields = selectedFields.filter((f) => f !== field);
			}
		} else {
			selectedFields = [...selectedFields, field];
		}
	}

	// Handle source type change
	function handleSourceTypeChange(value: string | undefined) {
		if (!value) return;
		sourceType = value;
		// Reset to default field
		selectedFields = ['body'];
	}

	// Start extraction
	async function startExtraction() {
		if (selectedExtractionTypes.length === 0) {
			error = 'Please select at least one extraction type';
			return;
		}

		if (selectedFields.length === 0) {
			error = 'Please select at least one field';
			return;
		}

		error = '';
		isSubmitting = true;

		try {
			for (const extractionType of selectedExtractionTypes) {
				const jobId = await client.mutation(api.extraction.createJob, {
					sourceType,
					extractionType,
					selectedFields,
					batchSize
				});

				// Start the job
				client.action(api.extraction.runJob, { jobId }).catch((e) => {
					console.error(`Job ${jobId} failed:`, e);
				});
			}

			// Reset form
			selectedExtractionTypes = [];
		} catch (e: any) {
			error = e.message || 'Failed to create extraction job';
		} finally {
			isSubmitting = false;
		}
	}

	// Cancel job
	async function cancelJob(jobId: Id<'extraction_jobs'>) {
		try {
			await client.mutation(api.extraction.cancelJob, { jobId });
		} catch (e: any) {
			alert(e.message || 'Failed to cancel job');
		}
	}

	// Retry job
	async function retryJob(jobId: Id<'extraction_jobs'>) {
		try {
			client.action(api.extraction.retryJob, { jobId }).catch((e) => {
				console.error(`Retry failed:`, e);
			});
		} catch (e: any) {
			alert(e.message || 'Failed to retry job');
		}
	}

	// Get status icon and color
	function getStatusInfo(status: string) {
		switch (status) {
			case 'pending':
				return { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-500/10' };
			case 'running':
				return { icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-500/10', animate: true };
			case 'completed':
				return { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-500/10' };
			case 'failed':
				return { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-500/10' };
			case 'cancelled':
				return { icon: XCircle, color: 'text-gray-500', bg: 'bg-gray-500/10' };
			default:
				return { icon: Clock, color: 'text-gray-500', bg: 'bg-gray-500/10' };
		}
	}

	// Format relative time
	function formatRelativeTime(timestamp: number | undefined) {
		if (!timestamp) return '';
		const diff = Date.now() - timestamp;
		const minutes = Math.floor(diff / 60000);
		if (minutes < 1) return 'Just now';
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		return `${days}d ago`;
	}
</script>

<div class="container mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
	<!-- Header -->
	<div class="mb-8 space-y-2">
		<div class="flex items-center gap-2">
			<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
				<Sparkles class="h-4 w-4 text-primary" />
			</div>
			<h1 class="text-3xl font-semibold tracking-tight">Extraction Center</h1>
		</div>
		<p class="text-muted-foreground">
			Run AI-powered extractions on source data to generate structured content.
		</p>
	</div>

	<!-- Stats Bar -->
	{#if statsQuery.data}
		<div class="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
			<div class="rounded-xl border border-muted bg-card p-4 shadow-sm">
				<div class="text-2xl font-bold tabular-nums">{statsQuery.data.todayTotal}</div>
				<div class="text-xs font-medium text-muted-foreground">Today's Jobs</div>
			</div>
			<div class="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 shadow-sm">
				<div class="text-2xl font-bold text-yellow-600 tabular-nums dark:text-yellow-400">
					{statsQuery.data.pending}
				</div>
				<div class="text-xs font-medium text-muted-foreground">Pending</div>
			</div>
			<div class="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 shadow-sm">
				<div class="text-2xl font-bold text-blue-600 tabular-nums dark:text-blue-400">
					{statsQuery.data.running}
				</div>
				<div class="text-xs font-medium text-muted-foreground">Running</div>
			</div>
			<div class="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 shadow-sm">
				<div class="text-2xl font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
					{statsQuery.data.completed}
				</div>
				<div class="text-xs font-medium text-muted-foreground">Completed</div>
			</div>
			<div class="rounded-xl border border-red-500/20 bg-red-500/5 p-4 shadow-sm">
				<div class="text-2xl font-bold text-red-600 tabular-nums dark:text-red-400">
					{statsQuery.data.failed}
				</div>
				<div class="text-xs font-medium text-muted-foreground">Failed</div>
			</div>
			<div class="rounded-xl border border-primary/20 bg-primary/5 p-4 shadow-sm">
				<div class="text-2xl font-bold text-primary tabular-nums">{statsQuery.data.total}</div>
				<div class="text-xs font-medium text-muted-foreground">Total Jobs</div>
			</div>
		</div>
	{:else}
		<div class="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
			{#each Array(6) as _}
				<Skeleton class="h-20 w-full rounded-xl" />
			{/each}
		</div>
	{/if}

	<div class="grid gap-8 lg:grid-cols-2">
		<!-- New Extraction Form -->
		<div class="rounded-xl border bg-card shadow-sm">
			<div class="border-b px-6 py-4">
				<div class="flex items-center gap-2">
					<Sparkles class="h-4 w-4 text-primary" />
					<h2 class="font-semibold">New Extraction</h2>
				</div>
				<p class="mt-1 text-xs text-muted-foreground">Configure and run a new extraction job</p>
			</div>
			<div class="space-y-6 p-6">
				<!-- Source Type -->
				<div class="space-y-2">
					<label for="sourceType" class="text-sm font-medium">Source Type</label>
					<div class="relative">
						<select
							id="sourceType"
							class="flex h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
							onchange={(e) => handleSourceTypeChange(e.currentTarget.value)}
							value={sourceType}
						>
							{#each sourceTypes as src}
								<option value={src.value}>{src.label}</option>
							{/each}
						</select>
						<ChevronDown
							class="pointer-events-none absolute top-3 right-3 h-4 w-4 text-muted-foreground"
						/>
					</div>
					{#if sourceCountQuery.data !== undefined}
						<p class="flex items-center gap-1 text-xs text-muted-foreground">
							<Database class="h-3 w-3" />
							{sourceCountQuery.data} items available
						</p>
					{/if}
				</div>

				<!-- Fields to Extract From -->
				<div class="space-y-2">
					<p class="text-sm font-medium">Fields to Extract From</p>
					<div class="flex flex-wrap gap-2">
						{#each availableFields as field}
							<Button
								variant={selectedFields.includes(field.key) ? 'default' : 'outline'}
								size="sm"
								onclick={() => toggleField(field.key)}
								class="h-8 text-xs"
							>
								{field.label}
							</Button>
						{/each}
					</div>
				</div>

				<Separator />

				<!-- Extraction Types -->
				<div class="space-y-3">
					<p class="text-sm font-medium">Extraction Types</p>
					<div class="grid gap-3 sm:grid-cols-2">
						{#if extractionTypesQuery.data}
							{#each extractionTypesQuery.data as ext}
								<button
									class="flex items-start gap-3 rounded-lg border p-3 text-left transition-all hover:border-primary/30 hover:bg-muted/50 {selectedExtractionTypes.includes(
										ext.type
									)
										? 'border-primary bg-primary/5 ring-1 ring-primary/20'
										: 'border-border'}"
									onclick={() => toggleExtractionType(ext.type)}
								>
									<div
										class="flex h-5 w-5 items-center justify-center rounded border border-primary/20 bg-background"
									>
										{#if selectedExtractionTypes.includes(ext.type)}
											<div class="h-3 w-3 rounded-sm bg-primary"></div>
										{/if}
									</div>
									<div>
										<div class="text-sm font-medium">{ext.name}</div>
										<div class="mt-0.5 text-xs leading-snug text-muted-foreground">
											{ext.description}
										</div>
									</div>
								</button>
							{/each}
						{:else}
							{#each Array(4) as _}
								<Skeleton class="h-20 w-full rounded-lg" />
							{/each}
						{/if}
					</div>
				</div>

				<Separator />

				<!-- Batch Size -->
				<div class="space-y-2">
					<label for="batchSize" class="text-sm font-medium">Batch Size</label>
					<div class="flex items-center gap-4">
						<Input
							id="batchSize"
							type="number"
							bind:value={batchSize}
							min={1}
							max={100}
							class="h-9 w-32"
						/>
						<span class="text-xs text-muted-foreground">Items per batch (1-100)</span>
					</div>
				</div>

				{#if error}
					<div
						class="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm font-medium text-destructive"
					>
						{error}
					</div>
				{/if}

				<!-- Submit Button -->
				<Button
					class="w-full gap-2 font-semibold shadow-sm"
					size="lg"
					onclick={startExtraction}
					disabled={isSubmitting || selectedExtractionTypes.length === 0}
				>
					{#if isSubmitting}
						<Loader2 class="h-4 w-4 animate-spin" />
						Starting...
					{:else}
						<Play class="h-4 w-4" />
						Start Extraction
					{/if}
				</Button>
			</div>
		</div>

		<!-- Job Queue -->
		<div class="overflow-hidden rounded-xl border bg-card shadow-sm">
			<div class="border-b bg-muted/30 px-6 py-4">
				<div class="flex items-center gap-2">
					<ListChecks class="h-5 w-5 text-primary" />
					<h2 class="font-semibold">Job Queue</h2>
				</div>
				<p class="mt-1 text-xs text-muted-foreground">Recent and active extraction jobs</p>
			</div>

			{#if jobsQuery.data}
				{#if jobsQuery.data.length === 0}
					<div class="flex flex-col items-center justify-center py-12 text-center">
						<Database class="mb-3 h-10 w-10 text-muted-foreground/30" />
						<p class="font-medium text-muted-foreground">No extraction jobs yet</p>
						<p class="text-sm text-muted-foreground/70">
							Start your first extraction to see it here
						</p>
					</div>
				{:else}
					<div class="divide-y">
						{#each jobsQuery.data as job}
							{@const statusInfo = getStatusInfo(job.status)}
							{@const StatusIcon = statusInfo.icon}
							<div class="flex items-start gap-4 p-4 transition-colors hover:bg-muted/30">
								<div
									class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg {statusInfo.bg}"
								>
									<StatusIcon
										class="h-4.5 w-4.5 {statusInfo.color} {statusInfo.animate
											? 'animate-spin'
											: ''}"
									/>
								</div>
								<div class="min-w-0 flex-1 space-y-1">
									<div class="flex items-center gap-2">
										<span class="truncate text-sm font-semibold capitalize"
											>{job.extractionType.replace('_', ' ')}</span
										>
										<Badge
											variant="secondary"
											class="h-5 px-1.5 text-[10px] font-bold tracking-wider uppercase"
											>{job.sourceType}</Badge
										>
									</div>
									<div
										class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
									>
										<span class="font-medium text-foreground/80 tabular-nums">
											{job.processedItems}/{job.totalItems} processed
										</span>
										<span>•</span>
										<span class="tabular-nums">{job.extractedCount} extracted</span>
										{#if job.completedAt}
											<span>•</span>
											<span>{formatRelativeTime(job.completedAt)}</span>
										{:else if job.createdAt}
											<span>•</span>
											<span>{formatRelativeTime(job.createdAt)}</span>
										{/if}
									</div>
									{#if job.status === 'running' || job.status === 'pending'}
										<div class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
											<div
												class="h-full bg-primary transition-all duration-500"
												style="width: {(job.processedItems / (job.totalItems || 1)) * 100}%"
											></div>
										</div>
									{/if}
								</div>
								<div class="flex shrink-0 gap-1">
									{#if job.status === 'running' || job.status === 'pending'}
										<Button
											variant="ghost"
											size="icon-sm"
											title="Cancel"
											onclick={() => cancelJob(job._id)}
											class="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
										>
											<XCircle class="h-4 w-4" />
										</Button>
									{:else if job.status === 'failed' || job.status === 'cancelled'}
										<Button
											variant="ghost"
											size="icon-sm"
											title="Retry"
											onclick={() => retryJob(job._id)}
											class="h-8 w-8 text-muted-foreground hover:text-foreground"
										>
											<RefreshCw class="h-4 w-4" />
										</Button>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{/if}
			{:else}
				<div class="space-y-4 divide-y p-4">
					{#each Array(5) as _}
						<div class="flex items-center gap-4">
							<Skeleton class="h-10 w-10 rounded-lg" />
							<div class="flex-1 space-y-2">
								<Skeleton class="h-4 w-32" />
								<Skeleton class="h-3 w-48" />
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>
