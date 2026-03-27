import type { PageServerLoad } from './$types';
import { redirectGuestFromPublicCommunitySubpage } from '$lib/server/communitySubpageAccess';

export const load: PageServerLoad = async ({ locals, params }) => {
	await redirectGuestFromPublicCommunitySubpage({
		accessToken: locals.auth?.accessToken,
		slug: params.slug
	});

	return {};
};
