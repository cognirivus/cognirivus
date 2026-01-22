<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import { Brain, Sparkles, Clock, History, ChevronRight, CheckCircle2 } from '@lucide/svelte';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';
	import { Progress } from '$lib/components/ui/progress';
	import { page } from '$app/state';

	const currentUser = $derived(page.data.currentUser);
	const isAuthenticated = $derived(!!currentUser);

	const statsQuery = useQuery(api.flashcards.getStats, {});
	const dueQuery = useQuery(api.flashcards.listDue, {});

	const contentWithCardsQuery = useQuery(api.flashcards.getContentWithFlashcardCounts, {
		paginationOpts: { numItems: 20, cursor: null }
	});
</script>

<svelte:head>
	<title>Flashcards - Knowledge Base</title>
</svelte:head>

<div class="container mx-auto max-w-7xl px-4 py-8 sm:px-6">
	<div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div class="space-y-1">
			<h1 class="text-3xl font-bold tracking-tight">Flashcard Study</h1>
			<p class="text-muted-foreground">Master your knowledge with spaced repetition.</p>
		</div>
		<Button
			href="/flashcards/study"
			size="lg"
			class="gap-2 shadow-lg shadow-primary/20"
			disabled={!isAuthenticated}
		>
			<Brain class="h-5 w-5" />
			Start Daily Review
		</Button>
	</div>

	<div class="grid gap-6 md:grid-cols-3">
		<Card.Root class="md:col-span-2">
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					<Clock class="h-5 w-5 text-primary" />
					Ready to Study
				</Card.Title>
				<Card.Description>Review due cards and start learning new ones.</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if dueQuery.isLoading}
					<div class="flex h-40 items-center justify-center">
						<Loader variant="circular" size="md" />
					</div>
				{:else if !isAuthenticated}
					<div class="flex flex-col items-center justify-center py-12 text-center">
						<div class="mb-4 rounded-full bg-muted p-4">
							<History class="h-8 w-8 text-muted-foreground" />
						</div>
						<h3 class="text-xl font-semibold">Sign in to study</h3>
						<p class="mt-1 text-muted-foreground">Track your progress and master new topics.</p>
						<Button href="/signin" class="mt-6">Sign In</Button>
					</div>
				{:else if dueQuery.data && dueQuery.data.length > 0}
					<div class="space-y-4">
						<div class="flex items-center justify-between rounded-lg border bg-muted/30 p-6">
							<div class="space-y-1">
								<p class="text-4xl font-bold text-primary">{dueQuery.data.length}</p>
								<p class="font-medium text-muted-foreground">Cards ready for session</p>
							</div>
							<Button href="/flashcards/study" size="lg" class="gap-2">
								Study Now
								<ChevronRight class="h-4 w-4" />
							</Button>
						</div>

						<div class="space-y-2">
							<p class="text-sm font-semibold text-muted-foreground">Recent Topics</p>
							<div class="flex flex-wrap gap-2">
								{#each [...new Set(dueQuery.data.map((c: any) => c.type))].slice(0, 5) as type}
									<Badge variant="outline">{type}</Badge>
								{/each}
							</div>
						</div>
					</div>
				{:else}
					<div class="flex flex-col items-center justify-center py-12 text-center">
						<div class="mb-4 rounded-full bg-primary/10 p-4">
							<Sparkles class="h-8 w-8 text-primary" />
						</div>
						<h3 class="text-xl font-semibold">You're all caught up!</h3>
						<p class="mt-1 text-muted-foreground">No cards are due for review right now.</p>
						<Button variant="outline" href="/content" class="mt-6">Browse Content to Study</Button>
					</div>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					<History class="h-5 w-5 text-primary" />
					Your Progress
				</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-6">
				{#if statsQuery.isLoading}
					<div class="space-y-4">
						{#each Array(5) as _}
							<div class="h-8 w-full animate-pulse rounded bg-muted"></div>
						{/each}
					</div>
				{:else if !isAuthenticated}
					<div class="py-10 text-center">
						<p class="text-sm text-muted-foreground">Sign in to see your personalized stats.</p>
					</div>
				{:else if statsQuery.data?.userStats}
					<div class="grid grid-cols-1 gap-4">
						<div
							class="flex items-center justify-between rounded-md border border-blue-500/20 bg-blue-500/5 p-3"
						>
							<span class="text-sm font-medium text-blue-700">New Cards</span>
							<Badge variant="outline" class="border-blue-500/20 bg-blue-500/10 text-blue-700"
								>{statsQuery.data.userStats.new}</Badge
							>
						</div>
						<div
							class="flex items-center justify-between rounded-md border border-orange-500/20 bg-orange-500/5 p-3"
						>
							<span class="text-sm font-medium text-orange-700">Learning</span>
							<Badge variant="outline" class="border-orange-500/20 bg-orange-500/10 text-orange-700"
								>{statsQuery.data.userStats.learning}</Badge
							>
						</div>
						<div
							class="flex items-center justify-between rounded-md border border-green-500/20 bg-green-500/5 p-3"
						>
							<span class="text-sm font-medium text-green-700">Mastered</span>
							<Badge variant="outline" class="border-green-500/20 bg-green-500/10 text-green-700"
								>{statsQuery.data.userStats.mastered}</Badge
							>
						</div>
					</div>

					<Separator />

					<div class="space-y-4">
						<div class="flex items-center justify-between">
							<span class="text-sm text-muted-foreground">Global Cards</span>
							<span class="font-bold">{statsQuery.data.total}</span>
						</div>
						<div class="space-y-3">
							<p class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
								Global Difficulty
							</p>
							{#each Object.entries(statsQuery.data.byDifficulty) as [diff, count]}
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-2 text-xs">
										<div
											class="h-1.5 w-1.5 rounded-full {Number(diff) <= 2
												? 'bg-green-500'
												: Number(diff) <= 3
													? 'bg-yellow-500'
													: 'bg-red-500'}"
										></div>
										Difficulty {diff}
									</div>
									<span class="text-xs font-medium text-muted-foreground">{count}</span>
								</div>
							{/each}
						</div>
						{#if statsQuery.data.userStats?.debugId}
							<p class="truncate pt-4 text-[8px] text-muted-foreground opacity-20">
								SID: {statsQuery.data.userStats.debugId}
							</p>
						{/if}
					</div>
				{:else}
					<div class="flex flex-col items-center justify-center gap-2 py-10">
						<p class="text-sm text-muted-foreground">Unable to load your stats.</p>
						<Button variant="outline" size="sm" onclick={() => window.location.reload()}>
							Retry
						</Button>
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>

	<div class="mt-12 space-y-6">
		<div class="flex items-center justify-between">
			<div class="space-y-1">
				<h2 class="text-xl font-bold tracking-tight">Study by Topic</h2>
				<p class="text-sm text-muted-foreground">Master specific content sets at your own pace.</p>
			</div>
		</div>

		<div class="overflow-hidden rounded-md border bg-card shadow-sm">
			<div class="overflow-x-auto">
				<table class="w-full text-left text-sm">
					<thead class="border-b bg-muted/50 font-medium text-muted-foreground">
						<tr>
							<th class="px-4 py-3 text-[10px] font-bold tracking-wider uppercase">Topic</th>
							<th class="px-4 py-3 text-[10px] font-bold tracking-wider uppercase">Subject</th>
							<th class="px-4 py-3 text-center text-[10px] font-bold tracking-wider uppercase"
								>Cards</th
							>
							<th class="px-4 py-3 text-center text-[10px] font-bold tracking-wider uppercase"
								>Status</th
							>
							<th class="px-4 py-3 text-right text-[10px] font-bold tracking-wider uppercase"
								>Action</th
							>
						</tr>
					</thead>
					<tbody class="divide-y">
						{#if contentWithCardsQuery.isLoading}
							{#each Array(5) as _}
								<tr class="animate-pulse">
									<td class="px-4 py-4"><div class="h-4 w-48 rounded bg-muted"></div></td>
									<td class="px-4 py-4"><div class="h-4 w-20 rounded bg-muted"></div></td>
									<td class="px-4 py-4"><div class="mx-auto h-4 w-10 rounded bg-muted"></div></td>
									<td class="px-4 py-4"><div class="mx-auto h-4 w-24 rounded bg-muted"></div></td>
									<td class="px-4 py-4"><div class="ml-auto h-8 w-24 rounded bg-muted"></div></td>
								</tr>
							{/each}
						{:else if contentWithCardsQuery.data}
							{#each contentWithCardsQuery.data.page.filter((c) => c.flashcardCount > 0) as content}
								<tr class="group transition-colors hover:bg-muted/30">
									<td class="max-w-md truncate px-4 py-4 font-medium text-foreground">
										{content.title}
									</td>
									<td class="px-4 py-4">
										<Badge variant="outline" class="h-5 px-2 py-0 text-[10px] font-bold uppercase">
											{content.subject?.name || 'Topic'}
										</Badge>
									</td>
									<td class="px-4 py-4 text-center tabular-nums">
										<span class="font-bold text-primary">{content.flashcardCount}</span>
									</td>
									<td class="px-4 py-4">
										<div class="flex min-w-[120px] flex-col items-center gap-1.5">
											<div
												class="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase"
											>
												<span>{content.attemptedCount} / {content.flashcardCount}</span>
												{#if content.attemptedCount === content.flashcardCount}
													<CheckCircle2 class="h-3 w-3 text-green-600" />
												{/if}
											</div>
											<div class="h-1 w-full overflow-hidden rounded-full bg-muted">
												<div
													class="h-full bg-primary transition-all duration-500"
													style="width: {(content.attemptedCount / content.flashcardCount) * 100}%"
												></div>
											</div>
										</div>
									</td>
									<td class="px-4 py-4 text-right">
										<div class="flex flex-col items-end gap-1">
											<Button
												href="/flashcards/study?contentId={content._id}"
												variant="ghost"
												size="sm"
												class="h-8 gap-1.5 px-3 text-xs font-bold tracking-tight uppercase group-hover:bg-primary group-hover:text-primary-foreground hover:bg-primary hover:text-primary-foreground"
												disabled={!isAuthenticated}
											>
												Study
												<ChevronRight class="h-3 w-3" />
											</Button>
											{#if !isAuthenticated}
												<span
													class="pr-2 text-[8px] font-bold text-muted-foreground uppercase italic"
													>Sign in required</span
												>
											{/if}
										</div>
									</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>

			{#if !contentWithCardsQuery.isLoading && contentWithCardsQuery.data?.page.filter((c) => c.flashcardCount > 0).length === 0}
				<div class="p-12 text-center">
					<p class="text-muted-foreground italic">No topics with flashcards found.</p>
					<Button variant="outline" href="/admin/flashcards" class="mt-4">
						Generate Flashcards in Admin
					</Button>
				</div>
			{/if}
		</div>
	</div>
</div>
