import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		// Build for Cloudflare Workers.
		adapter: adapter(),
		alias: {
			'@/*': './src/lib/*',
			$convex: './src/convex'
		}
	}
};

export default config;
