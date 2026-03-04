import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isAdminRole } from '$lib/shared/adminRole';

export const load: PageServerLoad = async ({ parent }) => {
	const { currentUser } = await parent();
	if (!currentUser || !isAdminRole(currentUser.role)) {
		throw redirect(302, '/');
	}
	return {};
};
