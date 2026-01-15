import { query } from './_generated/server';
import { authComponent } from './auth';

/**
 * Retrieves the current authenticated user's profile.
 *
 * @returns The user identity if authenticated, otherwise null.
 */
export const viewer = query({
	args: {},
	handler: async (ctx) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return null;
		return { id: user._id, email: user.email, name: user.name };
	}
});
