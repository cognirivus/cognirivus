<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import {
		Brain,
		Sparkles,
		Clock,
		History,
		ChevronRight,
		CheckCircle2,
		BarChart3
	} from '@lucide/svelte';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';
	import { Progress } from '$lib/components/ui/progress';

	import { authClient } from '$lib/auth-client';

	const session = authClient.useSession();
	const isAuthenticated = $derived(!!$session.data?.user);

	const statsQuery = useQuery(api.flashcards.getStats, {});
	const dueQuery = useQuery(api.flashcards.listDue, {});

	const subjectsQuery = useQuery(api.subjects.list, {});

	let selectedSubjectId = $state<string | undefined>(undefined);

	const contentWithCardsQuery = useQuery(api.flashcards.getContentWithFlashcardCounts, () => ({
		paginationOpts: { numItems: 20, cursor: null },
		subjectId: selectedSubjectId as any,
		onlyWithCards: true
	}));
</script>

<svelte:head>
	<title>Flashcards - Knowledge Base</title>
</svelte:head>

<div class="container mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-12">
	<!-- Page Header -->
	<div class="mb-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
		<div class="space-y-2">
			<div class="flex items-center gap-2">
				<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
					<Brain class="h-4 w-4 text-primary" />
				</div>
				<span class="text-xs font-bold tracking-widest text-muted-foreground uppercase">
					Spaced Repetition
				</span>
			</div>
			<h1 class="text-3xl font-semibold tracking-tight">Flashcard Study</h1>
			<p class="max-w-md text-muted-foreground">
				Master your knowledge with scientifically-proven spaced repetition techniques.
			</p>
		</div>
		<div class="flex flex-col gap-3 sm:flex-row">
			<Button
				href="/flashcards/analytics"
				variant="outline"
				size="lg"
				class="gap-2.5 px-6"
				disabled={!isAuthenticated}
			>
				<BarChart3 class="h-4 w-4" />
				View Analytics
			</Button>
			<Button href="/flashcards/study" size="lg" class="gap-2.5 px-6" disabled={!isAuthenticated}>
				<Brain class="h-4 w-4" />
				Start Daily Review
			</Button>
		</div>
	</div>

	<!-- Main Grid -->
	<div class="grid gap-6 lg:grid-cols-3">
		<!-- Ready to Study Card -->
		<div class="lg:col-span-2">
			<div class="rounded-xl border bg-card">
				<div class="flex items-center gap-3 border-b px-6 py-4">
					<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
						<Clock class="h-4 w-4 text-amber-600" />
					</div>
					<div>
						<h2 class="text-sm font-semibold">Ready to Study</h2>
						<p class="text-xs text-muted-foreground">
							Review due cards and start learning new ones
						</p>
					</div>
				</div>
				<div class="p-6">
					{#if dueQuery.isLoading}
						<div class="flex h-40 items-center justify-center">
							<Loader variant="circular" size="md" />
						</div>
					{:else if !isAuthenticated}
						<div class="flex flex-col items-center justify-center py-16 text-center">
							<div class="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
								<History class="h-7 w-7 text-muted-foreground" />
							</div>
							<h3 class="text-lg font-semibold">Sign in to study</h3>
							<p class="mt-1.5 max-w-xs text-sm text-muted-foreground">
								Track your progress and master new topics with personalized flashcards.
							</p>
							<Button href="/signin" class="mt-6">Sign In</Button>
						</div>
					{:else if dueQuery.data && dueQuery.data.length > 0}
						<div class="space-y-6">
							<div
								class="flex items-center justify-between rounded-xl bg-gradient-to-br from-primary/5 to-primary/10 p-6"
							>
								<div class="space-y-1">
									<p class="text-5xl font-bold text-primary tabular-nums">{dueQuery.data.length}</p>
									<p class="text-sm font-medium text-muted-foreground">Cards ready for session</p>
								</div>
								<Button href="/flashcards/study" size="lg" class="gap-2 px-6">
									Study Now
									<ChevronRight class="h-4 w-4" />
								</Button>
							</div>

							<div class="space-y-3">
								<p class="text-xs font-bold tracking-widest text-muted-foreground uppercase">
									Recent Topics
								</p>
								<div class="flex flex-wrap gap-2">
									{#each [...new Set(dueQuery.data.map((c: any) => c.type))].slice(0, 5) as type}
										<Badge variant="secondary" class="text-xs">{type}</Badge>
									{/each}
								</div>
							</div>
						</div>
					{:else}
						<div class="flex flex-col items-center justify-center py-16 text-center">
							<div
								class="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10"
							>
								<CheckCircle2 class="h-7 w-7 text-emerald-600" />
							</div>
							<h3 class="text-lg font-semibold">You're all caught up!</h3>
							<p class="mt-1.5 max-w-xs text-sm text-muted-foreground">
								No cards are due for review right now. Great job staying on top of your studies.
							</p>
							<Button variant="outline" href="/content" class="mt-6">Browse Content to Study</Button
							>
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- Progress Card -->
		<div class="rounded-xl border bg-card">
			<div class="flex items-center justify-between border-b px-6 py-4">
				<div class="flex items-center gap-3">
					<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
						<History class="h-4 w-4 text-violet-600" />
					</div>
					<h2 class="text-sm font-semibold">Your Progress</h2>
				</div>
				<Button
					href="/flashcards/analytics"
					variant="ghost"
					size="icon"
					class="-mr-2 h-8 w-8 text-muted-foreground"
				>
					<BarChart3 class="h-4 w-4" />
				</Button>
			</div>
			<div class="p-6">
				{#if statsQuery.isLoading}
					<div class="space-y-3">
						{#each Array(5) as _}
							<div class="h-10 w-full animate-pulse rounded-lg bg-muted"></div>
						{/each}
					</div>
				{:else if !isAuthenticated}
					<div class="py-12 text-center">
						<p class="text-sm text-muted-foreground">Sign in to see your personalized stats.</p>
					</div>
				{:else if statsQuery.data?.userStats}
					<div class="space-y-4">
						<!-- User Stats -->
						<div class="space-y-2">
							<div class="flex items-center justify-between rounded-lg bg-blue-500/5 p-3">
								<span class="text-xs font-semibold text-blue-700">New Cards</span>
								<span class="text-sm font-bold text-blue-700 tabular-nums"
									>{statsQuery.data.userStats.new}</span
								>
							</div>
							<div class="flex items-center justify-between rounded-lg bg-amber-500/5 p-3">
								<span class="text-xs font-semibold text-amber-700">Learning</span>
								<span class="text-sm font-bold text-amber-700 tabular-nums"
									>{statsQuery.data.userStats.learning}</span
								>
							</div>
							<div class="flex items-center justify-between rounded-lg bg-emerald-500/5 p-3">
								<span class="text-xs font-semibold text-emerald-700">Mastered</span>
								<span class="text-sm font-bold text-emerald-700 tabular-nums"
									>{statsQuery.data.userStats.mastered}</span
								>
							</div>
						</div>

						<Separator class="my-4" />

						<!-- Global Stats -->
						<div class="space-y-4">
							<div class="flex items-center justify-between">
								<span class="text-xs text-muted-foreground">Global Cards</span>
								<span class="text-sm font-bold tabular-nums">{statsQuery.data.total}</span>
							</div>
							<div class="space-y-2.5">
								<p class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
									Difficulty Distribution
								</p>
								{#each Object.entries(statsQuery.data.byDifficulty) as [diff, count]}
									<div class="flex items-center justify-between text-xs">
										<div class="flex items-center gap-2">
											<div
												class="h-2 w-2 rounded-full {Number(diff) <= 2
													? 'bg-emerald-500'
													: Number(diff) <= 3
														? 'bg-amber-500'
														: 'bg-red-500'}"
											></div>
											<span class="text-muted-foreground">Level {diff}</span>
										</div>
										<span class="font-medium tabular-nums">{count}</span>
									</div>
								{/each}
							</div>
						</div>
					</div>
				{:else}
					<div class="flex flex-col items-center justify-center gap-3 py-12">
						<p class="text-sm text-muted-foreground">Unable to load your stats.</p>
						<Button variant="outline" size="sm" onclick={() => window.location.reload()}>
							Retry
						</Button>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Study by Topic Section -->
	<div class="mt-12 space-y-6">
		<div class="flex items-end justify-between">
			<div class="space-y-1">
				<h2 class="text-xl font-semibold tracking-tight">Study by Topic</h2>
				<p class="text-sm text-muted-foreground">Master specific content sets at your own pace.</p>
			</div>
			<div class="w-[200px]">
				<select
					bind:value={selectedSubjectId}
					class="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
				>
					<option value={undefined}>All Subjects</option>
					{#if subjectsQuery.data}
						{#each subjectsQuery.data as subject}
							<option value={subject._id}>{subject.name}</option>
						{/each}
					{/if}
				</select>
			</div>
		</div>

		<div class="overflow-hidden rounded-xl border bg-card">
			<div class="overflow-x-auto">
				<table class="w-full text-left text-sm">
					<thead class="border-b bg-muted/30">
						<tr>
							<th class="px-5 py-3.5 text-xs font-semibold text-muted-foreground">Topic</th>
							<th class="px-5 py-3.5 text-xs font-semibold text-muted-foreground">Subject</th>
							<th class="px-5 py-3.5 text-center text-xs font-semibold text-muted-foreground"
								>Cards</th
							>
							<th class="px-5 py-3.5 text-center text-xs font-semibold text-muted-foreground"
								>Progress</th
							>
							<th class="px-5 py-3.5 text-right text-xs font-semibold text-muted-foreground"
								>Action</th
							>
						</tr>
					</thead>
					<tbody class="divide-y divide-border/50">
						{#if contentWithCardsQuery.isLoading}
							{#each Array(5) as _}
								<tr>
									<td class="px-5 py-4"
										><div class="h-4 w-48 animate-pulse rounded bg-muted"></div></td
									>
									<td class="px-5 py-4"
										><div class="h-4 w-20 animate-pulse rounded bg-muted"></div></td
									>
									<td class="px-5 py-4"
										><div class="mx-auto h-4 w-8 animate-pulse rounded bg-muted"></div></td
									>
									<td class="px-5 py-4"
										><div class="mx-auto h-4 w-24 animate-pulse rounded bg-muted"></div></td
									>
									<td class="px-5 py-4"
										><div class="ml-auto h-8 w-20 animate-pulse rounded bg-muted"></div></td
									>
								</tr>
							{/each}
						{:else if contentWithCardsQuery.data}
							{#each contentWithCardsQuery.data.page.filter((c) => c.flashcardCount > 0) as content}
								<tr class="group transition-colors hover:bg-muted/30">
									<td class="max-w-md px-5 py-4">
										<span class="line-clamp-1 font-medium">{content.title}</span>
									</td>
									<td class="px-5 py-4">
										<Badge variant="secondary" class="text-[10px] font-semibold uppercase">
											{content.subject?.name || 'Topic'}
										</Badge>
									</td>
									<td class="px-5 py-4 text-center">
										<span class="font-bold text-primary tabular-nums">{content.flashcardCount}</span
										>
									</td>
									<td class="px-5 py-4">
										<div class="flex min-w-[100px] flex-col items-center gap-1.5">
											<div
												class="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground"
											>
												<span class="tabular-nums"
													>{content.attemptedCount} / {content.flashcardCount}</span
												>
												{#if content.attemptedCount === content.flashcardCount}
													<CheckCircle2 class="h-3 w-3 text-emerald-600" />
												{/if}
											</div>
											<div class="h-1.5 w-full max-w-[80px] overflow-hidden rounded-full bg-muted">
												<div
													class="h-full bg-primary transition-all duration-500"
													style="width: {(content.attemptedCount / content.flashcardCount) * 100}%"
												></div>
											</div>
										</div>
									</td>
									<td class="px-5 py-4 text-right">
										<Button
											href="/flashcards/study?contentId={content._id}"
											variant="ghost"
											size="sm"
											class="h-8 gap-1.5 text-xs font-semibold transition-all group-hover:bg-primary group-hover:text-primary-foreground"
											disabled={!isAuthenticated}
										>
											Study
											<ChevronRight class="h-3 w-3" />
										</Button>
									</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>

			{#if !contentWithCardsQuery.isLoading && contentWithCardsQuery.data?.page.filter((c) => c.flashcardCount > 0).length === 0}
				<div class="p-16 text-center">
					<p class="text-muted-foreground">No topics with flashcards found.</p>
					<Button variant="outline" href="/admin/flashcards" class="mt-4">
						Generate Flashcards in Admin
					</Button>
				</div>
			{/if}
		</div>
	</div>
</div>
