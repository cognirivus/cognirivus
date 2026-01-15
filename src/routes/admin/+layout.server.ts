import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ parent }) => {
	const data = await parent();
	const currentUser = data.currentUser;

	const hasAdminRole = (r: any) => {
		if (!r) return false;
		if (Array.isArray(r)) return r.includes('admin');
		return r === 'admin';
	};

	if (!currentUser || !hasAdminRole(currentUser.role)) {
		console.error('ADMIN ACCESS DENIED:', {
			hasUser: !!currentUser,
			email: currentUser?.email,
			role: currentUser?.role
		});
		throw redirect(302, '/');
	}

	return {
		user: currentUser
	};
};
