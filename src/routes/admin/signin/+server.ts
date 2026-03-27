import { env } from '$env/dynamic/private';
import { authKit } from '@workos/authkit-sveltekit';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { normalizeAdminReturnTo } from '$lib/server/authRedirect';
import { hasAdminPermission } from '$lib/shared/adminRole';

export const GET: RequestHandler = async (event) => {
	const { url, locals } = event;
	const returnTo = normalizeAdminReturnTo(url.searchParams.get('redirectTo'));
	const hasAttemptedSwitch = url.searchParams.get('switched') === '1';

	if (locals.auth?.user) {
		if (
			hasAdminPermission(
				locals.auth.permissions,
				locals.auth.organizationId,
				env.WORKOS_ADMIN_ORG_ID
			)
		) {
			throw redirect(302, returnTo);
		}

		if (
			hasAttemptedSwitch ||
			locals.auth.organizationId === env.WORKOS_ADMIN_ORG_ID
		) {
			return new Response(
				[
					'Admin sign-in failed: this WorkOS session does not have admin access.',
					'Verify that this user is a member of the internal admin organization and that its role grants admin:access.',
					'Then sign out and try /admin/signin again.'
				].join('\n'),
				{
					status: 403,
					headers: {
						'content-type': 'text/plain; charset=utf-8'
					}
				}
			);
		}

		try {
			const response = await authKit.switchOrganization(event, {
				organizationId: env.WORKOS_ADMIN_ORG_ID
			});
			const nextLocation = `/admin/signin?redirectTo=${encodeURIComponent(returnTo)}&switched=1`;
			response.headers.set('Location', nextLocation);
			return response;
		} catch (error) {
			console.error('Failed to switch into WorkOS admin organization', error);
		}
	}

	const signInUrl = await authKit.getSignInUrl({
		returnTo,
		organizationId: env.WORKOS_ADMIN_ORG_ID
	});

	throw redirect(302, signInUrl);
};
