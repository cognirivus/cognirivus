import { sequence } from '@sveltejs/kit/hooks';
import { redirect, type Handle } from '@sveltejs/kit';
import { createAuth } from '$convex/auth.js';
import { getToken } from '@mmailaender/convex-better-auth-svelte/sveltekit';

const isProtectedRoute = (pathname: string) => {
	if (pathname === '/submit') return true;
	if (pathname === '/settings' || pathname.startsWith('/settings/')) return true;
	if (pathname === '/admin' || pathname.startsWith('/admin/')) return true;
	if (pathname === '/c/new') return true;
	if (/^\/c\/[^/]+\/manage$/.test(pathname)) return true;
	if (pathname === '/chat' || pathname.startsWith('/chat/')) return true;
	if (/^\/c\/[^/]+\/chat$/.test(pathname)) return true;
	return false;
};

const handleAuth: Handle = async ({ event, resolve }) => {
	event.locals.token = await getToken(createAuth, event.cookies);
	return resolve(event);
};

const requireAuth: Handle = async ({ event, resolve }) => {
	const pathname = event.url.pathname;
	if (isProtectedRoute(pathname) && !event.locals.token) {
		throw redirect(
			302,
			`/signin?redirectTo=${encodeURIComponent(event.url.pathname + event.url.search)}`
		);
	}
	return resolve(event);
};

export const handle = sequence(handleAuth, requireAuth);
