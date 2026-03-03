import type { LayoutServerLoad } from './$types';
import { api } from '$convex/_generated/api';
import { createAuth } from '$convex/auth.js';
import {
	createConvexHttpClient,
	getAuthState
} from '@mmailaender/convex-better-auth-svelte/sveltekit';

const isAdminRole = (role: unknown): boolean => {
	if (typeof role === 'string') {
		const normalizedRole = role.toLowerCase();
		return (
			normalizedRole === 'admin' ||
			normalizedRole === 'system-admin' ||
			normalizedRole === 'superadmin' ||
			normalizedRole === 'owner'
		);
	}
	if (Array.isArray(role)) {
		return role.some((entry) => isAdminRole(entry));
	}
	if (role && typeof role === 'object') {
		const roleObject = role as { role?: unknown; name?: unknown };
		return isAdminRole(roleObject.role ?? roleObject.name);
	}
	return false;
};

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
