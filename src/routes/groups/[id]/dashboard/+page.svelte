<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { page } from '$app/state';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import { Users, TrendingUp, Award, CheckCircle2, BookOpen, Zap, FileText } from '@lucide/svelte';
	import type { Id } from '$convex/_generated/dataModel';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';

	const groupId = $derived(page.params.id as Id<'groups'>);

	const analyticsQuery = useQuery((api as any).groups.getMemberAnalytics, () =>
		groupId ? { groupId } : 'skip'
	);
	const analytics = $derived(analyticsQuery.data);

	const currentUserId = $derived(
		(page.data.currentUser as any)?.id ?? (page.data.currentUser as any)?._id
	);

	const averageProgress = $derived.by(() => {
		if (!analytics || analytics.memberStats.length === 0) return 0;
		const sum = analytics.memberStats.reduce((acc: number, s: any) => acc + s.percentage, 0);
		return Math.round(sum / analytics.memberStats.length);
	});

	function getPercentage(completed: number, total: number) {
		if (total === 0) return 0;
		return Math.round((completed / total) * 100);
	}

	const sortedStats = $derived(
		analytics?.memberStats?.slice().sort((a: any, b: any) => b.completed - a.completed) ?? []
	);
</script>

<div class="p-6 lg:p-8">
	<div class="mx-auto max-w-5xl space-y-10">
		<header class="space-y-2">
			<div
				class="flex items-center gap-2.5 text-xs font-bold tracking-widest text-primary uppercase"
			>
				<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
					<TrendingUp class="h-4 w-4" />
				</div>
				Group Analytics
			</div>
			<h1 class="text-3xl font-semibold tracking-tight">Performance & Progress</h1>
			<p class="text-muted-foreground">
				Track how your group is moving through the shared intelligence in this hub.
			</p>
		</header>

		{#if analyticsQuery.isLoading}
			<div class="grid gap-6 sm:grid-cols-3">
				{#each Array(3) as _}
					<div class="h-32 w-full animate-pulse rounded-xl bg-muted/50"></div>
				{/each}
			</div>
		{:else if analytics}
			<!-- Top Stats Overview -->
			<div class="grid gap-6 sm:grid-cols-3">
				<div class="rounded-xl border border-blue-500/20 bg-blue-500/5 p-6">
					<div class="flex items-center justify-between">
						<div>
							<p
								class="text-[10px] font-bold tracking-widest text-blue-600/80 uppercase dark:text-blue-400/80"
							>
								Shared Content
							</p>
							<p class="mt-1 text-4xl font-bold text-blue-700 tabular-nums dark:text-blue-400">
								{analytics.totalContent}
							</p>
						</div>
						<div class="rounded-xl bg-blue-500/10 p-3 text-blue-600 dark:text-blue-400">
							<BookOpen class="h-6 w-6" />
						</div>
					</div>
				</div>

				<div class="rounded-xl border border-violet-500/20 bg-violet-500/5 p-6">
					<div class="flex items-center justify-between">
						<div>
							<p
								class="text-[10px] font-bold tracking-widest text-violet-600/80 uppercase dark:text-violet-400/80"
							>
								Active Members
							</p>
							<p class="mt-1 text-4xl font-bold text-violet-700 tabular-nums dark:text-violet-400">
								{analytics.memberStats.length}
							</p>
						</div>
						<div class="rounded-xl bg-violet-500/10 p-3 text-violet-600 dark:text-violet-400">
							<Users class="h-6 w-6" />
						</div>
					</div>
				</div>

				<div class="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-6">
					<div class="flex items-center justify-between">
						<div>
							<p
								class="text-[10px] font-bold tracking-widest text-emerald-600/80 uppercase dark:text-emerald-400/80"
							>
								Completion Rate
							</p>
							<p
								class="mt-1 text-4xl font-bold text-emerald-700 tabular-nums dark:text-emerald-400"
							>
								{averageProgress}%
							</p>
						</div>
						<div class="rounded-xl bg-emerald-500/10 p-3 text-emerald-600 dark:text-emerald-400">
							<CheckCircle2 class="h-6 w-6" />
						</div>
					</div>
				</div>
			</div>

			<div class="grid gap-8 lg:grid-cols-3">
				<!-- Leaderboard -->
				<div class="space-y-6 lg:col-span-2">
					<div class="flex items-center gap-3">
						<div
							class="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-500"
						>
							<Award class="h-5 w-5" />
						</div>
						<h2 class="text-xl font-bold tracking-tight">Member Leaderboard</h2>
					</div>

					<div class="divide-y overflow-hidden rounded-xl border bg-card shadow-sm">
						{#each sortedStats as stat, i}
							<div
								class="flex items-center gap-5 p-5 transition-colors hover:bg-muted/30 {stat.userId ===
								currentUserId
									? 'bg-primary/5 hover:bg-primary/10'
									: ''}"
							>
								<div
									class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground tabular-nums"
								>
									{i + 1}
								</div>

								<div class="flex min-w-0 flex-1 items-center justify-between gap-4">
									<div class="min-w-0">
										<div class="flex items-center gap-2">
											<span class="truncate text-sm font-bold text-foreground">
												{stat.name}
											</span>
											{#if stat.userId === currentUserId}
												<Badge
													variant="secondary"
													class="h-4 px-1.5 text-[9px] font-bold tracking-wider text-primary uppercase"
													>YOU</Badge
												>
											{/if}
										</div>
										<p
											class="mt-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase"
										>
											{stat.role}
										</p>
									</div>

									<div class="flex items-center gap-4">
										<div class="text-right">
											<span class="text-sm font-bold text-foreground tabular-nums"
												>{stat.completed}</span
											>
											<span class="text-[10px] font-medium text-muted-foreground uppercase">
												/ {stat.total}</span
											>
										</div>
										<div class="w-16">
											<Badge
												variant="outline"
												class="w-full justify-center bg-background text-[10px] font-bold tabular-nums"
											>
												{Math.round(stat.percentage)}%
											</Badge>
										</div>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</div>

				<!-- Group Insights -->
				<div class="space-y-6">
					<div class="flex items-center gap-3">
						<div
							class="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground"
						>
							<TrendingUp class="h-5 w-5" />
						</div>
						<h2 class="text-xl font-bold tracking-tight">Insights</h2>
					</div>

					<div class="rounded-xl border bg-card p-6 shadow-sm">
						<h3 class="mb-4 text-xs font-bold tracking-widest text-muted-foreground uppercase">
							Activity Breakdown
						</h3>
						<div class="space-y-4">
							<div class="flex items-center justify-between rounded-lg bg-muted/30 p-3">
								<div class="flex items-center gap-3 text-xs font-medium">
									<BookOpen class="h-4 w-4 text-primary" />
									<span>Knowledge Shared</span>
								</div>
								<span class="font-bold tabular-nums">{analytics.knowledgeCount}</span>
							</div>
							<div class="flex items-center justify-between rounded-lg bg-muted/30 p-3">
								<div class="flex items-center gap-3 text-xs font-medium">
									<Zap class="h-4 w-4 text-orange-500" />
									<span>News Discussed</span>
								</div>
								<span class="font-bold tabular-nums">{analytics.newsCount}</span>
							</div>
							<div class="flex items-center justify-between rounded-lg bg-muted/30 p-3">
								<div class="flex items-center gap-3 text-xs font-medium">
									<FileText class="h-4 w-4 text-blue-500" />
									<span>Blog Portals</span>
								</div>
								<span class="font-bold tabular-nums">{analytics.blogCount}</span>
							</div>
						</div>
					</div>

					<div
						class="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 p-6 text-center"
					>
						<div
							class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-background shadow-sm"
						>
							<TrendingUp class="h-6 w-6 text-primary" />
						</div>
						<p class="mb-2 text-xs font-bold tracking-widest text-primary uppercase">Pro Tip</p>
						<p class="text-sm leading-relaxed text-muted-foreground">
							Regularly sharing content in the group feed helps others stay on track and increases
							the overall group completion rate.
						</p>
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
