<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { ArrowRight } from '@lucide/svelte';

	const auth = useAuth();
	const redirectTo = page.url.searchParams.get('redirectTo') || '/';

	$effect(() => {
		if (auth.isAuthenticated) {
			goto(redirectTo);
		}
	});

	let email = $state('');
	let password = $state('');
	let error = $state('');
	let isLoading = $state(false);

	async function handleSubmit(event: Event) {
		event.preventDefault();
		error = '';
		isLoading = true;
		try {
			await authClient.signIn.email(
				{ email, password },
				{
					onError: (ctx) => {
						error = ctx.error.message;
					}
				}
			);
		} catch (e: any) {
			error = e.message || 'An error occurred during sign in.';
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="flex min-h-0 flex-1">
	<!-- Left side - Form -->
	<div class="flex w-full flex-col justify-center px-6 py-8 lg:w-1/2 lg:px-12">
		<div class="mx-auto w-full max-w-sm">
			<div class="mb-8">
				<h1 class="text-2xl font-semibold tracking-tight text-foreground">Welcome back</h1>
				<p class="mt-2 text-sm text-muted-foreground">
					Sign in to your account to continue learning
				</p>
			</div>

			<form onsubmit={handleSubmit} class="space-y-4">
				<div class="space-y-2">
					<Label for="email">Email</Label>
					<Input
						type="email"
						id="email"
						bind:value={email}
						required
						placeholder="name@example.com"
						class="h-11"
					/>
				</div>

				<div class="space-y-2">
					<Label for="password">Password</Label>
					<Input
						type="password"
						id="password"
						bind:value={password}
						required
						placeholder="Enter your password"
						class="h-11"
					/>
				</div>

				{#if error}
					<div
						class="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
					>
						{error}
					</div>
				{/if}

				<Button type="submit" class="group h-11 w-full gap-2" disabled={isLoading}>
					{#if isLoading}
						Signing in...
					{:else}
						Sign In
						<ArrowRight class="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
					{/if}
				</Button>
			</form>

			<p class="mt-6 text-center text-sm text-muted-foreground">
				Don't have an account?
				<a href="/signup" class="font-medium text-foreground underline-offset-4 hover:underline">
					Sign up
				</a>
			</p>
			<p class="text-center text-xs text-muted-foreground">
				By continuing, you agree to our Terms of Service.
			</p>
		</div>
	</div>

	<!-- Right side - Decorative -->
	<div class="hidden bg-foreground lg:flex lg:w-1/2 lg:items-center lg:justify-center">
		<div class="max-w-md px-12 text-center">
			<blockquote class="space-y-4">
				<p class="text-xl leading-relaxed font-medium text-background/90">
					"All that we are is the result of what we have thought: it is founded on our thoughts, it
					is made up of our thoughts."
				</p>
				<footer class="text-sm text-background/60">
					<cite>Dhammapada</cite>, Chapter I - The Twin-Verses<br />
				</footer>
			</blockquote>
		</div>
	</div>
</div>
