<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Separator } from '$lib/components/ui/separator';
	import { Progress } from '$lib/components/ui/progress';
	import {
		BookOpen,
		CheckCircle,
		Target,
		TrendingUp,
		Calendar,
		ChevronLeft,
		ChevronRight,
		Tag,
		GraduationCap
	} from '@lucide/svelte';

	const analyticsQuery = useQuery(api.content.getProgressAnalytics, {});

	let numItems = 10;
	let cursorStack = $state<(string | null)[]>([null]);
	let currentCursorIndex = $state(0);

	const recentQuery = useQuery(api.content.getRecentlyCompleted, () => ({
		paginationOpts: { numItems, cursor: cursorStack[currentCursorIndex] }
	}));

	const recentData = $derived(recentQuery.data);
	const recentItems = $derived(recentData?.page || []);
	const hasNextPage = $derived(recentData?.isDone === false);
	const hasPrevPage = $derived(currentCursorIndex > 0);

	function nextPage() {
		if (hasNextPage && recentData?.continueCursor) {
			const nextCursor = recentData.continueCursor;
			if (currentCursorIndex === cursorStack.length - 1) {
				cursorStack.push(nextCursor);
			}
			currentCursorIndex++;
		}
	}

	function prevPage() {
		if (hasPrevPage) {
			currentCursorIndex--;
		}
	}

	function formatDate(timestamp: number) {
		return new Date(timestamp).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function getPercentage(completed: number, total: number) {
		if (total === 0) return 0;
		return Math.round((completed / total) * 100);
	}

	function getGsLabel(gs: number) {
		if (gs === 0) return 'General';
		return `GS Paper ${gs}`;
	}
</script>

<div class="p-6 lg:p-8">
	<div class="mx-auto flex w-full max-w-5xl flex-col gap-8">
		<!-- Header -->
		<div class="space-y-2">
			<div class="flex items-center gap-2.5">
				<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/10">
					<Target class="h-4 w-4 text-green-600" />
				</div>
				<span class="text-xs font-bold tracking-widest text-muted-foreground uppercase">
					Learning
				</span>
			</div>
			<h1 class="text-2xl font-semibold tracking-tight">Content Progress</h1>
			<p class="text-sm text-muted-foreground">
				Track your learning progress across all subjects and topics.
			</p>
		</div>

		{#if analyticsQuery.isLoading}
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
		{:else if !analyticsQuery.data}
			<div
				class="rounded-xl border border-amber-200/50 bg-amber-50/50 p-6 text-center dark:border-amber-900/50 dark:bg-amber-950/20"
			>
				<p class="text-sm font-medium text-amber-800 dark:text-amber-200">
					Please sign in to view your progress analytics.
				</p>
			</div>
		{:else}
			{@const stats = analyticsQuery.data}
			{@const overallPercentage = getPercentage(stats.totalCompleted, stats.totalContent)}

			<!-- Summary Cards -->
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<div class="rounded-xl border bg-card p-5">
					<div class="flex items-center justify-between">
						<span class="text-xs font-medium text-muted-foreground">Total Content</span>
						<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
							<BookOpen class="h-4 w-4 text-blue-600" />
						</div>
					</div>
					<div class="mt-3 text-2xl font-semibold tabular-nums">{stats.totalContent}</div>
					<p class="mt-1 text-xs text-muted-foreground">Available items</p>
				</div>

				<div class="rounded-xl border bg-card p-5">
					<div class="flex items-center justify-between">
						<span class="text-xs font-medium text-muted-foreground">Completed</span>
						<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
							<CheckCircle class="h-4 w-4 text-emerald-600" />
						</div>
					</div>
					<div class="mt-3 text-2xl font-semibold tabular-nums">{stats.totalCompleted}</div>
					<p class="mt-1 text-xs text-muted-foreground">Items marked complete</p>
				</div>

				<div class="rounded-xl border bg-card p-5">
					<div class="flex items-center justify-between">
						<span class="text-xs font-medium text-muted-foreground">Remaining</span>
						<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
							<Target class="h-4 w-4 text-amber-600" />
						</div>
					</div>
					<div class="mt-3 text-2xl font-semibold tabular-nums">
						{stats.totalContent - stats.totalCompleted}
					</div>
					<p class="mt-1 text-xs text-muted-foreground">Items to complete</p>
				</div>

				<div class="rounded-xl border bg-card p-5">
					<div class="flex items-center justify-between">
						<span class="text-xs font-medium text-muted-foreground">Progress</span>
						<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
							<TrendingUp class="h-4 w-4 text-violet-600" />
						</div>
					</div>
					<div class="mt-3 text-2xl font-semibold tabular-nums">{overallPercentage}%</div>
					<Progress value={overallPercentage} class="mt-2 h-1.5" />
				</div>
			</div>

			<!-- Breakdown Charts -->
			<div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
				<!-- By GS Paper -->
				<div class="rounded-xl border bg-card p-5">
					<h3 class="flex items-center gap-2 text-sm font-semibold">
						<GraduationCap class="h-4 w-4 text-muted-foreground" />
						By GS Paper
					</h3>
					<div class="mt-5 space-y-4">
						{#each stats.byGsPaper as gs}
							{@const pct = getPercentage(gs.completed, gs.total)}
							<div class="space-y-2">
								<div class="flex items-center justify-between text-xs">
									<span class="font-medium">{getGsLabel(gs.gsPaper)}</span>
									<span class="text-muted-foreground tabular-nums">{gs.completed}/{gs.total}</span>
								</div>
								<Progress value={pct} class="h-1.5" />
								<div class="text-right text-[10px] text-muted-foreground tabular-nums">{pct}%</div>
							</div>
						{/each}
					</div>
				</div>

				<!-- By Subject -->
				<div class="rounded-xl border bg-card p-5">
					<h3 class="flex items-center gap-2 text-sm font-semibold">
						<BookOpen class="h-4 w-4 text-muted-foreground" />
						By Subject
					</h3>
					<div class="mt-5 max-h-80 space-y-4 overflow-y-auto pr-2">
						{#each stats.bySubject.slice(0, 10) as subject}
							{@const pct = getPercentage(subject.completed, subject.total)}
							<a
								href="/content?subject={subject.id}"
								class="group block space-y-2 hover:opacity-80"
							>
								<div class="flex items-center justify-between text-xs">
									<span class="font-medium transition-colors group-hover:text-primary"
										>{subject.name}</span
									>
									<Badge variant="outline" class="h-4 px-1 text-[9px]">GS-{subject.gsPaper}</Badge>
								</div>
								<Progress value={pct} class="h-1.5" />
								<div class="flex justify-between text-[10px] text-muted-foreground">
									<span class="tabular-nums">{subject.completed}/{subject.total}</span>
									<span class="tabular-nums">{pct}%</span>
								</div>
							</a>
						{/each}
					</div>
				</div>

				<!-- By Topic -->
				<div class="rounded-xl border bg-card p-5">
					<h3 class="flex items-center gap-2 text-sm font-semibold">
						<Tag class="h-4 w-4 text-muted-foreground" />
						By Topic
					</h3>
					<div class="mt-5 max-h-80 space-y-4 overflow-y-auto pr-2">
						{#each stats.byTopic.slice(0, 10) as topic}
							{@const pct = getPercentage(topic.completed, topic.total)}
							<div class="space-y-2">
								<div class="flex items-center justify-between text-xs">
									<span class="truncate pr-2 font-medium">{topic.topic}</span>
									<span class="text-muted-foreground tabular-nums"
										>{topic.completed}/{topic.total}</span
									>
								</div>
								<Progress value={pct} class="h-1.5" />
								<div class="text-right text-[10px] text-muted-foreground tabular-nums">{pct}%</div>
							</div>
						{/each}
					</div>
				</div>
			</div>
		{/if}

		<!-- Recently Completed Section -->
		<div class="space-y-4">
			<div class="flex items-center justify-between border-b pb-4">
				<div class="space-y-1">
					<h2 class="text-lg font-semibold tracking-tight">Recently Completed</h2>
					<p class="text-xs text-muted-foreground">Your latest learning achievements</p>
				</div>
			</div>

			{#if recentQuery.isLoading}
				<div class="space-y-3">
					{#each Array(3) as _}
						<div class="flex items-center gap-4 rounded-xl border bg-card p-4">
							<Skeleton class="h-10 w-10 rounded-full" />
							<div class="flex-1 space-y-2">
								<Skeleton class="h-4 w-3/4" />
								<Skeleton class="h-3 w-1/2" />
							</div>
						</div>
					{/each}
				</div>
			{:else if recentItems.length === 0}
				<div class="rounded-xl border border-dashed p-12 text-center">
					<div
						class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted"
					>
						<CheckCircle class="h-6 w-6 text-muted-foreground/50" />
					</div>
					<p class="font-medium text-foreground">No completed items yet</p>
					<p class="mt-1 text-sm text-muted-foreground">
						Start marking content as complete to track your progress!
					</p>
					<Button href="/content" class="mt-4" variant="outline" size="sm">Browse Content</Button>
				</div>
			{:else}
				<div class="space-y-3">
					{#each recentItems as item}
						<a href="/content/{item.content._id}" class="group block">
							<div
								class="flex items-center gap-4 rounded-xl border bg-card p-4 transition-all hover:border-emerald-500/30 hover:bg-emerald-500/5 hover:shadow-sm"
							>
								<div
									class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 group-hover:bg-emerald-500/20"
								>
									<CheckCircle class="h-5 w-5" />
								</div>
								<div class="min-w-0 flex-1">
									<h3
										class="truncate text-sm font-medium transition-colors group-hover:text-emerald-700 dark:group-hover:text-emerald-400"
									>
										{item.content.title}
									</h3>
									<div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
										{#if item.content.subject}
											<Badge
												variant="outline"
												class="h-4 px-1 text-[9px] font-normal group-hover:border-emerald-500/30 group-hover:text-emerald-600"
											>
												{item.content.subject.name}
											</Badge>
										{/if}
										<span class="flex items-center gap-1 text-[10px]">
											<Calendar class="h-3 w-3" />
											{formatDate(item.completedAt)}
										</span>
									</div>
								</div>
								<ChevronRight
									class="h-4 w-4 text-muted-foreground opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100"
								/>
							</div>
						</a>
					{/each}
				</div>

				<!-- Pagination -->
				<div class="flex items-center justify-between border-t pt-4">
					<div class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
						Page <span class="text-foreground">{currentCursorIndex + 1}</span>
					</div>
					<div class="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							onclick={prevPage}
							disabled={!hasPrevPage}
							class="h-7 gap-1 px-2.5 text-[10px] font-bold tracking-tight uppercase"
						>
							<ChevronLeft class="h-3.5 w-3.5" />
							Prev
						</Button>
						<Button
							variant="outline"
							size="sm"
							onclick={nextPage}
							disabled={!hasNextPage}
							class="h-7 gap-1 px-2.5 text-[10px] font-bold tracking-tight uppercase"
						>
							Next
							<ChevronRight class="h-3.5 w-3.5" />
						</Button>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
