import { authKit } from '@workos/authkit-sveltekit';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { normalizeReturnTo } from '$lib/server/authRedirect';

export const GET: RequestHandler = async ({ url }) => {
	const signInUrl = await authKit.getSignInUrl({
		returnTo: normalizeReturnTo(url.searchParams.get('redirectTo'))
	});

	throw redirect(302, signInUrl);
};
