import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { mutation, query } from './_generated/server';
import { getAuthUser } from './auth';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { rateLimiter } from './lib/rateLimits';

const COMMUNITY_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;

const visibilityValidator = v.union(v.literal('public'), v.literal('private'));

const communitySummaryValidator = v.object({
	_id: v.id('communities'),
	slug: v.string(),
	name: v.string(),
	description: v.optional(v.string()),
	visibility: visibilityValidator,
	ownerAuthId: v.string(),
	createdAt: v.number(),
	updatedAt: v.number(),
	memberCount: v.number()
});

const membershipStatusValidator = v.union(
	v.literal('none'),
	v.literal('pending'),
	v.literal('active'),
	v.literal('rejected')
);
const membershipRoleValidator = v.union(
	v.literal('owner'),
	v.literal('admin'),
	v.literal('member')
);

const myCommunityValidator = v.object({
	community: communitySummaryValidator,
	membershipStatus: membershipStatusValidator,
	membershipRole: membershipRoleValidator,
	requestedAt: v.number()
});

const pendingRequestValidator = v.object({
	membershipId: v.id('community_memberships'),
	userAuthId: v.string(),
	requestedAt: v.number(),
	requesterName: v.string(),
	requesterEmail: v.string(),
	requesterUsername: v.union(v.null(), v.string())
});

type AuthenticatedUser = {
	_id: string;
	email: string;
	name: string;
	image?: string | null;
};

const getOptionalAuthUser = async (ctx: any) => {
	try {
		return await getAuthUser(ctx);
	} catch {
		return null;
	}
};

const requireAuthenticatedUser = async (ctx: any): Promise<AuthenticatedUser> => {
	const authUser = await getOptionalAuthUser(ctx);
	if (!authUser) {
		throw new Error('Authentication required');
	}
	return {
		_id: authUser._id,
		email: authUser.email,
		name: authUser.name,
		image: authUser.image
	};
};

const normalizeSlug = (slug: string) => slug.trim().toLowerCase();

const ensureUsername = async (ctx: any, authUser: AuthenticatedUser): Promise<void> => {
	const profileId = await ctx.runMutation(internal.profiles.ensureProfileForAuth, {
		authId: authUser._id,
		email: authUser.email,
		name: authUser.name,
		image: authUser.image
	});
	const profile = await ctx.db.get(profileId);
	if (!profile || !profile.username) {
		throw new Error('Please set your username in /settings/username first.');
	}
};

const getMembership = async (ctx: any, communityId: Id<'communities'>, userAuthId: string) => {
	return await ctx.db
		.query('community_memberships')
		.withIndex('by_communityId_and_userAuthId', (q: any) =>
			q.eq('communityId', communityId).eq('userAuthId', userAuthId)
		)
		.unique();
};

const getMemberCount = async (ctx: any, communityId: Id<'communities'>) => {
	const members = await ctx.db
		.query('community_memberships')
		.withIndex('by_communityId_and_status', (q: any) =>
			q.eq('communityId', communityId).eq('status', 'active')
		)
		.collect();
	return members.length;
};

const ensureCommunityFollow = async (
	ctx: any,
	userAuthId: string,
	communityId: Id<'communities'>,
	now: number
) => {
	const existingFollow = await ctx.db
		.query('follows_communities')
		.withIndex('by_followerAuthId_and_communityId', (q: any) =>
			q.eq('followerAuthId', userAuthId).eq('communityId', communityId)
		)
		.unique();
	if (existingFollow) {
		return;
	}
	await ctx.db.insert('follows_communities', {
		followerAuthId: userAuthId,
		communityId,
		createdAt: now
	});
};

const toCommunitySummary = async (ctx: any, community: any) => {
	return {
		_id: community._id,
		slug: community.slug,
		name: community.name,
		description: community.description,
		visibility: community.visibility,
		ownerAuthId: community.ownerAuthId,
		createdAt: community.createdAt,
		updatedAt: community.updatedAt,
		memberCount: await getMemberCount(ctx, community._id)
	};
};

const requireManager = async (ctx: any, communityId: Id<'communities'>, userAuthId: string) => {
	const membership = await getMembership(ctx, communityId, userAuthId);
	if (!membership || membership.status !== 'active') {
		throw new Error('Active membership required');
	}
	if (membership.role !== 'owner' && membership.role !== 'admin') {
		throw new Error('Community manager permission required');
	}
	return membership;
};

export const create = mutation({
	args: {
		name: v.string(),
		slug: v.string(),
		description: v.optional(v.string()),
		visibility: visibilityValidator
	},
	returns: v.id('communities'),
	handler: async (ctx, args): Promise<Id<'communities'>> => {
		const authUser = await requireAuthenticatedUser(ctx);
		await rateLimiter.limit(ctx, 'createCommunity', { key: authUser._id, throws: true });
		await ensureUsername(ctx, authUser);

		const slug = normalizeSlug(args.slug);
		if (!COMMUNITY_SLUG_PATTERN.test(slug)) {
			throw new Error('Community slug format is invalid.');
		}

		const existing = await ctx.db
			.query('communities')
			.withIndex('by_slug', (q) => q.eq('slug', slug))
			.unique();
		if (existing) {
			throw new Error('Community slug already exists.');
		}

		const now = Date.now();
		const communityId = await ctx.db.insert('communities', {
			slug,
			name: args.name.trim(),
			description: args.description?.trim(),
			visibility: args.visibility,
			ownerAuthId: authUser._id,
			createdAt: now,
			updatedAt: now
		});

		await ctx.db.insert('community_memberships', {
			communityId,
			userAuthId: authUser._id,
			role: 'owner',
			status: 'active',
			requestedAt: now,
			respondedAt: now,
			createdAt: now
		});

		await ensureCommunityFollow(ctx, authUser._id, communityId, now);

		return communityId;
	}
});

export const requestJoin = mutation({
	args: {
		communityId: v.id('communities')
	},
	returns: v.object({
		status: v.union(v.literal('active'), v.literal('pending'))
	}),
	handler: async (ctx, args): Promise<{ status: 'active' | 'pending' }> => {
		const authUser = await requireAuthenticatedUser(ctx);
		await rateLimiter.limit(ctx, 'requestJoin', { key: authUser._id, throws: true });
		await ensureUsername(ctx, authUser);

		const community = await ctx.db.get(args.communityId);
		if (!community) {
			throw new Error('Community not found.');
		}

		const now = Date.now();
		const existing = await getMembership(ctx, args.communityId, authUser._id);

		if (community.visibility === 'public') {
			if (existing?.status === 'active') {
				await ensureCommunityFollow(ctx, authUser._id, args.communityId, now);
				return { status: 'active' as const };
			}
			if (existing) {
				await ctx.db.patch(existing._id, {
					status: 'active',
					role: existing.role === 'owner' || existing.role === 'admin' ? existing.role : 'member',
					respondedAt: now
				});
			} else {
				await ctx.db.insert('community_memberships', {
					communityId: args.communityId,
					userAuthId: authUser._id,
					role: 'member',
					status: 'active',
					requestedAt: now,
					respondedAt: now,
					createdAt: now
				});
			}
			await ensureCommunityFollow(ctx, authUser._id, args.communityId, now);
			return { status: 'active' as const };
		}

		if (existing?.status === 'active') {
			await ensureCommunityFollow(ctx, authUser._id, args.communityId, now);
			return { status: 'active' as const };
		}
		if (existing?.status === 'pending') {
			return { status: 'pending' as const };
		}

		if (existing) {
			await ctx.db.patch(existing._id, {
				status: 'pending',
				role: 'member',
				requestedAt: now
			});
		} else {
			await ctx.db.insert('community_memberships', {
				communityId: args.communityId,
				userAuthId: authUser._id,
				role: 'member',
				status: 'pending',
				requestedAt: now,
				createdAt: now
			});
		}

		return { status: 'pending' as const };
	}
});

export const approveJoin = mutation({
	args: {
		membershipId: v.id('community_memberships')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const authUser = await requireAuthenticatedUser(ctx);
		await rateLimiter.limit(ctx, 'moderateJoin', { key: authUser._id, throws: true });

		const membership = await ctx.db.get(args.membershipId);
		if (!membership) {
			throw new Error('Membership not found.');
		}
		await requireManager(ctx, membership.communityId, authUser._id);
		if (membership.status !== 'pending') {
			throw new Error('Only pending requests can be approved.');
		}

		await ctx.db.patch(membership._id, {
			status: 'active',
			role: 'member',
			respondedAt: Date.now()
		});
		await ensureCommunityFollow(ctx, membership.userAuthId, membership.communityId, Date.now());
		return null;
	}
});

export const rejectJoin = mutation({
	args: {
		membershipId: v.id('community_memberships')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const authUser = await requireAuthenticatedUser(ctx);
		await rateLimiter.limit(ctx, 'moderateJoin', { key: authUser._id, throws: true });

		const membership = await ctx.db.get(args.membershipId);
		if (!membership) {
			throw new Error('Membership not found.');
		}
		await requireManager(ctx, membership.communityId, authUser._id);
		if (membership.status !== 'pending') {
			throw new Error('Only pending requests can be rejected.');
		}

		await ctx.db.patch(membership._id, {
			status: 'rejected',
			respondedAt: Date.now()
		});
		return null;
	}
});

export const listPublic = query({
	args: {
		limit: v.optional(v.number())
	},
	returns: v.array(communitySummaryValidator),
	handler: async (ctx, args) => {
		const limit = Math.min(Math.max(args.limit ?? 30, 1), 100);
		const communities = await ctx.db
			.query('communities')
			.withIndex('by_visibility_and_createdAt', (q) => q.eq('visibility', 'public'))
			.order('desc')
			.take(limit);

		return await Promise.all(
			communities.map(async (community) => toCommunitySummary(ctx, community))
		);
	}
});

export const listMine = query({
	args: {},
	returns: v.array(myCommunityValidator),
	handler: async (ctx) => {
		const authUser = await getOptionalAuthUser(ctx);
		if (!authUser) {
			return [];
		}

		const [activeMemberships, pendingMemberships] = await Promise.all([
			ctx.db
				.query('community_memberships')
				.withIndex('by_userAuthId_and_status', (q) =>
					q.eq('userAuthId', authUser._id).eq('status', 'active')
				)
				.collect(),
			ctx.db
				.query('community_memberships')
				.withIndex('by_userAuthId_and_status', (q) =>
					q.eq('userAuthId', authUser._id).eq('status', 'pending')
				)
				.collect()
		]);

		const memberships = [...activeMemberships, ...pendingMemberships].sort(
			(a, b) => b.requestedAt - a.requestedAt
		);

		const items = await Promise.all(
			memberships.map(async (membership) => {
				const community = await ctx.db.get(membership.communityId);
				if (!community) {
					return null;
				}

				return {
					community: await toCommunitySummary(ctx, community),
					membershipStatus: membership.status,
					membershipRole: membership.role,
					requestedAt: membership.requestedAt
				};
			})
		);

		return items.filter((item): item is NonNullable<typeof item> => item !== null);
	}
});

export const listPendingRequests = query({
	args: {
		communityId: v.id('communities')
	},
	returns: v.array(pendingRequestValidator),
	handler: async (ctx, args) => {
		const authUser = await requireAuthenticatedUser(ctx);
		await requireManager(ctx, args.communityId, authUser._id);

		const pendingMemberships = await ctx.db
			.query('community_memberships')
			.withIndex('by_communityId_and_status', (q) =>
				q.eq('communityId', args.communityId).eq('status', 'pending')
			)
			.collect();

		return await Promise.all(
			pendingMemberships.map(async (membership) => {
				const profile = await ctx.db
					.query('users_profile')
					.withIndex('by_authId', (q) => q.eq('authId', membership.userAuthId))
					.unique();

				return {
					membershipId: membership._id,
					userAuthId: membership.userAuthId,
					requestedAt: membership.requestedAt,
					requesterName: profile?.name ?? 'Unknown',
					requesterEmail: profile?.email ?? 'unknown@example.com',
					requesterUsername: profile?.username ?? null
				};
			})
		);
	}
});

export const listMembers = query({
	args: {
		communityId: v.id('communities'),
		paginationOpts: paginationOptsValidator
	},
	handler: async (ctx, args) => {
		const community = await ctx.db.get(args.communityId);
		if (!community) {
			throw new Error('Community not found.');
		}

		if (community.visibility === 'private') {
			const authUser = await getOptionalAuthUser(ctx);
			if (!authUser) {
				throw new Error('Authentication required to view members of a private community.');
			}
			const membership = await getMembership(ctx, args.communityId, authUser._id);
			if (!membership || membership.status !== 'active') {
				throw new Error('You must be a member to view members of a private community.');
			}
		}

		const result = await ctx.db
			.query('community_memberships')
			.withIndex('by_communityId_and_status', (q: any) =>
				q.eq('communityId', args.communityId).eq('status', 'active')
			)
			.paginate(args.paginationOpts);

		const pageWithProfiles = await Promise.all(
			result.page.map(async (membership) => {
				const profile = await ctx.db
					.query('users_profile')
					.withIndex('by_authId', (q: any) => q.eq('authId', membership.userAuthId))
					.unique();

				return {
					userAuthId: membership.userAuthId,
					role: membership.role,
					joinedAt: membership.respondedAt ?? membership.createdAt,
					name: profile?.name ?? 'Unknown',
					username: profile?.username ?? null,
					image: profile?.image
				};
			})
		);

		return {
			...result,
			page: pageWithProfiles
		};
	}
});

export const getBySlug = query({
	args: {
		slug: v.string()
	},
	returns: v.union(
		v.null(),
		v.object({
			community: communitySummaryValidator,
			membershipStatus: membershipStatusValidator,
			canRead: v.boolean(),
			canPost: v.boolean(),
			isManager: v.boolean()
		})
	),
	handler: async (ctx, args) => {
		const community = await ctx.db
			.query('communities')
			.withIndex('by_slug', (q) => q.eq('slug', normalizeSlug(args.slug)))
			.unique();
		if (!community) {
			return null;
		}

		const authUser = await getOptionalAuthUser(ctx);
		const membership = authUser ? await getMembership(ctx, community._id, authUser._id) : null;
		const membershipStatus = (membership?.status ?? 'none') as
			| 'none'
			| 'pending'
			| 'active'
			| 'rejected';
		const isMember = membershipStatus === 'active';
		const isManager = isMember && (membership?.role === 'owner' || membership?.role === 'admin');
		const canRead = community.visibility === 'public' || isMember;
		const canPost = isMember;

		return {
			community: await toCommunitySummary(ctx, community),
			membershipStatus,
			canRead,
			canPost,
			isManager
		};
	}
});
