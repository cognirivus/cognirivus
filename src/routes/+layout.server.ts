import type { LayoutServerLoad } from './$types';
import { PUBLIC_CONVEX_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';
import { api } from '$convex/_generated/api';
import { ConvexHttpClient } from 'convex/browser';
import { hasAdminPermission } from '$lib/shared/adminRole';

export const load: LayoutServerLoad = async ({ locals }) => {
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

	try {
		await client.mutation((api as any).auth.syncCurrentUser, {
			email: authUser.email,
			name,
			image: authUser.profilePictureUrl ?? null,
			organizationId: locals.auth.organizationId ?? null,
			permissions: locals.auth.permissions ?? []
		});

		const currentUser = await client.query(api.auth.getCurrentUser, {});
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
	} catch (e) {
		console.error('Error fetching current user:', e);
		return {
			authUser: {
				id: authUser.id,
				email: authUser.email,
				firstName: authUser.firstName,
				lastName: authUser.lastName,
				profilePictureUrl: authUser.profilePictureUrl
			},
			currentUser: null,
			isAdmin
		};
	}
};
