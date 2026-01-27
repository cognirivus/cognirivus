import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import {
	internalMutation,
	internalQuery,
	mutation,
	query,
	type MutationCtx
} from './_generated/server';
import { api, internal, components } from './_generated/api';
import type { Id, DataModel } from './_generated/dataModel';
import { authComponent } from './auth';
import { TableAggregate } from '@convex-dev/aggregate';

// Content reactions aggregates
const contentLikesAggregate = new TableAggregate<{
	Key: Id<'content'>;
	DataModel: DataModel;
	TableName: 'content_reactions';
}>(components.aggregateContentLikes, {
	sortKey: (doc) => doc.contentId
});

const contentDislikesAggregate = new TableAggregate<{
	Key: Id<'content'>;
	DataModel: DataModel;
	TableName: 'content_reactions';
}>(components.aggregateContentDislikes, {
	sortKey: (doc) => doc.contentId
});

const contentCommentsAggregate = new TableAggregate<{
	Key: Id<'content'>;
	DataModel: DataModel;
	TableName: 'content_comments';
}>(components.aggregateContentComments, {
	sortKey: (doc) => doc.contentId
});

const contentCommentLikesAggregate = new TableAggregate<{
	Key: Id<'content_comments'>;
	DataModel: DataModel;
	TableName: 'content_comment_reactions';
}>(components.aggregateContentCommentLikes, {
	sortKey: (doc) => doc.commentId
});

const contentCommentDislikesAggregate = new TableAggregate<{
	Key: Id<'content_comments'>;
	DataModel: DataModel;
	TableName: 'content_comment_reactions';
}>(components.aggregateContentCommentDislikes, {
	sortKey: (doc) => doc.commentId
});

async function deleteContentCommentWithReactions(
	ctx: MutationCtx,
	commentId: Id<'content_comments'>
) {
	const comment = await ctx.db.get(commentId);
	if (!comment) return;

	// Delete all child comments recursively
	const childComments = await ctx.db
		.query('content_comments')
		.withIndex('by_parent', (q) => q.eq('parentId', commentId))
		.collect();
	for (const child of childComments) {
		await deleteContentCommentWithReactions(ctx, child._id);
	}

	// Delete reactions
	const reactions = await ctx.db
		.query('content_comment_reactions')
		.withIndex('by_comment', (q) => q.eq('commentId', commentId))
		.collect();
	for (const reaction of reactions) {
		await ctx.db.delete(reaction._id);
		if (reaction.like_dislike === 1) {
			await contentCommentLikesAggregate.delete(ctx, reaction);
		} else {
			await contentCommentDislikesAggregate.delete(ctx, reaction);
		}
	}

	await ctx.db.delete(commentId);
	await contentCommentsAggregate.delete(ctx, comment);
}

async function enrichContentItems(ctx: any, items: any[]) {
	return await Promise.all(
		items.map(async (item) => {
			const subject = await ctx.db.get(item.subjectId);
			let newsDate = item.date;

			if (!newsDate && item.newsId) {
				const news = await ctx.db.get(item.newsId);
				newsDate = news?.date;
			}

			// Fetch linked entities
			const links = await ctx.db
				.query('content_entities')
				.withIndex('by_content', (q: any) => q.eq('contentId', item._id))
				.collect();

			const entities = await Promise.all(links.map(async (l: any) => await ctx.db.get(l.entityId)));

			// Fetch reactions and comments counts
			const [likes, dislikes, commentCount] = await Promise.all([
				contentLikesAggregate.count(ctx, {
					bounds: {
						lower: { key: item._id, inclusive: true },
						upper: { key: item._id, inclusive: true }
					}
				}),
				contentDislikesAggregate.count(ctx, {
					bounds: {
						lower: { key: item._id, inclusive: true },
						upper: { key: item._id, inclusive: true }
					}
				}),
				contentCommentsAggregate.count(ctx, {
					bounds: {
						lower: { key: item._id, inclusive: true },
						upper: { key: item._id, inclusive: true }
					}
				})
			]);

			return {
				...item,
				newsDate,
				subject,
				entities: entities.filter((e: any): e is NonNullable<typeof e> => !!e),
				likes,
				dislikes,
				commentCount
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
			queryBuilder = ctx.db.query('content').withIndex('by_date').order('desc');
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
		includeNews: v.optional(v.boolean()),
		subjectIds: v.optional(v.array(v.id('subjects'))),
		gsPapers: v.optional(v.array(v.number())),
		entityTypes: v.optional(v.array(v.string())),
		entityIds: v.optional(v.array(v.id('entities'))),
		status: v.optional(v.union(v.literal('all'), v.literal('completed'), v.literal('incomplete'))),
		search: v.optional(v.string()),
		paginationOpts: paginationOptsValidator
	},
	handler: async (ctx, args) => {
		const {
			topic,
			includeNews,
			subjectIds,
			gsPapers,
			entityTypes,
			entityIds,
			status,
			search,
			paginationOpts
		} = args;
		let queryBuilder;

		if (search) {
			queryBuilder = ctx.db.query('content').withSearchIndex('search_all', (q) => {
				const searchQ = q.search('body', search);
				return topic ? searchQ.eq('topic', topic) : searchQ;
			});
		} else if (topic) {
			queryBuilder = ctx.db
				.query('content')
				.withIndex('by_topic_date', (q) => q.eq('topic', topic))
				.order('desc');
		} else {
			queryBuilder = ctx.db.query('content').withIndex('by_date').order('desc');
		}

		// Filter out Current Affairs if explicitly requested (Knowledge Base Library Mode)
		if (!topic && includeNews === false) {
			// Note: filter() doesn't work on SearchQuery, we handle it after pagination for search
			if (!search) {
				queryBuilder = queryBuilder.filter((q) => q.neq(q.field('topic'), 'Current Affairs'));
			}
		}

		if (subjectIds && subjectIds.length > 0) {
			queryBuilder = queryBuilder.filter((q) =>
				q.or(...subjectIds.map((id) => q.eq(q.field('subjectId'), id)))
			);
		}

		if (gsPapers && gsPapers.length > 0) {
			// Get all subject IDs for these GS papers
			const subjects = await ctx.db.query('subjects').collect();
			const filteredSubjectIds = subjects
				.filter((s) => gsPapers.includes(s.gsPaper))
				.map((s) => s._id);

			if (filteredSubjectIds.length > 0) {
				queryBuilder = queryBuilder.filter((q) =>
					q.or(...filteredSubjectIds.map((id) => q.eq(q.field('subjectId'), id)))
				);
			} else {
				queryBuilder = queryBuilder.filter((q) => q.eq(q.field('_id'), 'non-existent' as any));
			}
		}

		if (entityTypes && entityTypes.length > 0) {
			const entities = await ctx.db.query('entities').collect();
			const selectedEntityIds = new Set(
				entities.filter((e) => entityTypes.includes(e.type)).map((e) => e._id)
			);

			const links = await ctx.db.query('content_entities').collect();
			const allowedContentIds = Array.from(
				new Set(links.filter((l) => selectedEntityIds.has(l.entityId)).map((l) => l.contentId))
			);

			if (allowedContentIds.length > 0) {
				queryBuilder = queryBuilder.filter((q) =>
					q.or(...allowedContentIds.map((id) => q.eq(q.field('_id'), id)))
				);
			} else {
				queryBuilder = queryBuilder.filter((q) => q.eq(q.field('_id'), 'non-existent' as any));
			}
		}

		// Filter by specific entity IDs
		if (entityIds && entityIds.length > 0) {
			const links = await ctx.db.query('content_entities').collect();
			const allowedContentIds = Array.from(
				new Set(links.filter((l) => entityIds.includes(l.entityId)).map((l) => l.contentId))
			);

			if (allowedContentIds.length > 0) {
				queryBuilder = queryBuilder.filter((q) =>
					q.or(...allowedContentIds.map((id) => q.eq(q.field('_id'), id)))
				);
			} else {
				queryBuilder = queryBuilder.filter((q) => q.eq(q.field('_id'), 'non-existent' as any));
			}
		}

		// Filter by completion status
		if (status && status !== 'all') {
			const user = await authComponent.getAuthUser(ctx);
			if (user) {
				const progress = await ctx.db
					.query('user_content_progress')
					.withIndex('by_user', (q) => q.eq('userId', user._id))
					.collect();
				const completedIds = new Set(progress.map((p) => p.contentId));

				if (status === 'completed') {
					if (completedIds.size > 0) {
						queryBuilder = queryBuilder.filter((q) =>
							q.or(...Array.from(completedIds).map((id) => q.eq(q.field('_id'), id)))
						);
					} else {
						queryBuilder = queryBuilder.filter((q) => q.eq(q.field('_id'), 'non-existent' as any));
					}
				} else if (status === 'incomplete') {
					if (completedIds.size > 0) {
						queryBuilder = queryBuilder.filter((q) =>
							q.and(...Array.from(completedIds).map((id) => q.neq(q.field('_id'), id)))
						);
					}
				}
			}
		}

		const result = await queryBuilder.paginate(paginationOpts);

		// Manual filter for search results when news should be excluded
		// Since search index doesn't support 'neq'
		if (search && !topic && includeNews === false) {
			result.page = result.page.filter((item) => item.topic !== 'Current Affairs');
		}

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
		body: v.string(),
		subjectId: v.id('subjects'),
		topic: v.string(),
		source: v.optional(v.string()),
		newsId: v.optional(v.id('news'))
	},
	handler: async (ctx, args) => {
		await checkAdmin(ctx);
		const { body, ...rest } = args;
		return await ctx.db.insert('content', {
			...rest,
			body,
			flashcardCount: 0,
			createdAt: Date.now()
		});
	}
});

export const update = mutation({
	args: {
		id: v.id('content'),
		title: v.string(),
		body: v.string(),
		subjectId: v.id('subjects'),
		topic: v.string(),
		source: v.optional(v.string()),
		date: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await checkAdmin(ctx);
		const { id, body, ...updates } = args;
		await ctx.db.patch(id, {
			...updates,
			body
		});
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
		console.log('Fetching content by ID:', args.id);
		const item = await ctx.db.get(args.id);
		if (!item) return null;

		const enriched = await enrichContentItems(ctx, [item]);
		return enriched[0];
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

		const cleanedItems = items.filter((item): item is NonNullable<typeof item> => !!item);
		const enriched = await enrichContentItems(ctx, cleanedItems);

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

export const saveArticle = internalMutation({
	args: {
		entityId: v.id('entities'),
		article: v.string()
	},
	handler: async (ctx, args) => {
		const entity = await ctx.db.get(args.entityId);
		if (entity?.article) {
			await ctx.db.insert('article_archive', {
				entityId: args.entityId,
				article: entity.article,
				createdAt: entity.articleGeneratedAt ?? Date.now()
			});
		}

		await ctx.db.patch(args.entityId, {
			article: args.article,
			articleGeneratedAt: Date.now()
		});
	}
});

export const listArticleArchive = query({
	args: { entityId: v.id('entities') },
	handler: async (ctx, args) => {
		return await ctx.db
			.query('article_archive')
			.withIndex('by_entity', (q) => q.eq('entityId', args.entityId))
			.order('desc')
			.collect();
	}
});

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

		const bySubject: Record<
			string,
			{ name: string; slug: string; gsPaper: number; total: number; completed: number }
		> = {};
		const byTopic: Record<string, { total: number; completed: number }> = {};
		const byGsPaper: Record<number, { total: number; completed: number }> = {};

		for (const content of allContent) {
			const isCompleted = completedIds.has(content._id);
			const subject = subjectMap.get(content.subjectId);

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

			if (!byTopic[content.topic]) {
				byTopic[content.topic] = { total: 0, completed: 0 };
			}
			byTopic[content.topic].total++;
			if (isCompleted) byTopic[content.topic].completed++;

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

async function saveFactLogic(
	ctx: any,
	args: {
		title: string;
		body: string;
		subjectName: string;
		topic: string;
		entityType: string;
		source: string;
		newsId: any;
		date?: string;
	}
) {
	const { title, subjectName, entityType, body, ...rest } = args;

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

	const contentId = await ctx.db.insert('content', {
		title,
		body,
		subjectId: subject._id,
		...rest,
		flashcardCount: 0,
		createdAt: Date.now()
	});

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
		title: v.string(),
		body: v.string(),
		subjectName: v.string(),
		topic: v.string(),
		entityType: v.string(),
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
		title: v.string(),
		body: v.string(),
		subjectName: v.string(),
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
		excludeType: v.optional(v.string()),
		subjectId: v.optional(v.id('subjects'))
	},
	handler: async (ctx, args) => {
		let entities = await ctx.db.query('entities').collect();

		if (args.subjectId) {
			const contentItems = await ctx.db
				.query('content')
				.withIndex('by_subjectId', (q) => q.eq('subjectId', args.subjectId!))
				.collect();
			const contentIds = new Set(contentItems.map((c) => c._id));

			const allLinks = await ctx.db.query('content_entities').collect();
			const entityIdsForSubject = new Set(
				allLinks.filter((l) => contentIds.has(l.contentId)).map((l) => l.entityId)
			);

			entities = entities.filter((e) => entityIdsForSubject.has(e._id));
		}

		const filteredEntities = args.excludeType
			? entities.filter((e) => e.type !== args.excludeType)
			: entities;

		const types = new Set(filteredEntities.map((e) => e.type));

		return Array.from(types)
			.sort()
			.map((type) => ({
				type,
				count: filteredEntities.filter((e) => e.type === type).length
			}));
	}
});

export const listEntities = query({
	args: {
		type: v.string(),
		subjectId: v.optional(v.id('subjects'))
	},
	handler: async (ctx, args) => {
		let entities = await ctx.db
			.query('entities')
			.withIndex('by_type', (q) => q.eq('type', args.type))
			.collect();

		let contentIdsForSubject: Set<string> | null = null;
		if (args.subjectId) {
			const contentItems = await ctx.db
				.query('content')
				.withIndex('by_subjectId', (q) => q.eq('subjectId', args.subjectId!))
				.collect();
			contentIdsForSubject = new Set(contentItems.map((c) => c._id));
		}

		const results = await Promise.all(
			entities.map(async (entity) => {
				let links = await ctx.db
					.query('content_entities')
					.withIndex('by_entity', (q) => q.eq('entityId', entity._id))
					.collect();

				if (contentIdsForSubject) {
					links = links.filter((l) => contentIdsForSubject!.has(l.contentId));
				}

				return { ...entity, count: links.length };
			})
		);

		return args.subjectId ? results.filter((e) => e.count > 0) : results;
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

// ===== Content Reactions & Comments =====

export const listAllEntities = query({
	args: {
		paginationOpts: paginationOptsValidator,
		search: v.optional(v.string()),
		type: v.optional(v.string()),
		onlyGenerated: v.optional(v.boolean())
	},
	handler: async (ctx, args) => {
		let query;
		if (args.type) {
			query = ctx.db
				.query('entities')
				.withIndex('by_type', (q) => q.eq('type', args.type!))
				.order('desc');
		} else {
			query = ctx.db.query('entities').order('desc');
		}

		if (args.onlyGenerated) {
			query = query.filter((q) => q.neq(q.field('article'), undefined));
		}

		const result = await query.paginate(args.paginationOpts);

		const enriched = await Promise.all(
			result.page.map(async (entity) => {
				const links = await ctx.db
					.query('content_entities')
					.withIndex('by_entity', (q) => q.eq('entityId', entity._id))
					.collect();
				return { ...entity, segmentCount: links.length };
			})
		);

		return { ...result, page: enriched };
	}
});

export const updateEntityArticle = mutation({
	args: {
		id: v.id('entities'),
		article: v.string()
	},
	handler: async (ctx, args) => {
		await checkAdmin(ctx);
		const entity = await ctx.db.get(args.id);
		if (!entity) throw new Error('Entity not found');

		if (entity.article) {
			await ctx.db.insert('article_archive', {
				entityId: args.id,
				article: entity.article,
				createdAt: entity.articleGeneratedAt ?? Date.now()
			});
		}

		await ctx.db.patch(args.id, {
			article: args.article,
			articleGeneratedAt: Date.now()
		});
	}
});

export const removeEntityArticle = mutation({
	args: { id: v.id('entities') },
	handler: async (ctx, args) => {
		await checkAdmin(ctx);
		const entity = await ctx.db.get(args.id);
		if (!entity) throw new Error('Entity not found');

		if (entity.article) {
			await ctx.db.insert('article_archive', {
				entityId: args.id,
				article: entity.article,
				createdAt: entity.articleGeneratedAt ?? Date.now()
			});
		}

		await ctx.db.patch(args.id, {
			article: undefined,
			articleGeneratedAt: undefined
		});
	}
});

export const toggleLike = mutation({
	args: { contentId: v.id('content'), groupId: v.optional(v.id('groups')) },
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Unauthorized');

		const existing = await ctx.db
			.query('content_reactions')
			.withIndex('by_content_user', (q) => q.eq('contentId', args.contentId).eq('userId', user._id))
			.filter((q) => q.eq(q.field('groupId'), args.groupId))
			.unique();

		if (existing) {
			await ctx.db.delete(existing._id);
			if (existing.like_dislike === 1) {
				if (!args.groupId) await contentLikesAggregate.delete(ctx, existing);
			} else {
				if (!args.groupId) await contentDislikesAggregate.delete(ctx, existing);
				const id = await ctx.db.insert('content_reactions', {
					contentId: args.contentId,
					userId: user._id,
					like_dislike: 1,
					groupId: args.groupId
				});
				if (!args.groupId) {
					const doc = await ctx.db.get(id);
					await contentLikesAggregate.insert(ctx, doc!);
				}
			}
		} else {
			const id = await ctx.db.insert('content_reactions', {
				contentId: args.contentId,
				userId: user._id,
				like_dislike: 1,
				groupId: args.groupId
			});
			if (!args.groupId) {
				const doc = await ctx.db.get(id);
				await contentLikesAggregate.insert(ctx, doc!);
			}
		}
	}
});

export const toggleDislike = mutation({
	args: { contentId: v.id('content'), groupId: v.optional(v.id('groups')) },
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Unauthorized');

		const existing = await ctx.db
			.query('content_reactions')
			.withIndex('by_content_user', (q) => q.eq('contentId', args.contentId).eq('userId', user._id))
			.filter((q) => q.eq(q.field('groupId'), args.groupId))
			.unique();

		if (existing) {
			await ctx.db.delete(existing._id);
			if (existing.like_dislike === -1) {
				if (!args.groupId) await contentDislikesAggregate.delete(ctx, existing);
			} else {
				if (!args.groupId) await contentLikesAggregate.delete(ctx, existing);
				const id = await ctx.db.insert('content_reactions', {
					contentId: args.contentId,
					userId: user._id,
					like_dislike: -1,
					groupId: args.groupId
				});
				if (!args.groupId) {
					const doc = await ctx.db.get(id);
					await contentDislikesAggregate.insert(ctx, doc!);
				}
			}
		} else {
			const id = await ctx.db.insert('content_reactions', {
				contentId: args.contentId,
				userId: user._id,
				like_dislike: -1,
				groupId: args.groupId
			});
			if (!args.groupId) {
				const doc = await ctx.db.get(id);
				await contentDislikesAggregate.insert(ctx, doc!);
			}
		}
	}
});

export const addComment = mutation({
	args: {
		contentId: v.id('content'),
		body: v.string(),
		parentId: v.optional(v.id('content_comments')),
		groupId: v.optional(v.id('groups'))
	},
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Unauthorized');

		const id = await ctx.db.insert('content_comments', {
			contentId: args.contentId,
			userId: user._id,
			userName: user.name,
			body: args.body,
			parentId: args.parentId,
			createdAt: Date.now(),
			groupId: args.groupId
		});
		if (!args.groupId) {
			const doc = await ctx.db.get(id);
			await contentCommentsAggregate.insert(ctx, doc!);
		}
		return id;
	}
});

export const removeComment = mutation({
	args: { id: v.id('content_comments') },
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Unauthorized');

		const comment = await ctx.db.get(args.id);
		if (!comment) throw new Error('Comment not found');

		const isAdmin = Array.isArray(user.role) ? user.role.includes('admin') : user.role === 'admin';
		if (comment.userId !== user._id && !isAdmin) {
			throw new Error('Forbidden');
		}

		// Check if it has child comments
		const childComments = await ctx.db
			.query('content_comments')
			.withIndex('by_parent', (q) => q.eq('parentId', args.id))
			.first();

		if (childComments) {
			// Soft delete: keep node but mask content
			await ctx.db.patch(args.id, {
				userName: 'Deleted',
				body: 'This message was deleted by the user'
			});
		} else {
			// Hard delete: remove normally
			await deleteContentCommentWithReactions(ctx, args.id);
		}
	}
});

export const toggleCommentLike = mutation({
	args: { commentId: v.id('content_comments') },
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Unauthorized');

		const comment = await ctx.db.get(args.commentId);
		if (!comment) throw new Error('Comment not found');

		const existing = await ctx.db
			.query('content_comment_reactions')
			.withIndex('by_comment_user', (q) => q.eq('commentId', args.commentId).eq('userId', user._id))
			.unique();

		if (existing) {
			await ctx.db.delete(existing._id);
			if (existing.like_dislike === 1) {
				if (!comment.groupId) await contentCommentLikesAggregate.delete(ctx, existing);
			} else {
				if (!comment.groupId) await contentCommentDislikesAggregate.delete(ctx, existing);
				const id = await ctx.db.insert('content_comment_reactions', {
					commentId: args.commentId,
					userId: user._id,
					like_dislike: 1,
					groupId: comment.groupId
				});
				if (!comment.groupId) {
					const doc = await ctx.db.get(id);
					await contentCommentLikesAggregate.insert(ctx, doc!);
				}
			}
		} else {
			const id = await ctx.db.insert('content_comment_reactions', {
				commentId: args.commentId,
				userId: user._id,
				like_dislike: 1,
				groupId: comment.groupId
			});
			if (!comment.groupId) {
				const doc = await ctx.db.get(id);
				await contentCommentLikesAggregate.insert(ctx, doc!);
			}
		}
	}
});

export const toggleCommentDislike = mutation({
	args: { commentId: v.id('content_comments') },
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Unauthorized');

		const comment = await ctx.db.get(args.commentId);
		if (!comment) throw new Error('Comment not found');

		const existing = await ctx.db
			.query('content_comment_reactions')
			.withIndex('by_comment_user', (q) => q.eq('commentId', args.commentId).eq('userId', user._id))
			.unique();

		if (existing) {
			await ctx.db.delete(existing._id);
			if (existing.like_dislike === -1) {
				if (!comment.groupId) await contentCommentDislikesAggregate.delete(ctx, existing);
			} else {
				if (!comment.groupId) await contentCommentLikesAggregate.delete(ctx, existing);
				const id = await ctx.db.insert('content_comment_reactions', {
					commentId: args.commentId,
					userId: user._id,
					like_dislike: -1,
					groupId: comment.groupId
				});
				if (!comment.groupId) {
					const doc = await ctx.db.get(id);
					await contentCommentDislikesAggregate.insert(ctx, doc!);
				}
			}
		} else {
			const id = await ctx.db.insert('content_comment_reactions', {
				commentId: args.commentId,
				userId: user._id,
				like_dislike: -1,
				groupId: comment.groupId
			});
			if (!comment.groupId) {
				const doc = await ctx.db.get(id);
				await contentCommentDislikesAggregate.insert(ctx, doc!);
			}
		}
	}
});

export const getComments = query({
	args: { contentId: v.id('content'), groupId: v.optional(v.id('groups')) },
	handler: async (ctx, args) => {
		let commentsQuery = ctx.db
			.query('content_comments')
			.withIndex('by_content_created_at', (q) => q.eq('contentId', args.contentId));

		if (args.groupId) {
			commentsQuery = commentsQuery.filter((q) => q.eq(q.field('groupId'), args.groupId));
		} else {
			// Explicitly filter for public comments (no groupId)
			commentsQuery = commentsQuery.filter((q) => q.eq(q.field('groupId'), undefined));
		}

		const comments = await commentsQuery.order('asc').collect();

		const identity = await ctx.auth.getUserIdentity();
		const user = identity ? await authComponent.getAuthUser(ctx) : null;

		const enrichedComments = await Promise.all(
			comments.map(async (comment) => {
				let likes, dislikes;
				// Fetch the latest user info to avoid 'Unknown' names
				const userDoc = await authComponent.getAnyUserById(ctx, comment.userId);
				const currentUserName = userDoc?.name || comment.userName || 'Anonymous';
				if (args.groupId) {
					const reactions = await ctx.db
						.query('content_comment_reactions')
						.withIndex('by_group', (q) => q.eq('groupId', args.groupId))
						.filter((q) => q.eq(q.field('commentId'), comment._id))
						.collect();
					likes = reactions.filter((r) => r.like_dislike === 1).length;
					dislikes = reactions.filter((r) => r.like_dislike === -1).length;
				} else {
					[likes, dislikes] = await Promise.all([
						contentCommentLikesAggregate.count(ctx, {
							bounds: {
								lower: { key: comment._id, inclusive: true },
								upper: { key: comment._id, inclusive: true }
							}
						}),
						contentCommentDislikesAggregate.count(ctx, {
							bounds: {
								lower: { key: comment._id, inclusive: true },
								upper: { key: comment._id, inclusive: true }
							}
						})
					]);
				}

				let userReaction: 'like' | 'dislike' | null = null;
				if (user) {
					const reaction = await ctx.db
						.query('content_comment_reactions')
						.withIndex('by_comment_user', (q) =>
							q.eq('commentId', comment._id).eq('userId', user._id)
						)
						.filter((q) => q.eq(q.field('groupId'), args.groupId))
						.unique();
					if (reaction) {
						userReaction = reaction.like_dislike === 1 ? 'like' : 'dislike';
					}
				}

				return {
					...comment,
					userName: currentUserName,
					likes,
					dislikes,
					userReaction
				};
			})
		);

		return enrichedComments;
	}
});

export const getReactionCounts = query({
	args: { contentId: v.id('content'), groupId: v.optional(v.id('groups')) },
	handler: async (ctx, args) => {
		let likes, dislikes, commentCount;

		if (args.groupId) {
			const reactions = await ctx.db
				.query('content_reactions')
				.withIndex('by_group', (q) => q.eq('groupId', args.groupId))
				.filter((q) => q.eq(q.field('contentId'), args.contentId))
				.collect();
			likes = reactions.filter((r) => r.like_dislike === 1).length;
			dislikes = reactions.filter((r) => r.like_dislike === -1).length;

			const comments = await ctx.db
				.query('content_comments')
				.withIndex('by_group', (q) => q.eq('groupId', args.groupId))
				.filter((q) => q.eq(q.field('contentId'), args.contentId))
				.collect();
			commentCount = comments.length;
		} else {
			[likes, dislikes, commentCount] = await Promise.all([
				contentLikesAggregate.count(ctx, {
					bounds: {
						lower: { key: args.contentId, inclusive: true },
						upper: { key: args.contentId, inclusive: true }
					}
				}),
				contentDislikesAggregate.count(ctx, {
					bounds: {
						lower: { key: args.contentId, inclusive: true },
						upper: { key: args.contentId, inclusive: true }
					}
				}),
				contentCommentsAggregate.count(ctx, {
					bounds: {
						lower: { key: args.contentId, inclusive: true },
						upper: { key: args.contentId, inclusive: true }
					}
				})
			]);
		}

		const identity = await ctx.auth.getUserIdentity();
		const user = identity ? await authComponent.getAuthUser(ctx) : null;

		let userReaction: 'like' | 'dislike' | null = null;
		if (user) {
			const reaction = await ctx.db
				.query('content_reactions')
				.withIndex('by_content_user', (q) =>
					q.eq('contentId', args.contentId).eq('userId', user._id)
				)
				.filter((q) => q.eq(q.field('groupId'), args.groupId))
				.unique();
			if (reaction) {
				userReaction = reaction.like_dislike === 1 ? 'like' : 'dislike';
			}
		}

		return { likes, dislikes, commentCount, userReaction };
	}
});
