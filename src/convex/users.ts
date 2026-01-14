import { query } from './_generated/server';

/**
 * Retrieves the current authenticated user's profile.
 *
 * @returns The user identity if authenticated, otherwise null.
 */
export const viewer = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return null;
		return { id: identity.subject, email: identity.email, name: identity.name };
	}
});
