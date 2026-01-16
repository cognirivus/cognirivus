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
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<ModeWatcher />

{#if showNavbar}
	<Navbar />
{:else}
	<div class="fixed top-2 right-2 z-50">
		<ThemeToggle />
	</div>
{/if}

{@render children()}
<Toaster />
