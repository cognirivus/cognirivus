<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import { Coins, Zap, MessageSquare, Ban, TrendingUp, BarChart3 } from '@lucide/svelte';
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

<div class="p-6">
	<div class="mx-auto flex w-full max-w-6xl flex-col gap-8">
		<!-- Header -->
		<div class="space-y-4">
			<div>
				<h1 class="text-2xl font-bold tracking-tight text-foreground">Usage Statistics</h1>
				<p class="text-sm text-muted-foreground">
					Monitor your AI consumption and costs in real-time.
				</p>
			</div>
			<Separator />
		</div>

		{#if statsQuery.isLoading}
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{#each Array(4) as _}
					<Card.Root>
						<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
							<Skeleton class="h-4 w-[100px]" />
							<Skeleton class="h-4 w-4 rounded-full" />
						</Card.Header>
						<Card.Content>
							<Skeleton class="mb-1 h-8 w-[120px]" />
							<Skeleton class="h-3 w-[140px]" />
						</Card.Content>
					</Card.Root>
				{/each}
			</div>
			<div class="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
				{#each Array(3) as _}
					<Card.Root>
						<Card.Header>
							<Skeleton class="h-5 w-[150px]" />
						</Card.Header>
						<Card.Content class="space-y-4">
							{#each Array(4) as _}
								<div class="space-y-2">
									<div class="flex justify-between">
										<Skeleton class="h-4 w-[80px]" />
										<Skeleton class="h-4 w-[40px]" />
									</div>
									<Skeleton class="h-2 w-full" />
								</div>
							{/each}
						</Card.Content>
					</Card.Root>
				{/each}
			</div>
		{:else if statsQuery.error}
			<Card.Root class="border-destructive/20 bg-destructive/10">
				<Card.Content class="pt-6 text-destructive">
					Failed to load usage statistics. Please try again later.
				</Card.Content>
			</Card.Root>
		{:else if statsQuery.data}
			{@const stats = statsQuery.data}

			<!-- Summary Cards -->
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<Card.Root>
					<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
						<Card.Title class="text-sm font-medium text-muted-foreground">Total Cost</Card.Title>
						<div
							class="rounded-lg bg-emerald-100 p-2 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
						>
							<Coins class="h-4 w-4" />
						</div>
					</Card.Header>
					<Card.Content>
						<div class="text-2xl font-bold">{formatCost(stats.summary.totalCost)}</div>
						<p class="text-xs text-muted-foreground">Across all sessions</p>
					</Card.Content>
				</Card.Root>

				<Card.Root>
					<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
						<Card.Title class="text-sm font-medium text-muted-foreground">Total Tokens</Card.Title>
						<div
							class="rounded-lg bg-blue-100 p-2 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
						>
							<Zap class="h-4 w-4" />
						</div>
					</Card.Header>
					<Card.Content>
						<div class="text-2xl font-bold">{formatNumber(stats.summary.totalTokens)}</div>
						<p class="text-xs text-muted-foreground">
							{formatNumber(stats.summary.totalPromptTokens)} P · {formatNumber(
								stats.summary.totalCompletionTokens
							)} C
						</p>
					</Card.Content>
				</Card.Root>

				<Card.Root>
					<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
						<Card.Title class="text-sm font-medium text-muted-foreground">AI Responses</Card.Title>
						<div
							class="rounded-lg bg-orange-100 p-2 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
						>
							<MessageSquare class="h-4 w-4" />
						</div>
					</Card.Header>
					<Card.Content>
						<div class="text-2xl font-bold">
							{formatNumber(stats.summary.assistantMessageCount)}
						</div>
						<p class="text-xs text-muted-foreground">Total responses generated</p>
					</Card.Content>
				</Card.Root>

				<Card.Root>
					<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
						<Card.Title class="text-sm font-medium text-muted-foreground"
							>Cancellation Rate</Card.Title
						>
						<div
							class="rounded-lg bg-red-100 p-2 text-red-600 dark:bg-red-900/30 dark:text-red-400"
						>
							<Ban class="h-4 w-4" />
						</div>
					</Card.Header>
					<Card.Content>
						<div class="text-2xl font-bold">
							{(stats.summary.cancellationRate * 100).toFixed(1)}%
						</div>
						<p class="text-xs text-muted-foreground">
							{stats.summary.cancelledCount} generations stopped early
						</p>
					</Card.Content>
				</Card.Root>
			</div>

			<!-- Charts & Tables -->
			<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
				<!-- Purpose Breakdown -->
				<Card.Root>
					<Card.Header>
						<Card.Title class="flex items-center gap-2 text-base">
							<BarChart3 class="h-4 w-4" />
							Purpose Breakdown
						</Card.Title>
					</Card.Header>
					<Card.Content class="space-y-4">
						{#each stats.purposeBreakdown.sort((a, b) => b.cost - a.cost) as purpose}
							<div class="flex flex-col gap-1.5">
								<div class="flex items-center justify-between text-sm">
									<span class="font-medium text-foreground/80 capitalize">
										{purpose.name.replace('_', ' ')}
									</span>
									<span class="text-muted-foreground">{formatCost(purpose.cost)}</span>
								</div>
								<div class="h-2 w-full overflow-hidden rounded-full bg-muted">
									<div
										class="h-full bg-primary transition-all"
										style="width: {(purpose.cost / (stats.summary.totalCost || 1)) * 100}%"
									></div>
								</div>
								<div class="flex justify-between text-[10px] text-muted-foreground">
									<span>{formatNumber(purpose.count)} calls</span>
									<span>{formatNumber(purpose.tokens)} tokens</span>
								</div>
							</div>
						{/each}
					</Card.Content>
				</Card.Root>

				<!-- Model Breakdown -->
				<Card.Root>
					<Card.Header>
						<Card.Title class="flex items-center gap-2 text-base">
							<BarChart3 class="h-4 w-4" />
							Model Breakdown
						</Card.Title>
					</Card.Header>
					<Card.Content class="space-y-4">
						{#each stats.modelBreakdown.sort((a, b) => b.cost - a.cost) as model}
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
										style="width: {(model.cost / (stats.summary.totalCost || 1)) * 100}%"
									></div>
								</div>
								<div class="flex justify-between text-[10px] text-muted-foreground">
									<span>{formatNumber(model.count)} sessions</span>
									<span>{formatNumber(model.tokens)} tokens</span>
								</div>
							</div>
						{/each}
					</Card.Content>
				</Card.Root>

				<!-- Daily Activity -->
				<Card.Root>
					<Card.Header>
						<Card.Title class="flex items-center gap-2 text-base">
							<TrendingUp class="h-4 w-4" />
							Daily Activity
						</Card.Title>
					</Card.Header>
					<Card.Content>
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
					</Card.Content>
				</Card.Root>
			</div>
		{/if}
	</div>
</div>
