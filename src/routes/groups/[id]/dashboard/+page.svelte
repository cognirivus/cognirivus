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

<div class="p-6">
	<div class="mx-auto max-w-5xl space-y-8">
		<header>
			<div
				class="mb-1 flex items-center gap-2 text-sm font-bold tracking-wider text-primary uppercase"
			>
				<TrendingUp class="h-4 w-4" />
				Group Dashboard
			</div>
			<h1 class="text-3xl font-extrabold tracking-tight">Performance & Progress</h1>
			<p class="text-muted-foreground">
				Track how your group is moving through the shared intelligence in this hub.
			</p>
		</header>

		{#if analyticsQuery.isLoading}
			<div class="flex h-[40vh] items-center justify-center">
				<Loader variant="circular" size="lg" />
			</div>
		{:else if analytics}
			<!-- Top Stats Overview -->
			<div class="grid gap-4 sm:grid-cols-3">
				<Card.Root class="border-primary/10 bg-primary/5">
					<Card.Content class="pt-6">
						<div class="flex items-center justify-between">
							<div>
								<p class="text-[10px] font-black tracking-widest text-muted-foreground uppercase">
									Shared in Group
								</p>
								<p class="text-3xl font-black tabular-nums">{analytics.totalContent}</p>
							</div>
							<div class="rounded-full bg-primary/10 p-2 text-primary">
								<BookOpen class="h-6 w-6" />
							</div>
						</div>
					</Card.Content>
				</Card.Root>

				<Card.Root>
					<Card.Content class="pt-6">
						<div class="flex items-center justify-between">
							<div>
								<p class="text-[10px] font-black tracking-widest text-muted-foreground uppercase">
									Active Members
								</p>
								<p class="text-3xl font-black tabular-nums">{analytics.memberStats.length}</p>
							</div>
							<div class="rounded-full bg-blue-500/10 p-2 text-blue-500">
								<Users class="h-6 w-6" />
							</div>
						</div>
					</Card.Content>
				</Card.Root>

				<Card.Root>
					<Card.Content class="pt-6">
						<div class="flex items-center justify-between">
							<div>
								<p class="text-[10px] font-black tracking-widest text-muted-foreground uppercase">
									Group Completion
								</p>
								<p class="text-3xl font-black tabular-nums">{averageProgress}%</p>
							</div>
							<div class="rounded-full bg-green-500/10 p-2 text-green-500">
								<CheckCircle2 class="h-6 w-6" />
							</div>
						</div>
					</Card.Content>
				</Card.Root>
			</div>

			<div class="grid gap-8 lg:grid-cols-3">
				<!-- Leaderboard -->
				<div class="space-y-6 lg:col-span-2">
					<h2 class="flex items-center gap-2 text-xl font-bold">
						<Award class="h-5 w-5 text-amber-500" />
						Member Leaderboard
					</h2>

					<div class="divide-y rounded-xl border bg-card shadow-sm">
						{#each sortedStats as stat, i}
							<div
								class="flex items-center gap-4 p-4 transition-colors hover:bg-muted/50 {stat.userId ===
								currentUserId
									? 'bg-primary/5'
									: ''}"
							>
								<div
									class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-black tabular-nums"
								>
									{i + 1}
								</div>

								<div class="flex min-w-0 flex-1 items-center justify-between gap-4">
									<div class="min-w-0">
										<span class="text-sm font-bold">
											{stat.name}
											{#if stat.userId === currentUserId}
												<span
													class="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[8px] text-primary"
													>YOU</span
												>
											{/if}
										</span>
										<p class="text-[10px] tracking-tight text-muted-foreground uppercase">
											{stat.role}
										</p>
									</div>

									<div class="flex items-center gap-3">
										<div class="text-right">
											<span class="text-sm font-black tabular-nums">{stat.completed}</span>
											<span class="text-[10px] text-muted-foreground uppercase">
												/ {stat.total}</span
											>
										</div>
										<Badge
											variant="secondary"
											class="bg-primary/10 text-[10px] font-bold text-primary"
										>
											{Math.round(stat.percentage)}%
										</Badge>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</div>

				<!-- Group Insights -->
				<div class="space-y-6">
					<h2 class="text-xl font-bold">Insights</h2>

					<Card.Root>
						<Card.Header>
							<Card.Title class="text-sm font-bold tracking-wider text-muted-foreground uppercase"
								>Group Activity</Card.Title
							>
						</Card.Header>
						<Card.Content class="space-y-4">
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2 text-xs">
									<BookOpen class="h-4 w-4 text-primary" />
									<span>Knowledge Shared</span>
								</div>
								<span class="font-bold tabular-nums">{analytics.knowledgeCount}</span>
							</div>
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2 text-xs">
									<Zap class="h-4 w-4 text-orange-500" />
									<span>News Discussed</span>
								</div>
								<span class="font-bold tabular-nums">{analytics.newsCount}</span>
							</div>
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2 text-xs">
									<FileText class="h-4 w-4 text-blue-500" />
									<span>Blog Portals</span>
								</div>
								<span class="font-bold tabular-nums">{analytics.blogCount}</span>
							</div>
						</Card.Content>
					</Card.Root>

					<div class="rounded-2xl border border-dashed bg-muted/20 p-8 text-center">
						<TrendingUp class="mx-auto mb-4 h-10 w-10 text-muted-foreground/30" />
						<p class="mb-2 text-xs font-bold tracking-widest text-muted-foreground uppercase">
							Pro Tip
						</p>
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
