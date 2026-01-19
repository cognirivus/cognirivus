import { v } from 'convex/values';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';

export const list = query({
	args: {
		subjectId: v.optional(v.id('subjects')),
		limit: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		const { subjectId, limit } = args;

		let content;
		if (subjectId) {
			content = await ctx.db
				.query('content')
				.withIndex('by_subjectId', (dbq) => dbq.eq('subjectId', subjectId))
				.take(limit ?? 50);
		} else {
			content = await ctx.db
				.query('content')
				.order('desc')
				.take(limit ?? 50);
		}

		return await Promise.all(
			content.map(async (item) => {
				const subject = await ctx.db.get(item.subjectId);
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
			})
		);
	}
});

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
		return await ctx.db.insert('content', {
			...args,
			createdAt: Date.now()
		});
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

export const saveExtractedLocation = internalMutation({
	args: {
		title: v.string(), // This is the entity name (Location)
		text: v.string(),
		subjectName: v.string(), // Name of the subject to resolve
		topic: v.string(),
		source: v.string(),
		newsId: v.id('news')
	},
	handler: async (ctx, args) => {
		const { title, subjectName, ...rest } = args;

		// 1. Resolve Subject
		let subject = await ctx.db
			.query('subjects')
			.withIndex('by_name', (q) => q.eq('name', subjectName))
			.unique();

		if (!subject) {
			// Fallback to "Other"
			subject = await ctx.db
				.query('subjects')
				.withIndex('by_name', (q) => q.eq('name', 'Other'))
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
			createdAt: Date.now()
		});

		// 3. Handle Entity Linking (Location)
		const entityName = title.trim();
		const type = 'location';

		let entity = await ctx.db
			.query('entities')
			.withIndex('by_name', (q) => q.eq('name', entityName))
			.filter((q) => q.eq(q.field('type'), type))
			.first();

		if (!entity) {
			const slug = entityName
				.toLowerCase()
				.replace(/[^\w\s-]/g, '')
				.replace(/[\s_-]+/g, '-')
				.replace(/^-+|-+$/g, '');

			const entityId = await ctx.db.insert('entities', {
				name: entityName,
				type,
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
});

export const listEntityTypes = query({
	args: {},
	handler: async (ctx) => {
		const entities = await ctx.db.query('entities').collect();
		const types = new Set(entities.map((e) => e.type));

		// Return types with some basic metadata
		return Array.from(types)
			.sort()
			.map((type) => ({
				type,
				count: entities.filter((e) => e.type === type).length
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
	args: { newsId: v.id('news') },
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query('content')
			.withIndex('by_newsId', (q) => q.eq('newsId', args.newsId))
			.first();
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
