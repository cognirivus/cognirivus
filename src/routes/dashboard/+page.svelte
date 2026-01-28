<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import * as Card from '$lib/components/ui/card';
	import {
		BookCheck,
		ChartLine,
		ArrowRight,
		CheckCircle,
		Zap,
		Brain,
		Highlighter,
		MessageSquare,
		TrendingUp,
		Users
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

<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
	<!-- Header -->
	<div class="mb-8">
		<h1 class="text-2xl font-semibold tracking-tight text-foreground">Overview</h1>
		<p class="mt-1 text-sm text-muted-foreground">Track your learning progress and AI usage</p>
	</div>

	<!-- Stats Grid -->
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<!-- Content Progress Card -->
		<a href="/dashboard/content" class="group">
			<Card.Root
				class="h-full border-border/50 transition-all duration-200 hover:border-border hover:shadow-sm"
			>
				<Card.Content class="p-5">
					<div class="flex items-center justify-between">
						<div
							class="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600"
						>
							<BookCheck class="h-5 w-5" />
						</div>
						<ArrowRight
							class="h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
						/>
					</div>
					<div class="mt-4">
						<p class="text-sm text-muted-foreground">Content Progress</p>
						{#if progressStats}
							<p class="mt-1 text-2xl font-semibold">
								{getPercentage(progressStats.totalCompleted, progressStats.totalContent)}%
							</p>
							<div class="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
								<div
									class="h-full rounded-full bg-emerald-500 transition-all duration-500"
									style="width: {getPercentage(
										progressStats.totalCompleted,
										progressStats.totalContent
									)}%"
								></div>
							</div>
							<p class="mt-2 text-xs text-muted-foreground">
								{progressStats.totalCompleted} of {progressStats.totalContent} completed
							</p>
						{:else}
							<div class="mt-1 h-8 w-16 animate-pulse rounded bg-muted"></div>
						{/if}
					</div>
				</Card.Content>
			</Card.Root>
		</a>

		<!-- Highlights Card -->
		<a href="/dashboard/highlights" class="group">
			<Card.Root
				class="h-full border-border/50 transition-all duration-200 hover:border-border hover:shadow-sm"
			>
				<Card.Content class="p-5">
					<div class="flex items-center justify-between">
						<div
							class="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600"
						>
							<Highlighter class="h-5 w-5" />
						</div>
						<ArrowRight
							class="h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
						/>
					</div>
					<div class="mt-4">
						<p class="text-sm text-muted-foreground">Highlights</p>
						<p class="mt-1 text-2xl font-semibold">{highlightsCount}</p>
						<p class="mt-2 text-xs text-muted-foreground">Saved notes & insights</p>
					</div>
				</Card.Content>
			</Card.Root>
		</a>

		<!-- Usage Card -->
		<a href="/dashboard/usage" class="group">
			<Card.Root
				class="h-full border-border/50 transition-all duration-200 hover:border-border hover:shadow-sm"
			>
				<Card.Content class="p-5">
					<div class="flex items-center justify-between">
						<div
							class="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600"
						>
							<ChartLine class="h-5 w-5" />
						</div>
						<ArrowRight
							class="h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
						/>
					</div>
					<div class="mt-4">
						<p class="text-sm text-muted-foreground">AI Usage</p>
						{#if usageStats}
							<p class="mt-1 text-2xl font-semibold">{formatCost(usageStats.summary.totalCost)}</p>
							<p class="mt-2 text-xs text-muted-foreground">
								{(usageStats.summary.totalTokens / 1000).toFixed(1)}k tokens used
							</p>
						{:else}
							<div class="mt-1 h-8 w-20 animate-pulse rounded bg-muted"></div>
						{/if}
					</div>
				</Card.Content>
			</Card.Root>
		</a>

		<!-- Memories Card -->
		<a href="/dashboard/memories" class="group">
			<Card.Root
				class="h-full border-border/50 transition-all duration-200 hover:border-border hover:shadow-sm"
			>
				<Card.Content class="p-5">
					<div class="flex items-center justify-between">
						<div
							class="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600"
						>
							<Brain class="h-5 w-5" />
						</div>
						<ArrowRight
							class="h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
						/>
					</div>
					<div class="mt-4">
						<p class="text-sm text-muted-foreground">AI Memories</p>
						<p class="mt-1 text-2xl font-semibold">{memoriesCount}</p>
						<p class="mt-2 text-xs text-muted-foreground">Personalization data</p>
					</div>
				</Card.Content>
			</Card.Root>
		</a>
	</div>

	<!-- Quick Actions -->
	<div class="mt-10">
		<h2 class="mb-4 text-sm font-medium text-muted-foreground">Quick Actions</h2>
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			<a
				href="/chat"
				class="group flex items-center gap-3 rounded-lg border border-border/50 bg-card p-4 transition-all duration-200 hover:border-border hover:shadow-sm"
			>
				<div
					class="flex h-9 w-9 items-center justify-center rounded-lg bg-foreground/5 text-foreground transition-colors group-hover:bg-foreground/10"
				>
					<MessageSquare class="h-4 w-4" />
				</div>
				<div>
					<p class="text-sm font-medium">Start Chat</p>
					<p class="text-xs text-muted-foreground">Ask AI anything</p>
				</div>
			</a>

			<a
				href="/content"
				class="group flex items-center gap-3 rounded-lg border border-border/50 bg-card p-4 transition-all duration-200 hover:border-border hover:shadow-sm"
			>
				<div
					class="flex h-9 w-9 items-center justify-center rounded-lg bg-foreground/5 text-foreground transition-colors group-hover:bg-foreground/10"
				>
					<TrendingUp class="h-4 w-4" />
				</div>
				<div>
					<p class="text-sm font-medium">Browse Content</p>
					<p class="text-xs text-muted-foreground">Study materials</p>
				</div>
			</a>

			<a
				href="/flashcards"
				class="group flex items-center gap-3 rounded-lg border border-border/50 bg-card p-4 transition-all duration-200 hover:border-border hover:shadow-sm"
			>
				<div
					class="flex h-9 w-9 items-center justify-center rounded-lg bg-foreground/5 text-foreground transition-colors group-hover:bg-foreground/10"
				>
					<Zap class="h-4 w-4" />
				</div>
				<div>
					<p class="text-sm font-medium">Flashcards</p>
					<p class="text-xs text-muted-foreground">Review & test</p>
				</div>
			</a>

			<a
				href="/groups"
				class="group flex items-center gap-3 rounded-lg border border-border/50 bg-card p-4 transition-all duration-200 hover:border-border hover:shadow-sm"
			>
				<div
					class="flex h-9 w-9 items-center justify-center rounded-lg bg-foreground/5 text-foreground transition-colors group-hover:bg-foreground/10"
				>
					<Users class="h-4 w-4" />
				</div>
				<div>
					<p class="text-sm font-medium">Study Groups</p>
					<p class="text-xs text-muted-foreground">Collaborate</p>
				</div>
			</a>
		</div>
	</div>
</div>
