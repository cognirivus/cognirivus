<script>
	import { useAuth } from '@mmailaender/convex-auth-svelte/sveltekit';

	const { signOut, isAuthenticated } = useAuth();
</script>

<main class="container mx-auto max-w-4xl p-8 py-20">
	{#if isAuthenticated}
		<h1 class="mb-4 text-4xl font-extrabold tracking-tight lg:text-5xl">Welcome back!</h1>
		<p class="mb-8 text-xl text-muted-foreground">You are securely logged in.</p>
		<div class="flex gap-4">
			<a
				href="/chat"
				class="inline-flex h-11 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
			>
				Go to Chat
			</a>
			<button
				onclick={() => signOut()}
				class="inline-flex h-11 items-center justify-center rounded-md bg-destructive px-8 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
			>
				Sign Out
			</button>
		</div>
	{:else}
		<h1 class="mb-4 text-4xl font-extrabold tracking-tight lg:text-5xl">
			Welcome to <span class="text-primary">Cognirivus</span> Chat!
		</h1>
		<p class="mb-8 text-xl text-muted-foreground">Please sign in to start chatting with AI.</p>
		<a
			href="/signin"
			class="inline-flex h-11 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
		>
			Sign In
		</a>
	{/if}
</main>
