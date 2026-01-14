<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';

	const auth = useAuth();
	const redirectTo = page.url.searchParams.get('redirectTo') || '/';

	$effect(() => {
		if (auth.isAuthenticated) {
			goto(redirectTo);
		}
	});

	let name = $state('');
	let email = $state('');
	let password = $state('');
	let error = $state('');

	async function handleSubmit(event: Event) {
		event.preventDefault();
		error = '';
		try {
			await authClient.signUp.email(
				{ name, email, password },
				{
					onError: (ctx) => {
						error = ctx.error.message;
					}
				}
			);
		} catch (e: any) {
			error = e.message || 'An error occurred during sign up.';
		}
	}
</script>

<div class="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-foreground">
	<div class="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-2xl">
		<h1 class="mb-2 text-center text-3xl font-bold">Create Account</h1>
		<p class="mb-8 text-center text-muted-foreground">Join Cognirivus today</p>

		<form onsubmit={handleSubmit} class="space-y-6">
			<div class="space-y-2">
				<label for="name" class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Name</label>
				<input
					type="text"
					id="name"
					bind:value={name}
					required
					placeholder="Your name"
					class="flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
				/>
			</div>

			<div class="space-y-2">
				<label for="email" class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Email</label>
				<input
					type="email"
					id="email"
					bind:value={email}
					required
					placeholder="name@example.com"
					class="flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
				/>
			</div>

			<div class="space-y-2">
				<label for="password" class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Password</label>
				<input
					type="password"
					id="password"
					bind:value={password}
					required
					placeholder="••••••••"
					class="flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
				/>
			</div>

			{#if error}
				<p class="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
					{error}
				</p>
			{/if}

			<button
				type="submit"
				class="inline-flex h-12 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all duration-200 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
			>
				Sign Up
			</button>
		</form>

		<div class="mt-8 border-t border-border pt-6 text-center">
			<p class="text-muted-foreground">
				Already have an account?
				<a href="/signin" class="ml-1 font-medium text-primary transition hover:underline">
					Sign in
				</a>
			</p>
		</div>
	</div>
</div>
