import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { getAppRole } from '../lib/shared/adminRole';

type IdentityRecord = Record<string, unknown> & {
	subject: string;
	email?: string;
	givenName?: string;
	familyName?: string;
	pictureUrl?: string;
};

export type AuthUser = {
	_id: string;
	email: string;
	name: string;
	image?: string | null;
	role: 'admin' | 'regular';
	organizationId: string | null;
	permissions: Array<string>;
};

const ADMIN_ORG_ID = process.env.WORKOS_ADMIN_ORG_ID ?? null;

const currentUserValidator = v.union(
	v.null(),
	v.object({
		id: v.string(),
		email: v.string(),
		name: v.string(),
		image: v.optional(v.union(v.null(), v.string())),
		role: v.string(),
		username: v.union(v.null(), v.string()),
		hasUsername: v.boolean()
	})
);

const normalizePermissions = (permissions: unknown): Array<string> => {
	if (!Array.isArray(permissions)) {
		return [];
	}

	return permissions.filter((entry): entry is string => typeof entry === 'string');
};

const getIdentityOrganizationId = (identity: Record<string, unknown>): string | null => {
	const value = identity.org_id ?? identity.organizationId;
	return typeof value === 'string' ? value : null;
};

const getIdentityPermissions = (identity: Record<string, unknown>): Array<string> =>
	normalizePermissions(identity.permissions);

const getIdentityName = (identity: Record<string, unknown>): string => {
	const givenName = typeof identity.givenName === 'string' ? identity.givenName.trim() : '';
	const familyName = typeof identity.familyName === 'string' ? identity.familyName.trim() : '';
	const fullName = `${givenName} ${familyName}`.trim();
	if (fullName) {
		return fullName;
	}
	if (typeof identity.name === 'string' && identity.name.trim()) {
		return identity.name.trim();
	}
	if (typeof identity.email === 'string' && identity.email.trim()) {
		return identity.email.trim();
	}
	return typeof identity.subject === 'string' ? identity.subject : '';
};

const getIdentityImage = (identity: Record<string, unknown>): string | null => {
	const value = identity.pictureUrl ?? identity.picture;
	return typeof value === 'string' && value.trim() ? value : null;
};

const getIdentityEmail = (identity: Record<string, unknown>): string => {
	if (typeof identity.email === 'string' && identity.email.trim()) {
		return identity.email.trim();
	}
	return '';
};

const toRole = (organizationId: string | null, permissions: Array<string>): 'admin' | 'regular' =>
	getAppRole(permissions, organizationId, ADMIN_ORG_ID);

const getIdentityRecord = async (ctx: any): Promise<IdentityRecord | null> => {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) {
		return null;
	}
	return identity as IdentityRecord;
};

const getProfileByAuthId = async (ctx: any, authId: string) =>
	ctx.db
		? await ctx.db
				.query('users_profile')
				.withIndex('by_authId', (q: any) => q.eq('authId', authId))
				.unique()
		: null;

const buildAuthUser = async (ctx: any, identity: IdentityRecord): Promise<AuthUser> => {
	const profile = await getProfileByAuthId(ctx, identity.subject);
	const organizationId = getIdentityOrganizationId(identity);
	const permissions = getIdentityPermissions(identity);

	return {
		_id: identity.subject,
		email: profile?.email ?? getIdentityEmail(identity),
		name: profile?.name ?? getIdentityName(identity),
		image: profile?.image ?? getIdentityImage(identity),
		role: toRole(organizationId, permissions),
		organizationId,
		permissions
	};
};

export const getOptionalAuthUser = async (ctx: any): Promise<AuthUser | null> => {
	const identity = await getIdentityRecord(ctx);
	if (!identity) {
		return null;
	}
	return await buildAuthUser(ctx, identity);
};

export const getAuthUser = async (ctx: any): Promise<AuthUser> => {
	const authUser = await getOptionalAuthUser(ctx);
	if (!authUser) {
		throw new Error('Not authenticated');
	}
	return authUser;
};

export const getAnyUserById = async (ctx: any, authId: string): Promise<AuthUser | null> => {
	const profile = await getProfileByAuthId(ctx, authId);
	if (!profile) {
		return null;
	}

	return {
		_id: authId,
		email: profile.email,
		name: profile.name,
		image: profile.image,
		role: 'regular',
		organizationId: null,
		permissions: []
	};
};

export const syncCurrentUser = mutation({
	args: {
		email: v.string(),
		name: v.string(),
		image: v.optional(v.union(v.null(), v.string())),
		organizationId: v.optional(v.union(v.null(), v.string())),
		permissions: v.optional(v.array(v.string()))
	},
	returns: currentUserValidator,
	handler: async (ctx, args) => {
		const identity = await getIdentityRecord(ctx);
		if (!identity) {
			throw new Error('Unauthorized');
		}

		const authId = identity.subject;
		const now = Date.now();
		const trimmedName = args.name.trim() || getIdentityName(identity);
		const email = args.email.trim() || getIdentityEmail(identity);
		const existing = await getProfileByAuthId(ctx, authId);

		if (existing) {
			await ctx.db.patch(existing._id, {
				email,
				name: trimmedName,
				nameLower: trimmedName.toLowerCase(),
				image: args.image,
				updatedAt: now
			});
		} else {
			await ctx.db.insert('users_profile', {
				authId,
				email,
				name: trimmedName,
				nameLower: trimmedName.toLowerCase(),
				image: args.image,
				createdAt: now,
				updatedAt: now
			});
		}

		const organizationId = args.organizationId ?? getIdentityOrganizationId(identity);
		const permissions = args.permissions ?? getIdentityPermissions(identity);
		const profile = await getProfileByAuthId(ctx, authId);

		return {
			id: authId,
			email,
			name: trimmedName,
			image: args.image,
			role: toRole(organizationId, permissions),
			username: profile?.username ?? null,
			hasUsername: !!profile?.username
		};
	}
});

export const getCurrentUser = query({
	args: {},
	returns: currentUserValidator,
	handler: async (ctx) => {
		const authUser = await getOptionalAuthUser(ctx);
		if (!authUser) {
			return null;
		}

		const profile = await getProfileByAuthId(ctx, authUser._id);

		return {
			id: authUser._id,
			email: authUser.email,
			name: authUser.name,
			image: authUser.image,
			role: authUser.role,
			username: profile?.username ?? null,
			hasUsername: !!profile?.username
		};
	}
});
