import { mutation, query } from './_generated/server';
import { components } from './_generated/api';
import { v } from 'convex/values';
import { Presence } from '@convex-dev/presence';
import { authComponent } from './auth';

export const presence = new Presence((components as any).presence);

export const heartbeat = mutation({
	args: {
		roomId: v.string(),
		userId: v.string(),
		sessionId: v.string(),
		interval: v.number()
	},
	handler: async (ctx, { roomId, userId, sessionId, interval }) => {
		return await presence.heartbeat(ctx, roomId, userId, sessionId, interval);
	}
});

export const list = query({
	args: { roomToken: v.string() },
	handler: async (ctx, { roomToken }) => {
		const presenceList = await presence.list(ctx, roomToken);

		if (!presenceList || presenceList.length === 0) {
			return [];
		}

		const users = await Promise.all(
			presenceList.map(async (p, index) => {
				try {
					const user = await authComponent.getAnyUserById(ctx, p.userId);
					return {
						...p,
						id: `${p.userId}-${index}`,
						userName: user?.name ?? 'Anonymous',
						userImage: user?.image || undefined
					};
				} catch {
					return {
						...p,
						id: `${p.userId}-${index}`,
						userName: 'Anonymous',
						userImage: undefined
					};
				}
			})
		);
		return users;
	}
});

export const disconnect = mutation({
	args: { sessionToken: v.string() },
	handler: async (ctx, { sessionToken }) => {
		return await presence.disconnect(ctx, sessionToken);
	}
});

export const listRaw = query({
	args: { roomToken: v.string() },
	handler: async (ctx, { roomToken }) => {
		return await presence.list(ctx, roomToken);
	}
});

