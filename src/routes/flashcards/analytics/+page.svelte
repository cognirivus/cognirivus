<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';
	import { Card } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { ChevronLeft, BarChart3, TrendingUp, Calendar } from '@lucide/svelte';
	import { authClient } from '$lib/auth-client';

	const session = authClient.useSession();
	const isAuthenticated = $derived(!!$session.data?.user);

	const analyticsQuery = useQuery(api.flashcards.getAnalytics, {});

	// Helper to get color based on score (0-5 scale)
	function getScoreColor(score: number) {
		if (score >= 4.5) return 'text-emerald-600 bg-emerald-50';
		if (score >= 3.5) return 'text-blue-600 bg-blue-50';
		if (score >= 2.5) return 'text-amber-600 bg-amber-50';
		return 'text-red-600 bg-red-50';
	}

	function getIntensityColor(count: number, max: number) {
		if (count === 0) return 'bg-muted/40';
		const ratio = count / Math.max(1, max);
		if (ratio < 0.25) return 'bg-emerald-200';
		if (ratio < 0.5) return 'bg-emerald-400';
		if (ratio < 0.75) return 'bg-emerald-600';
		return 'bg-emerald-800';
	}
</script>

<svelte:head>
	<title>Analytics - Flashcards</title>
</svelte:head>

<div class="container mx-auto max-w-5xl px-4 py-8">
	<div class="mb-8 flex items-center gap-4">
		<Button href="/flashcards" variant="ghost" size="icon" class="-ml-2">
			<ChevronLeft class="h-5 w-5" />
		</Button>
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Study Analytics</h1>
			<p class="text-muted-foreground">
				Insights into your learning progress over the last 30 days
			</p>
		</div>
	</div>

	{#if analyticsQuery.isLoading}
		<div class="flex h-64 items-center justify-center">
			<Loader variant="circular" size="lg" />
		</div>
	{:else if !isAuthenticated}
		<div class="py-12 text-center">
			<p class="text-muted-foreground">Please sign in to view your analytics.</p>
			<Button href="/signin" class="mt-4">Sign In</Button>
		</div>
	{:else if analyticsQuery.data}
		<div class="grid gap-8">
			<!-- Activity Heatmap -->
			<div class="rounded-xl border bg-card p-6 shadow-sm">
				<div class="mb-6 flex items-center gap-2">
					<Calendar class="h-5 w-5 text-primary" />
					<h2 class="text-lg font-semibold">Study Consistency</h2>
				</div>

				<div class="flex flex-col gap-2">
					<div class="flex gap-1 overflow-x-auto pb-2">
						{#each analyticsQuery.data.activity as day}
							<div class="flex min-w-[30px] flex-col items-center gap-1">
								<div
									class="h-24 w-full rounded-sm transition-all hover:opacity-80 {getIntensityColor(
										day.count,
										Math.max(...analyticsQuery.data.activity.map((a) => a.count))
									)}"
									style="height: {day.count === 0
										? '4px'
										: `${Math.min(100, Math.max(10, (day.count / Math.max(...analyticsQuery.data.activity.map((a) => a.count))) * 96))}px`}"
									title="{day.date}: {day.count} reviews"
								></div>
								<span
									class="origin-top-left translate-y-4 rotate-[-45deg] text-[9px] whitespace-nowrap text-muted-foreground"
									>{new Date(day.date).toLocaleDateString(undefined, {
										month: 'short',
										day: 'numeric'
									})}</span
								>
							</div>
						{/each}
					</div>
				</div>
				<div class="mt-8 flex items-center justify-end gap-2 text-xs text-muted-foreground">
					<span>Less</span>
					<div class="flex gap-1">
						<div class="h-3 w-3 rounded-sm bg-muted/40"></div>
						<div class="h-3 w-3 rounded-sm bg-emerald-200"></div>
						<div class="h-3 w-3 rounded-sm bg-emerald-400"></div>
						<div class="h-3 w-3 rounded-sm bg-emerald-600"></div>
						<div class="h-3 w-3 rounded-sm bg-emerald-800"></div>
					</div>
					<span>More</span>
				</div>
			</div>

			<!-- Subject Performance -->
			<div class="rounded-xl border bg-card p-6 shadow-sm">
				<div class="mb-6 flex items-center gap-2">
					<TrendingUp class="h-5 w-5 text-primary" />
					<h2 class="text-lg font-semibold">Subject Mastery</h2>
				</div>

				{#if analyticsQuery.data.performance.length === 0}
					<div class="py-12 text-center text-muted-foreground">
						No review data yet. Start studying to see your performance metrics!
					</div>
				{:else}
					<div class="space-y-4">
						{#each analyticsQuery.data.performance as subject}
							<div
								class="flex items-center justify-between gap-4 rounded-lg border bg-muted/20 p-3"
							>
								<div class="min-w-0 flex-1">
									<p class="truncate font-medium">{subject.subject}</p>
									<p class="text-xs text-muted-foreground">{subject.totalReviews} reviews</p>
								</div>
								<div class="flex items-center gap-4">
									<div class="h-2 w-24 overflow-hidden rounded-full bg-muted">
										<div
											class="h-full bg-primary"
											style="width: {(subject.averageScore / 5) * 100}%"
										></div>
									</div>
									<span
										class={`rounded px-2 py-0.5 text-xs font-bold ${getScoreColor(subject.averageScore)}`}
									>
										{subject.averageScore.toFixed(1)} / 5.0
									</span>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
