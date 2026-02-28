import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { authComponent } from './auth';
import { rateLimiter } from './lib/rateLimits';

const getOptionalAuthUser = async (ctx: any) => {
	try {
		return await authComponent.getAuthUser(ctx);
	} catch {
		return null;
	}
};

const requireAuthenticatedUser = async (ctx: any) => {
	const authUser = await getOptionalAuthUser(ctx);
	if (!authUser) {
		throw new Error('Authentication required');
	}
	return authUser;
};

const ensureUsername = async (ctx: any, authUserId: string) => {
	const profile = await ctx.db
		.query('users_profile')
		.withIndex('by_authId', (q: any) => q.eq('authId', authUserId))
		.unique();
	if (!profile || !profile.username) {
		throw new Error('Please set your username in /settings/username first.');
	}
};

const followUserListItemValidator = v.object({
	authId: v.string(),
	name: v.string(),
	username: v.union(v.null(), v.string()),
	image: v.optional(v.union(v.null(), v.string())),
	followedAt: v.number()
});

const toFollowUserListItem = async (ctx: any, authId: string, followedAt: number) => {
	const profile = await ctx.db
		.query('users_profile')
		.withIndex('by_authId', (q: any) => q.eq('authId', authId))
		.unique();
	return {
		authId,
		name: profile?.name ?? 'Unknown',
		username: profile?.username ?? null,
		image: profile?.image,
		followedAt
	};
};

export const followUser = mutation({
	args: {
		targetAuthId: v.string()
	},
	returns: v.object({
		following: v.boolean()
	}),
	handler: async (ctx, args) => {
		const authUser = await requireAuthenticatedUser(ctx);
		await ensureUsername(ctx, authUser._id);
		await rateLimiter.limit(ctx, 'followUser', { key: authUser._id, throws: true });

		if (authUser._id === args.targetAuthId) {
			throw new Error('You cannot follow yourself.');
		}

		const existing = await ctx.db
			.query('follows_users')
			.withIndex('by_followerAuthId_and_targetAuthId', (q) =>
				q.eq('followerAuthId', authUser._id).eq('targetAuthId', args.targetAuthId)
			)
			.unique();

		if (existing) {
			await ctx.db.delete(existing._id);
			return { following: false };
		}

		await ctx.db.insert('follows_users', {
			followerAuthId: authUser._id,
			targetAuthId: args.targetAuthId,
			createdAt: Date.now()
		});
		return { following: true };
	}
});

export const followCommunity = mutation({
	args: {
		communityId: v.id('communities')
	},
	returns: v.object({
		following: v.boolean()
	}),
	handler: async (ctx, args) => {
		const authUser = await requireAuthenticatedUser(ctx);
		await ensureUsername(ctx, authUser._id);
		await rateLimiter.limit(ctx, 'followCommunity', { key: authUser._id, throws: true });

		const community = await ctx.db.get(args.communityId);
		if (!community) {
			throw new Error('Community not found.');
		}
		const membership = await ctx.db
			.query('community_memberships')
			.withIndex('by_communityId_and_userAuthId', (q) =>
				q.eq('communityId', args.communityId).eq('userAuthId', authUser._id)
			)
			.unique();
		const isImplicitlyFollowing = membership?.status === 'active';

		const existing = await ctx.db
			.query('follows_communities')
			.withIndex('by_followerAuthId_and_communityId', (q) =>
				q.eq('followerAuthId', authUser._id).eq('communityId', args.communityId)
			)
			.unique();

		if (existing) {
			await ctx.db.delete(existing._id);
			return { following: false };
		}
		if (isImplicitlyFollowing) {
			return { following: false };
		}

		await ctx.db.insert('follows_communities', {
			followerAuthId: authUser._id,
			communityId: args.communityId,
			createdAt: Date.now()
		});
		return { following: true };
	}
});

export const listFollowing = query({
	args: {},
	returns: v.object({
		userIds: v.array(v.string()),
		communityIds: v.array(v.id('communities'))
	}),
	handler: async (ctx) => {
		const authUser = await getOptionalAuthUser(ctx);
		if (!authUser) {
			return { userIds: [], communityIds: [] };
		}

		const [userFollows, communityFollows] = await Promise.all([
			ctx.db
				.query('follows_users')
				.withIndex('by_followerAuthId_and_createdAt', (q) => q.eq('followerAuthId', authUser._id))
				.collect(),
			ctx.db
				.query('follows_communities')
				.withIndex('by_followerAuthId_and_createdAt', (q) =>
					q.eq('followerAuthId', authUser._id)
				)
				.collect()
		]);

		return {
			userIds: userFollows.map((row) => row.targetAuthId),
			communityIds: communityFollows.map((row) => row.communityId)
		};
	}
});

export const listFollowers = query({
	args: {
		targetAuthId: v.string(),
		limit: v.optional(v.number())
	},
	returns: v.array(followUserListItemValidator),
	handler: async (ctx, args) => {
		const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
		const followerRows = await ctx.db
			.query('follows_users')
			.withIndex('by_targetAuthId_and_createdAt', (q) => q.eq('targetAuthId', args.targetAuthId))
			.order('desc')
			.take(limit);

		return await Promise.all(
			followerRows.map((row) => toFollowUserListItem(ctx, row.followerAuthId, row.createdAt))
		);
	}
});

export const listFollowingUsers = query({
	args: {
		followerAuthId: v.string(),
		limit: v.optional(v.number())
	},
	returns: v.array(followUserListItemValidator),
	handler: async (ctx, args) => {
		const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
		const followingRows = await ctx.db
			.query('follows_users')
			.withIndex('by_followerAuthId_and_createdAt', (q) =>
				q.eq('followerAuthId', args.followerAuthId)
			)
			.order('desc')
			.take(limit);

		return await Promise.all(
			followingRows.map((row) => toFollowUserListItem(ctx, row.targetAuthId, row.createdAt))
		);
	}
});
