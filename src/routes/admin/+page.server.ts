import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { currentUser, isAdmin } = await parent();
	if (!currentUser || !isAdmin) {
		throw redirect(302, '/');
	}
	return {};
};
