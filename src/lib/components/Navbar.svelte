<script lang="ts">
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { authClient } from '$lib/auth-client';
	import { Button } from '$lib/components/ui/button';
	import Logo from './Logo.svelte';
	import ThemeToggle from './theme-toggle.svelte';

	const auth = useAuth();
	const currentUserQuery = useQuery(api.auth.getCurrentUser, {}, () => ({
		initialData: (page.data as any).currentUser,
		keepPreviousData: true
	}));
	const currentUser = $derived(currentUserQuery.data);
	const profileHref = $derived(
		currentUser?.username ? `/u/${currentUser.username}` : '/settings/username'
	);

	async function signOut() {
		await authClient.signOut();
		await invalidateAll();
	}
</script>

<nav class="sticky top-0 z-40 border-b border-border/50 bg-background/85 backdrop-blur">
	<div class="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
		<div class="flex items-center gap-5">
			<Logo size="sm" />
			<a
				href="/feed"
				class="text-sm font-medium {page.url.pathname === '/feed'
					? 'text-foreground'
					: 'text-muted-foreground hover:text-foreground'}"
			>
				Feed
			</a>
			<a
				href="/c"
				class="text-sm font-medium {page.url.pathname === '/c' || page.url.pathname.startsWith('/c/')
					? 'text-foreground'
					: 'text-muted-foreground hover:text-foreground'}"
			>
				Communities
			</a>
			{#if auth.isAuthenticated}
				<a
					href="/submit"
					class="text-sm font-medium {page.url.pathname === '/submit'
						? 'text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					Submit
				</a>
				<a
					href="/c/new"
					class="text-sm font-medium {page.url.pathname === '/c/new'
						? 'text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					Create
				</a>
			{/if}
		</div>

		<div class="flex items-center gap-2">
			<ThemeToggle />
			{#if auth.isAuthenticated && currentUser}
				<a
					href={profileHref}
					class="hidden text-sm text-muted-foreground hover:text-foreground sm:inline"
				>
					{currentUser.username ? `u/${currentUser.username}` : currentUser.name}
				</a>
				<Button variant="outline" size="sm" href="/settings">Settings</Button>
				<Button size="sm" onclick={signOut}>Sign out</Button>
			{:else}
				<Button variant="outline" size="sm" href="/signin">Sign in</Button>
				<Button size="sm" href="/signup">Sign up</Button>
			{/if}
		</div>
	</div>
</nav>

