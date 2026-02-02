import type { PageLoad } from './$types';

export const load: PageLoad = async () => {
	// The page uses convex-svelte's useQuery hook for reactive data fetching
	// This load function can be used for initial data or server-side checks if needed
	return {};
};
