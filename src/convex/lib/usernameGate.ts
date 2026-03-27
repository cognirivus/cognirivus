import { internal } from '../_generated/api';
import { getAuthUser } from '../auth';

export const USERNAME_REQUIRED_MESSAGE = 'Please set your username in /profile first.';

const getUsernameForAuth = async (ctx: any, authId: string): Promise<string | null> => {
	if (ctx.db) {
		const profile = await ctx.db
			.query('users_profile')
			.withIndex('by_authId', (q: any) => q.eq('authId', authId))
			.unique();
		return profile?.username ?? null;
	}

	return await ctx.runQuery((internal as any).profiles.getUsernameForAuth, {
		authId
	});
};

export const requireUserWithUsername = async (ctx: any) => {
	const authUser = await getAuthUser(ctx);

	await ctx.runMutation((internal as any).profiles.ensureProfileForAuth, {
		authId: authUser._id,
		email: authUser.email,
		name: authUser.name,
		image: authUser.image
	});

	const username = await getUsernameForAuth(ctx, authUser._id);
	if (!username) {
		throw new Error(USERNAME_REQUIRED_MESSAGE);
	}

	return {
		...authUser,
		username
	};
};
