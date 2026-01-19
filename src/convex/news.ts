import { v } from 'convex/values';
import { internalQuery, mutation, query } from './_generated/server';

export const insert = mutation({
	args: {
		date: v.string(),
		content: v.string()
	},
	handler: async (ctx, args) => {
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
