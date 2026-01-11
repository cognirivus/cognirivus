<script lang="ts">
	import { useAuth } from '@mmailaender/convex-auth-svelte/sveltekit';
	import { MessageSquare, Sparkles, Shield, Image as ImageIcon, ArrowRight } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';

	const auth = useAuth();
</script>

<main class="min-h-screen bg-background">
	<!-- Hero Section -->
	<div class="relative isolate px-6 pt-14 lg:px-8">
		<div class="mx-auto max-w-4xl py-24 sm:py-32 lg:py-40">
			<div class="text-center">
				<div class="mb-8 flex justify-center">
					<div
						class="relative rounded-full px-3 py-1 text-sm leading-6 text-muted-foreground ring-1 ring-border transition-all hover:ring-primary/50"
					>
						Introducing Cognirivus v1.0. <a href="/chat" class="font-semibold text-primary"
							><span class="absolute inset-0" aria-hidden="true"></span>Read more
							<span aria-hidden="true">&rarr;</span></a
						>
					</div>
				</div>
				<h1 class="text-4xl font-extrabold tracking-tight text-foreground sm:text-6xl lg:text-7xl">
					Experience the future of <span
						class="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent"
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
		<div class="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
			<dl class="grid max-w-xl grid-cols-1 gap-x-12 gap-y-16 lg:max-w-none lg:grid-cols-3">
				<div
					class="flex flex-col items-start gap-4 rounded-2xl border border-border bg-card p-8 shadow-sm transition-all hover:border-primary/20 hover:shadow-md"
				>
					<div class="rounded-lg bg-primary/10 p-3 text-primary">
						<MessageSquare class="h-6 w-6" />
					</div>
					<div>
						<dt class="text-lg font-bold text-foreground">Real-time Chat</dt>
						<dd class="mt-2 text-base leading-7 text-muted-foreground">
							Lightning-fast streaming responses from the world's best AI models.
						</dd>
					</div>
				</div>
				<div
					class="flex flex-col items-start gap-4 rounded-2xl border border-border bg-card p-8 shadow-sm transition-all hover:border-primary/20 hover:shadow-md"
				>
					<div class="rounded-lg bg-primary/10 p-3 text-primary">
						<ImageIcon class="h-6 w-6" />
					</div>
					<div>
						<dt class="text-lg font-bold text-foreground">Image Generation</dt>
						<dd class="mt-2 text-base leading-7 text-muted-foreground">
							Create stunning visuals with integrated DALL-E and custom models.
						</dd>
					</div>
				</div>
				<div
					class="flex flex-col items-start gap-4 rounded-2xl border border-border bg-card p-8 shadow-sm transition-all hover:border-primary/20 hover:shadow-md"
				>
					<div class="rounded-lg bg-primary/10 p-3 text-primary">
						<Shield class="h-6 w-6" />
					</div>
					<div>
						<dt class="text-lg font-bold text-foreground">Secure & Private</dt>
						<dd class="mt-2 text-base leading-7 text-muted-foreground">
							Your data is secured with enterprise-grade authentication and encryption.
						</dd>
					</div>
				</div>
			</dl>
		</div>
	</div>
</main>
