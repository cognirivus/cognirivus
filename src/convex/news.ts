import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { internalQuery, mutation, query } from './_generated/server';
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
		date: v.string(),
		content: v.string()
	},
	handler: async (ctx, args) => {
		await checkAdmin(ctx);
		await ctx.db.insert('news', {
			date: args.date,
			content: args.content
		});
	}
});

export const list = query({
	args: {
		limit: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		return await ctx.db
			.query('news')
			.order('desc')
			.take(args.limit ?? 50);
	}
});

export const listInternal = internalQuery({
	args: {
		limit: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		return await ctx.db
			.query('news')
			.order('asc') // Start from the oldest (first) as requested
			.take(args.limit ?? 1);
	}
});

export const getByDate = query({
	args: {
		date: v.string()
	},
	handler: async (ctx, args) => {
		return await ctx.db
			.query('news')
			.withIndex('by_date', (q) => q.eq('date', args.date))
			.unique();
	}
});

export const getById = query({
	args: { id: v.id('news') },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.id);
	}
});

export const listWithContentCount = query({
	args: { limit: v.optional(v.number()) },
	handler: async (ctx, args) => {
		const news = await ctx.db
			.query('news')
			.order('desc')
			.take(args.limit ?? 100);

		return await Promise.all(
			news.map(async (item) => {
				const contentItems = await ctx.db
					.query('content')
					.withIndex('by_newsId', (q) => q.eq('newsId', item._id))
					.collect();
				return { ...item, contentCount: contentItems.length };
			})
		);
	}
});

export const listPaginated = query({
	args: { paginationOpts: paginationOptsValidator },
	handler: async (ctx, args) => {
		const result = await ctx.db.query('news').order('desc').paginate(args.paginationOpts);

		const enrichedPage = await Promise.all(
			result.page.map(async (item) => {
				const contentItems = await ctx.db
					.query('content')
					.withIndex('by_newsId', (q) => q.eq('newsId', item._id))
					.collect();
				return { ...item, contentCount: contentItems.length };
			})
		);

		return { ...result, page: enrichedPage };
	}
});

export const getWithContent = query({
	args: { id: v.id('news') },
	handler: async (ctx, args) => {
		const news = await ctx.db.get(args.id);
		if (!news) return null;

		const contentItems = await ctx.db
			.query('content')
			.withIndex('by_newsId', (q) => q.eq('newsId', args.id))
			.collect();

		const enrichedContent = await Promise.all(
			contentItems.map(async (item) => {
				const subject = await ctx.db.get(item.subjectId);
				return { ...item, subject };
			})
		);

		return { ...news, content: enrichedContent };
	}
});

export const update = mutation({
	args: {
		id: v.id('news'),
		date: v.string(),
		content: v.string()
	},
	handler: async (ctx, args) => {
		await checkAdmin(ctx);
		const { id, ...updates } = args;
		await ctx.db.patch(id, updates);
		return id;
	}
});

export const remove = mutation({
	args: { id: v.id('news') },
	handler: async (ctx, args) => {
		await checkAdmin(ctx);
		const linkedContent = await ctx.db
			.query('content')
			.withIndex('by_newsId', (q) => q.eq('newsId', args.id))
			.collect();

		for (const item of linkedContent) {
			await ctx.db.patch(item._id, { newsId: undefined });
		}

		await ctx.db.delete(args.id);
		return args.id;
	}
});
