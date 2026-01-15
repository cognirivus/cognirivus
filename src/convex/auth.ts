import { createClient, type GenericCtx } from '@convex-dev/better-auth';
import { convex } from '@convex-dev/better-auth/plugins';
import { components } from './_generated/api';
import { type DataModel } from './_generated/dataModel';
import { query } from './_generated/server';
import { betterAuth, type BetterAuthOptions } from 'better-auth/minimal';
import authConfig from './auth.config';
import authSchema from './betterAuth/schema';
import { admin } from 'better-auth/plugins';

const getSiteUrl = () => {
	if (process.env.SITE_URL) return process.env.SITE_URL;
	if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
	if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
	return 'http://localhost:5173';
};

const siteUrl = getSiteUrl();
console.log('Convex Auth Config - Resolved siteUrl:', siteUrl);

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

	const secret = process.env.BETTER_AUTH_SECRET;
	if (!secret) {
		console.warn('BETTER_AUTH_SECRET is not defined');
	}

	return {
		baseURL: siteUrl,
		secret: secret,
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
		]
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
