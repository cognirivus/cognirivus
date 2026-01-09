<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { setupConvexAuth } from '@mmailaender/convex-auth-svelte/sveltekit';
	import { ModeWatcher } from 'mode-watcher';
	import ThemeToggle from '$lib/components/theme-toggle.svelte';
	import Navbar from '$lib/components/Navbar.svelte';
	import { page } from '$app/state';

	// Import data from +layout.server.ts
	let { children, data } = $props();

	// Set up authentication (automatically initializes Convex client)
	setupConvexAuth({ getServerState: () => data.authState });

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
