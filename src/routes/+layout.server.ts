import type { LayoutServerLoad } from './$types';
import { PUBLIC_CONVEX_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';
import { api } from '$convex/_generated/api';
import { ConvexHttpClient } from 'convex/browser';
import { redirect } from '@sveltejs/kit';
import { hasAdminPermission } from '$lib/shared/adminRole';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.auth?.user || !locals.auth.accessToken) {
		return { authUser: null, currentUser: null, isAdmin: false };
	}

	const client = new ConvexHttpClient(PUBLIC_CONVEX_URL, {
		auth: locals.auth.accessToken
	});
	const authUser = locals.auth.user;
	const name = `${authUser.firstName ?? ''} ${authUser.lastName ?? ''}`.trim() || authUser.email;
	const isAdmin = hasAdminPermission(
		locals.auth.permissions,
		locals.auth.organizationId,
		env.WORKOS_ADMIN_ORG_ID
	);
	const pathname = url.pathname;
	const isProfileRoute = pathname === '/profile' || pathname.startsWith('/profile/');
	const isDocsRoute = pathname === '/docs' || pathname.startsWith('/docs/');
	let currentUser: App.PageData['currentUser'] = null;
	let syncedUser: App.PageData['currentUser'] = null;

	try {
		syncedUser = await client.mutation((api as any).auth.syncCurrentUser, {
			email: authUser.email,
			name,
			image: authUser.profilePictureUrl ?? null,
			organizationId: locals.auth.organizationId ?? null,
			permissions: locals.auth.permissions ?? []
		});
	} catch (e) {
		console.error('Error syncing current user:', e);
	}

	try {
		currentUser = await client.query(api.auth.getCurrentUser, {});
	} catch (e) {
		console.error('Error querying current user:', e);
	}

	if (!currentUser) {
		currentUser = syncedUser;
	}

	if (!currentUser && !isProfileRoute && !isDocsRoute) {
		redirect(302, '/profile');
	}
	if (currentUser && !currentUser.hasUsername && !isProfileRoute && !isDocsRoute) {
		redirect(302, '/profile');
	}
	if (currentUser?.hasUsername && isProfileRoute) {
		redirect(302, '/');
	}

	return {
		authUser: {
			id: authUser.id,
			email: authUser.email,
			firstName: authUser.firstName,
			lastName: authUser.lastName,
			profilePictureUrl: authUser.profilePictureUrl
		},
		currentUser,
		isAdmin
	};
};
