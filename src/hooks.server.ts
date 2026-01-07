import { sequence } from '@sveltejs/kit/hooks';
import { redirect, type Handle } from '@sveltejs/kit';
import {
	createConvexAuthHooks,
	createRouteMatcher
} from '@mmailaender/convex-auth-svelte/sveltekit/server';

const isPublicRoute = createRouteMatcher([
	'/signin'
	// Note: No need to add '/api/auth' here as the handleAuth middleware
	// will process those requests before this middleware runs
]);

// Create auth hooks - convexUrl is automatically detected from environment
const { handleAuth, isAuthenticated } = createConvexAuthHooks();

// Create custom auth handler
const requireAuth: Handle = async ({ event, resolve }) => {
	// Allow public routes
	if (isPublicRoute(event.url.pathname)) {
		return resolve(event);
	}

	// Check if user is authenticated
	if (!(await isAuthenticated(event))) {
		// Redirect to signin if not authenticated
		throw redirect(
			302,
			`/signin?redirectTo=${encodeURIComponent(event.url.pathname + event.url.search)}`
		);
	}

	// User is authenticated, proceed
	return resolve(event);
};

// Apply hooks in sequence
export const handle = sequence(
	handleAuth, // This MUST come first to handle auth requests
	requireAuth // Then enforce authentication
);
