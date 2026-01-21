import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { authComponent } from './auth';

const checkAdmin = async (ctx: any) => {
	const user = await authComponent.getAuthUser(ctx);
	const isAdmin =
		user?.role && (Array.isArray(user.role) ? user.role.includes('admin') : user.role === 'admin');
	if (!isAdmin) throw new Error('Unauthorized: Admin access required');
	return user;
};

export const insert = mutation({
	args: {
		title: v.string(),
		body: v.string(),
		subjectId: v.id('subjects'),
		topic: v.string(),
		exams: v.array(v.string())
	},
	handler: async (ctx, args) => {
		await checkAdmin(ctx);
		return await ctx.db.insert('syllabus', {
			...args,
			createdAt: Date.now()
		});
	}
});

export const update = mutation({
	args: {
		id: v.id('syllabus'),
		title: v.string(),
		body: v.string(),
		subjectId: v.id('subjects'),
		topic: v.string(),
		exams: v.array(v.string())
	},
	handler: async (ctx, args) => {
		await checkAdmin(ctx);
		const { id, ...updates } = args;
		await ctx.db.patch(id, updates);
		return id;
	}
});

export const remove = mutation({
	args: { id: v.id('syllabus') },
	handler: async (ctx, args) => {
		await checkAdmin(ctx);
		await ctx.db.delete(args.id);
		return args.id;
	}
});

export const list = query({
	args: {
		limit: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		const items = await ctx.db
			.query('syllabus')
			.order('desc')
			.take(args.limit ?? 100);

		return await Promise.all(
			items.map(async (item) => {
				const subject = await ctx.db.get(item.subjectId);
				return { ...item, subject };
			})
		);
	}
});

export const getById = query({
	args: { id: v.id('syllabus') },
	handler: async (ctx, args) => {
		const item = await ctx.db.get(args.id);
		if (!item) return null;
		const subject = await ctx.db.get(item.subjectId);
		return { ...item, subject };
	}
});
