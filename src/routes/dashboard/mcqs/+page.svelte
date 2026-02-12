<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Progress } from '$lib/components/ui/progress';
	import { Button } from '$lib/components/ui/button';
	import {
		Trophy,
		Target,
		BarChart3,
		Tag,
		TrendingUp,
		AlertCircle,
		BookOpen,
		GraduationCap,
		ChevronRight,
		ChevronLeft,
		CheckCircle2,
		XCircle,
		Calendar
	} from '@lucide/svelte';

	const statsQuery = useQuery(api.mcqs?.getUserStats, {});
	const stats = $derived(statsQuery.data);

	// Pagination for table
	let numItems = 10;
	let cursorStack = $state<(string | null)[]>([null]);
	let currentCursorIndex = $state(0);

	const recentResponsesQuery = useQuery(api.mcqs?.getRecentResponses, () => ({
		paginationOpts: { numItems, cursor: cursorStack[currentCursorIndex] }
	}));

	const recentData = $derived(recentResponsesQuery.data);
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

	function formatNumber(num: number) {
		return new Intl.NumberFormat('en-US').format(num);
	}

	function formatDate(timestamp: number) {
		return new Date(timestamp).toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<div class="p-6 lg:p-8">
	<div class="mx-auto flex w-full max-w-5xl flex-col gap-8">
		<!-- Header -->
		<div class="space-y-2">
			<div class="flex items-center gap-2.5">
				<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10">
					<TrendingUp class="h-4 w-4 text-orange-600" />
				</div>
				<span class="text-xs font-bold tracking-widest text-muted-foreground uppercase">
					Performance
				</span>
			</div>
			<h1 class="text-2xl font-semibold tracking-tight">MCQ Statistics</h1>
			<p class="text-sm text-muted-foreground">
				Analyze your practice performance and identify areas for improvement.
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
			<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
				{#each Array(2) as _}
					<div class="rounded-xl border bg-card p-5">
						<Skeleton class="mb-4 h-5 w-36" />
						<div class="space-y-4">
							{#each Array(4) as _}
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
		{:else if !stats}
			<div class="rounded-xl border border-dashed p-12 text-center">
				<div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
					<AlertCircle class="h-6 w-6 text-muted-foreground/50" />
				</div>
				<p class="font-medium text-foreground">No practice data yet</p>
				<p class="mt-1 text-sm text-muted-foreground">
					Complete some MCQs to see your performance metrics here.
				</p>
				<a
					href="/mcqs"
					class="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
				>
					Start Practicing <ChevronRight class="h-4 w-4" />
				</a>
			</div>
		{:else}
			<!-- Summary Cards -->
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<div class="rounded-xl border bg-card p-5">
					<div class="flex items-center justify-between">
						<span class="text-xs font-medium text-muted-foreground">Attempted</span>
						<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
							<BarChart3 class="h-4 w-4 text-blue-600" />
						</div>
					</div>
					<div class="mt-3 text-2xl font-semibold tabular-nums">{formatNumber(stats.overall.total)}</div>
					<p class="mt-1 text-xs text-muted-foreground">Total questions solved</p>
				</div>

				<div class="rounded-xl border bg-card p-5">
					<div class="flex items-center justify-between">
						<span class="text-xs font-medium text-muted-foreground">Correct</span>
						<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
							<Target class="h-4 w-4 text-emerald-600" />
						</div>
					</div>
					<div class="mt-3 text-2xl font-semibold tabular-nums">{formatNumber(stats.overall.correct)}</div>
					<p class="mt-1 text-xs text-muted-foreground">Successful attempts</p>
				</div>

				<div class="rounded-xl border bg-card p-5">
					<div class="flex items-center justify-between">
						<span class="text-xs font-medium text-muted-foreground">Accuracy</span>
						<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10">
							<Trophy class="h-4 w-4 text-orange-600" />
						</div>
					</div>
					<div class="mt-3 text-2xl font-semibold tabular-nums">{stats.overall.accuracy.toFixed(1)}%</div>
					<p class="mt-1 text-xs text-muted-foreground">Average precision</p>
				</div>

				<div class="rounded-xl border bg-card p-5">
					<div class="flex items-center justify-between">
						<span class="text-xs font-medium text-muted-foreground">Mastery</span>
						<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
							<TrendingUp class="h-4 w-4 text-violet-600" />
						</div>
					</div>
					<div class="mt-3 text-2xl font-semibold tabular-nums">
						{Math.min(100, Math.round((stats.overall.accuracy / 85) * 100))}%
					</div>
					<Progress value={(stats.overall.accuracy / 85) * 100} class="mt-2 h-1.5" />
				</div>
			</div>

			<!-- Breakdown Grid -->
			<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<!-- By Exam -->
				<div class="rounded-xl border bg-card p-5">
					<h3 class="flex items-center gap-2 text-sm font-semibold">
						<GraduationCap class="h-4 w-4 text-muted-foreground" />
						Performance by Exam
					</h3>
					<div class="mt-5 space-y-5">
						{#each stats.byExam as exam}
							<div class="space-y-2">
								<div class="flex items-center justify-between text-xs">
									<span class="font-medium uppercase tracking-wide">{exam.name}</span>
									<span class="text-muted-foreground tabular-nums">{exam.correct}/{exam.total}</span>
								</div>
								<Progress value={exam.accuracy} class="h-1.5" />
								<div class="text-right text-[10px] font-bold text-muted-foreground tabular-nums">
									{exam.accuracy.toFixed(1)}%
								</div>
							</div>
						{/each}
					</div>
				</div>

				<!-- By Topic -->
				<div class="rounded-xl border bg-card p-5">
					<h3 class="flex items-center gap-2 text-sm font-semibold">
						<Tag class="h-4 w-4 text-muted-foreground" />
						Performance by Topic
					</h3>
					<div class="mt-5 max-h-[300px] space-y-5 overflow-y-auto pr-2 [scrollbar-width:thin]">
						{#each stats.byTag.slice(0, 15) as tag}
							<div class="group space-y-2">
								<div class="flex items-center justify-between text-xs">
									<span class="font-medium text-muted-foreground transition-colors group-hover:text-foreground">
										#{tag.name}
									</span>
									<span class="font-mono font-bold {tag.accuracy >= 70 ? 'text-emerald-600' : 'text-rose-600'}">
										{tag.accuracy.toFixed(0)}%
									</span>
								</div>
								<div class="h-1 w-full overflow-hidden rounded-full bg-muted">
									<div
										class="h-full {tag.accuracy >= 70 ? 'bg-emerald-500' : 'bg-rose-500'} transition-all duration-700"
										style="width: {tag.accuracy}%"
									></div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			</div>
		{/if}

		<!-- Recent Attempts Table -->
		<div class="space-y-4 pt-4">
			<div class="flex items-center justify-between border-b pb-4">
				<div class="space-y-1">
					<h2 class="text-lg font-semibold tracking-tight">Recent Attempts</h2>
					<p class="text-xs text-muted-foreground">Historical list of your MCQ practice sessions</p>
				</div>
			</div>

			{#if recentResponsesQuery.isLoading}
				<div class="space-y-3">
					{#each Array(5) as _}
						<Skeleton class="h-12 w-full rounded-lg" />
					{/each}
				</div>
			{:else if recentItems.length === 0}
				<div class="rounded-xl border border-dashed py-12 text-center">
					<p class="text-sm text-muted-foreground">No attempts recorded yet.</p>
				</div>
			{:else}
				<div class="w-full overflow-x-auto rounded-xl border bg-card shadow-sm">
					<table class="w-full text-left text-sm">
						<thead>
							<tr class="border-b bg-muted/30 transition-colors">
								<th class="px-4 py-3 font-semibold text-muted-foreground">Question</th>
								<th class="px-4 py-3 font-semibold text-muted-foreground">Exam</th>
								<th class="px-4 py-3 font-semibold text-muted-foreground">Status</th>
								<th class="px-4 py-3 font-semibold text-muted-foreground">Date</th>
							</tr>
						</thead>
						<tbody class="divide-y">
							{#each recentItems as resp}
								<tr class="transition-colors hover:bg-muted/20">
									<td class="px-4 py-3 min-w-[300px]">
										<a
											href="/mcqs?id={resp.mcqId}"
											class="line-clamp-1 font-medium hover:text-primary hover:underline"
										>
											{resp.mcqTitle}
										</a>
									</td>
									<td class="px-4 py-3 whitespace-nowrap">
										<Badge variant="outline" class="text-[10px] font-bold uppercase">
											{resp.exam} {resp.year}
										</Badge>
									</td>
									<td class="px-4 py-3 whitespace-nowrap">
										<div class="flex items-center gap-2">
											{#if resp.isCorrect}
												<CheckCircle2 class="h-4 w-4 text-emerald-500" />
												<span class="font-medium text-emerald-600">Correct</span>
											{:else}
												<XCircle class="h-4 w-4 text-rose-500" />
												<span class="font-medium text-rose-600">Incorrect</span>
											{/if}
										</div>
									</td>
									<td class="px-4 py-3 text-muted-foreground whitespace-nowrap tabular-nums">
										{formatDate(resp.createdAt)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				<!-- Pagination -->
				<div class="flex items-center justify-between pt-2">
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
