import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import { authComponent } from './auth';

async function enrichContentItems(ctx: any, items: any[]) {
	return await Promise.all(
		items.map(async (item) => {
			const subject = await ctx.db.get(item.subjectId);
			let newsDate;
			if (item.newsId) {
				const news = await ctx.db.get(item.newsId);
				newsDate = news?.date;
			}

			// Fetch linked entities
			const links = await ctx.db
				.query('content_entities')
				.withIndex('by_content', (q: any) => q.eq('contentId', item._id))
				.collect();

			const entities = await Promise.all(links.map(async (l: any) => await ctx.db.get(l.entityId)));

			return {
				...item,
				newsDate,
				subject,
				entities: entities.filter((e: any): e is NonNullable<typeof e> => !!e)
			};
		})
	);
}

export const list = query({
	args: {
		subjectId: v.optional(v.id('subjects')),
		topic: v.optional(v.string()),
		excludeTopic: v.optional(v.string()),
		limit: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		const { subjectId, topic, excludeTopic, limit } = args;

		let queryBuilder;

		if (subjectId) {
			queryBuilder = ctx.db
				.query('content')
				.withIndex('by_subjectId', (q) => q.eq('subjectId', subjectId));
		} else if (topic) {
			queryBuilder = ctx.db.query('content').withIndex('by_topic', (q) => q.eq('topic', topic));
		} else {
			queryBuilder = ctx.db.query('content').order('desc');
		}

		let content = await queryBuilder.take(limit ?? 100);

		if (excludeTopic) {
			content = content.filter((item) => item.topic !== excludeTopic);
		}

		return await enrichContentItems(ctx, content);
	}
});

export const listPaginated = query({
	args: {
		topic: v.optional(v.string()),
		search: v.optional(v.string()),
		paginationOpts: paginationOptsValidator
	},
	handler: async (ctx, args) => {
		const { topic, search, paginationOpts } = args;
		let queryBuilder;

		if (search) {
			queryBuilder = ctx.db.query('content').withSearchIndex('search_all', (q) => {
				const searchQ = q.search('text', search);
				return topic ? searchQ.eq('topic', topic) : searchQ;
			});
		} else if (topic) {
			queryBuilder = ctx.db
				.query('content')
				.withIndex('by_topic_date', (q) => q.eq('topic', topic))
				.order('desc');
		} else {
			queryBuilder = ctx.db.query('content').order('desc');
		}

		const result = await queryBuilder.paginate(paginationOpts);
		const enrichedPage = await enrichContentItems(ctx, result.page);

		return {
			...result,
			page: enrichedPage
		};
	}
});

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
		text: v.string(),
		subjectId: v.id('subjects'),
		topic: v.string(),
		source: v.optional(v.string()),
		newsId: v.optional(v.id('news'))
	},
	handler: async (ctx, args) => {
		await checkAdmin(ctx);
		return await ctx.db.insert('content', {
			...args,
			flashcardCount: 0,
			createdAt: Date.now()
		});
	}
});

export const update = mutation({
	args: {
		id: v.id('content'),
		title: v.string(),
		text: v.string(),
		subjectId: v.id('subjects'),
		topic: v.string(),
		source: v.optional(v.string()),
		date: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await checkAdmin(ctx);
		const { id, ...updates } = args;
		await ctx.db.patch(id, updates);
		return id;
	}
});

export const remove = mutation({
	args: { id: v.id('content') },
	handler: async (ctx, args) => {
		await checkAdmin(ctx);
		const links = await ctx.db
			.query('content_entities')
			.withIndex('by_content', (q) => q.eq('contentId', args.id))
			.collect();

		for (const link of links) {
			await ctx.db.delete(link._id);
		}

		await ctx.db.delete(args.id);
		return args.id;
	}
});

export const getById = query({
	args: { id: v.id('content') },
	handler: async (ctx, args) => {
		const item = await ctx.db.get(args.id);
		if (!item) return null;

		const subject = await ctx.db.get(item.subjectId);

		// Fetch news date if linked
		let newsDate;
		if (item.newsId) {
			const news = await ctx.db.get(item.newsId);
			newsDate = news?.date;
		}

		// Fetch linked entities
		const links = await ctx.db
			.query('content_entities')
			.withIndex('by_content', (q) => q.eq('contentId', item._id))
			.collect();

		const entities = await Promise.all(links.map(async (l) => await ctx.db.get(l.entityId)));

		return {
			...item,
			newsDate,
			subject,
			entities: entities.filter((e): e is NonNullable<typeof e> => !!e)
		};
	}
});

// Helper logic for saving extracted facts
async function saveFactLogic(
	ctx: any,
	args: {
		title: string;
		text: string;
		subjectName: string;
		topic: string;
		entityType: string;
		source: string;
		newsId: any;
		date?: string;
	}
) {
	const { title, subjectName, entityType, ...rest } = args;

	// 1. Resolve Subject
	let subject = await ctx.db
		.query('subjects')
		.withIndex('by_name', (q: any) => q.eq('name', subjectName))
		.unique();

	if (!subject) {
		subject = await ctx.db
			.query('subjects')
			.withIndex('by_name', (q: any) => q.eq('name', 'Other'))
			.unique();
	}

	if (!subject) {
		throw new Error('Subject "Other" not found. Please run seed mutation.');
	}

	// 2. Create the content entry
	const contentId = await ctx.db.insert('content', {
		title,
		subjectId: subject._id,
		...rest,
		flashcardCount: 0,
		createdAt: Date.now()
	});

	// 3. Handle Entity Linking
	const entityName = title.trim();

	let entity = await ctx.db
		.query('entities')
		.withIndex('by_name', (q: any) => q.eq('name', entityName))
		.filter((q: any) => q.eq(q.field('type'), entityType))
		.first();

	if (!entity) {
		const slug = entityName
			.toLowerCase()
			.replace(/[^\w\s-]/g, '')
			.replace(/[\s_-]+/g, '-')
			.replace(/^-+|-+$/g, '');

		const entityId = await ctx.db.insert('entities', {
			name: entityName,
			type: entityType,
			slug
		});
		entity = await ctx.db.get(entityId);
	}

	// 4. Create the junction entry
	if (entity) {
		await ctx.db.insert('content_entities', {
			contentId,
			entityId: entity._id
		});
	}

	return contentId;
}

export const saveExtractedFact = internalMutation({
	args: {
		title: v.string(), // This is the entity name
		text: v.string(),
		subjectName: v.string(), // Name of the subject to resolve
		topic: v.string(),
		entityType: v.string(), // 'location' or 'Current Affairs'
		source: v.string(),
		newsId: v.id('news'),
		date: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		return await saveFactLogic(ctx, args);
	}
});

export const saveExtractedLocation = internalMutation({
	args: {
		title: v.string(), // This is the entity name (Location)
		text: v.string(),
		subjectName: v.string(), // Name of the subject to resolve
		topic: v.string(),
		source: v.string(),
		newsId: v.id('news'),
		date: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		return await saveFactLogic(ctx, {
			...args,
			entityType: 'location'
		});
	}
});

export const listEntityTypes = query({
	args: {
		excludeType: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		let query = ctx.db.query('entities');
		const entities = await query.collect();

		const filteredEntities = args.excludeType
			? entities.filter((e) => e.type !== args.excludeType)
			: entities;

		const types = new Set(filteredEntities.map((e) => e.type));

		// Return types with some basic metadata
		return Array.from(types)
			.sort()
			.map((type) => ({
				type,
				count: filteredEntities.filter((e) => e.type === type).length
			}));
	}
});

export const listEntities = query({
	args: { type: v.string() },
	handler: async (ctx, args) => {
		const entities = await ctx.db
			.query('entities')
			.withIndex('by_type', (q) => q.eq('type', args.type))
			.collect();

		// Add counts for each entity
		return await Promise.all(
			entities.map(async (entity) => {
				const links = await ctx.db
					.query('content_entities')
					.withIndex('by_entity', (q) => q.eq('entityId', entity._id))
					.collect();
				return { ...entity, count: links.length };
			})
		);
	}
});

export const getEntityBySlug = query({
	args: { slug: v.string(), type: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query('entities')
			.withIndex('by_slug', (q) => q.eq('slug', args.slug))
			.filter((q) => q.eq(q.field('type'), args.type))
			.unique();
	}
});

export const getEntity = query({
	args: { id: v.id('entities') },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.id);
	}
});

export const listByEntity = query({
	args: {
		entityId: v.id('entities'),
		subjectId: v.optional(v.id('subjects')),
		limit: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		const links = await ctx.db
			.query('content_entities')
			.withIndex('by_entity', (q) => q.eq('entityId', args.entityId))
			.collect();

		const contentIds = links.map((l) => l.contentId);
		let items = await Promise.all(contentIds.map((id) => ctx.db.get(id)));

		if (args.subjectId) {
			items = items.filter((item) => item && item.subjectId === args.subjectId);
		}

		// Filter out any nulls and enrich with news date
		const enriched = await Promise.all(
			items
				.filter((item): item is NonNullable<typeof item> => !!item)
				.map(async (item) => {
					const subject = await ctx.db.get(item.subjectId);
					if (item.newsId) {
						const news = await ctx.db.get(item.newsId);
						return { ...item, newsDate: news?.date, subject };
					}
					return { ...item, subject };
				})
		);

		// Sort by news date desc, then by creation time
		return (enriched as any[]).sort((a, b) => {
			const dateA = a.newsDate || '0000-00-00';
			const dateB = b.newsDate || '0000-00-00';
			if (dateA !== dateB) return dateB.localeCompare(dateA);
			return b.createdAt - a.createdAt;
		});
	}
});

export const isNewsProcessed = internalQuery({
	args: { newsId: v.id('news'), topic: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const query = ctx.db
			.query('content')
			.withIndex('by_newsId', (q) => q.eq('newsId', args.newsId));

		if (args.topic) {
			const results = await query.collect();
			return results.some((r) => r.topic === args.topic);
		}

		const existing = await query.first();
		return !!existing;
	}
});

export const saveReport = internalMutation({
	args: {
		entityId: v.id('entities'),
		report: v.string()
	},
	handler: async (ctx, args) => {
		const entity = await ctx.db.get(args.entityId);
		if (entity?.report) {
			// Move current report to archive
			await ctx.db.insert('report_archive', {
				entityId: args.entityId,
				report: entity.report,
				createdAt: entity.reportGeneratedAt ?? Date.now()
			});
		}

		await ctx.db.patch(args.entityId, {
			report: args.report,
			reportGeneratedAt: Date.now()
		});
	}
});

export const listReportArchive = query({
	args: { entityId: v.id('entities') },
	handler: async (ctx, args) => {
		return await ctx.db
			.query('report_archive')
			.withIndex('by_entity', (q) => q.eq('entityId', args.entityId))
			.order('desc')
			.collect();
	}
});

/**
 * Internal mutation to backfill the 'date' field in the 'content' table.
 */
export const backfillDates = internalMutation({
	args: {},
	handler: async (ctx) => {
		const items = await ctx.db.query('content').collect();
		let updatedCount = 0;

		for (const item of items) {
			if (!item.date && item.newsId) {
				const news = await ctx.db.get(item.newsId);
				if (news?.date) {
					await ctx.db.patch(item._id, { date: news.date });
					updatedCount++;
				}
			}
		}

		return { total: items.length, updated: updatedCount };
	}
});

// ============== User Content Progress ==============

export const toggleComplete = mutation({
	args: { contentId: v.id('content') },
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Authentication required');

		const existing = await ctx.db
			.query('user_content_progress')
			.withIndex('by_user_content', (q) => q.eq('userId', user._id).eq('contentId', args.contentId))
			.unique();

		if (existing) {
			await ctx.db.delete(existing._id);
			return { completed: false };
		} else {
			await ctx.db.insert('user_content_progress', {
				userId: user._id,
				contentId: args.contentId,
				completedAt: Date.now()
			});
			return { completed: true };
		}
	}
});

export const isCompleted = query({
	args: { contentId: v.id('content') },
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return false;

		const progress = await ctx.db
			.query('user_content_progress')
			.withIndex('by_user_content', (q) => q.eq('userId', user._id).eq('contentId', args.contentId))
			.unique();

		return !!progress;
	}
});

export const getUserProgress = query({
	args: { contentIds: v.optional(v.array(v.id('content'))) },
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return {};

		const progress = await ctx.db
			.query('user_content_progress')
			.withIndex('by_user', (q) => q.eq('userId', user._id))
			.collect();

		const progressMap: Record<string, boolean> = {};
		for (const p of progress) {
			if (!args.contentIds || args.contentIds.includes(p.contentId)) {
				progressMap[p.contentId] = true;
			}
		}
		return progressMap;
	}
});

export const getProgressAnalytics = query({
	args: {},
	handler: async (ctx) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return null;

		const completedItems = await ctx.db
			.query('user_content_progress')
			.withIndex('by_user', (q) => q.eq('userId', user._id))
			.collect();

		const completedIds = new Set(completedItems.map((p) => p.contentId));
		const allContent = await ctx.db.query('content').collect();
		const allSubjects = await ctx.db.query('subjects').collect();

		const subjectMap = new Map(allSubjects.map((s) => [s._id, s]));

		// Group by subject
		const bySubject: Record<
			string,
			{ name: string; slug: string; gsPaper: number; total: number; completed: number }
		> = {};
		// Group by topic
		const byTopic: Record<string, { total: number; completed: number }> = {};
		// Group by GS Paper
		const byGsPaper: Record<number, { total: number; completed: number }> = {};

		for (const content of allContent) {
			const isCompleted = completedIds.has(content._id);
			const subject = subjectMap.get(content.subjectId);

			// By subject
			const subjectKey = content.subjectId;
			if (!bySubject[subjectKey]) {
				bySubject[subjectKey] = {
					name: subject?.name || 'Unknown',
					slug: subject?.slug || '',
					gsPaper: subject?.gsPaper ?? 0,
					total: 0,
					completed: 0
				};
			}
			bySubject[subjectKey].total++;
			if (isCompleted) bySubject[subjectKey].completed++;

			// By topic
			if (!byTopic[content.topic]) {
				byTopic[content.topic] = { total: 0, completed: 0 };
			}
			byTopic[content.topic].total++;
			if (isCompleted) byTopic[content.topic].completed++;

			// By GS Paper
			const gs = subject?.gsPaper ?? 0;
			if (!byGsPaper[gs]) {
				byGsPaper[gs] = { total: 0, completed: 0 };
			}
			byGsPaper[gs].total++;
			if (isCompleted) byGsPaper[gs].completed++;
		}

		return {
			totalContent: allContent.length,
			totalCompleted: completedIds.size,
			bySubject: Object.entries(bySubject)
				.map(([id, data]) => ({ id, ...data }))
				.sort((a, b) => b.total - a.total),
			byTopic: Object.entries(byTopic)
				.map(([topic, data]) => ({ topic, ...data }))
				.sort((a, b) => b.total - a.total),
			byGsPaper: Object.entries(byGsPaper)
				.map(([gs, data]) => ({ gsPaper: Number(gs), ...data }))
				.sort((a, b) => a.gsPaper - b.gsPaper)
		};
	}
});

export const getRecentlyCompleted = query({
	args: { paginationOpts: paginationOptsValidator },
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return { page: [], isDone: true, continueCursor: '' };

		const result = await ctx.db
			.query('user_content_progress')
			.withIndex('by_user', (q) => q.eq('userId', user._id))
			.order('desc')
			.paginate(args.paginationOpts);

		const enrichedPage = await Promise.all(
			result.page.map(async (progress) => {
				const content = await ctx.db.get(progress.contentId);
				if (!content) return null;

				const subject = await ctx.db.get(content.subjectId);
				return {
					...progress,
					content: {
						...content,
						subject
					}
				};
			})
		);

		return {
			...result,
			page: enrichedPage.filter((p): p is NonNullable<typeof p> => p !== null)
		};
	}
});
