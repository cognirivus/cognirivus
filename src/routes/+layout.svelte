<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { setupConvexAuth } from '@mmailaender/convex-auth-svelte/sveltekit';

	// Import data from +layout.server.ts
	let { children, data } = $props();

	// Set up authentication (automatically initializes Convex client)
	setupConvexAuth({ getServerState: () => data.authState });

	// Alternatively, you have these options:

	// Option 1: Provide a custom Convex URL
	// setupConvexAuth({
	//   getServerState: () => data.authState,
	//   convexUrl: "https://your-convex-deployment.convex.cloud"
	// });

	// Option 2: Provide your own ConvexClient instance
	// import { ConvexClient } from "convex/browser";
	// const client = new ConvexClient("https://your-deployment.convex.cloud");
	// setupConvexAuth({ getServerState: () => data.authState, client });
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
