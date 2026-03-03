import { v } from 'convex/values';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { authComponent } from './auth';
import { rateLimiter } from './lib/rateLimits';

const MAX_SCOPE_ITEMS = 200;

const uniqueValues = <T>(values: Array<T>) => [...new Set(values)];

const listOnlineUserIds = async (ctx: QueryCtx | MutationCtx, userAuthIds: Array<string>) => {
	const now = Date.now();
	const online: Array<string> = [];

	for (const userAuthId of uniqueValues(userAuthIds)) {
		const presence = await ctx.db
			.query('user_presence')
			.withIndex('by_userAuthId', (q) => q.eq('userAuthId', userAuthId))
			.unique();

		if (presence && presence.expiresAt > now) {
			online.push(userAuthId);
		}
	}

	return online;
};

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

export const getOnlineUsersForConversations = query({
	args: {
		conversationIds: v.array(v.id('dm_conversations'))
	},
	returns: v.array(v.string()),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) {
			throw new Error('Not authenticated');
		}

		if (args.conversationIds.length > MAX_SCOPE_ITEMS) {
			throw new Error(`Too many conversation ids. Max ${MAX_SCOPE_ITEMS}.`);
		}

		const otherUserIds = new Set<string>();
		for (const conversationId of uniqueValues(args.conversationIds)) {
			const conversation = await ctx.db.get(conversationId);
			if (!conversation) {
				continue;
			}

			const isParticipant =
				conversation.participant1 === user._id || conversation.participant2 === user._id;
			if (!isParticipant) {
				throw new Error('Forbidden presence scope.');
			}

			const otherUserAuthId =
				conversation.participant1 === user._id
					? conversation.participant2
					: conversation.participant1;
			otherUserIds.add(otherUserAuthId);
		}

		return await listOnlineUserIds(ctx, [...otherUserIds]);
	}
});

export const getOnlineUsersForCommunity = query({
	args: {
		communityId: v.id('communities')
	},
	returns: v.array(v.string()),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) {
			throw new Error('Not authenticated');
		}

		const community = await ctx.db.get(args.communityId);
		if (!community) {
			throw new Error('Community not found');
		}

		if (community.visibility === 'private') {
			const membership = await ctx.db
				.query('community_memberships')
				.withIndex('by_communityId_and_userAuthId', (q) =>
					q.eq('communityId', args.communityId).eq('userAuthId', user._id)
				)
				.unique();
			if (!membership || membership.status !== 'active') {
				throw new Error('Forbidden presence scope.');
			}
		}

		const activeMemberships = await ctx.db
			.query('community_memberships')
			.withIndex('by_communityId_and_status', (q) =>
				q.eq('communityId', args.communityId).eq('status', 'active')
			)
			.take(MAX_SCOPE_ITEMS);

		const memberAuthIds = activeMemberships.map((membership) => membership.userAuthId);
		return await listOnlineUserIds(ctx, memberAuthIds);
	}
});
