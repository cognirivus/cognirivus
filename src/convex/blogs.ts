import { v } from 'convex/values';
import { mutation, query, type QueryCtx, type MutationCtx } from './_generated/server';
import { authComponent } from './auth';

async function checkAdmin(ctx: QueryCtx | MutationCtx) {
	const user = await authComponent.getAuthUser(ctx);
	if (!user) return null;

	const role = user.role;
	const isAdmin = Array.isArray(role) ? role.includes('admin') : role === 'admin';

	if (!isAdmin) return null;
	return user;
}

export const list = query({
	args: { onlyPublished: v.boolean() },
	handler: async (ctx, args) => {
		let blogs;
		if (args.onlyPublished) {
			blogs = await ctx.db
				.query('blogs')
				.withIndex('by_published', (q) => q.eq('published', true))
				.order('desc')
				.collect();
		} else {
			blogs = await ctx.db.query('blogs').order('desc').collect();
		}
		return blogs;
	}
});

export const get = query({
	args: { id: v.id('blogs') },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.id);
	}
});

export const create = mutation({
	args: {
		title: v.string(),
		content: v.string(),
		published: v.boolean()
	},
	handler: async (ctx, args) => {
		const user = await checkAdmin(ctx);
		if (!user) {
			throw new Error('Unauthorized: Admin access required');
		}

		return await ctx.db.insert('blogs', {
			...args,
			authorId: user._id,
			createdAt: Date.now()
		});
	}
});

export const update = mutation({
	args: {
		id: v.id('blogs'),
		title: v.string(),
		content: v.string(),
		published: v.boolean()
	},
	handler: async (ctx, args) => {
		const user = await checkAdmin(ctx);
		if (!user) {
			throw new Error('Unauthorized: Admin access required');
		}

		const { id, ...data } = args;
		await ctx.db.patch(id, data);
	}
});

export const remove = mutation({
	args: { id: v.id('blogs') },
	handler: async (ctx, args) => {
		const user = await checkAdmin(ctx);
		if (!user) {
			throw new Error('Unauthorized: Admin access required');
		}

		await ctx.db.delete(args.id);
	}
});
