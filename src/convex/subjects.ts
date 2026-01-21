import { v } from 'convex/values';
import { internalMutation, mutation, query } from './_generated/server';
import { authComponent } from './auth';

const checkAdmin = async (ctx: any) => {
	const user = await authComponent.getAuthUser(ctx);
	const isAdmin =
		user?.role && (Array.isArray(user.role) ? user.role.includes('admin') : user.role === 'admin');
	if (!isAdmin) throw new Error('Unauthorized: Admin access required');
	return user;
};

const UPSC_SUBJECTS = [
	{ name: 'Agriculture', gsPaper: 3 },
	{ name: 'Art and Culture', gsPaper: 1 },
	{ name: 'Disaster Management', gsPaper: 3 },
	{ name: 'Economy', gsPaper: 3 },
	{ name: 'Environment and Biodiversity', gsPaper: 3 },
	{ name: 'Ethics, Integrity and Aptitude', gsPaper: 4 },
	{ name: 'Geography', gsPaper: 1 },
	{ name: 'Governance', gsPaper: 2 },
	{ name: 'Indian Society', gsPaper: 1 },
	{ name: 'Internal Security', gsPaper: 3 },
	{ name: 'International Relations', gsPaper: 2 },
	{ name: 'Modern Indian History', gsPaper: 1 },
	{ name: 'Polity', gsPaper: 2 },
	{ name: 'Post Independence India', gsPaper: 1 },
	{ name: 'Science and Technology', gsPaper: 3 },
	{ name: 'Social Justice', gsPaper: 2 },
	{ name: 'World History', gsPaper: 1 },
	{ name: 'Other', gsPaper: 0 }
];

/**
 * Logic to seed subjects, extracted so it can be used by both
 * public and internal mutations.
 */
async function runSeed(ctx: any) {
	for (const sub of UPSC_SUBJECTS) {
		const slug = sub.name
			.toLowerCase()
			.replace(/[^\w\s-]/g, '')
			.replace(/[\s_-]+/g, '-')
			.replace(/^-+|-+$/g, '');

		const existing = await ctx.db
			.query('subjects')
			.withIndex('by_slug', (q: any) => q.eq('slug', slug))
			.unique();

		if (!existing) {
			await ctx.db.insert('subjects', {
				name: sub.name,
				gsPaper: sub.gsPaper,
				slug
			});
		}
	}
}

/**
 * Seed subjects from the CLI without authentication.
 * Usage: npx convex run subjects:seedInternal
 */
export const seedInternal = internalMutation({
	handler: async (ctx) => {
		await runSeed(ctx);
	}
});

/**
 * Seed subjects from the UI (requires admin auth).
 */
export const seed = mutation({
	handler: async (ctx) => {
		await checkAdmin(ctx);
		await runSeed(ctx);
	}
});

export const list = query({
	handler: async (ctx) => {
		return await ctx.db.query('subjects').collect();
	}
});

export const getBySlug = query({
	args: { slug: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query('subjects')
			.withIndex('by_slug', (q) => q.eq('slug', args.slug))
			.unique();
	}
});

export const getById = query({
	args: { id: v.id('subjects') },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.id);
	}
});
