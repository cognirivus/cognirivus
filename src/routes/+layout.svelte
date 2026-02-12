<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { createSvelteAuthClient } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { authClient } from '$lib/auth-client';
	import { ModeWatcher } from 'mode-watcher';
	import ThemeToggle from '$lib/components/theme-toggle.svelte';
	import Navbar from '$lib/components/Navbar.svelte';
	import { page } from '$app/state';
	import Toaster from '$lib/components/ui/sonner/sonner.svelte';

	let { children, data } = $props();

	createSvelteAuthClient({
		authClient,
		getServerState: () => data.authState
	});

	const showNavbar = $derived(
		!page.url.pathname.startsWith('/chat') && !page.url.pathname.startsWith('/image')
	);

	const isAppPage = $derived(
		page.url.pathname.startsWith('/mcqs') ||
			page.url.pathname.startsWith('/chat') ||
			page.url.pathname.startsWith('/image')
	);
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<ModeWatcher />

<div class="flex h-[100dvh] flex-col {isAppPage ? 'overflow-hidden' : 'overflow-auto'}">
	{#if showNavbar}
		<Navbar />
	{:else}
		<div class="fixed top-1 right-1 z-50 lg:top-2 lg:right-2">
			<ThemeToggle />
		</div>
	{/if}

	{@render children()}
</div>
<Toaster />
