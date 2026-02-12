import { createClient, type GenericCtx } from '@convex-dev/better-auth';
import { convex } from '@convex-dev/better-auth/plugins';
import { components } from './_generated/api';
import { type DataModel } from './_generated/dataModel';
import { query } from './_generated/server';
import { betterAuth, type BetterAuthOptions } from 'better-auth/minimal';
import { createAuthMiddleware, APIError } from 'better-auth/api';
import authConfig from './auth.config';
import authSchema from './betterAuth/schema';
import { admin } from 'better-auth/plugins';

const siteUrl = process.env.SITE_URL || '';

const NAME_MIN = 2;
const NAME_MAX = 50;
const NAME_PATTERN = /^[a-zA-Z\s.\-']+$/;
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202F\uFEFF]/;

/**
 * The auth component client.
 */
export const authComponent = createClient<DataModel, typeof authSchema>(components.betterAuth, {
	local: {
		schema: authSchema
	}
});

/**
 * Generates the configuration for Better Auth.
 */
export const createAuthOptions = (ctx: GenericCtx<DataModel>) => {
	const rawAdminIds = process.env.AUTH_ADMIN_IDS || '';
	const adminIds = rawAdminIds
		.replace(/[\[\]"']/g, '')
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean);

	return {
		baseURL: siteUrl,
		...(siteUrl ? { trustedOrigins: [siteUrl] } : {}),
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
			before: createAuthMiddleware(async (ctx) => {
				if (ctx.path !== '/update-user') return;

				const name = ctx.body?.name;
				if (name !== undefined) {
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
							message:
								'Name can only contain letters, spaces, hyphens, apostrophes, and dots.'
						});
					}
					if (CONTROL_CHARS.test(trimmed)) {
						throw new APIError('BAD_REQUEST', {
							message: 'Name contains invalid characters.'
						});
					}

					return {
						context: {
							...ctx,
							body: { ...ctx.body, name: trimmed }
						}
					};
				}
			})
		}
	} satisfies BetterAuthOptions;
};

export const createAuth = (ctx: GenericCtx<DataModel>) => {
	return betterAuth(createAuthOptions(ctx));
};

export const getCurrentUser = query({
	args: {},
	handler: async (ctx) => {
		return await authComponent.getAuthUser(ctx);
	}
});
