import { v } from 'convex/values';
import { internal } from './_generated/api';
import {
	internalMutation,
	mutation,
	query,
	type MutationCtx,
	type QueryCtx
} from './_generated/server';
import type { Id } from './_generated/dataModel';
import { authComponent } from './auth';
import { rateLimiter } from './lib/rateLimits';

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
const RESERVED_USERNAMES = new Set([
	'admin',
	'api',
	'auth',
	'c',
	'feed',
	'post',
	'settings',
	'signin',
	'signup',
	'submit',
	'u'
]);

const normalizeUsername = (value: string) => value.trim().toLowerCase();

const profileSummaryValidator = v.object({
	authId: v.string(),
	email: v.string(),
	name: v.string(),
	image: v.optional(v.union(v.null(), v.string())),
	username: v.union(v.null(), v.string()),
	bio: v.optional(v.string()),
	createdAt: v.number(),
	updatedAt: v.number(),
	postCount: v.number(),
	followerCount: v.number(),
	followingCount: v.number()
});

const getOptionalAuthUser = async (ctx: QueryCtx | MutationCtx) => {
	try {
		return await authComponent.getAuthUser(ctx);
	} catch {
		return null;
	}
};

const requireAuthenticatedUser = async (ctx: QueryCtx | MutationCtx) => {
	const authUser = await getOptionalAuthUser(ctx);
	if (!authUser) {
		throw new Error('Authentication required');
	}
	return authUser;
};

const toProfileSummary = async (ctx: QueryCtx | MutationCtx, authId: string) => {
	const profile = await ctx.db
		.query('users_profile')
		.withIndex('by_authId', (q) => q.eq('authId', authId))
		.unique();

	if (!profile) {
		return null;
	}

	const [postCount, followerCount, followingCount] = await Promise.all([
		ctx.db
			.query('posts')
			.withIndex('by_authorAuthId_and_createdAt', (q) => q.eq('authorAuthId', authId))
			.filter((q) => q.neq(q.field('visibility'), 'private'))
			.collect()
			.then((rows) => rows.length),
		ctx.db
			.query('follows_users')
			.withIndex('by_targetAuthId_and_createdAt', (q) => q.eq('targetAuthId', authId))
			.collect()
			.then((rows) => rows.length),
		ctx.db
			.query('follows_users')
			.withIndex('by_followerAuthId_and_createdAt', (q) => q.eq('followerAuthId', authId))
			.collect()
			.then((rows) => rows.length)
	]);

	return {
		authId: profile.authId,
		email: profile.email,
		name: profile.name,
		image: profile.image,
		username: profile.username ?? null,
		bio: profile.bio,
		createdAt: profile.createdAt,
		updatedAt: profile.updatedAt,
		postCount,
		followerCount,
		followingCount
	};
};

export const ensureProfileForAuth = internalMutation({
	args: {
		authId: v.string(),
		email: v.string(),
		name: v.string(),
		image: v.optional(v.union(v.null(), v.string()))
	},
	returns: v.id('users_profile'),
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query('users_profile')
			.withIndex('by_authId', (q) => q.eq('authId', args.authId))
			.unique();

		if (existing) {
			await ctx.db.patch(existing._id, {
				email: args.email,
				name: args.name,
				image: args.image,
				updatedAt: Date.now()
			});
			return existing._id;
		}

		const now = Date.now();
		return await ctx.db.insert('users_profile', {
			authId: args.authId,
			email: args.email,
			name: args.name,
			image: args.image,
			createdAt: now,
			updatedAt: now
		});
	}
});

export const setUsername = mutation({
	args: {
		username: v.string()
	},
	returns: v.object({
		username: v.string()
	}),
	handler: async (ctx, args) => {
		const authUser = await requireAuthenticatedUser(ctx);
		await rateLimiter.limit(ctx, 'setUsername', { key: authUser._id, throws: true });

		const username = normalizeUsername(args.username);
		if (!USERNAME_PATTERN.test(username)) {
			throw new Error('Username must match [a-z0-9_]{3,20}.');
		}
		if (RESERVED_USERNAMES.has(username)) {
			throw new Error('This username is reserved.');
		}

		const profileId: Id<'users_profile'> = await ctx.runMutation(
			internal.profiles.ensureProfileForAuth,
			{
				authId: authUser._id,
				email: authUser.email,
				name: authUser.name,
				image: authUser.image
			}
		);
		const profile = await ctx.db.get(profileId);
		if (!profile) {
			throw new Error('Profile not found.');
		}

		if (profile.username) {
			if (profile.username !== username) {
				throw new Error('Username is immutable once set.');
			}
			return { username: profile.username };
		}

		const taken = await ctx.db
			.query('users_profile')
			.withIndex('by_username', (q) => q.eq('username', username))
			.unique();

		if (taken && taken._id !== profile._id) {
			throw new Error('Username is already taken.');
		}

		await ctx.db.patch(profile._id, {
			username,
			usernameSetAt: profile.usernameSetAt ?? Date.now(),
			updatedAt: Date.now()
		});

		return { username };
	}
});

export const getMyProfile = query({
	args: {},
	returns: v.union(v.null(), profileSummaryValidator),
	handler: async (ctx) => {
		const authUser = await getOptionalAuthUser(ctx);
		if (!authUser) {
			return null;
		}
		const profile = await toProfileSummary(ctx, authUser._id);
		return profile;
	}
});

export const getByUsername = query({
	args: {
		username: v.string()
	},
	returns: v.union(v.null(), profileSummaryValidator),
	handler: async (ctx, args) => {
		const username = normalizeUsername(args.username);
		const profile = await ctx.db
			.query('users_profile')
			.withIndex('by_username', (q) => q.eq('username', username))
			.unique();

		if (!profile) {
			return null;
		}

		const summary = await toProfileSummary(ctx, profile.authId);
		return summary;
	}
});
