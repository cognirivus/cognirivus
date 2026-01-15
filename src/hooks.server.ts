import { sequence } from '@sveltejs/kit/hooks';
import { redirect, type Handle } from '@sveltejs/kit';
import { createAuth } from '$convex/auth.js';
import { getToken } from '@mmailaender/convex-better-auth-svelte/sveltekit';

const isPublicRoute = (pathname: string) => {
	const publicRoutes = ['/', '/signin', '/api/auth'];
	return publicRoutes.some((route) => pathname === route || pathname.startsWith('/api/auth'));
};

const handleAuth: Handle = async ({ event, resolve }) => {
	event.locals.token = await getToken(createAuth, event.cookies);
	return resolve(event);
};

const requireAuth: Handle = async ({ event, resolve }) => {
	if (isPublicRoute(event.url.pathname)) {
		return resolve(event);
	}

	if (!event.locals.token) {
		throw redirect(
			302,
			`/signin?redirectTo=${encodeURIComponent(event.url.pathname + event.url.search)}`
		);
	}

	return resolve(event);
};

export const handle = sequence(handleAuth, requireAuth);
