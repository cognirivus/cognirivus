<script>
	import { useAuth } from '@mmailaender/convex-auth-svelte/sveltekit';

	const { signOut } = useAuth();
</script>

<main class="p-8">
	<h1 class="mb-4 text-3xl font-bold">Welcome, authenticated user!</h1>
	<p class="mb-6">You are now securely logged in.</p>
	<button
		onclick={() => signOut()}
		class="rounded bg-red-600 px-4 py-2 text-white transition hover:bg-red-700"
	>
		Sign Out
	</button>
</main>
