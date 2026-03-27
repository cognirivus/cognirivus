import { v } from 'convex/values';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { components } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { getAuthUser } from './auth';
import { rateLimiter } from './lib/rateLimits';
import { requireUserWithUsername } from './lib/usernameGate';
import { Presence } from '@convex-dev/presence';

const MAX_SCOPE_ITEMS = 200;
const COMMUNITY_ROOM_PREFIX = 'community:';
const DM_ROOM_PREFIX = 'dm:';
const DEFAULT_HEARTBEAT_INTERVAL_MS = 20_000;
const MIN_HEARTBEAT_INTERVAL_MS = 5_000;
const MAX_HEARTBEAT_INTERVAL_MS = 60_000;

const presence = new Presence(components.presence);

const uniqueValues = <T>(values: Array<T>) => [...new Set(values)];

const toPresenceInterval = (value?: number) => {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return DEFAULT_HEARTBEAT_INTERVAL_MS;
	}
	return Math.max(
		MIN_HEARTBEAT_INTERVAL_MS,
		Math.min(MAX_HEARTBEAT_INTERVAL_MS, Math.floor(value))
	);
};

const toPresenceRoomId = (value: string) => {
	const trimmed = value.trim();
	if (!trimmed) {
		throw new Error('roomId is required.');
	}
	return trimmed;
};

const resolvePresenceSessionId = async (
	ctx: MutationCtx,
	userId: string,
	providedSessionId?: string
) => {
	if (typeof providedSessionId === 'string' && providedSessionId.trim()) {
		return providedSessionId.trim();
	}
	const identity = await ctx.auth.getUserIdentity();
	const identitySessionId = (identity as { sessionId?: unknown } | null)?.sessionId;
	if (typeof identitySessionId === 'string' && identitySessionId.trim()) {
		return identitySessionId.trim();
	}
	return `user:${userId}`;
};

const getCommunityFromRoom = async (ctx: QueryCtx | MutationCtx, roomId: string) => {
	const communityId = roomId.slice(COMMUNITY_ROOM_PREFIX.length);
	if (!communityId) {
		throw new Error('Invalid community room id.');
	}
	try {
		return await ctx.db.get(communityId as Id<'communities'>);
	} catch {
		throw new Error('Invalid community room id.');
	}
};

const getConversationFromRoom = async (ctx: QueryCtx | MutationCtx, roomId: string) => {
	const conversationId = roomId.slice(DM_ROOM_PREFIX.length);
	if (!conversationId) {
		throw new Error('Invalid DM room id.');
	}
	try {
		return await ctx.db.get(conversationId as Id<'dm_conversations'>);
	} catch {
		throw new Error('Invalid DM room id.');
	}
};

const assertRoomAccess = async (
	ctx: QueryCtx | MutationCtx,
	roomId: string,
	userAuthId: string
) => {
	if (roomId.startsWith(COMMUNITY_ROOM_PREFIX)) {
		const community = await getCommunityFromRoom(ctx, roomId);
		if (!community) {
			throw new Error('Community not found.');
		}
		const membership = await ctx.db
			.query('community_memberships')
			.withIndex('by_communityId_and_userAuthId', (q) =>
				q.eq('communityId', community._id).eq('userAuthId', userAuthId)
			)
			.unique();
		if (!membership || membership.status !== 'active') {
			throw new Error('Forbidden presence room.');
		}
		return;
	}
	if (roomId.startsWith(DM_ROOM_PREFIX)) {
		const conversation = await getConversationFromRoom(ctx, roomId);
		if (!conversation) {
			throw new Error('Conversation not found.');
		}
		const isParticipant =
			conversation.participant1 === userAuthId || conversation.participant2 === userAuthId;
		if (!isParticipant) {
			throw new Error('Forbidden presence room.');
		}
		return;
	}
	throw new Error('Unsupported presence room.');
};

const listOnlineUserIdsInRoom = async (
	ctx: QueryCtx,
	roomId: string,
	userAuthIds: Array<string>,
	limit: number
) => {
	const desiredIds = uniqueValues(userAuthIds);
	if (desiredIds.length === 0) {
		return [];
	}
	const onlineInRoom = await presence.listRoom(ctx, roomId, true, limit);
	const onlineSet = new Set(onlineInRoom.map((entry) => entry.userId));
	return desiredIds.filter((userAuthId) => onlineSet.has(userAuthId));
};

export const heartbeat = mutation({
	args: {
		roomId: v.string(),
		userId: v.optional(v.string()),
		sessionId: v.optional(v.string()),
		interval: v.optional(v.number())
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await requireUserWithUsername(ctx);
		if (args.userId && args.userId !== user._id) {
			throw new Error('Invalid heartbeat identity');
		}

		await rateLimiter.limit(ctx, 'presenceHeartbeat', { key: user._id, throws: true });
		const roomId = toPresenceRoomId(args.roomId);
		await assertRoomAccess(ctx, roomId, user._id);
		const sessionId = await resolvePresenceSessionId(ctx, user._id, args.sessionId);
		const interval = toPresenceInterval(args.interval);

		await presence.heartbeat(ctx, roomId, user._id, sessionId, interval);

		return null;
	}
});

export const list = query({
	args: {
		roomToken: v.string(),
		limit: v.optional(v.number())
	},
	returns: v.array(
		v.object({
			userId: v.string(),
			online: v.boolean(),
			lastDisconnected: v.number(),
			data: v.optional(v.any())
		})
	),
	handler: async (ctx, args) => {
		const limit =
			typeof args.limit === 'number' && Number.isFinite(args.limit)
				? Math.max(1, Math.floor(args.limit))
				: 104;
		return await presence.list(ctx, args.roomToken, limit);
	}
});

export const disconnect = mutation({
	args: {
		sessionToken: v.string()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		return await presence.disconnect(ctx, args.sessionToken);
	}
});

export const getOnlineUsersForConversations = query({
	args: {
		conversationIds: v.array(v.id('dm_conversations'))
	},
	returns: v.array(v.string()),
	handler: async (ctx, args) => {
		const user = await getAuthUser(ctx);
		if (!user) {
			throw new Error('Not authenticated');
		}

		if (args.conversationIds.length > MAX_SCOPE_ITEMS) {
			throw new Error(`Too many conversation ids. Max ${MAX_SCOPE_ITEMS}.`);
		}

		const onlineUserIds = new Set<string>();
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
			const roomId = `${DM_ROOM_PREFIX}${conversationId}`;
			const online = await listOnlineUserIdsInRoom(ctx, roomId, [otherUserAuthId], 4);
			if (online.length > 0) {
				onlineUserIds.add(otherUserAuthId);
			}
		}

		return [...onlineUserIds];
	}
});

export const getOnlineUsersForCommunity = query({
	args: {
		communityId: v.id('communities')
	},
	returns: v.array(v.string()),
	handler: async (ctx, args) => {
		const user = await getAuthUser(ctx);
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
		const roomId = `${COMMUNITY_ROOM_PREFIX}${args.communityId}`;
		return await listOnlineUserIdsInRoom(ctx, roomId, memberAuthIds, MAX_SCOPE_ITEMS * 2);
	}
});
