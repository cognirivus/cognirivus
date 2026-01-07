<script lang="ts">
	import { useAuth } from '@mmailaender/convex-auth-svelte/sveltekit';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';

	const auth = useAuth();
	const redirectTo = page.url.searchParams.get('redirectTo') || '/';

	$effect(() => {
		if (auth.isAuthenticated) {
			goto(redirectTo);
		}
	});

	let email = $state('');
	let password = $state('');
	let flow = $state<'signIn' | 'signUp'>('signIn');
	let error = $state('');

	async function handleSubmit(event: Event) {
		event.preventDefault();
		error = '';
		try {
			await auth.signIn('password', { email, password, flow });
			await goto(redirectTo);
		} catch (e: any) {
			error = e.message || 'An error occurred during sign in.';
		}
	}
</script>

<div class="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-4 text-zinc-100">
	<div class="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl">
		<h1 class="mb-2 text-center text-3xl font-bold text-white">
			{flow === 'signIn' ? 'Welcome Back' : 'Create Account'}
		</h1>
		<p class="mb-8 text-center text-zinc-400">
			{flow === 'signIn' ? 'Sign in to continue to Cognirivus' : 'Join Cognirivus today'}
		</p>

		<form onsubmit={handleSubmit} class="space-y-6">
			<div>
				<label for="email" class="mb-2 block text-sm font-medium text-zinc-300">Email</label>
				<input
					type="email"
					id="email"
					bind:value={email}
					required
					placeholder="name@example.com"
					class="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 text-white transition outline-none focus:border-transparent focus:ring-2 focus:ring-blue-500"
				/>
			</div>

			<div>
				<label for="password" class="mb-2 block text-sm font-medium text-zinc-300">Password</label>
				<input
					type="password"
					id="password"
					bind:value={password}
					required
					placeholder="••••••••"
					class="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 text-white transition outline-none focus:border-transparent focus:ring-2 focus:ring-blue-500"
				/>
			</div>

			{#if error}
				<p class="rounded-lg border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-400">
					{error}
				</p>
			{/if}

			<button
				type="submit"
				class="w-full rounded-lg bg-blue-600 py-3 font-semibold text-white shadow-lg shadow-blue-600/20 transition-all duration-200 hover:bg-blue-500 active:scale-[0.98]"
			>
				{flow === 'signIn' ? 'Sign In' : 'Sign Up'}
			</button>
		</form>

		<div class="mt-8 border-t border-zinc-800 pt-6 text-center">
			<p class="text-zinc-400">
				{flow === 'signIn' ? "Don't have an account?" : 'Already have an account?'}
				<button
					onclick={() => (flow = flow === 'signIn' ? 'signUp' : 'signIn')}
					class="ml-1 font-medium text-blue-400 transition hover:text-blue-300"
				>
					{flow === 'signIn' ? 'Sign up' : 'Sign in'}
				</button>
			</p>
		</div>
	</div>
</div>
