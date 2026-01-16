<script lang="ts">
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { MessageSquare, Sparkles, Shield, Image as ImageIcon, ArrowRight } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';

	const auth = useAuth();
</script>

<main class="min-h-screen bg-background">
	<!-- Hero Section -->
	<div class="relative isolate px-6 pt-14 lg:px-8">
		<div class="mx-auto max-w-4xl py-24 sm:py-32 lg:py-40">
			<div class="text-center">
				<div class="mb-8 flex justify-center">
					<Badge
						variant="outline"
						class="px-3 py-1 text-sm font-medium transition-colors hover:border-primary/50"
					>
						<span class="mr-2 inline-flex h-2 w-2 animate-pulse rounded-full bg-primary"></span>
						Introducing Cognirivus v1.0.
						<a href="/blog" class="ml-2 font-bold text-primary hover:underline">
							Read more &rarr;
						</a>
					</Badge>
				</div>
				<h1 class="text-4xl font-extrabold tracking-tight text-foreground sm:text-6xl lg:text-7xl">
					Experience the future of <br />
					<span
						class="bg-gradient-to-r from-primary via-primary/80 to-primary/40 bg-clip-text text-transparent"
						>AI Interaction</span
					>
				</h1>
				<p class="mx-auto mt-8 max-w-2xl text-lg leading-8 text-muted-foreground">
					A premium, all-in-one platform for chatting with advanced AI models, generating images,
					and managing your digital intelligence.
				</p>
				<div class="mt-10 flex items-center justify-center gap-x-6">
					{#if auth.isAuthenticated}
						<Button size="lg" href="/chat" class="gap-2 px-8 py-6 text-base shadow-sm">
							Start Chatting
							<ArrowRight class="h-5 w-5" />
						</Button>
						<a
							href="/image"
							class="text-sm leading-6 font-semibold text-foreground transition-colors hover:text-primary"
						>
							Generate Images <span aria-hidden="true">→</span>
						</a>
					{:else}
						<Button size="lg" href="/signin" class="gap-2 px-8 py-6 text-base shadow-sm">
							Get Started
							<Sparkles class="h-5 w-5" />
						</Button>
						<a
							href="#features"
							class="text-sm leading-6 font-semibold text-foreground transition-colors hover:text-primary"
						>
							Learn more <span aria-hidden="true">→</span>
						</a>
					{/if}
				</div>
			</div>
		</div>
	</div>

	<!-- Simple Features Section -->
	<div id="features" class="mx-auto max-w-7xl px-6 pb-24 sm:pb-32 lg:px-8">
		<div class="mb-16 flex flex-col items-center text-center">
			<h2 class="text-3xl font-bold tracking-tight sm:text-4xl">
				Everything you need in one place
			</h2>
			<p class="mt-4 max-w-2xl text-lg text-muted-foreground">
				We've combined the most powerful AI capabilities into a single, intuitive interface.
			</p>
			<Separator class="mt-8 w-24" />
		</div>

		<div class="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
			<dl class="grid max-w-xl grid-cols-1 gap-x-8 gap-y-8 lg:max-w-none lg:grid-cols-3">
				<Card.Root class="group transition-all hover:border-primary/50 hover:shadow-lg">
					<Card.Header>
						<div
							class="mb-2 w-fit rounded-lg bg-primary/10 p-3 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"
						>
							<MessageSquare class="h-6 w-6" />
						</div>
						<Card.Title>Real-time Chat</Card.Title>
						<Card.Description class="text-base leading-7">
							Lightning-fast streaming responses from the world's best AI models.
						</Card.Description>
					</Card.Header>
				</Card.Root>

				<Card.Root class="group transition-all hover:border-primary/50 hover:shadow-lg">
					<Card.Header>
						<div
							class="mb-2 w-fit rounded-lg bg-primary/10 p-3 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"
						>
							<ImageIcon class="h-6 w-6" />
						</div>
						<Card.Title>Image Generation</Card.Title>
						<Card.Description class="text-base leading-7">
							Create stunning visuals with integrated DALL-E and custom models.
						</Card.Description>
					</Card.Header>
				</Card.Root>

				<Card.Root class="group transition-all hover:border-primary/50 hover:shadow-lg">
					<Card.Header>
						<div
							class="mb-2 w-fit rounded-lg bg-primary/10 p-3 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"
						>
							<Shield class="h-6 w-6" />
						</div>
						<Card.Title>Secure & Private</Card.Title>
						<Card.Description class="text-base leading-7">
							Your data is secured with enterprise-grade authentication and encryption.
						</Card.Description>
					</Card.Header>
				</Card.Root>
			</dl>
		</div>
	</div>
</main>
