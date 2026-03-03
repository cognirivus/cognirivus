import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

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

export const load: PageServerLoad = async ({ parent }) => {
	const { currentUser } = await parent();
	if (!currentUser || !isAdminRole(currentUser.role)) {
		throw redirect(302, '/');
	}
	return {};
};
