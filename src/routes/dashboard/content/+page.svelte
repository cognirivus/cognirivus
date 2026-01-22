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

<div class="p-6">
	<div class="mx-auto flex w-full max-w-6xl flex-col gap-8">
		<!-- Header -->
		<div class="space-y-4">
			<div>
				<h1 class="text-2xl font-bold tracking-tight text-foreground">Content Progress</h1>
				<p class="text-sm text-muted-foreground">
					Track your learning progress across all content.
				</p>
			</div>
			<Separator />
		</div>

		{#if analyticsQuery.isLoading}
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{#each Array(4) as _}
					<Card.Root>
						<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
							<Skeleton class="h-4 w-[100px]" />
							<Skeleton class="h-4 w-4 rounded-full" />
						</Card.Header>
						<Card.Content>
							<Skeleton class="mb-1 h-8 w-[80px]" />
							<Skeleton class="h-3 w-[120px]" />
						</Card.Content>
					</Card.Root>
				{/each}
			</div>
		{:else if !analyticsQuery.data}
			<Card.Root
				class="border-amber-200/50 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20"
			>
				<Card.Content class="pt-6 text-amber-800 dark:text-amber-200">
					Please sign in to view your progress analytics.
				</Card.Content>
			</Card.Root>
		{:else}
			{@const stats = analyticsQuery.data}
			{@const overallPercentage = getPercentage(stats.totalCompleted, stats.totalContent)}

			<!-- Summary Cards -->
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<Card.Root>
					<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
						<Card.Title class="text-sm font-medium text-muted-foreground">Total Content</Card.Title>
						<div
							class="rounded-lg bg-blue-100 p-2 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
						>
							<BookOpen class="h-4 w-4" />
						</div>
					</Card.Header>
					<Card.Content>
						<div class="text-2xl font-bold">{stats.totalContent}</div>
						<p class="text-xs text-muted-foreground">Available items</p>
					</Card.Content>
				</Card.Root>

				<Card.Root>
					<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
						<Card.Title class="text-sm font-medium text-muted-foreground">Completed</Card.Title>
						<div
							class="rounded-lg bg-green-100 p-2 text-green-600 dark:bg-green-900/30 dark:text-green-400"
						>
							<CheckCircle class="h-4 w-4" />
						</div>
					</Card.Header>
					<Card.Content>
						<div class="text-2xl font-bold">{stats.totalCompleted}</div>
						<p class="text-xs text-muted-foreground">Items marked complete</p>
					</Card.Content>
				</Card.Root>

				<Card.Root>
					<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
						<Card.Title class="text-sm font-medium text-muted-foreground">Remaining</Card.Title>
						<div
							class="rounded-lg bg-orange-100 p-2 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
						>
							<Target class="h-4 w-4" />
						</div>
					</Card.Header>
					<Card.Content>
						<div class="text-2xl font-bold">{stats.totalContent - stats.totalCompleted}</div>
						<p class="text-xs text-muted-foreground">Items to complete</p>
					</Card.Content>
				</Card.Root>

				<Card.Root>
					<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
						<Card.Title class="text-sm font-medium text-muted-foreground">Progress</Card.Title>
						<div
							class="rounded-lg bg-purple-100 p-2 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
						>
							<TrendingUp class="h-4 w-4" />
						</div>
					</Card.Header>
					<Card.Content>
						<div class="text-2xl font-bold">{overallPercentage}%</div>
						<Progress value={overallPercentage} class="mt-2 h-2" />
					</Card.Content>
				</Card.Root>
			</div>

			<!-- Breakdown Charts -->
			<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
				<!-- By GS Paper -->
				<Card.Root>
					<Card.Header>
						<Card.Title class="flex items-center gap-2 text-base">
							<GraduationCap class="h-4 w-4" />
							By GS Paper
						</Card.Title>
					</Card.Header>
					<Card.Content class="space-y-4">
						{#each stats.byGsPaper as gs}
							{@const pct = getPercentage(gs.completed, gs.total)}
							<div class="space-y-2">
								<div class="flex items-center justify-between text-sm">
									<span class="font-medium">{getGsLabel(gs.gsPaper)}</span>
									<span class="text-muted-foreground">{gs.completed}/{gs.total}</span>
								</div>
								<Progress value={pct} class="h-2" />
								<div class="text-right text-[10px] text-muted-foreground">{pct}%</div>
							</div>
						{/each}
					</Card.Content>
				</Card.Root>

				<!-- By Subject -->
				<Card.Root>
					<Card.Header>
						<Card.Title class="flex items-center gap-2 text-base">
							<BookOpen class="h-4 w-4" />
							By Subject
						</Card.Title>
					</Card.Header>
					<Card.Content class="max-h-80 space-y-4 overflow-y-auto">
						{#each stats.bySubject.slice(0, 10) as subject}
							{@const pct = getPercentage(subject.completed, subject.total)}
							<a href="/content/subject/{subject.slug}" class="block space-y-2 hover:opacity-80">
								<div class="flex items-center justify-between text-sm">
									<span class="font-medium">{subject.name}</span>
									<Badge variant="outline" class="text-[10px]">GS-{subject.gsPaper}</Badge>
								</div>
								<Progress value={pct} class="h-2" />
								<div class="flex justify-between text-[10px] text-muted-foreground">
									<span>{subject.completed}/{subject.total} completed</span>
									<span>{pct}%</span>
								</div>
							</a>
						{/each}
					</Card.Content>
				</Card.Root>

				<!-- By Topic -->
				<Card.Root>
					<Card.Header>
						<Card.Title class="flex items-center gap-2 text-base">
							<Tag class="h-4 w-4" />
							By Topic
						</Card.Title>
					</Card.Header>
					<Card.Content class="max-h-80 space-y-4 overflow-y-auto">
						{#each stats.byTopic.slice(0, 10) as topic}
							{@const pct = getPercentage(topic.completed, topic.total)}
							<div class="space-y-2">
								<div class="flex items-center justify-between text-sm">
									<span class="font-medium">{topic.topic}</span>
									<span class="text-muted-foreground">{topic.completed}/{topic.total}</span>
								</div>
								<Progress value={pct} class="h-2" />
								<div class="text-right text-[10px] text-muted-foreground">{pct}%</div>
							</div>
						{/each}
					</Card.Content>
				</Card.Root>
			</div>
		{/if}

		<!-- Recently Completed Section -->
		<div class="space-y-4">
			<div class="flex items-center justify-between">
				<h2 class="text-xl font-bold tracking-tight">Recently Completed</h2>
			</div>
			<Separator />

			{#if recentQuery.isLoading}
				<div class="space-y-4">
					{#each Array(3) as _}
						<Card.Root>
							<Card.Content class="flex items-center gap-4 py-4">
								<Skeleton class="h-10 w-10 rounded-full" />
								<div class="flex-1 space-y-2">
									<Skeleton class="h-4 w-3/4" />
									<Skeleton class="h-3 w-1/2" />
								</div>
							</Card.Content>
						</Card.Root>
					{/each}
				</div>
			{:else if recentItems.length === 0}
				<Card.Root class="border-dashed">
					<Card.Content class="flex flex-col items-center justify-center py-12 text-center">
						<CheckCircle class="mb-4 h-12 w-12 text-muted-foreground/50" />
						<p class="text-muted-foreground">No completed items yet.</p>
						<p class="text-sm text-muted-foreground">
							Start marking content as complete to track your progress!
						</p>
						<Button href="/content" class="mt-4" variant="outline">Browse Content</Button>
					</Card.Content>
				</Card.Root>
			{:else}
				<div class="space-y-3">
					{#each recentItems as item}
						<a href="/content/{item.content._id}" class="block">
							<Card.Root
								class="transition-all hover:border-primary/30 hover:bg-muted/30 hover:shadow-sm"
							>
								<Card.Content class="flex items-center gap-4 py-4">
									<div
										class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
									>
										<CheckCircle class="h-5 w-5" />
									</div>
									<div class="min-w-0 flex-1">
										<h3 class="truncate font-medium">{item.content.title}</h3>
										<div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
											{#if item.content.subject}
												<Badge variant="outline" class="text-[10px]">
													{item.content.subject.name}
												</Badge>
											{/if}
											<span class="flex items-center gap-1">
												<Calendar class="h-3 w-3" />
												{formatDate(item.completedAt)}
											</span>
										</div>
									</div>
								</Card.Content>
							</Card.Root>
						</a>
					{/each}
				</div>

				<!-- Pagination -->
				<div class="flex items-center justify-between border-t px-2 pt-4">
					<div class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
						Page <span class="text-foreground">{currentCursorIndex + 1}</span>
					</div>
					<div class="flex items-center gap-1.5">
						<Button
							variant="outline"
							size="sm"
							onclick={prevPage}
							disabled={!hasPrevPage}
							class="h-7 gap-1 px-2 text-[10px] font-bold tracking-tight uppercase"
						>
							<ChevronLeft class="h-3.5 w-3.5" />
							Previous
						</Button>
						<Button
							variant="outline"
							size="sm"
							onclick={nextPage}
							disabled={!hasNextPage}
							class="h-7 gap-1 px-2 text-[10px] font-bold tracking-tight uppercase"
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
