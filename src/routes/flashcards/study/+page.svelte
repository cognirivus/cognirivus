<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { authClient } from '$lib/auth-client';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Progress } from '$lib/components/ui/progress';
	import {
		Brain,
		ChevronLeft,
		ChevronRight,
		CheckCircle2,
		XCircle,
		RotateCcw,
		Eye,
		Trophy,
		Sparkles
	} from '@lucide/svelte';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';
	import { fade, fly } from 'svelte/transition';
	import { toast } from 'svelte-sonner';
	import { page } from '$app/state';
	import ClozeText from '$lib/components/ClozeText.svelte';
	import { Separator } from '$lib/components/ui/separator';
	import { untrack } from 'svelte';

	const client = useConvexClient();
	const session = authClient.useSession();
	const currentUser = $derived($session.data?.user);
	const contentId = $derived(page.url.searchParams.get('contentId') as any);

	// Fetch cards due for review (server-side auth will handle filtering)
	const dueQuery = useQuery(api.flashcards.listDue, () => {
		const args: any = {};
		if (contentId) args.contentId = contentId;
		return args;
	});

	let sessionCards = $state<any[]>([]);
	let currentIndex = $state(0);
	let isFlipped = $state(false);
	let isComplete = $state(false);
	let sessionStats = $state({
		correct: 0,
		total: 0
	});

	// Populate sessionCards once when data arrives
	$effect(() => {
		const data = dueQuery.data;
		if (data && untrack(() => sessionCards.length === 0) && !isComplete) {
			sessionCards = [...data];
		}
	});

	const currentCard = $derived(sessionCards[currentIndex]);
	const totalCards = $derived(sessionCards.length);
	const progress = $derived(totalCards > 0 ? (currentIndex / totalCards) * 100 : 0);

	let isSubmitting = $state(false);

	async function handleReview(quality: number) {
		if (isSubmitting) return;

		const cardToReview = currentCard;
		if (!cardToReview) return;

		isSubmitting = true;
		try {
			await client.mutation(api.flashcards.review, {
				flashcardId: cardToReview._id,
				quality
			});

			console.log('Review:', { quality, isCorrect: quality >= 3 });
			if (quality >= 3) sessionStats.correct++;
			sessionStats.total++;
			console.log('Stats:', $state.snapshot(sessionStats));

			if (totalCards > 0 && currentIndex < totalCards - 1) {
				isFlipped = false;
				currentIndex++;
			} else {
				isComplete = true;
			}
		} catch (e: any) {
			toast.error('Failed to save review: ' + e.message);
		} finally {
			isSubmitting = false;
		}
	}

	function resetSession() {
		currentIndex = 0;
		isFlipped = false;
		isComplete = false;
		sessionStats = { correct: 0, total: 0 };
	}

	function goToPrevious() {
		if (currentIndex > 0) {
			currentIndex--;
			isFlipped = false;
		}
	}

	function goToNext() {
		if (currentIndex < totalCards - 1) {
			currentIndex++;
			isFlipped = false;
		} else if (currentIndex === totalCards - 1) {
			isComplete = true;
		}
	}
</script>

<svelte:head>
	<title>Flashcard Session - Knowledge Base</title>
</svelte:head>

<div class="container mx-auto max-w-2xl px-4 py-10 sm:px-6">
	<!-- Header -->
	<div class="mb-8 flex items-center justify-between">
		<Button
			variant="ghost"
			size="sm"
			href="/flashcards"
			class="gap-2 text-muted-foreground hover:text-foreground"
		>
			<ChevronLeft class="h-4 w-4" />
			Back
		</Button>
		<div class="flex items-center gap-2.5">
			<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
				<Brain class="h-4 w-4 text-primary" />
			</div>
			<span class="text-sm font-semibold">Study Session</span>
		</div>
		<div class="w-20"></div>
	</div>

	{#if dueQuery.isLoading}
		<div class="flex h-64 flex-col items-center justify-center gap-4">
			<Loader variant="circular" size="lg" />
			<p class="text-sm text-muted-foreground">Loading your cards...</p>
		</div>
	{:else if !currentUser}
		<div class="rounded-xl border bg-card p-12 text-center">
			<p class="text-muted-foreground">Please sign in to review your flashcards.</p>
			<Button href="/signin" class="mt-6">Sign In</Button>
		</div>
	{:else if isComplete}
		<!-- Session Complete -->
		<div in:fly={{ y: 20, duration: 400 }} class="space-y-8 text-center">
			<div class="inline-flex h-20 w-20 items-center justify-center rounded-full bg-amber-500/10">
				<Trophy class="h-10 w-10 text-amber-600" />
			</div>
			<div class="space-y-2">
				<h2 class="text-2xl font-semibold">Session Complete!</h2>
				<p class="mx-auto max-w-sm text-muted-foreground">
					Great job! You've finished this study session. Consistency is key to long-term retention.
				</p>
			</div>

			<div class="mx-auto max-w-xs rounded-xl border bg-card p-6">
				<div class="grid grid-cols-2 gap-6">
					<div class="text-center">
						<p class="text-3xl font-bold tabular-nums">{sessionStats.total}</p>
						<p class="mt-1 text-xs text-muted-foreground">Reviewed</p>
					</div>
					<div class="text-center">
						<p class="text-3xl font-bold tabular-nums">
							{sessionStats.total > 0
								? Math.round((sessionStats.correct / sessionStats.total) * 100)
								: 0}%
						</p>
						<p class="mt-1 text-xs text-muted-foreground">Accuracy</p>
					</div>
				</div>
			</div>

			<div class="flex flex-col justify-center gap-3 pt-2 sm:flex-row">
				<Button href="/flashcards" variant="outline" class="gap-2">
					<ChevronLeft class="h-4 w-4" />
					Back to Dashboard
				</Button>
				<Button onclick={resetSession} class="gap-2">
					<RotateCcw class="h-4 w-4" />
					Study Again
				</Button>
			</div>
		</div>
	{:else if currentCard}
		<div class="space-y-6">
			<!-- Progress Bar -->
			<div class="space-y-2">
				<div class="flex justify-between text-xs font-medium text-muted-foreground">
					<span>Progress</span>
					<span class="tabular-nums">{currentIndex + 1} / {totalCards}</span>
				</div>
				<Progress value={progress} class="h-1.5" />
			</div>

			<!-- Flashcard -->
			<div class="min-h-[420px]">
				{#key currentIndex}
					<div in:fade={{ duration: 200 }} class="space-y-6">
						<div class="overflow-hidden rounded-xl border bg-card">
							<!-- Card Header -->
							<div class="flex items-center justify-between border-b bg-muted/20 px-5 py-3">
								<div class="flex items-center gap-3">
									<Badge variant="secondary" class="text-[10px] font-semibold uppercase">
										{currentCard.type}
									</Badge>
									<span class="text-xs text-muted-foreground">
										Card {currentIndex + 1} of {totalCards}
									</span>
								</div>
								<div class="flex items-center gap-2 text-muted-foreground">
									<span class="text-[10px] font-semibold">Difficulty</span>
									<div class="flex gap-0.5">
										{#each Array(5) as _, i}
											<div
												class="h-1 w-3 rounded-full {i < currentCard.difficulty
													? 'bg-primary'
													: 'bg-muted'}"
											></div>
										{/each}
									</div>
								</div>
							</div>

							<!-- Card Content -->
							<div class="flex min-h-[280px] flex-col items-center justify-center p-8 text-center">
								{#if !isFlipped}
									<div class="space-y-4">
										<div class="text-xl leading-relaxed font-semibold">
											{#if currentCard.type === 'cloze'}
												<ClozeText text={currentCard.front} showAnswer={false} />
											{:else}
												{currentCard.front}
											{/if}
										</div>
										<p class="text-xs text-muted-foreground">
											Think about the answer before revealing
										</p>
									</div>
								{:else}
									<div
										class="w-full animate-in space-y-6 duration-300 fade-in slide-in-from-bottom-2"
									>
										<div class="space-y-2">
											<p class="text-[10px] font-bold tracking-widest text-primary uppercase">
												Question
											</p>
											<div class="text-base text-muted-foreground">
												{#if currentCard.type === 'cloze'}
													<ClozeText text={currentCard.front} showAnswer={false} />
												{:else}
													{currentCard.front}
												{/if}
											</div>
										</div>

										<Separator class="mx-auto w-16" />

										<div class="space-y-2">
											<p class="text-[10px] font-bold tracking-widest text-emerald-600 uppercase">
												Answer
											</p>
											<div class="text-xl leading-relaxed font-semibold">
												{#if currentCard.type === 'cloze'}
													<ClozeText text={currentCard.front} showAnswer={true} />
												{:else}
													{currentCard.back}
												{/if}
											</div>
											{#if currentCard.type === 'cloze' && currentCard.back}
												<p
													class="mt-4 rounded-lg bg-muted/30 p-3 text-sm text-muted-foreground italic"
												>
													{currentCard.back}
												</p>
											{/if}
										</div>
									</div>
								{/if}
							</div>

							<!-- Card Footer -->
							<div class="flex justify-center border-t bg-muted/10 p-5">
								{#if !isFlipped}
									<Button
										size="lg"
										onclick={() => (isFlipped = true)}
										class="w-full max-w-[220px] gap-2"
									>
										<Eye class="h-4 w-4" />
										Reveal Answer
									</Button>
								{:else}
									<div class="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
										<Button
											variant="outline"
											class="h-auto flex-col gap-1 border-red-200 py-3 text-red-600 hover:bg-red-50 hover:text-red-700"
											onclick={() => handleReview(1)}
											disabled={isSubmitting}
										>
											<XCircle class="h-4 w-4" />
											<span class="text-[10px] font-semibold">Again</span>
										</Button>
										<Button
											variant="outline"
											class="h-auto flex-col gap-1 border-amber-200 py-3 text-amber-600 hover:bg-amber-50 hover:text-amber-700"
											onclick={() => handleReview(3)}
											disabled={isSubmitting}
										>
											<RotateCcw class="h-4 w-4" />
											<span class="text-[10px] font-semibold">Hard</span>
										</Button>
										<Button
											variant="outline"
											class="h-auto flex-col gap-1 border-emerald-200 py-3 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
											onclick={() => handleReview(4)}
											disabled={isSubmitting}
										>
											<CheckCircle2 class="h-4 w-4" />
											<span class="text-[10px] font-semibold">Good</span>
										</Button>
										<Button
											variant="outline"
											class="h-auto flex-col gap-1 border-blue-200 py-3 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
											onclick={() => handleReview(5)}
											disabled={isSubmitting}
										>
											<Sparkles class="h-4 w-4" />
											<span class="text-[10px] font-semibold">Easy</span>
										</Button>
									</div>
								{/if}
							</div>
						</div>
					</div>
				{/key}

				<!-- Navigation -->
				<div class="mt-5 flex items-center justify-between px-1">
					<Button
						variant="ghost"
						size="sm"
						onclick={goToPrevious}
						disabled={currentIndex === 0}
						class="text-muted-foreground hover:text-foreground"
					>
						<ChevronLeft class="mr-1 h-4 w-4" />
						Previous
					</Button>

					<div class="flex items-center gap-1">
						{#each sessionCards as _, i}
							<button
								class="h-1.5 rounded-full transition-all duration-300 {i === currentIndex
									? 'w-6 bg-primary'
									: 'w-1.5 bg-muted hover:bg-muted-foreground/40'}"
								onclick={() => {
									currentIndex = i;
									isFlipped = false;
								}}
								aria-label="Go to card {i + 1}"
							></button>
						{/each}
					</div>

					<Button
						variant="ghost"
						size="sm"
						onclick={goToNext}
						class="text-muted-foreground hover:text-foreground"
					>
						{currentIndex === totalCards - 1 ? 'Finish' : 'Next'}
						<ChevronRight class="ml-1 h-4 w-4" />
					</Button>
				</div>
			</div>

			<!-- Learning Principles -->
			<div
				class="flex items-center justify-center gap-6 pt-6 text-[10px] font-medium tracking-wide text-muted-foreground/50 uppercase"
			>
				<div class="flex items-center gap-1.5">
					<div class="h-1 w-1 rounded-full bg-current"></div>
					Atomic Concepts
				</div>
				<div class="flex items-center gap-1.5">
					<div class="h-1 w-1 rounded-full bg-current"></div>
					Active Recall
				</div>
				<div class="flex items-center gap-1.5">
					<div class="h-1 w-1 rounded-full bg-current"></div>
					Spaced Repetition
				</div>
			</div>
		</div>
	{:else}
		<div class="rounded-xl border bg-card p-16 text-center">
			<div class="inline-flex h-16 w-16 items-center justify-center rounded-full bg-muted">
				<CheckCircle2 class="h-8 w-8 text-muted-foreground" />
			</div>
			<h3 class="mt-5 text-lg font-semibold">No cards ready for review</h3>
			<p class="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
				Check back later or browse new content to generate more cards.
			</p>
			<Button href="/content" variant="outline" class="mt-6">Browse Knowledge Base</Button>
		</div>
	{/if}
</div>
