<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import { Coins, Zap, MessageSquare, Ban, TrendingUp, ChartLine } from '@lucide/svelte';
	import * as Card from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';

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

<div class="p-6 lg:p-8">
	<div class="mx-auto flex w-full max-w-5xl flex-col gap-8">
		<!-- Header -->
		<div class="space-y-2">
			<div class="flex items-center gap-2.5">
				<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
					<ChartLine class="h-4 w-4 text-blue-600" />
				</div>
				<span class="text-xs font-bold tracking-widest text-muted-foreground uppercase">
					Analytics
				</span>
			</div>
			<h1 class="text-2xl font-semibold tracking-tight">Usage Statistics</h1>
			<p class="text-sm text-muted-foreground">
				Monitor your AI consumption and costs in real-time.
			</p>
		</div>

		{#if statsQuery.isLoading}
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{#each Array(4) as _}
					<div class="rounded-xl border bg-card p-5">
						<div class="flex items-center justify-between">
							<Skeleton class="h-4 w-24" />
							<Skeleton class="h-8 w-8 rounded-lg" />
						</div>
						<Skeleton class="mt-4 h-7 w-32" />
						<Skeleton class="mt-2 h-3 w-24" />
					</div>
				{/each}
			</div>
			<div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
				{#each Array(3) as _}
					<div class="rounded-xl border bg-card p-5">
						<Skeleton class="mb-4 h-5 w-36" />
						<div class="space-y-4">
							{#each Array(3) as _}
								<div class="space-y-2">
									<div class="flex justify-between">
										<Skeleton class="h-4 w-20" />
										<Skeleton class="h-4 w-16" />
									</div>
									<Skeleton class="h-2 w-full rounded-full" />
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{:else if statsQuery.error}
			<div class="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
				<p class="text-sm text-destructive">
					Failed to load usage statistics. Please try again later.
				</p>
			</div>
		{:else if statsQuery.data}
			{@const stats = statsQuery.data}

			<!-- Summary Cards -->
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<div class="rounded-xl border bg-card p-5">
					<div class="flex items-center justify-between">
						<span class="text-xs font-medium text-muted-foreground">Total Cost</span>
						<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
							<Coins class="h-4 w-4 text-emerald-600" />
						</div>
					</div>
					<div class="mt-3 text-2xl font-semibold tabular-nums">
						{formatCost(stats.summary.totalCost)}
					</div>
					<p class="mt-1 text-xs text-muted-foreground">Across all sessions</p>
				</div>

				<div class="rounded-xl border bg-card p-5">
					<div class="flex items-center justify-between">
						<span class="text-xs font-medium text-muted-foreground">Total Tokens</span>
						<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
							<Zap class="h-4 w-4 text-blue-600" />
						</div>
					</div>
					<div class="mt-3 text-2xl font-semibold tabular-nums">
						{formatNumber(stats.summary.totalTokens)}
					</div>
					<p class="mt-1 text-xs text-muted-foreground">
						{formatNumber(stats.summary.totalPromptTokens)} P / {formatNumber(
							stats.summary.totalCompletionTokens
						)} C
					</p>
				</div>

				<div class="rounded-xl border bg-card p-5">
					<div class="flex items-center justify-between">
						<span class="text-xs font-medium text-muted-foreground">AI Responses</span>
						<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
							<MessageSquare class="h-4 w-4 text-amber-600" />
						</div>
					</div>
					<div class="mt-3 text-2xl font-semibold tabular-nums">
						{formatNumber(stats.summary.assistantMessageCount)}
					</div>
					<p class="mt-1 text-xs text-muted-foreground">Total responses generated</p>
				</div>

				<div class="rounded-xl border bg-card p-5">
					<div class="flex items-center justify-between">
						<span class="text-xs font-medium text-muted-foreground">Cancellation Rate</span>
						<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10">
							<Ban class="h-4 w-4 text-red-600" />
						</div>
					</div>
					<div class="mt-3 text-2xl font-semibold tabular-nums">
						{(stats.summary.cancellationRate * 100).toFixed(1)}%
					</div>
					<p class="mt-1 text-xs text-muted-foreground">
						{stats.summary.cancelledCount} stopped early
					</p>
				</div>
			</div>

			<!-- Charts & Tables -->
			<div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
				<!-- Purpose Breakdown -->
				<div class="rounded-xl border bg-card p-5">
					<h3 class="flex items-center gap-2 text-sm font-semibold">
						<ChartLine class="h-4 w-4 text-muted-foreground" />
						Purpose Breakdown
					</h3>
					<div class="mt-5 space-y-4">
						{#each stats.purposeBreakdown.sort((a, b) => b.cost - a.cost) as purpose}
							<div class="space-y-2">
								<div class="flex items-center justify-between text-xs">
									<span class="font-medium capitalize">{purpose.name.replace('_', ' ')}</span>
									<span class="text-muted-foreground tabular-nums">{formatCost(purpose.cost)}</span>
								</div>
								<div class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
									<div
										class="h-full bg-primary transition-all"
										style="width: {(purpose.cost / (stats.summary.totalCost || 1)) * 100}%"
									></div>
								</div>
								<div class="flex justify-between text-[10px] text-muted-foreground">
									<span class="tabular-nums">{formatNumber(purpose.count)} calls</span>
									<span class="tabular-nums">{formatNumber(purpose.tokens)} tokens</span>
								</div>
							</div>
						{/each}
					</div>
				</div>

				<!-- Model Breakdown -->
				<div class="rounded-xl border bg-card p-5">
					<h3 class="flex items-center gap-2 text-sm font-semibold">
						<ChartLine class="h-4 w-4 text-muted-foreground" />
						Model Breakdown
					</h3>
					<div class="mt-5 space-y-4">
						{#each stats.modelBreakdown.sort((a, b) => b.cost - a.cost) as model}
							<div class="space-y-2">
								<div class="flex items-center justify-between text-xs">
									<span class="font-medium">{model.name.split('/').pop()}</span>
									<span class="text-muted-foreground tabular-nums">{formatCost(model.cost)}</span>
								</div>
								<div class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
									<div
										class="h-full bg-primary transition-all"
										style="width: {(model.cost / (stats.summary.totalCost || 1)) * 100}%"
									></div>
								</div>
								<div class="flex justify-between text-[10px] text-muted-foreground">
									<span class="tabular-nums">{formatNumber(model.count)} sessions</span>
									<span class="tabular-nums">{formatNumber(model.tokens)} tokens</span>
								</div>
							</div>
						{/each}
					</div>
				</div>

				<!-- Daily Activity -->
				<div class="rounded-xl border bg-card p-5">
					<h3 class="flex items-center gap-2 text-sm font-semibold">
						<TrendingUp class="h-4 w-4 text-muted-foreground" />
						Daily Activity
					</h3>
					<div class="mt-5 flex h-40 items-end gap-1">
						{#each stats.dailyUsage as day}
							{@const height =
								(day.tokens / Math.max(...stats.dailyUsage.map((d) => d.tokens), 1)) * 100}
							<div class="group relative flex flex-1 flex-col items-center">
								<div
									class="w-full rounded-t bg-muted transition-all hover:bg-primary"
									style="height: {height}%"
								></div>
								<div
									class="absolute bottom-full mb-2 hidden rounded-lg border bg-popover px-2.5 py-1.5 text-[10px] shadow-lg group-hover:block"
								>
									{new Date(day.date).toLocaleDateString()}<br />
									{formatNumber(day.tokens)} tokens
								</div>
							</div>
						{/each}
					</div>
					<div class="mt-3 flex justify-between text-[10px] text-muted-foreground">
						<span>{stats.dailyUsage[0]?.date || ''}</span>
						<span>Daily Token Usage</span>
						<span>{stats.dailyUsage[stats.dailyUsage.length - 1]?.date || ''}</span>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
