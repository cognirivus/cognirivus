import { query } from './_generated/server';
import { v, ConvexError } from 'convex/values';
import { authComponent } from './auth';
import { components } from './_generated/api';

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
/**
 * Search for users by email.
 */
export const search = query({
	args: {
		query: v.string()
	},
	handler: async (ctx, args) => {
		const currentUser = await authComponent.getAuthUser(ctx);
		if (!currentUser || currentUser.role !== 'admin') {
			throw new ConvexError('Only admins can list users');
		}

		const where = args.query
			? [
					{
						field: 'email',
						operator: 'contains' as const,
						value: args.query.toLowerCase()
					}
				]
			: [];

		const result = await ctx.runQuery(components.betterAuth.adapter.findMany, {
			model: 'user',
			where,
			paginationOpts: {
				numItems: 20,
				cursor: null
			}
		});

		return result.page;
	}
});
