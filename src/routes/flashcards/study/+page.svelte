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
	const currentUser = $derived(page.data.currentUser);
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

	async function handleReview(quality: number) {
		const cardToReview = currentCard;
		if (!cardToReview) return;

		try {
			await client.mutation(api.flashcards.review, {
				flashcardId: cardToReview._id,
				quality
			});

			if (quality >= 3) sessionStats.correct++;
			sessionStats.total++;

			if (totalCards > 0 && currentIndex < totalCards - 1) {
				isFlipped = false;
				currentIndex++;
			} else {
				isComplete = true;
			}
		} catch (e: any) {
			toast.error('Failed to save review: ' + e.message);
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

<div class="container mx-auto max-w-2xl px-4 py-8">
	<div class="mb-8 flex items-center justify-between">
		<Button variant="ghost" size="sm" href="/flashcards" class="gap-2">
			<ChevronLeft class="h-4 w-4" />
			Back
		</Button>
		<div class="flex items-center gap-2">
			<Brain class="h-5 w-5 text-primary" />
			<span class="font-bold">Study Session</span>
		</div>
		<div class="w-20"></div>
	</div>

	{#if dueQuery.isLoading}
		<div class="flex h-64 flex-col items-center justify-center gap-4">
			<Loader variant="circular" size="lg" />
			<p class="animate-pulse text-muted-foreground">Loading your cards...</p>
		</div>
	{:else if !currentUser}
		<Card.Root>
			<Card.Content class="py-12 text-center">
				<p>Please sign in to review your flashcards.</p>
				<Button href="/signin" class="mt-4">Sign In</Button>
			</Card.Content>
		</Card.Root>
	{:else if isComplete}
		<div in:fly={{ y: 20, duration: 400 }} class="space-y-6 text-center">
			<div class="inline-flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
				<Trophy class="h-10 w-10 text-primary" />
			</div>
			<h2 class="text-3xl font-bold">Session Complete!</h2>
			<p class="mx-auto max-w-md text-muted-foreground">
				Great job! You've finished this study session. Consistency is key to long-term retention.
			</p>

			<Card.Root class="mx-auto max-w-sm">
				<Card.Content class="grid grid-cols-2 gap-4 pt-6">
					<div class="text-center">
						<p class="text-2xl font-bold">{sessionStats.total}</p>
						<p class="text-xs text-muted-foreground uppercase">Reviewed</p>
					</div>
					<div class="text-center">
						<p class="text-2xl font-bold">
							{sessionStats.total > 0
								? Math.round((sessionStats.correct / sessionStats.total) * 100)
								: 0}%
						</p>
						<p class="text-xs text-muted-foreground uppercase">Accuracy</p>
					</div>
				</Card.Content>
			</Card.Root>

			<div class="flex flex-col justify-center gap-3 pt-4 sm:flex-row">
				<Button href="/flashcards" variant="outline" class="gap-2">
					<ChevronLeft class="h-4 w-4" />
					To Dashboard
				</Button>
				<Button onclick={resetSession} class="gap-2">
					<RotateCcw class="h-4 w-4" />
					Study Again
				</Button>
			</div>
		</div>
	{:else if currentCard}
		<div class="space-y-6">
			<div class="space-y-2">
				<div class="flex justify-between text-sm font-medium">
					<span>Progress</span>
					<span>{currentIndex + 1} / {totalCards}</span>
				</div>
				<Progress value={progress} class="h-2" />
			</div>

			<div class="min-h-[400px]">
				{#key currentIndex}
					<div in:fade={{ duration: 200 }} class="space-y-6">
						<Card.Root class="overflow-hidden border-border bg-card shadow-sm transition-all">
							<Card.Header
								class="flex flex-row items-center justify-between border-b bg-muted/20 px-6 py-3"
							>
								<div class="flex items-center gap-3">
									<Badge
										variant="secondary"
										class="rounded-sm font-mono text-[10px] tracking-wider uppercase"
									>
										{currentCard.type}
									</Badge>
									<span class="text-[10px] font-bold text-muted-foreground uppercase"
										>Card {currentIndex + 1} of {totalCards}</span
									>
								</div>
								<div class="flex items-center gap-1 text-muted-foreground">
									<span class="text-[10px] font-bold tracking-tighter uppercase">Difficulty</span>
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
							</Card.Header>

							<Card.Content
								class="flex min-h-[250px] flex-col items-center justify-center p-10 text-center"
							>
								{#if !isFlipped}
									<div class="space-y-4">
										<div class="text-2xl leading-snug font-semibold text-foreground">
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
											<div class="text-lg font-medium text-muted-foreground opacity-80">
												{#if currentCard.type === 'cloze'}
													<ClozeText text={currentCard.front} showAnswer={false} />
												{:else}
													{currentCard.front}
												{/if}
											</div>
										</div>

										<Separator class="mx-auto w-12" />

										<div class="space-y-2">
											<p class="text-[10px] font-bold tracking-widest text-green-600 uppercase">
												Correct Answer
											</p>
											<div class="text-2xl leading-relaxed font-bold text-foreground">
												{#if currentCard.type === 'cloze'}
													<ClozeText text={currentCard.front} showAnswer={true} />
												{:else}
													{currentCard.back}
												{/if}
											</div>
											{#if currentCard.type === 'cloze' && currentCard.back}
												<p
													class="mt-4 rounded-md bg-muted/30 p-3 text-center text-sm text-muted-foreground italic"
												>
													{currentCard.back}
												</p>
											{/if}
										</div>
									</div>
								{/if}
							</Card.Content>

							<Card.Footer class="justify-center border-t bg-muted/10 p-6">
								{#if !isFlipped}
									<Button
										size="lg"
										onclick={() => (isFlipped = true)}
										class="w-full max-w-[240px] shadow-sm"
									>
										<Eye class="mr-2 h-4 w-4" />
										Reveal Answer
									</Button>
								{:else}
									<div class="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
										<Button
											variant="outline"
											class="h-auto flex-col border-red-200 py-3 text-red-600 hover:bg-red-50 hover:text-red-700"
											onclick={() => handleReview(1)}
										>
											<XCircle class="mb-1 h-4 w-4" />
											<span class="text-xs font-bold tracking-tight uppercase">Again</span>
										</Button>
										<Button
											variant="outline"
											class="h-auto flex-col border-orange-200 py-3 text-orange-600 hover:bg-orange-50 hover:text-orange-700"
											onclick={() => handleReview(3)}
										>
											<RotateCcw class="mb-1 h-4 w-4" />
											<span class="text-xs font-bold tracking-tight uppercase">Hard</span>
										</Button>
										<Button
											variant="outline"
											class="h-auto flex-col border-green-200 py-3 text-green-600 hover:bg-green-50 hover:text-green-700"
											onclick={() => handleReview(4)}
										>
											<CheckCircle2 class="mb-1 h-4 w-4" />
											<span class="text-xs font-bold tracking-tight uppercase">Good</span>
										</Button>
										<Button
											variant="outline"
											class="h-auto flex-col border-blue-200 py-3 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
											onclick={() => handleReview(5)}
										>
											<Sparkles class="mb-1 h-4 w-4" />
											<span class="text-xs font-bold tracking-tight uppercase">Easy</span>
										</Button>
									</div>
								{/if}
							</Card.Footer>
						</Card.Root>
					</div>
				{/key}

				<div class="mt-4 flex items-center justify-between px-2">
					<Button
						variant="ghost"
						size="sm"
						onclick={goToPrevious}
						disabled={currentIndex === 0}
						class="text-muted-foreground hover:text-foreground"
					>
						<ChevronLeft class="mr-1.5 h-4 w-4" />
						Previous
					</Button>

					<div class="flex items-center gap-1.5">
						{#each sessionCards as _, i}
							<button
								class="h-1.5 rounded-full transition-all duration-300 {i === currentIndex
									? 'w-8 bg-primary'
									: 'w-1.5 bg-muted hover:bg-muted-foreground/50'}"
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
						<ChevronRight class="ml-1.5 h-4 w-4" />
					</Button>
				</div>
			</div>

			<div
				class="flex items-center justify-center gap-6 pt-4 text-[10px] font-bold tracking-widest text-muted-foreground/40 uppercase"
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
		<Card.Root>
			<Card.Content class="space-y-4 py-20 text-center">
				<div class="inline-flex h-16 w-16 items-center justify-center rounded-full bg-muted">
					<CheckCircle2 class="h-8 w-8 text-muted-foreground" />
				</div>
				<h3 class="text-xl font-semibold">No cards ready for review</h3>
				<p class="text-muted-foreground">
					Check back later or browse new content to generate more cards.
				</p>
				<Button href="/content" variant="outline">Browse Knowledge Base</Button>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
