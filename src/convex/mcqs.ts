import { v } from 'convex/values';
import { query } from './_generated/server';
import { paginationOptsValidator } from 'convex/server';

export const list = query({
	args: {
		paginationOpts: paginationOptsValidator,
		exam: v.optional(v.string()),
		year: v.optional(v.number()),
		mcqType: v.optional(v.string()),
		search: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		if (args.search) {
			const searchQ = ctx.db.query('mcqs').withSearchIndex('search_question', (q) => {
				let search = q.search('question', args.search!);
				if (args.exam) search = search.eq('exam', args.exam);
				if (args.mcqType) search = search.eq('mcq_type', args.mcqType);
				return search;
			});
			return await searchQ.paginate(args.paginationOpts);
		}

		let query;

		if (args.exam) {
			query = ctx.db.query('mcqs').withIndex('by_exam', (q) => q.eq('exam', args.exam!));
		} else if (args.year) {
			query = ctx.db.query('mcqs').withIndex('by_year', (q) => q.eq('year', args.year!));
		} else if (args.mcqType) {
			query = ctx.db.query('mcqs').withIndex('by_mcq_type', (q) => q.eq('mcq_type', args.mcqType!));
		} else {
			query = ctx.db.query('mcqs');
		}

		return await query.order('desc').paginate(args.paginationOpts);
	}
});

export const getFilterHierarchy = query({
	args: {
		type: v.optional(v.string()),
		exam: v.optional(v.string()),
		year: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		const mcqs = await ctx.db.query('mcqs').collect();

		const types = Array.from(new Set(mcqs.map((m) => m.mcq_type))).sort();

		let filtered = mcqs;
		if (args.type) {
			filtered = filtered.filter((m) => m.mcq_type === args.type);
		}
		const exams = Array.from(new Set(filtered.map((m) => m.exam))).sort();

		if (args.exam) {
			filtered = filtered.filter((m) => m.exam === args.exam);
		}
		const years = Array.from(new Set(filtered.map((m) => m.year))).sort((a, b) => b - a);

		if (args.year) {
			filtered = filtered.filter((m) => m.year === args.year);
		}
		const tags = Array.from(new Set(filtered.flatMap((m) => m.tags))).sort();

		return { types, exams, years, tags };
	}
});

export const count = query({
	args: {
		exam: v.optional(v.string()),
		year: v.optional(v.number()),
		mcqType: v.optional(v.string()),
		search: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		let query;
		if (args.search) {
			query = ctx.db.query('mcqs').withSearchIndex('search_question', (q) => {
				let search = q.search('question', args.search!);
				if (args.exam) search = search.eq('exam', args.exam);
				if (args.mcqType) search = search.eq('mcq_type', args.mcqType);
				return search;
			});
		} else if (args.exam) {
			query = ctx.db.query('mcqs').withIndex('by_exam', (q) => q.eq('exam', args.exam!));
		} else if (args.year) {
			query = ctx.db.query('mcqs').withIndex('by_year', (q) => q.eq('year', args.year!));
		} else if (args.mcqType) {
			query = ctx.db.query('mcqs').withIndex('by_mcq_type', (q) => q.eq('mcq_type', args.mcqType!));
		} else {
			query = ctx.db.query('mcqs');
		}

		const results = await query.collect();
		return results.length;
	}
});
