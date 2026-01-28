<script lang="ts">
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import {
		MessageSquare,
		Sparkles,
		Shield,
		Image as ImageIcon,
		ArrowRight,
		Zap,
		BookOpen,
		Users,
		Check,
		Github,
		Twitter
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import Logo from '$lib/components/Logo.svelte';

	const auth = useAuth();

	const features = [
		{
			icon: MessageSquare,
			title: 'AI Chat',
			description:
				'Have intelligent conversations with advanced AI models. Get instant answers, explanations, and deep insights on any topic.'
		},
		{
			icon: BookOpen,
			title: 'Knowledge Base',
			description:
				'Organized study materials, current affairs, and curated content. Track your progress and build structured knowledge.'
		},
		{
			icon: Users,
			title: 'Study Groups',
			description:
				'Collaborate with peers, share resources, and discuss topics together. Learn collectively and stay motivated.'
		},
		{
			icon: ImageIcon,
			title: 'Image Generation',
			description:
				'Create stunning visuals and diagrams with AI. Perfect for visual learners and creating memorable study aids.'
		},
		{
			icon: Zap,
			title: 'Smart Flashcards',
			description:
				'Auto-generated flashcards from your content. Master concepts with spaced repetition and active recall.'
		},
		{
			icon: Shield,
			title: 'Private & Secure',
			description:
				'Your data is secured with enterprise-grade encryption. Private by design, always under your control.'
		}
	];

	const benefits = [
		'Access to multiple AI models',
		'Structured learning paths',
		'Progress tracking & analytics',
		'Collaborative study tools'
	];
</script>

<main class="min-h-screen bg-background">
	<!-- Hero Section -->
	<section class="relative isolate overflow-hidden">
		<!-- Subtle grid pattern background -->
		<div class="absolute inset-0 -z-10">
			<div
				class="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_110%)] bg-[size:4rem_4rem] opacity-40"
			></div>
		</div>

		<!-- Gradient orb -->
		<div
			class="absolute -top-40 left-1/2 -z-10 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-gradient-to-br from-foreground/5 via-foreground/3 to-transparent blur-3xl"
		></div>

		<div class="mx-auto max-w-7xl px-6 lg:px-8">
			<div class="mx-auto max-w-3xl pt-20 pb-24 sm:pt-24 sm:pb-32 lg:pt-32 lg:pb-40">
				<div class="text-center">
					<!-- Announcement Badge -->
					<div class="mb-8 flex justify-center">
						<a
							href="/blog"
							class="group inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-1.5 text-sm transition-all duration-200 hover:border-foreground/20 hover:bg-accent"
						>
							<span
								class="flex h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_2px] shadow-emerald-500/30"
							></span>
							<span class="text-muted-foreground">Introducing Cognirivus v1.0</span>
							<ArrowRight
								class="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5"
							/>
						</a>
					</div>

					<!-- Main Headline -->
					<h1 class="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
						Study smarter with
						<br class="hidden sm:block" />
						<span class="text-foreground">AI-powered learning</span>
					</h1>

					<!-- Subheadline -->
					<p
						class="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg"
					>
						The intelligent platform for serious learners. Chat with AI, organize knowledge, and
						prepare for competitive exams with precision.
					</p>

					<!-- CTA Buttons -->
					<div class="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
						{#if auth.isAuthenticated}
							<Button
								size="lg"
								href="/chat"
								class="group h-11 w-full gap-2 px-6 text-base font-medium sm:w-auto"
							>
								Start Chatting
								<ArrowRight
									class="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
								/>
							</Button>
							<Button
								variant="outline"
								size="lg"
								href="/content"
								class="h-11 w-full gap-2 px-6 text-base font-medium sm:w-auto"
							>
								Explore Knowledge Base
							</Button>
						{:else}
							<Button
								size="lg"
								href="/signin"
								class="group h-11 w-full gap-2 px-6 text-base font-medium sm:w-auto"
							>
								Get Started Free
								<ArrowRight
									class="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
								/>
							</Button>
							<Button
								variant="outline"
								size="lg"
								href="#features"
								class="h-11 w-full px-6 text-base font-medium sm:w-auto"
							>
								Learn More
							</Button>
						{/if}
					</div>

					<!-- Social proof -->
					<div class="mt-12 flex flex-col items-center gap-4">
						<p class="text-sm text-muted-foreground/60">
							Built for serious learners preparing for competitive exams
						</p>
						<div class="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
							{#each benefits as benefit}
								<div class="flex items-center gap-2 text-sm text-muted-foreground">
									<Check class="h-4 w-4 text-foreground" />
									<span>{benefit}</span>
								</div>
							{/each}
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Features Section -->
	<section id="features" class="relative border-t border-border/40 bg-accent/30">
		<div class="mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8">
			<!-- Section Header -->
			<div class="mx-auto max-w-2xl text-center">
				<p class="text-sm font-medium tracking-wide text-muted-foreground uppercase">Features</p>
				<h2 class="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
					Everything you need to excel
				</h2>
				<p class="mt-4 text-base text-muted-foreground sm:text-lg">
					Powerful AI-driven tools designed to help you learn faster, remember more, and stay
					organized.
				</p>
			</div>

			<!-- Feature Cards Grid -->
			<div class="mx-auto mt-16 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each features as feature, index}
					<div
						class="group relative rounded-xl border border-border/50 bg-background p-6 transition-all duration-200 hover:border-border hover:shadow-sm"
					>
						<div
							class="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-foreground/5 text-foreground transition-colors duration-200 group-hover:bg-foreground/10"
						>
							<feature.icon class="h-5 w-5" />
						</div>
						<h3 class="text-base font-medium text-foreground">
							{feature.title}
						</h3>
						<p class="mt-2 text-sm leading-relaxed text-muted-foreground">
							{feature.description}
						</p>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- How it works section -->
	<section class="border-t border-border/40">
		<div class="mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8">
			<div class="mx-auto max-w-2xl text-center">
				<p class="text-sm font-medium tracking-wide text-muted-foreground uppercase">
					How it works
				</p>
				<h2 class="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
					Start learning in minutes
				</h2>
			</div>

			<div class="mx-auto mt-16 max-w-3xl">
				<div class="grid gap-8 sm:grid-cols-3">
					<div class="relative text-center">
						<div
							class="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-sm font-medium text-background"
						>
							1
						</div>
						<h3 class="text-base font-medium">Create your account</h3>
						<p class="mt-2 text-sm text-muted-foreground">
							Sign up in seconds and set your learning preferences.
						</p>
					</div>
					<div class="relative text-center">
						<div
							class="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-sm font-medium text-background"
						>
							2
						</div>
						<h3 class="text-base font-medium">Explore & learn</h3>
						<p class="mt-2 text-sm text-muted-foreground">
							Chat with AI, browse curated content, and build knowledge.
						</p>
					</div>
					<div class="relative text-center">
						<div
							class="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-sm font-medium text-background"
						>
							3
						</div>
						<h3 class="text-base font-medium">Track progress</h3>
						<p class="mt-2 text-sm text-muted-foreground">
							Monitor your learning journey with analytics and insights.
						</p>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- CTA Section -->
	<section class="border-t border-border/40 bg-foreground">
		<div class="mx-auto max-w-7xl px-6 py-16 sm:py-24 lg:px-8">
			<div class="mx-auto max-w-2xl text-center">
				<h2 class="text-2xl font-semibold tracking-tight text-background sm:text-3xl">
					Ready to transform how you learn?
				</h2>
				<p class="mt-4 text-base text-background/70">
					Join learners who study smarter with Cognirivus.
				</p>
				<div class="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
					{#if auth.isAuthenticated}
						<Button
							size="lg"
							href="/chat"
							variant="secondary"
							class="group h-11 w-full gap-2 px-6 text-base font-medium sm:w-auto"
						>
							Start Chatting
							<ArrowRight
								class="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
							/>
						</Button>
					{:else}
						<Button
							size="lg"
							href="/signin"
							variant="secondary"
							class="group h-11 w-full gap-2 px-6 text-base font-medium sm:w-auto"
						>
							Get Started Free
							<ArrowRight
								class="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
							/>
						</Button>
					{/if}
				</div>
			</div>
		</div>
	</section>

	<!-- Footer -->
	<footer class="border-t border-border/40 bg-background">
		<div class="mx-auto max-w-7xl px-6 py-12 lg:px-8">
			<div class="flex flex-col items-center justify-between gap-6 sm:flex-row">
				<div class="flex items-center gap-6">
					<Logo size="sm" />
					<Separator orientation="vertical" class="h-5" />
					<nav class="flex gap-6">
						<a
							href="/blog"
							class="text-sm text-muted-foreground transition-colors hover:text-foreground"
						>
							Blog
						</a>
						<a
							href="/content"
							class="text-sm text-muted-foreground transition-colors hover:text-foreground"
						>
							Knowledge Base
						</a>
					</nav>
				</div>
				<div class="flex items-center gap-4">
					<p class="text-sm text-muted-foreground">
						&copy; {new Date().getFullYear()} Cognirivus
					</p>
				</div>
			</div>
		</div>
	</footer>
</main>
