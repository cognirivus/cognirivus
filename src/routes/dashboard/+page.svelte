<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import * as Card from '$lib/components/ui/card';
	import { Separator } from '$lib/components/ui/separator';
	import {
		BookCheck,
		ChartLine,
		Settings,
		ChevronRight,
		CheckCircle,
		Zap,
		Brain,
		Highlighter
	} from '@lucide/svelte';

	const progressQuery = useQuery(api.content.getProgressAnalytics, {});
	const usageQuery = useQuery(api.analytics.getDashboardStats, {});
	const memoriesQuery = useQuery(api.memories.list, {});
	const highlightsQuery = useQuery(api.highlights.getAllUserHighlights, {});

	const progressStats = $derived(progressQuery.data);
	const usageStats = $derived(usageQuery.data);
	const memoriesCount = $derived(memoriesQuery.data?.length ?? 0);
	const highlightsCount = $derived(highlightsQuery.data?.length ?? 0);

	function getPercentage(completed: number, total: number) {
		if (total === 0) return 0;
		return Math.round((completed / total) * 100);
	}

	function formatCost(cost: number) {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 4
		}).format(cost);
	}
</script>

<div class="p-6">
	<div class="mx-auto flex w-full max-w-6xl flex-col gap-8">
		<!-- Header -->
		<div class="space-y-4">
			<div>
				<h1 class="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
				<p class="text-sm text-muted-foreground">
					Overview of your learning progress and AI usage.
				</p>
			</div>
			<Separator />
		</div>

		<!-- Navigation Cards -->
		<div class="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
			<!-- Content Progress Card -->
			<a href="/dashboard/content" class="group">
				<Card.Root
					class="h-full transition-all hover:border-primary/50 hover:bg-primary/5 hover:shadow-lg"
				>
					<Card.Header class="pb-3">
						<div class="flex items-center justify-between">
							<div
								class="flex h-12 w-12 items-center justify-center rounded-xl bg-green-100 text-green-600 transition-colors group-hover:bg-green-600 group-hover:text-white dark:bg-green-900/30 dark:text-green-400"
							>
								<BookCheck class="h-6 w-6" />
							</div>
							<ChevronRight
								class="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary"
							/>
						</div>
					</Card.Header>
					<Card.Content class="space-y-3">
						<div>
							<Card.Title class="text-lg">Content Progress</Card.Title>
							<p class="text-sm text-muted-foreground">Track your learning across all content</p>
						</div>

						{#if progressStats}
							<div class="space-y-2 rounded-lg bg-muted/50 p-3">
								<div class="flex items-center justify-between text-sm">
									<span class="flex items-center gap-2 text-muted-foreground">
										<CheckCircle class="h-4 w-4 text-green-500" />
										Completed
									</span>
									<span class="font-bold">
										{progressStats.totalCompleted}/{progressStats.totalContent}
									</span>
								</div>
								<div class="h-2 overflow-hidden rounded-full bg-muted">
									<div
										class="h-full bg-green-500 transition-all"
										style="width: {getPercentage(
											progressStats.totalCompleted,
											progressStats.totalContent
										)}%"
									></div>
								</div>
								<div class="text-right text-xs font-medium text-green-600 dark:text-green-400">
									{getPercentage(progressStats.totalCompleted, progressStats.totalContent)}%
									complete
								</div>
							</div>
						{:else}
							<div class="rounded-lg bg-muted/50 p-3">
								<p class="text-sm text-muted-foreground">Loading stats...</p>
							</div>
						{/if}
					</Card.Content>
				</Card.Root>
			</a>

			<!-- Highlights Card -->
			<a href="/dashboard/highlights" class="group">
				<Card.Root
					class="h-full transition-all hover:border-primary/50 hover:bg-primary/5 hover:shadow-lg"
				>
					<Card.Header class="pb-3">
						<div class="flex items-center justify-between">
							<div
								class="flex h-12 w-12 items-center justify-center rounded-xl bg-yellow-100 text-yellow-600 transition-colors group-hover:bg-yellow-600 group-hover:text-white dark:bg-yellow-900/30 dark:text-yellow-400"
							>
								<Highlighter class="h-6 w-6" />
							</div>
							<ChevronRight
								class="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary"
							/>
						</div>
					</Card.Header>
					<Card.Content class="space-y-3">
						<div>
							<Card.Title class="text-lg">Highlights</Card.Title>
							<p class="text-sm text-muted-foreground">Review your saved text highlights</p>
						</div>

						<div class="space-y-2 rounded-lg bg-muted/50 p-3">
							<div class="flex items-center justify-between text-sm">
								<span class="flex items-center gap-2 text-muted-foreground">
									<Highlighter class="h-4 w-4 text-yellow-500" />
									Saved
								</span>
								<span class="font-bold">{highlightsCount}</span>
							</div>
							<p class="text-xs text-muted-foreground">
								Quickly access your notes and group discussions
							</p>
						</div>
					</Card.Content>
				</Card.Root>
			</a>

			<!-- Usage Card -->
			<a href="/dashboard/usage" class="group">
				<Card.Root
					class="h-full transition-all hover:border-primary/50 hover:bg-primary/5 hover:shadow-lg"
				>
					<Card.Header class="pb-3">
						<div class="flex items-center justify-between">
							<div
								class="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white dark:bg-blue-900/30 dark:text-blue-400"
							>
								<ChartLine class="h-6 w-6" />
							</div>
							<ChevronRight
								class="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary"
							/>
						</div>
					</Card.Header>
					<Card.Content class="space-y-3">
						<div>
							<Card.Title class="text-lg">Usage Statistics</Card.Title>
							<p class="text-sm text-muted-foreground">Monitor AI consumption and costs</p>
						</div>

						{#if usageStats}
							<div class="space-y-2 rounded-lg bg-muted/50 p-3">
								<div class="flex items-center justify-between text-sm">
									<span class="flex items-center gap-2 text-muted-foreground">
										<Zap class="h-4 w-4 text-blue-500" />
										Total Cost
									</span>
									<span class="font-bold">{formatCost(usageStats.summary.totalCost)}</span>
								</div>
								<div class="flex items-center justify-between text-sm">
									<span class="text-muted-foreground">Tokens Used</span>
									<span class="font-medium">
										{usageStats.summary.totalTokens.toLocaleString()}
									</span>
								</div>
								<div class="flex items-center justify-between text-sm">
									<span class="text-muted-foreground">AI Responses</span>
									<span class="font-medium">
										{usageStats.summary.assistantMessageCount.toLocaleString()}
									</span>
								</div>
							</div>
						{:else}
							<div class="rounded-lg bg-muted/50 p-3">
								<p class="text-sm text-muted-foreground">Loading stats...</p>
							</div>
						{/if}
					</Card.Content>
				</Card.Root>
			</a>

			<!-- Memories Card -->
			<a href="/dashboard/memories" class="group">
				<Card.Root
					class="h-full transition-all hover:border-primary/50 hover:bg-primary/5 hover:shadow-lg"
				>
					<Card.Header class="pb-3">
						<div class="flex items-center justify-between">
							<div
								class="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 text-purple-600 transition-colors group-hover:bg-purple-600 group-hover:text-white dark:bg-purple-900/30 dark:text-purple-400"
							>
								<Brain class="h-6 w-6" />
							</div>
							<ChevronRight
								class="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary"
							/>
						</div>
					</Card.Header>
					<Card.Content class="space-y-3">
						<div>
							<Card.Title class="text-lg">Memories</Card.Title>
							<p class="text-sm text-muted-foreground">Manage AI personalization data</p>
						</div>

						<div class="space-y-2 rounded-lg bg-muted/50 p-3">
							<div class="flex items-center justify-between text-sm">
								<span class="flex items-center gap-2 text-muted-foreground">
									<Brain class="h-4 w-4 text-purple-500" />
									Stored Memories
								</span>
								<span class="font-bold">{memoriesCount}</span>
							</div>
							<p class="text-xs text-muted-foreground">
								AI learns from your conversations to provide better responses
							</p>
						</div>
					</Card.Content>
				</Card.Root>
			</a>
		</div>
	</div>
</div>
