<script>
	import { useAuth } from '@mmailaender/convex-auth-svelte/sveltekit';

	const { signOut, isAuthenticated } = useAuth();
</script>

<main class="p-8">
	{#if isAuthenticated}
		<h1 class="mb-4 text-3xl font-bold">Welcome back!</h1>
		<p class="mb-6">You are securely logged in.</p>
		<div class="flex gap-4">
			<a
				href="/chat"
				class="rounded bg-blue-600 px-4 py-2 text-white transition hover:bg-blue-700"
			>
				Go to Chat
			</a>
			<button
				onclick={() => signOut()}
				class="rounded bg-red-600 px-4 py-2 text-white transition hover:bg-red-700"
			>
				Sign Out
			</button>
		</div>
	{:else}
		<h1 class="mb-4 text-3xl font-bold">Welcome to Cognirivus Chat!</h1>
		<p class="mb-6">Please sign in to start chatting with AI.</p>
		<a
			href="/signin"
			class="rounded bg-indigo-600 px-4 py-2 text-white transition hover:bg-indigo-700"
		>
			Sign In
		</a>
	{/if}
</main>
