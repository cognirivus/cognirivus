import { env } from '$env/dynamic/private';
import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { authKitHandle, configureAuthKit } from '@workos/authkit-sveltekit';
import { hasAdminPermission } from '$lib/shared/adminRole';

configureAuthKit({
	clientId: env.WORKOS_CLIENT_ID,
	apiKey: env.WORKOS_API_KEY,
	redirectUri: env.WORKOS_REDIRECT_URI,
	cookiePassword: env.WORKOS_COOKIE_PASSWORD
});

const isProtectedRoute = (pathname: string) => {
	if (pathname === '/submit') return true;
	if (pathname === '/settings' || pathname.startsWith('/settings/')) return true;
	if (pathname === '/c/new') return true;
	if (/^\/c\/[^/]+\/manage$/.test(pathname)) return true;
	if (pathname === '/chat' || pathname.startsWith('/chat/')) return true;
	if (/^\/c\/[^/]+\/chat$/.test(pathname)) return true;
	return false;
};

const handleAuth = authKitHandle();

const requireAuth: Handle = async ({ event, resolve }) => {
	const pathname = event.url.pathname;

	if (pathname === '/admin' || pathname.startsWith('/admin/')) {
		if (pathname === '/admin/signin') {
			return resolve(event);
		}

		if (!event.locals.auth?.user) {
			throw redirect(
				302,
				`/admin/signin?redirectTo=${encodeURIComponent(event.url.pathname + event.url.search)}`
			);
		}

		if (
			!hasAdminPermission(
				event.locals.auth.permissions,
				event.locals.auth.organizationId,
				env.WORKOS_ADMIN_ORG_ID
			)
		) {
			throw redirect(
				302,
				`/admin/signin?redirectTo=${encodeURIComponent(event.url.pathname + event.url.search)}`
			);
		}

		return resolve(event);
	}

	if (isProtectedRoute(pathname) && !event.locals.auth?.user) {
		throw redirect(
			302,
			`/signin?redirectTo=${encodeURIComponent(event.url.pathname + event.url.search)}`
		);
	}

	return resolve(event);
};

export const handle = sequence(handleAuth, requireAuth);
