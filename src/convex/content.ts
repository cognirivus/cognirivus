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
import { rateLimiter } from './lib/rateLimits';
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

const toEntitySlug = (value: string) =>
	value
		.toLowerCase()
		.replace(/[^\w\s-]/g, '')
		.replace(/[\s_-]+/g, '-')
		.replace(/^-+|-+$/g, '');

const getGroupShareKey = (
	share: {
		groupId: Id<'groups'>;
		contentId?: Id<'content'>;
		blogId?: Id<'blogs'>;
		newsId?: Id<'news'>;
		entityId?: Id<'entities'>;
	},
	entityIdOverride?: Id<'entities'>
) => {
	return [
		share.groupId,
		share.contentId ?? '',
		share.blogId ?? '',
		share.newsId ?? '',
		entityIdOverride ?? share.entityId ?? ''
	].join('|');
};

async function resolveEntityBySlugAndType(ctx: any, slug: string, type: string) {
	const direct = await ctx.db
		.query('entities')
		.withIndex('by_slug_and_type', (q: any) => q.eq('slug', slug).eq('type', type))
		.first();

	if (direct) return direct;

	const alias = await ctx.db
		.query('entity_aliases')
		.withIndex('by_slug_and_type', (q: any) => q.eq('slug', slug).eq('type', type))
		.first();

	if (!alias) return null;
	return await ctx.db.get(alias.entityId);
}

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

export const removeBulk = mutation({
	args: { ids: v.array(v.id('content')) },
	handler: async (ctx, args) => {
		await checkAdmin(ctx);

		for (const id of args.ids) {
			// Delete entity links
			const links = await ctx.db
				.query('content_entities')
				.withIndex('by_content', (q) => q.eq('contentId', id))
				.collect();
			for (const link of links) {
				await ctx.db.delete(link._id);
			}

			// Delete flashcards
			const flashcards = await ctx.db
				.query('flashcards')
				.withIndex('by_content', (q) => q.eq('contentId', id))
				.collect();
			for (const card of flashcards) {
				// Delete flashcard progress
				const progress = await ctx.db
					.query('user_flashcard_progress')
					.withIndex('by_flashcard', (q) => q.eq('flashcardId', card._id))
					.collect();
				for (const p of progress) {
					await ctx.db.delete(p._id);
				}
				await ctx.db.delete(card._id);
			}

			// Delete reactions
			const reactions = await ctx.db
				.query('content_reactions')
				.withIndex('by_content', (q) => q.eq('contentId', id))
				.collect();
			for (const r of reactions) {
				await ctx.db.delete(r._id);
				if (r.like_dislike === 1) {
					await contentLikesAggregate.delete(ctx, r);
				} else {
					await contentDislikesAggregate.delete(ctx, r);
				}
			}

			// Delete comments
			const comments = await ctx.db
				.query('content_comments')
				.withIndex('by_content', (q) => q.eq('contentId', id))
				.collect();
			for (const comment of comments) {
				await deleteContentCommentWithReactions(ctx, comment._id);
			}

			await ctx.db.delete(id);
		}

		return args.ids;
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
	const slug = toEntitySlug(entityName);

	let entity = await resolveEntityBySlugAndType(ctx, slug, entityType);

	if (!entity) {
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
		const direct = await ctx.db
			.query('entities')
			.withIndex('by_slug_and_type', (q) => q.eq('slug', args.slug).eq('type', args.type))
			.first();

		if (direct) return direct;

		const alias = await ctx.db
			.query('entity_aliases')
			.withIndex('by_slug_and_type', (q) => q.eq('slug', args.slug).eq('type', args.type))
			.first();

		if (!alias) return null;
		return await ctx.db.get(alias.entityId);
	}
});

export const getEntity = query({
	args: { id: v.id('entities') },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.id);
	}
});

export const createEntity = mutation({
	args: {
		name: v.string(),
		type: v.string(),
		slug: v.optional(v.string())
	},
	returns: v.id('entities'),
	handler: async (ctx, args) => {
		await checkAdmin(ctx);

		const name = args.name.trim();
		const type = args.type.trim();
		const slug = toEntitySlug(args.slug?.trim() || name);

		if (!name) throw new Error('Entity name is required');
		if (!type) throw new Error('Entity type is required');
		if (!slug) throw new Error('Entity slug is required');

		const existing = await ctx.db
			.query('entities')
			.withIndex('by_slug_and_type', (q) => q.eq('slug', slug).eq('type', type))
			.first();
		if (existing) {
			throw new Error('An entity with the same slug and type already exists');
		}

		const alias = await ctx.db
			.query('entity_aliases')
			.withIndex('by_slug_and_type', (q) => q.eq('slug', slug).eq('type', type))
			.first();
		if (alias) {
			throw new Error('Slug/type is reserved by a merged entity alias');
		}

		return await ctx.db.insert('entities', {
			name,
			type,
			slug
		});
	}
});

export const updateEntity = mutation({
	args: {
		id: v.id('entities'),
		name: v.string(),
		type: v.string(),
		slug: v.optional(v.string())
	},
	returns: v.id('entities'),
	handler: async (ctx, args) => {
		await checkAdmin(ctx);

		const entity = await ctx.db.get(args.id);
		if (!entity) throw new Error('Entity not found');

		const name = args.name.trim();
		const type = args.type.trim();
		const slug = toEntitySlug(args.slug?.trim() || name);

		if (!name) throw new Error('Entity name is required');
		if (!type) throw new Error('Entity type is required');
		if (!slug) throw new Error('Entity slug is required');

		const conflict = await ctx.db
			.query('entities')
			.withIndex('by_slug_and_type', (q) => q.eq('slug', slug).eq('type', type))
			.first();
		if (conflict && conflict._id !== args.id) {
			throw new Error('Another entity already uses this slug and type');
		}

		const aliasConflict = await ctx.db
			.query('entity_aliases')
			.withIndex('by_slug_and_type', (q) => q.eq('slug', slug).eq('type', type))
			.first();
		if (aliasConflict && aliasConflict.entityId !== args.id) {
			throw new Error('Slug/type is reserved by a merged entity alias');
		}

		const slugOrTypeChanged = entity.slug !== slug || entity.type !== type;
		await ctx.db.patch(args.id, { name, type, slug });

		if (slugOrTypeChanged) {
			const existingAlias = await ctx.db
				.query('entity_aliases')
				.withIndex('by_slug_and_type', (q) => q.eq('slug', entity.slug).eq('type', entity.type))
				.first();

			if (existingAlias) {
				await ctx.db.patch(existingAlias._id, {
					entityId: args.id,
					sourceEntityId: args.id,
					sourceName: entity.name,
					createdAt: Date.now()
				});
			} else {
				await ctx.db.insert('entity_aliases', {
					slug: entity.slug,
					type: entity.type,
					entityId: args.id,
					sourceEntityId: args.id,
					sourceName: entity.name,
					createdAt: Date.now()
				});
			}
		}

		return args.id;
	}
});

export const deleteEntity = mutation({
	args: { id: v.id('entities') },
	returns: v.id('entities'),
	handler: async (ctx, args) => {
		await checkAdmin(ctx);

		const entity = await ctx.db.get(args.id);
		if (!entity) throw new Error('Entity not found');

		const links = await ctx.db
			.query('content_entities')
			.withIndex('by_entity', (q) => q.eq('entityId', args.id))
			.collect();
		for (const link of links) {
			await ctx.db.delete(link._id);
		}

		const archiveEntries = await ctx.db
			.query('article_archive')
			.withIndex('by_entity', (q) => q.eq('entityId', args.id))
			.collect();
		for (const entry of archiveEntries) {
			await ctx.db.delete(entry._id);
		}

		const sharedEntries = await ctx.db
			.query('group_shared_content')
			.withIndex('by_entity', (q) => q.eq('entityId', args.id))
			.collect();
		for (const shared of sharedEntries) {
			await ctx.db.delete(shared._id);
		}

		const aliasesByEntity = await ctx.db
			.query('entity_aliases')
			.withIndex('by_entity', (q) => q.eq('entityId', args.id))
			.collect();
		for (const alias of aliasesByEntity) {
			await ctx.db.delete(alias._id);
		}

		const aliasesBySource = await ctx.db
			.query('entity_aliases')
			.withIndex('by_source_entity', (q) => q.eq('sourceEntityId', args.id))
			.collect();
		for (const alias of aliasesBySource) {
			await ctx.db.delete(alias._id);
		}

		await ctx.db.delete(args.id);
		return args.id;
	}
});

export const previewEntityMerge = query({
	args: {
		canonicalEntityId: v.id('entities'),
		sourceEntityIds: v.array(v.id('entities'))
	},
	returns: v.any(),
	handler: async (ctx, args) => {
		await checkAdmin(ctx);

		const canonical = await ctx.db.get(args.canonicalEntityId);
		if (!canonical) throw new Error('Canonical entity not found');

		const sourceIds = Array.from(
			new Set(args.sourceEntityIds.filter((id) => id !== args.canonicalEntityId))
		);
		if (sourceIds.length === 0) {
			throw new Error('Provide at least one source entity different from the canonical entity');
		}

		const sourceEntities = await Promise.all(sourceIds.map((id) => ctx.db.get(id)));
		const missingSourceIds = sourceIds.filter((_, index) => !sourceEntities[index]);
		if (missingSourceIds.length > 0) {
			throw new Error(`Source entity not found: ${missingSourceIds.join(', ')}`);
		}

		const validSourceEntities = sourceEntities.filter(
			(entity): entity is NonNullable<typeof entity> => entity !== null
		);

		const typeMismatches = validSourceEntities
			.filter((source) => source.type !== canonical.type)
			.map((source) => ({
				id: source._id,
				name: source.name,
				type: source.type
			}));

		const canonicalContentLinks = await ctx.db
			.query('content_entities')
			.withIndex('by_entity', (q) => q.eq('entityId', canonical._id))
			.collect();
		const canonicalContentIds = new Set(canonicalContentLinks.map((link) => link.contentId));

		let totalSourceContentLinks = 0;
		const sourceLinkCountByContentId = new Map<Id<'content'>, number>();
		for (const source of validSourceEntities) {
			const links = await ctx.db
				.query('content_entities')
				.withIndex('by_entity', (q) => q.eq('entityId', source._id))
				.collect();
			totalSourceContentLinks += links.length;
			for (const link of links) {
				sourceLinkCountByContentId.set(
					link.contentId,
					(sourceLinkCountByContentId.get(link.contentId) ?? 0) + 1
				);
			}
		}

		let contentLinksToDelete = 0;
		for (const [contentId, count] of sourceLinkCountByContentId.entries()) {
			if (canonicalContentIds.has(contentId)) {
				contentLinksToDelete += count;
			} else if (count > 1) {
				contentLinksToDelete += count - 1;
			}
		}
		const contentLinksToPatch = totalSourceContentLinks - contentLinksToDelete;

		const canonicalGroupShares = await ctx.db
			.query('group_shared_content')
			.withIndex('by_entity', (q) => q.eq('entityId', canonical._id))
			.collect();
		const canonicalGroupShareKeys = new Set(
			canonicalGroupShares.map((share) => getGroupShareKey(share, canonical._id))
		);

		let totalSourceGroupShares = 0;
		const sourceGroupShareCounts = new Map<string, number>();
		for (const source of validSourceEntities) {
			const shares = await ctx.db
				.query('group_shared_content')
				.withIndex('by_entity', (q) => q.eq('entityId', source._id))
				.collect();
			totalSourceGroupShares += shares.length;
			for (const share of shares) {
				const patchedKey = getGroupShareKey(share, canonical._id);
				sourceGroupShareCounts.set(patchedKey, (sourceGroupShareCounts.get(patchedKey) ?? 0) + 1);
			}
		}

		let groupSharesToDelete = 0;
		for (const [key, count] of sourceGroupShareCounts.entries()) {
			if (canonicalGroupShareKeys.has(key)) {
				groupSharesToDelete += count;
			} else if (count > 1) {
				groupSharesToDelete += count - 1;
			}
		}
		const groupSharesToPatch = totalSourceGroupShares - groupSharesToDelete;

		let articleArchivesToPatch = 0;
		let sourceCurrentArticlesToArchive = 0;
		for (const source of validSourceEntities) {
			const sourceArchives = await ctx.db
				.query('article_archive')
				.withIndex('by_entity', (q) => q.eq('entityId', source._id))
				.collect();
			articleArchivesToPatch += sourceArchives.length;
			if (source.article) sourceCurrentArticlesToArchive++;
		}

		return {
			canonical: {
				id: canonical._id,
				name: canonical.name,
				type: canonical.type,
				slug: canonical.slug,
				hasArticle: !!canonical.article
			},
			sources: validSourceEntities.map((source) => ({
				id: source._id,
				name: source.name,
				type: source.type,
				slug: source.slug,
				hasArticle: !!source.article
			})),
			typeMismatches,
			counts: {
				totalSources: validSourceEntities.length,
				contentLinksTotal: totalSourceContentLinks,
				contentLinksToPatch,
				contentLinksToDelete,
				groupSharesTotal: totalSourceGroupShares,
				groupSharesToPatch,
				groupSharesToDelete,
				articleArchivesToPatch,
				sourceCurrentArticlesToArchive
			}
		};
	}
});

export const mergeEntities = mutation({
	args: {
		canonicalEntityId: v.id('entities'),
		sourceEntityIds: v.array(v.id('entities')),
		allowCrossType: v.optional(v.boolean())
	},
	returns: v.any(),
	handler: async (ctx, args) => {
		await checkAdmin(ctx);

		const canonical = await ctx.db.get(args.canonicalEntityId);
		if (!canonical) throw new Error('Canonical entity not found');

		const sourceIds = Array.from(
			new Set(args.sourceEntityIds.filter((id) => id !== args.canonicalEntityId))
		);
		if (sourceIds.length === 0) {
			throw new Error('Provide at least one source entity different from the canonical entity');
		}

		const sourceEntities = await Promise.all(sourceIds.map((id) => ctx.db.get(id)));
		const missingSourceIds = sourceIds.filter((_, index) => !sourceEntities[index]);
		if (missingSourceIds.length > 0) {
			throw new Error(`Source entity not found: ${missingSourceIds.join(', ')}`);
		}

		const validSourceEntities = sourceEntities.filter(
			(entity): entity is NonNullable<typeof entity> => entity !== null
		);
		const crossTypeSources = validSourceEntities.filter((source) => source.type !== canonical.type);
		if (crossTypeSources.length > 0 && !args.allowCrossType) {
			throw new Error(
				`Type mismatch for ${crossTypeSources.length} source entity/entities. ` +
					'Pass allowCrossType=true to force merge.'
			);
		}

		const stats = {
			contentLinksPatched: 0,
			contentLinksDeleted: 0,
			groupSharesPatched: 0,
			groupSharesDeleted: 0,
			articleArchivesPatched: 0,
			sourceArticlesArchived: 0,
			aliasesUpserted: 0,
			sourceEntitiesDeleted: 0,
			canonicalArticleFilledFromSource: false
		};

		const now = Date.now();
		let bestSourceArticle: { article: string; generatedAt: number } | null = null;

		const canonicalContentLinks = await ctx.db
			.query('content_entities')
			.withIndex('by_entity', (q) => q.eq('entityId', canonical._id))
			.collect();
		const canonicalContentIds = new Set(canonicalContentLinks.map((link) => link.contentId));

		const sourceLinksByContentId = new Map<Id<'content'>, Array<Id<'content_entities'>>>();
		for (const source of validSourceEntities) {
			const links = await ctx.db
				.query('content_entities')
				.withIndex('by_entity', (q) => q.eq('entityId', source._id))
				.collect();
			for (const link of links) {
				const list = sourceLinksByContentId.get(link.contentId) ?? [];
				list.push(link._id);
				sourceLinksByContentId.set(link.contentId, list);
			}
		}

		for (const [contentId, linkIds] of sourceLinksByContentId.entries()) {
			if (canonicalContentIds.has(contentId)) {
				for (const linkId of linkIds) {
					await ctx.db.delete(linkId);
					stats.contentLinksDeleted++;
				}
				continue;
			}

			const [firstLinkId, ...duplicates] = linkIds;
			await ctx.db.patch(firstLinkId, { entityId: canonical._id });
			stats.contentLinksPatched++;
			canonicalContentIds.add(contentId);

			for (const duplicateLinkId of duplicates) {
				await ctx.db.delete(duplicateLinkId);
				stats.contentLinksDeleted++;
			}
		}

		const canonicalGroupShares = await ctx.db
			.query('group_shared_content')
			.withIndex('by_entity', (q) => q.eq('entityId', canonical._id))
			.collect();
		const canonicalGroupShareKeys = new Set(
			canonicalGroupShares.map((share) => getGroupShareKey(share, canonical._id))
		);

		const sourceSharesByKey = new Map<string, Array<Id<'group_shared_content'>>>();
		for (const source of validSourceEntities) {
			const shares = await ctx.db
				.query('group_shared_content')
				.withIndex('by_entity', (q) => q.eq('entityId', source._id))
				.collect();

			for (const share of shares) {
				const key = getGroupShareKey(share, canonical._id);
				const list = sourceSharesByKey.get(key) ?? [];
				list.push(share._id);
				sourceSharesByKey.set(key, list);
			}
		}

		for (const [key, shareIds] of sourceSharesByKey.entries()) {
			if (canonicalGroupShareKeys.has(key)) {
				for (const shareId of shareIds) {
					await ctx.db.delete(shareId);
					stats.groupSharesDeleted++;
				}
				continue;
			}

			const [firstShareId, ...duplicates] = shareIds;
			await ctx.db.patch(firstShareId, { entityId: canonical._id });
			stats.groupSharesPatched++;
			canonicalGroupShareKeys.add(key);

			for (const duplicateShareId of duplicates) {
				await ctx.db.delete(duplicateShareId);
				stats.groupSharesDeleted++;
			}
		}

		for (const source of validSourceEntities) {
			const archives = await ctx.db
				.query('article_archive')
				.withIndex('by_entity', (q) => q.eq('entityId', source._id))
				.collect();
			for (const archive of archives) {
				await ctx.db.patch(archive._id, { entityId: canonical._id });
				stats.articleArchivesPatched++;
			}

			if (source.article) {
				await ctx.db.insert('article_archive', {
					entityId: canonical._id,
					article: source.article,
					createdAt: source.articleGeneratedAt ?? now
				});
				stats.sourceArticlesArchived++;

				const sourceArticleTime = source.articleGeneratedAt ?? 0;
				if (!bestSourceArticle || sourceArticleTime > bestSourceArticle.generatedAt) {
					bestSourceArticle = {
						article: source.article,
						generatedAt: sourceArticleTime
					};
				}
			}

			if (!(source.slug === canonical.slug && source.type === canonical.type)) {
				const existingAlias = await ctx.db
					.query('entity_aliases')
					.withIndex('by_slug_and_type', (q) => q.eq('slug', source.slug).eq('type', source.type))
					.first();

				if (existingAlias) {
					await ctx.db.patch(existingAlias._id, {
						entityId: canonical._id,
						sourceEntityId: source._id,
						sourceName: source.name,
						createdAt: now
					});
				} else {
					await ctx.db.insert('entity_aliases', {
						slug: source.slug,
						type: source.type,
						entityId: canonical._id,
						sourceEntityId: source._id,
						sourceName: source.name,
						createdAt: now
					});
				}
				stats.aliasesUpserted++;
			}
		}

		if (!canonical.article && bestSourceArticle) {
			await ctx.db.patch(canonical._id, {
				article: bestSourceArticle.article,
				articleGeneratedAt: bestSourceArticle.generatedAt || now
			});
			stats.canonicalArticleFilledFromSource = true;
		}

		for (const sourceId of sourceIds) {
			await ctx.db.delete(sourceId);
			stats.sourceEntitiesDeleted++;
		}

		return {
			canonicalEntityId: canonical._id,
			mergedSourceIds: sourceIds,
			stats
		};
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

export const removeEntitiesBulk = mutation({
	args: { ids: v.array(v.id('entities')) },
	handler: async (ctx, args) => {
		await checkAdmin(ctx);

		for (const id of args.ids) {
			const entity = await ctx.db.get(id);
			if (!entity) continue;

			// Archive article if exists before deleting entity
			if (entity.article) {
				await ctx.db.insert('article_archive', {
					entityId: id,
					article: entity.article,
					createdAt: entity.articleGeneratedAt ?? Date.now()
				});
			}

			// Delete content_entity links
			const links = await ctx.db
				.query('content_entities')
				.withIndex('by_entity', (q) => q.eq('entityId', id))
				.collect();
			for (const link of links) {
				await ctx.db.delete(link._id);
			}

			// Delete article archive entries
			const archiveEntries = await ctx.db
				.query('article_archive')
				.withIndex('by_entity', (q) => q.eq('entityId', id))
				.collect();
			for (const entry of archiveEntries) {
				await ctx.db.delete(entry._id);
			}

			// Delete group-shared entity references
			const sharedEntries = await ctx.db
				.query('group_shared_content')
				.withIndex('by_entity', (q) => q.eq('entityId', id))
				.collect();
			for (const shared of sharedEntries) {
				await ctx.db.delete(shared._id);
			}

			// Delete aliases referencing this entity
			const aliasesByEntity = await ctx.db
				.query('entity_aliases')
				.withIndex('by_entity', (q) => q.eq('entityId', id))
				.collect();
			for (const alias of aliasesByEntity) {
				await ctx.db.delete(alias._id);
			}

			const aliasesBySource = await ctx.db
				.query('entity_aliases')
				.withIndex('by_source_entity', (q) => q.eq('sourceEntityId', id))
				.collect();
			for (const alias of aliasesBySource) {
				await ctx.db.delete(alias._id);
			}

			await ctx.db.delete(id);
		}

		return args.ids;
	}
});

export const toggleLike = mutation({
	args: { contentId: v.id('content'), groupId: v.optional(v.id('groups')) },
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Unauthorized');
		await rateLimiter.limit(ctx, 'contentReaction', { key: user._id, throws: true });

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
		await rateLimiter.limit(ctx, 'contentReaction', { key: user._id, throws: true });

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
		await rateLimiter.limit(ctx, 'contentComment', { key: user._id, throws: true });

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
		await rateLimiter.limit(ctx, 'contentReaction', { key: user._id, throws: true });

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
		await rateLimiter.limit(ctx, 'contentReaction', { key: user._id, throws: true });

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
