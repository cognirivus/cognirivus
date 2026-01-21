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
	// import * as Select from '$lib/components/ui/select';
	// import { Checkbox } from '$lib/components/ui/checkbox';
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
		ChevronDown,
		ChevronUp,
		Eye
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
	<div class="mb-8 space-y-1">
		<h1 class="text-3xl font-bold tracking-tight">Extraction Center</h1>
		<p class="text-muted-foreground">
			Run AI-powered extractions on source data to generate structured content.
		</p>
	</div>

	<!-- Stats Bar -->
	{#if statsQuery.data}
		<div class="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
			<Card.Root class="border-none bg-muted/50">
				<Card.Content class="p-4">
					<div class="text-2xl font-bold">{statsQuery.data.todayTotal}</div>
					<div class="text-xs text-muted-foreground">Today's Jobs</div>
				</Card.Content>
			</Card.Root>
			<Card.Root class="border-none bg-yellow-500/10">
				<Card.Content class="p-4">
					<div class="text-2xl font-bold text-yellow-600">{statsQuery.data.pending}</div>
					<div class="text-xs text-muted-foreground">Pending</div>
				</Card.Content>
			</Card.Root>
			<Card.Root class="border-none bg-blue-500/10">
				<Card.Content class="p-4">
					<div class="text-2xl font-bold text-blue-600">{statsQuery.data.running}</div>
					<div class="text-xs text-muted-foreground">Running</div>
				</Card.Content>
			</Card.Root>
			<Card.Root class="border-none bg-green-500/10">
				<Card.Content class="p-4">
					<div class="text-2xl font-bold text-green-600">{statsQuery.data.completed}</div>
					<div class="text-xs text-muted-foreground">Completed</div>
				</Card.Content>
			</Card.Root>
			<Card.Root class="border-none bg-red-500/10">
				<Card.Content class="p-4">
					<div class="text-2xl font-bold text-red-600">{statsQuery.data.failed}</div>
					<div class="text-xs text-muted-foreground">Failed</div>
				</Card.Content>
			</Card.Root>
			<Card.Root class="border-none bg-primary/10">
				<Card.Content class="p-4">
					<div class="text-2xl font-bold text-primary">{statsQuery.data.total}</div>
					<div class="text-xs text-muted-foreground">Total Jobs</div>
				</Card.Content>
			</Card.Root>
		</div>
	{:else}
		<div class="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
			{#each Array(6) as _}
				<Skeleton class="h-20 w-full" />
			{/each}
		</div>
	{/if}

	<div class="grid gap-8 lg:grid-cols-2">
		<!-- New Extraction Form -->
		<Card.Root class="overflow-hidden border-primary/10 shadow-lg">
			<Card.Header class="bg-muted/30 pb-4">
				<div class="flex items-center gap-2">
					<Sparkles class="h-5 w-5 text-primary" />
					<Card.Title>New Extraction</Card.Title>
				</div>
				<Card.Description>Configure and run a new extraction job</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-6 p-6">
				<!-- Source Type -->
				<div class="space-y-2">
					<label for="sourceType" class="text-sm font-semibold">Source Type</label>
					<select
						id="sourceType"
						class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
						onchange={(e) => handleSourceTypeChange(e.currentTarget.value)}
						value={sourceType}
					>
						{#each sourceTypes as src}
							<option value={src.value}>{src.label}</option>
						{/each}
					</select>
					{#if sourceCountQuery.data !== undefined}
						<p class="text-xs text-muted-foreground">
							{sourceCountQuery.data} items available
						</p>
					{/if}
				</div>

				<!-- Fields to Extract From -->
				<div class="space-y-2">
					<p class="text-sm font-semibold">Fields to Extract From</p>
					<div class="flex flex-wrap gap-2">
						{#each availableFields as field}
							<Button
								variant={selectedFields.includes(field.key) ? 'default' : 'outline'}
								size="sm"
								onclick={() => toggleField(field.key)}
							>
								{field.label}
							</Button>
						{/each}
					</div>
				</div>

				<Separator />

				<!-- Extraction Types -->
				<div class="space-y-2">
					<p class="text-sm font-semibold">Extraction Types</p>
					<div class="grid gap-2 sm:grid-cols-2">
						{#if extractionTypesQuery.data}
							{#each extractionTypesQuery.data as ext}
								<button
									class="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 {selectedExtractionTypes.includes(
										ext.type
									)
										? 'border-primary bg-primary/5'
										: 'border-border'}"
									onclick={() => toggleExtractionType(ext.type)}
								>
									<input
										type="checkbox"
										class="mt-1"
										checked={selectedExtractionTypes.includes(ext.type)}
										readonly
									/>
									<div>
										<div class="font-medium">{ext.name}</div>
										<div class="text-xs text-muted-foreground">{ext.description}</div>
									</div>
								</button>
							{/each}
						{:else}
							{#each Array(6) as _}
								<Skeleton class="h-16 w-full" />
							{/each}
						{/if}
					</div>
				</div>

				<Separator />

				<!-- Batch Size -->
				<div class="space-y-2">
					<label for="batchSize" class="text-sm font-semibold">Batch Size</label>
					<Input
						id="batchSize"
						type="number"
						bind:value={batchSize}
						min={1}
						max={100}
						class="w-32"
					/>
					<p class="text-xs text-muted-foreground">Number of items to process</p>
				</div>

				{#if error}
					<div
						class="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
					>
						{error}
					</div>
				{/if}

				<!-- Submit Button -->
				<Button
					class="w-full gap-2"
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
			</Card.Content>
		</Card.Root>

		<!-- Job Queue -->
		<Card.Root class="overflow-hidden border-primary/10 shadow-lg">
			<Card.Header class="bg-muted/30 pb-4">
				<div class="flex items-center gap-2">
					<ListChecks class="h-5 w-5 text-primary" />
					<Card.Title>Job Queue</Card.Title>
				</div>
				<Card.Description>Recent and active extraction jobs</Card.Description>
			</Card.Header>
			<Card.Content class="p-0">
				{#if jobsQuery.data}
					{#if jobsQuery.data.length === 0}
						<div class="flex flex-col items-center justify-center py-12 text-center">
							<Database class="mb-4 h-12 w-12 text-muted-foreground/30" />
							<p class="text-muted-foreground">No extraction jobs yet</p>
							<p class="text-sm text-muted-foreground/70">Start your first extraction above</p>
						</div>
					{:else}
						<div class="divide-y">
							{#each jobsQuery.data as job}
								{@const statusInfo = getStatusInfo(job.status)}
								{@const StatusIcon = statusInfo.icon}
								<div class="flex items-center gap-4 p-4 hover:bg-muted/30">
									<div
										class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full {statusInfo.bg}"
									>
										<StatusIcon
											class="h-5 w-5 {statusInfo.color} {statusInfo.animate ? 'animate-spin' : ''}"
										/>
									</div>
									<div class="min-w-0 flex-1">
										<div class="flex items-center gap-2">
											<span class="truncate font-medium capitalize"
												>{job.extractionType.replace('_', ' ')}</span
											>
											<Badge variant="outline" class="shrink-0">{job.sourceType}</Badge>
										</div>
										<div class="flex items-center gap-2 text-xs text-muted-foreground">
											<span>
												{job.processedItems}/{job.totalItems} items
											</span>
											<span>-</span>
											<span>{job.extractedCount} extracted</span>
											{#if job.completedAt}
												<span>-</span>
												<span>{formatRelativeTime(job.completedAt)}</span>
											{:else if job.createdAt}
												<span>-</span>
												<span>{formatRelativeTime(job.createdAt)}</span>
											{/if}
										</div>
									</div>
									<div class="flex shrink-0 gap-1">
										{#if job.status === 'running' || job.status === 'pending'}
											<Button
												variant="ghost"
												size="icon-sm"
												title="Cancel"
												onclick={() => cancelJob(job._id)}
												class="text-destructive hover:bg-destructive/10"
											>
												<XCircle class="h-4 w-4" />
											</Button>
										{:else if job.status === 'failed' || job.status === 'cancelled'}
											<Button
												variant="ghost"
												size="icon-sm"
												title="Retry"
												onclick={() => retryJob(job._id)}
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
					<div class="divide-y">
						{#each Array(5) as _}
							<div class="flex items-center gap-4 p-4">
								<Skeleton class="h-10 w-10 rounded-full" />
								<div class="flex-1 space-y-2">
									<Skeleton class="h-4 w-32" />
									<Skeleton class="h-3 w-48" />
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>
</div>
