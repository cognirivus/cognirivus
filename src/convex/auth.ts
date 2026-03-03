import { createClient, type AuthFunctions, type GenericCtx } from '@convex-dev/better-auth';
import { convex } from '@convex-dev/better-auth/plugins';
import { components, internal } from './_generated/api';
import { type DataModel } from './_generated/dataModel';
import { query } from './_generated/server';
import { v } from 'convex/values';
import { betterAuth, type BetterAuthOptions } from 'better-auth/minimal';
import { createAuthMiddleware, APIError } from 'better-auth/api';
import authConfig from './auth.config';
import authSchema from './betterAuth/schema';
import { admin } from 'better-auth/plugins';

const getSiteUrl = () => process.env.SITE_URL ?? process.env.PUBLIC_SITE_URL ?? '';

const NAME_MIN = 2;
const NAME_MAX = 50;
const NAME_PATTERN = /^[a-zA-Z\s.\-']+$/;
const authFunctions: AuthFunctions = internal.auth;

const hasControlChars = (value: string) =>
	[...value].some((char) => {
		const code = char.charCodeAt(0);
		return (
			(code >= 0 && code <= 31) ||
			(code >= 127 && code <= 159) ||
			(code >= 0x200b && code <= 0x200f) ||
			(code >= 0x2028 && code <= 0x202f) ||
			code === 0xfeff
		);
	});

const buildAuthComponent = () =>
	createClient<DataModel, typeof authSchema>(components.betterAuth, {
		authFunctions,
		local: {
			schema: authSchema
		},
		triggers: {
			user: {
				onCreate: async (ctx, authUser) => {
					const existing = await ctx.db
						.query('users_profile')
						.withIndex('by_authId', (q) => q.eq('authId', authUser._id))
						.unique();
					if (existing) {
						return;
					}

					const now = Date.now();
					await ctx.db.insert('users_profile', {
						authId: authUser._id,
						email: authUser.email,
						name: authUser.name,
						nameLower: authUser.name.trim().toLowerCase(),
						image: authUser.image,
						createdAt: now,
						updatedAt: now
					});
				},
				onUpdate: async (ctx, newAuthUser) => {
					const profile = await ctx.db
						.query('users_profile')
						.withIndex('by_authId', (q) => q.eq('authId', newAuthUser._id))
						.unique();

					if (!profile) {
						const now = Date.now();
						await ctx.db.insert('users_profile', {
							authId: newAuthUser._id,
							email: newAuthUser.email,
							name: newAuthUser.name,
							nameLower: newAuthUser.name.trim().toLowerCase(),
							image: newAuthUser.image,
							createdAt: now,
							updatedAt: now
						});
						return;
					}

					await ctx.db.patch(profile._id, {
						email: newAuthUser.email,
						name: newAuthUser.name,
						nameLower: newAuthUser.name.trim().toLowerCase(),
						image: newAuthUser.image,
						updatedAt: Date.now()
					});
				}
			}
		}
	});

export const authComponent = buildAuthComponent();
export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi();

export const createAuthOptions = (ctx: GenericCtx<DataModel>) => {
	const siteUrl = getSiteUrl();
	const rawAdminIds = process.env.AUTH_ADMIN_IDS || '';
	const adminIds = rawAdminIds
		.replaceAll('[', '')
		.replaceAll(']', '')
		.replace(/["']/g, '')
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean);

	return {
		...(siteUrl ? { baseURL: siteUrl, trustedOrigins: [siteUrl] } : {}),
		database: authComponent.adapter(ctx),
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: false
		},
		plugins: [
			convex({ authConfig }),
			admin({
				defaultRole: 'regular',
				adminUserIds: adminIds
			})
		],
		hooks: {
			before: createAuthMiddleware(async (hookCtx) => {
				if (hookCtx.path !== '/update-user') return;

				const name = hookCtx.body?.name;
				if (name === undefined) return;
				if (typeof name !== 'string') {
					throw new APIError('BAD_REQUEST', { message: 'Name must be a string.' });
				}

				const trimmed = name.trim();
				if (trimmed.length < NAME_MIN) {
					throw new APIError('BAD_REQUEST', {
						message: `Name must be at least ${NAME_MIN} characters.`
					});
				}
				if (trimmed.length > NAME_MAX) {
					throw new APIError('BAD_REQUEST', {
						message: `Name must be at most ${NAME_MAX} characters.`
					});
				}
				if (!NAME_PATTERN.test(trimmed)) {
					throw new APIError('BAD_REQUEST', {
						message: 'Name can only contain letters, spaces, hyphens, apostrophes, and dots.'
					});
				}
				if (hasControlChars(trimmed)) {
					throw new APIError('BAD_REQUEST', {
						message: 'Name contains invalid characters.'
					});
				}

				return {
					context: {
						...hookCtx,
						body: { ...hookCtx.body, name: trimmed }
					}
				};
			})
		}
	} satisfies BetterAuthOptions;
};

export const createAuth = (ctx: GenericCtx<DataModel>) => {
	return betterAuth(createAuthOptions(ctx));
};

const getOptionalAuthUser = async (ctx: GenericCtx<DataModel>) => {
	try {
		return await authComponent.getAuthUser(ctx);
	} catch {
		return null;
	}
};

export const getCurrentUser = query({
	args: {},
	returns: v.union(
		v.null(),
		v.object({
			id: v.string(),
			email: v.string(),
			name: v.string(),
			image: v.optional(v.union(v.null(), v.string())),
			role: v.optional(v.any()),
			username: v.union(v.null(), v.string()),
			hasUsername: v.boolean()
		})
	),
	handler: async (ctx) => {
		const authUser = await getOptionalAuthUser(ctx);
		if (!authUser) {
			return null;
		}

		const profile = await ctx.db
			.query('users_profile')
			.withIndex('by_authId', (q) => q.eq('authId', authUser._id))
			.unique();

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
