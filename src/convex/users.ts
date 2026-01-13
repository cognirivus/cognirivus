import { query } from './_generated/server';
import { getAuthUserId } from '@convex-dev/auth/server';

/**
 * Retrieves the current authenticated user's profile.
 *
 * @returns The user document if authenticated, otherwise null.
 */
export const viewer = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) {
			return null;
		}
		return await ctx.db.get(userId);
	}
});
