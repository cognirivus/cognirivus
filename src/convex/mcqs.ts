import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { paginationOptsValidator } from 'convex/server';
import { authComponent } from './auth';
import type { Id } from './_generated/dataModel';

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
			const searchLower = args.search.toLowerCase();
			
			// Use an index for the base query if possible to avoid full table scan
			let baseQuery;
			if (args.exam) {
				baseQuery = ctx.db.query('mcqs').withIndex('by_exam', q => q.eq('exam', args.exam!));
			} else if (args.year) {
				baseQuery = ctx.db.query('mcqs').withIndex('by_year', q => q.eq('year', args.year!));
			} else if (args.mcqType) {
				baseQuery = ctx.db.query('mcqs').withIndex('by_mcq_type', q => q.eq('mcq_type', args.mcqType!));
			} else {
				baseQuery = ctx.db.query('mcqs');
			}
			
			const results = await baseQuery.collect();
			
			const filtered = results.filter(m => {
				// Secondary filters (since we only used one index)
				if (args.exam && m.exam !== args.exam) return false;
				if (args.year && m.year !== args.year) return false;
				if (args.mcqType && m.mcq_type !== args.mcqType) return false;
				
				// Search filter (question or tags)
				return (
					m.question.toLowerCase().includes(searchLower) || 
					m.tags?.some(t => t.toLowerCase().includes(searchLower))
				);
			});

			// Manual pagination
			const cursor = args.paginationOpts.cursor ? Number(args.paginationOpts.cursor) : 0;
			const numItems = args.paginationOpts.numItems;
			const page = filtered.slice(cursor, cursor + numItems);
			
			return {
				page,
				isDone: cursor + numItems >= filtered.length,
				continueCursor: (cursor + numItems).toString()
			};
		}

		let mcqsQuery;

		if (args.exam) {
			mcqsQuery = ctx.db.query('mcqs').withIndex('by_exam', (q) => q.eq('exam', args.exam!));
			if (args.year) mcqsQuery = mcqsQuery.filter((q) => q.eq(q.field('year'), args.year));
			if (args.mcqType) mcqsQuery = mcqsQuery.filter((q) => q.eq(q.field('mcq_type'), args.mcqType));
		} else if (args.year) {
			mcqsQuery = ctx.db.query('mcqs').withIndex('by_year', (q) => q.eq('year', args.year!));
			if (args.mcqType) mcqsQuery = mcqsQuery.filter((q) => q.eq(q.field('mcq_type'), args.mcqType));
		} else if (args.mcqType) {
			mcqsQuery = ctx.db.query('mcqs').withIndex('by_mcq_type', (q) => q.eq('mcq_type', args.mcqType!));
			if (args.year) mcqsQuery = mcqsQuery.filter((q) => q.eq(q.field('year'), args.year));
		} else {
			mcqsQuery = ctx.db.query('mcqs');
			if (args.year) mcqsQuery = mcqsQuery.filter((q) => q.eq(q.field('year'), args.year));
			if (args.mcqType) mcqsQuery = mcqsQuery.filter((q) => q.eq(q.field('mcq_type'), args.mcqType));
		}

		return await mcqsQuery.order('desc').paginate(args.paginationOpts);
	}
});

// Helper to update metadata (Can be called via scheduler or manual trigger)
export const refreshMetadata = mutation({
	args: {},
	handler: async (ctx) => {
		const mcqs = await ctx.db.query('mcqs').collect();
		
		const types = Array.from(new Set(mcqs.map((m) => m.mcq_type))).sort();
		const exams = Array.from(new Set(mcqs.map((m) => m.exam))).sort();
		const years = Array.from(new Set(mcqs.map((m) => m.year))).sort((a, b) => b - a);
		const tags = Array.from(new Set(mcqs.flatMap((m) => m.tags || []))).sort();

		const existing = await ctx.db.query('mcq_metadata').withIndex('by_type', q => q.eq('type', 'aggregate')).first();
		
		if (existing) {
			await ctx.db.patch(existing._id, {
				types,
				exams,
				years,
				tags,
				updatedAt: Date.now()
			});
		} else {
			await ctx.db.insert('mcq_metadata', {
				type: 'aggregate',
				types,
				exams,
				years,
				tags,
				updatedAt: Date.now()
			});
		}
	}
});

export const getFilterHierarchy = query({
	args: {
		type: v.optional(v.string()),
		exam: v.optional(v.string()),
		year: v.optional(v.number()),
		search: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		// Optimize: Use metadata for initial load (no filters)
		const metadata = await ctx.db.query('mcq_metadata').withIndex('by_type', q => q.eq('type', 'aggregate')).first();
		
		if (metadata && !args.type && !args.exam && !args.year && !args.search) {
			return {
				types: metadata.types,
				exams: metadata.exams,
				years: metadata.years,
				tags: metadata.tags
			};
		}

		// Calculate hierarchy dynamically based on active filters
		// This ensures dependent dropdowns (e.g., selecting an Exam filters the available Years and Tags)
		const allMcqs = await ctx.db.query('mcqs').collect();
		let filtered = allMcqs;
		
		if (args.type) filtered = filtered.filter(m => m.mcq_type === args.type);
		if (args.exam) filtered = filtered.filter(m => m.exam === args.exam);
		if (args.year) filtered = filtered.filter(m => m.year === args.year);
		
		// Handle implicit tag filtering via search
		if (args.search) {
			const searchLower = args.search.toLowerCase();
			filtered = filtered.filter(m => 
				m.tags?.some(t => t.toLowerCase().includes(searchLower)) || 
				m.question.toLowerCase().includes(searchLower)
			);
		}

		return {
			types: Array.from(new Set(allMcqs.map(m => m.mcq_type))).sort(),
			exams: Array.from(new Set(filtered.map(m => m.exam))).sort(),
			years: Array.from(new Set(filtered.map(m => m.year))).sort((a, b) => b - a),
			tags: Array.from(new Set(filtered.flatMap(m => m.tags || []))).sort()
		};
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
		if (args.search) {
			const searchLower = args.search.toLowerCase();
			
			let baseQuery;
			if (args.exam) {
				baseQuery = ctx.db.query('mcqs').withIndex('by_exam', q => q.eq('exam', args.exam!));
			} else if (args.year) {
				baseQuery = ctx.db.query('mcqs').withIndex('by_year', q => q.eq('year', args.year!));
			} else if (args.mcqType) {
				baseQuery = ctx.db.query('mcqs').withIndex('by_mcq_type', q => q.eq('mcq_type', args.mcqType!));
			} else {
				baseQuery = ctx.db.query('mcqs');
			}
			
			const results = await baseQuery.collect();
			
			return results.filter(m => {
				if (args.exam && m.exam !== args.exam) return false;
				if (args.year && m.year !== args.year) return false;
				if (args.mcqType && m.mcq_type !== args.mcqType) return false;
				
				return (
					m.question.toLowerCase().includes(searchLower) || 
					m.tags?.some(t => t.toLowerCase().includes(searchLower))
				);
			}).length;
		} 
		
		// Standard query logic
		let mcqsQuery;
		if (args.exam) {
			mcqsQuery = ctx.db.query('mcqs').withIndex('by_exam', (q) => q.eq('exam', args.exam!));
			if (args.year) mcqsQuery = mcqsQuery.filter((q) => q.eq(q.field('year'), args.year));
			if (args.mcqType) mcqsQuery = mcqsQuery.filter((q) => q.eq(q.field('mcq_type'), args.mcqType));
		} else if (args.year) {
			mcqsQuery = ctx.db.query('mcqs').withIndex('by_year', (q) => q.eq('year', args.year!));
			if (args.mcqType) mcqsQuery = mcqsQuery.filter((q) => q.eq(q.field('mcq_type'), args.mcqType));
		} else if (args.mcqType) {
			mcqsQuery = ctx.db.query('mcqs').withIndex('by_mcq_type', (q) => q.eq('mcq_type', args.mcqType!));
			if (args.year) mcqsQuery = mcqsQuery.filter((q) => q.eq(q.field('year'), args.year));
		} else {
			mcqsQuery = ctx.db.query('mcqs');
			if (args.year) mcqsQuery = mcqsQuery.filter((q) => q.eq(q.field('year'), args.year));
			if (args.mcqType) mcqsQuery = mcqsQuery.filter((q) => q.eq(q.field('mcq_type'), args.mcqType));
		}

		const results = await mcqsQuery.collect();
		return results.length;
	}
});

export const getById = query({
	args: { id: v.id('mcqs') },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.id);
	}
});

export const getRecentResponses = query({
	args: {
		paginationOpts: paginationOptsValidator
	},
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return null;

		const responses = await ctx.db
			.query('mcq_responses')
			.withIndex('by_user', (q) => q.eq('userId', user._id))
			.order('desc')
			.paginate(args.paginationOpts);

		// Optimize: Fetch MCQs in parallel
		const mcqIds = [...new Set(responses.page.map(r => r.mcqId))];
		const mcqs = await Promise.all(mcqIds.map(id => ctx.db.get(id)));
		const mcqMap = new Map(mcqs.map(m => m ? [m._id, m] : null).filter(Boolean) as [Id<"mcqs">, any][]);

		return {
			...responses,
			page: responses.page.map((resp) => {
				const mcq = mcqMap.get(resp.mcqId);
				return {
					...resp,
					mcqTitle: mcq?.question || 'Unknown Question',
					exam: mcq?.exam || 'Unknown',
					year: mcq?.year || 0
				};
			})
		};
	}
});

export const recordResponse = mutation({
	args: {
		mcqId: v.id('mcqs'),
		selectedOption: v.string()
		// removed isCorrect from args to prevent client-side spoofing
	},
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		const mcq = await ctx.db.get(args.mcqId);
		if (!mcq) throw new Error('MCQ not found');

		const isCorrect = args.selectedOption === mcq.correct_option;

		return await ctx.db.insert('mcq_responses', {
			userId: user._id,
			mcqId: args.mcqId,
			selectedOption: args.selectedOption,
			isCorrect,
			createdAt: Date.now()
		});
	}
});

export const getUserStats = query({
	args: {},
	handler: async (ctx) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return null;

		const responses = await ctx.db
			.query('mcq_responses')
			.withIndex('by_user', (q) => q.eq('userId', user._id))
			.collect();

		if (responses.length === 0) return null;

		const total = responses.length;
		const correct = responses.filter((r) => r.isCorrect).length;

		// Optimize: Fetch all unique MCQs in parallel
		const uniqueMcqIds = [...new Set(responses.map(r => r.mcqId))];
		const mcqs = await Promise.all(uniqueMcqIds.map(id => ctx.db.get(id)));
		const mcqMap = new Map(mcqs.map(m => m ? [m._id, m] : null).filter(Boolean) as [Id<"mcqs">, any][]);

		// Group by Exam and Tag
		const examStats: Record<string, { total: number; correct: number }> = {};
		const tagStats: Record<string, { total: number; correct: number }> = {};

		for (const resp of responses) {
			const mcq = mcqMap.get(resp.mcqId);
			if (!mcq) continue;

			// Exam Stats
			const exam = mcq.exam || 'Unknown';
			if (!examStats[exam]) examStats[exam] = { total: 0, correct: 0 };
			examStats[exam].total++;
			if (resp.isCorrect) examStats[exam].correct++;

			// Tag Stats
			if (mcq.tags) {
				for (const tag of mcq.tags) {
					if (!tagStats[tag]) tagStats[tag] = { total: 0, correct: 0 };
					tagStats[tag].total++;
					if (resp.isCorrect) tagStats[tag].correct++;
				}
			}
		}

		return {
			overall: {
				total,
				correct,
				accuracy: (correct / total) * 100
			},
			byExam: Object.entries(examStats).map(([name, stats]) => ({
				name,
				...stats,
				accuracy: (stats.correct / stats.total) * 100
			})),
			byTag: Object.entries(tagStats)
				.map(([name, stats]) => ({
					name,
					...stats,
					accuracy: (stats.correct / stats.total) * 100
				}))
				.sort((a, b) => b.total - a.total)
		};
	}
});

export const getMyPreviousResponses = query({
	args: {
		mcqIds: v.array(v.id('mcqs'))
	},
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return {};

		const results: Record<string, { selectedOption: string; isCorrect: boolean }> = {};

		// Optimize: Run queries in parallel
		const responsePromises = args.mcqIds.map(async (mcqId) => {
			const latest = await ctx.db
				.query('mcq_responses')
				.withIndex('by_user_mcq', (q) => q.eq('userId', user._id).eq('mcqId', mcqId))
				.order('desc')
				.first();
			return { mcqId, latest };
		});

		const responses = await Promise.all(responsePromises);

		for (const { mcqId, latest } of responses) {
			if (latest) {
				results[mcqId] = {
					selectedOption: latest.selectedOption,
					isCorrect: latest.isCorrect
				};
			}
		}

		return results;
	}
});

export const getMcqHistory = query({
	args: { mcqId: v.id('mcqs') },
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return [];

		return await ctx.db
			.query('mcq_responses')
			.withIndex('by_user_mcq', (q) => q.eq('userId', user._id).eq('mcqId', args.mcqId))
			.order('desc')
			.take(5);
	}
});
