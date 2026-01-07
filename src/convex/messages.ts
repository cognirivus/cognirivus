import { mutation } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';

export const send = mutation({
	args: { body: v.string() },
	handler: async (ctx, { body }) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) {
			throw new Error('Not authenticated');
		}
		await ctx.db.insert('messages', {
			body,
			userId
		});
	}
});
