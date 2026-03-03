import type { LayoutServerLoad } from './$types';
import { api } from '$convex/_generated/api';
import { createAuth } from '$convex/auth.js';
import {
	createConvexHttpClient,
	getAuthState
} from '@mmailaender/convex-better-auth-svelte/sveltekit';
import { isAdminRole } from '$lib/shared/adminRole';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	const authState = await getAuthState(createAuth, cookies);

	if (!authState.isAuthenticated || !locals.token) {
		return { authState, currentUser: null, isAdmin: false };
	}

	const client = createConvexHttpClient({ token: locals.token });

	try {
		const currentUser = await client.query(api.auth.getCurrentUser, {});
		return { authState, currentUser, isAdmin: isAdminRole(currentUser?.role) };
	} catch (e) {
		console.error('Error fetching current user:', e);
		return { authState, currentUser: null, isAdmin: false };
	}
};
