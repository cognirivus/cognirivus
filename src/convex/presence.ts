import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { authComponent } from './auth';
import { rateLimiter } from './lib/rateLimits';

export const heartbeat = mutation({
	args: {
		roomId: v.optional(v.string()),
		userId: v.optional(v.string()),
		sessionId: v.optional(v.string()),
		interval: v.optional(v.number())
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');
		if (args.userId && args.userId !== user._id) {
			throw new Error('Invalid heartbeat identity');
		}

		await rateLimiter.limit(ctx, 'presenceHeartbeat', { key: user._id, throws: true });

		const existing = await ctx.db
			.query('user_presence')
			.withIndex('by_userAuthId', (q) => q.eq('userAuthId', user._id))
			.unique();

		const expiresAt = Date.now() + 30_000;

		if (existing) {
			await ctx.db.patch(existing._id, { expiresAt });
		} else {
			await ctx.db.insert('user_presence', {
				userAuthId: user._id,
				expiresAt
			});
		}

		return null;
	}
});

export const getOnlineUsers = query({
	args: {
		userAuthIds: v.array(v.string())
	},
	returns: v.array(v.string()),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');
		const MAX_USER_IDS = 200;
		if (args.userAuthIds.length > MAX_USER_IDS) {
			throw new Error(`Too many user ids. Max ${MAX_USER_IDS}`);
		}

		const now = Date.now();
		const online: Array<string> = [];

		for (const userAuthId of new Set(args.userAuthIds)) {
			const presence = await ctx.db
				.query('user_presence')
				.withIndex('by_userAuthId', (q) => q.eq('userAuthId', userAuthId))
				.unique();

			if (presence && presence.expiresAt > now) {
				online.push(userAuthId);
			}
		}

		return online;
	}
});
