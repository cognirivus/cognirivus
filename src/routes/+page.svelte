<script lang="ts">
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { Button } from '$lib/components/ui/button';

	const auth = useAuth();
</script>

<main class="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
	<div class="rounded-2xl border border-border bg-card p-8 sm:p-12">
		<p class="text-sm font-medium tracking-wide text-muted-foreground uppercase">
			Cognirivus Pivot
		</p>
		<h1 class="mt-3 text-3xl leading-tight font-semibold tracking-tight sm:text-5xl">
			A high-density knowledge network inspired by HN.
		</h1>
		<p class="mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
			Read public discussions, join communities, publish knowledge posts, and contribute with
			like/dislike and threaded comments.
		</p>

		<div class="mt-8 flex flex-wrap gap-3">
			<Button href="/feed" size="lg">Explore Feed</Button>
			{#if auth.isAuthenticated}
				<Button href="/submit" variant="outline" size="lg">Create Post</Button>
			{:else}
				<Button href="/signup" variant="outline" size="lg">Create Account</Button>
			{/if}
		</div>
	</div>
</main>
