<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import { Coins, Zap, MessageSquare, Ban, TrendingUp, BarChart3 } from '@lucide/svelte';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';

	const statsQuery = useQuery(api.analytics.getDashboardStats, {});

	function formatCost(cost: number) {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 6
		}).format(cost);
	}

	function formatNumber(num: number) {
		return new Intl.NumberFormat('en-US').format(num);
	}
</script>

<div class="p-6">
	<div class="mx-auto flex w-full max-w-6xl flex-col gap-8">
		<!-- Header -->
		<div>
			<h1 class="text-2xl font-bold tracking-tight text-foreground">Usage Statistics</h1>
			<p class="text-sm text-muted-foreground">
				Monitor your AI consumption and costs in real-time.
			</p>
		</div>

		{#if statsQuery.isLoading}
			<div class="flex h-64 items-center justify-center">
				<Loader variant="circular" size="lg" />
			</div>
		{:else if statsQuery.error}
			<div class="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-destructive">
				Failed to load usage statistics. Please try again later.
			</div>
		{:else if statsQuery.data}
			{@const stats = statsQuery.data}

			<!-- Summary Cards -->
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<div class="rounded-2xl border border-border bg-card p-6 shadow-sm">
					<div class="flex items-center gap-3">
						<div
							class="rounded-lg bg-emerald-100 p-2 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
						>
							<Coins class="h-5 w-5" />
						</div>
						<span class="text-sm font-medium text-muted-foreground">Total Cost</span>
					</div>
					<div class="mt-4">
						<div class="text-2xl font-bold text-foreground">
							{formatCost(stats.summary.totalCost)}
						</div>
						<p class="text-xs text-muted-foreground">Across all sessions</p>
					</div>
				</div>

				<div class="rounded-2xl border border-border bg-card p-6 shadow-sm">
					<div class="flex items-center gap-3">
						<div
							class="rounded-lg bg-blue-100 p-2 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
						>
							<Zap class="h-5 w-5" />
						</div>
						<span class="text-sm font-medium text-muted-foreground">Total Tokens</span>
					</div>
					<div class="mt-4">
						<div class="text-2xl font-bold text-foreground">
							{formatNumber(stats.summary.totalTokens)}
						</div>
						<p class="text-xs text-muted-foreground">
							{formatNumber(stats.summary.totalPromptTokens)} Prompt · {formatNumber(
								stats.summary.totalCompletionTokens
							)} Completions
						</p>
					</div>
				</div>

				<div class="rounded-2xl border border-border bg-card p-6 shadow-sm">
					<div class="flex items-center gap-3">
						<div
							class="rounded-lg bg-orange-100 p-2 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
						>
							<MessageSquare class="h-5 w-5" />
						</div>
						<span class="text-sm font-medium text-muted-foreground">AI Responses</span>
					</div>
					<div class="mt-4">
						<div class="text-2xl font-bold text-foreground">
							{formatNumber(stats.summary.assistantMessageCount)}
						</div>
						<p class="text-xs text-muted-foreground">Total responses generated</p>
					</div>
				</div>

				<div class="rounded-2xl border border-border bg-card p-6 shadow-sm">
					<div class="flex items-center gap-3">
						<div
							class="rounded-lg bg-red-100 p-2 text-red-600 dark:bg-red-900/30 dark:text-red-400"
						>
							<Ban class="h-5 w-5" />
						</div>
						<span class="text-sm font-medium text-muted-foreground">Stopped</span>
					</div>
					<div class="mt-4">
						<div class="text-2xl font-bold text-foreground">
							{(stats.summary.cancellationRate * 100).toFixed(1)}%
						</div>
						<p class="text-xs text-muted-foreground">
							{stats.summary.cancelledCount} generations stopped early
						</p>
					</div>
				</div>
			</div>

			<!-- Charts & Tables -->
			<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<!-- Model Breakdown -->
				<div class="rounded-2xl border border-border bg-card p-6 shadow-sm">
					<div class="mb-6 flex items-center justify-between">
						<h3 class="flex items-center gap-2 font-bold text-foreground">
							<BarChart3 class="h-4 w-4" />
							Model Breakdown
						</h3>
					</div>
					<div class="space-y-4">
						{#each stats.modelBreakdown as model}
							<div class="flex flex-col gap-1.5">
								<div class="flex items-center justify-between text-sm">
									<span class="font-medium text-foreground/80">
										{model.name.split('/').pop()}
									</span>
									<span class="text-muted-foreground">{formatCost(model.cost)}</span>
								</div>
								<div class="h-2 w-full overflow-hidden rounded-full bg-muted">
									<div
										class="h-full bg-primary transition-all"
										style="width: {(model.cost / stats.summary.totalCost) * 100}%"
									></div>
								</div>
								<div class="flex justify-between text-[10px] text-muted-foreground">
									<span>{formatNumber(model.count)} sessions</span>
									<span>{formatNumber(model.tokens)} tokens</span>
								</div>
							</div>
						{/each}
					</div>
				</div>

				<!-- Daily Activity -->
				<div class="rounded-2xl border border-border bg-card p-6 shadow-sm">
					<div class="mb-6 flex items-center justify-between">
						<h3 class="flex items-center gap-2 font-bold text-foreground">
							<TrendingUp class="h-4 w-4" />
							Daily Activity
						</h3>
					</div>
					<div class="flex h-48 items-end gap-1 px-2">
						{#each stats.dailyUsage as day}
							{@const height =
								(day.tokens / Math.max(...stats.dailyUsage.map((d) => d.tokens), 1)) * 100}
							<div class="group relative flex flex-1 flex-col items-center">
								<div
									class="w-full rounded-t-sm bg-muted transition-all hover:bg-primary"
									style="height: {height}%"
								></div>
								<div
									class="absolute bottom-full mb-2 hidden rounded border border-border bg-popover px-2 py-1 text-[10px] text-popover-foreground shadow-lg group-hover:block"
								>
									{new Date(day.date).toLocaleDateString()}<br />
									{formatNumber(day.tokens)} tokens
								</div>
							</div>
						{/each}
					</div>
					<div class="mt-4 flex justify-between text-[10px] text-muted-foreground">
						<span>{stats.dailyUsage[0]?.date || ''}</span>
						<span>Daily Token Usage</span>
						<span>{stats.dailyUsage[stats.dailyUsage.length - 1]?.date || ''}</span>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
