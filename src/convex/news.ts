import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { action, internalQuery, mutation, query } from './_generated/server';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { authComponent } from './auth';
import { r2 } from './lib/r2';

const checkAdmin = async (ctx: any) => {
	const user = await authComponent.getAuthUser(ctx);
	const isAdmin =
		user?.role && (Array.isArray(user.role) ? user.role.includes('admin') : user.role === 'admin');
	if (!isAdmin) throw new Error('Unauthorized: Admin access required');
	return user;
};

/**
 * Mutation to save news metadata.
 */
export const insertMetadata = mutation({
	args: {
		date: v.string(),
		snippet: v.string(),
		r2Key: v.optional(v.string()),
		bodyHash: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await checkAdmin(ctx);
		return await ctx.db.insert('news', args);
	}
});

/**
 * Action to store news with body in R2.
 */
export const insert = action({
	args: {
		date: v.string(),
		body: v.string(),
		bodyHash: v.optional(v.string())
	},
	handler: async (ctx, args): Promise<Id<'news'>> => {
		const snippet = args.body.substring(0, 500);
		const r2Key = `news/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.txt`;

		await r2.store(ctx, new Blob([args.body], { type: 'text/plain' }), {
			key: r2Key,
			type: 'text/plain'
		});

		return await ctx.runMutation(api.news.insertMetadata, {
			date: args.date,
			snippet,
			r2Key,
			bodyHash: args.bodyHash
		});
	}
});

export const list = query({
	args: {
		limit: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		const items = await ctx.db
			.query('news')
			.order('desc')
			.take(args.limit ?? 50);

		return items.map((item) => ({
			...item,
			body: item.snippet // Client expects 'body' field
		}));
	}
});

export const listInternal = internalQuery({
	args: {
		limit: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		return await ctx.db
			.query('news')
			.order('asc')
			.take(args.limit ?? 1);
	}
});

export const getById = query({
	args: { id: v.id('news') },
	handler: async (ctx, args) => {
		const news = await ctx.db.get(args.id);
		if (!news) return null;

		let bodyUrl = null;
		if (news.r2Key) {
			bodyUrl = await r2.getUrl(news.r2Key);
		}

		return {
			...news,
			bodyUrl,
			body: news.snippet // Fallback
		};
	}
});

export const getWithContent = query({
	args: { id: v.id('news') },
	handler: async (ctx, args) => {
		const news = await ctx.db.get(args.id);
		if (!news) return null;

		const content = await ctx.db
			.query('content')
			.withIndex('by_newsId', (q) => q.eq('newsId', args.id))
			.collect();

		const enrichedContent = await Promise.all(
			content.map(async (c) => {
				const subject = await ctx.db.get(c.subjectId);
				return { ...c, subject, body: c.body };
			})
		);

		return {
			...news,
			content: enrichedContent
		};
	}
});

export const checkDuplicate = query({
	args: { bodyHash: v.string() },
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query('news')
			.withIndex('by_bodyHash', (q) => q.eq('bodyHash', args.bodyHash))
			.first();
		return !!existing;
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

				let bodyUrl = null;
				if (item.r2Key) {
					bodyUrl = await r2.getUrl(item.r2Key);
				}

				return {
					...item,
					body: item.snippet,
					bodyUrl,
					contentCount: contentItems.length
				};
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

				let bodyUrl = null;
				if (item.r2Key) {
					bodyUrl = await r2.getUrl(item.r2Key);
				}

				return {
					...item,
					body: item.snippet,
					bodyUrl,
					contentCount: contentItems.length
				};
			})
		);

		return { ...result, page: enrichedPage };
	}
});

export const updateMetadata = mutation({
	args: {
		id: v.id('news'),
		date: v.string(),
		snippet: v.string(),
		r2Key: v.optional(v.string()),
		bodyHash: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await checkAdmin(ctx);
		const { id, ...updates } = args;
		await ctx.db.patch(id, updates);
		return id;
	}
});

export const update = action({
	args: {
		id: v.id('news'),
		date: v.string(),
		body: v.string(),
		bodyHash: v.optional(v.string())
	},
	handler: async (ctx, args): Promise<Id<'news'>> => {
		const news = await ctx.runQuery(api.news.getById, { id: args.id });
		if (!news) throw new Error('News not found');

		let r2Key = news.r2Key;
		if (!r2Key) {
			r2Key = `news/${args.id}-${Date.now()}.txt`;
		}

		await r2.store(ctx, new Blob([args.body], { type: 'text/plain' }), {
			key: r2Key,
			type: 'text/plain'
		});

		return await ctx.runMutation(api.news.updateMetadata, {
			id: args.id,
			date: args.date,
			snippet: args.body.substring(0, 500),
			r2Key,
			bodyHash: args.bodyHash
		});
	}
});

export const remove = mutation({
	args: { id: v.id('news') },
	handler: async (ctx, args) => {
		await checkAdmin(ctx);

		const news = await ctx.db.get(args.id);
		if (news?.r2Key) {
			await r2.deleteObject(ctx, news.r2Key);
		}

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
