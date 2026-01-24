import { redirect } from '@sveltejs/kit';
import { api } from '$convex/_generated/api';
import type { LayoutServerLoad } from './$types';
import { createConvexHttpClient } from '@mmailaender/convex-better-auth-svelte/sveltekit';

export const load: LayoutServerLoad = async ({ params, locals }) => {
	const groupId = params.id as any;
	const token = locals.token;

	if (!token) {
		throw redirect(302, '/signin');
	}

	const client = createConvexHttpClient({ token });

	try {
		// Fetch group details including membership status
		const group = await client.query(api.groups.get, { groupId });

		if (!group) {
			// Group doesn't exist
			throw redirect(302, '/groups');
		}

		if (group.membershipStatus !== 'active') {
			// Not a member or pending member
			throw redirect(302, '/groups');
		}

		return {
			group
		};
	} catch (e: any) {
		if (e.status === 302) throw e;
		console.error('Error in group layout load:', e);
		throw redirect(302, '/groups');
	}
};
