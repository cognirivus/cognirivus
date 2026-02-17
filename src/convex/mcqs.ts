/* eslint-disable @typescript-eslint/no-explicit-any */
import { v } from 'convex/values';
import { action, internalMutation, mutation, query } from './_generated/server';
import { paginationOptsValidator } from 'convex/server';
import { authComponent } from './auth';
import type { Doc, Id } from './_generated/dataModel';
import { api, components, internal } from './_generated/api';
import { createRag, getConfiguredRag, RAG_CONFIG } from './rag';

const MCQ_SIMILARITY_DEFAULT_LIMIT = 5;
const MCQ_SIMILARITY_DEFAULT_THRESHOLD = 0.55;
const MCQ_BULK_DELETE_DEFAULT_PARALLELISM = 8;
const MCQ_BULK_DELETE_MAX_PARALLELISM = 20;
const MCQ_CACHE_BATCH_DEFAULT_PARALLELISM = 4;
const MCQ_CACHE_BATCH_MAX_PARALLELISM = 12;

type SimilarMcq = Doc<'mcqs'> & { _score: number };
type SimilarMcqSearchResult = {
	modelId: string;
	dimension: number;
	limit: number;
	vectorScoreThreshold: number;
	mcqs: Array<SimilarMcq>;
};
const unsafeInternal = internal as any;

type RagNamespaceDoc = {
	namespaceId: string;
	namespace: string;
	modelId: string;
	dimension: number;
	status: 'pending' | 'ready' | 'replaced';
	version: number;
	createdAt: number;
};

type SimilarityCacheRowInput = {
	relatedMcqId: Id<'mcqs'>;
	score: number;
	rank: number;
};

type SimilarityCacheComputationResult = {
	mcqId: Id<'mcqs'>;
	cachedCount: number;
	modelId: string;
	dimension: number;
	namespaceVersion: number;
	limit: number;
	vectorScoreThreshold: number;
};

function normalizeLimit(limit?: number) {
	if (typeof limit !== 'number' || !Number.isFinite(limit)) return MCQ_SIMILARITY_DEFAULT_LIMIT;
	return Math.max(1, Math.min(20, Math.trunc(limit)));
}

function normalizeThreshold(threshold?: number) {
	if (typeof threshold !== 'number' || !Number.isFinite(threshold))
		return MCQ_SIMILARITY_DEFAULT_THRESHOLD;
	return Math.max(0, Math.min(1, threshold));
}

function normalizeParallelism(parallelism?: number) {
	if (typeof parallelism !== 'number' || !Number.isFinite(parallelism))
		return MCQ_BULK_DELETE_DEFAULT_PARALLELISM;
	return Math.max(1, Math.min(MCQ_BULK_DELETE_MAX_PARALLELISM, Math.trunc(parallelism)));
}

function normalizeCacheParallelism(parallelism?: number) {
	if (typeof parallelism !== 'number' || !Number.isFinite(parallelism))
		return MCQ_CACHE_BATCH_DEFAULT_PARALLELISM;
	return Math.max(1, Math.min(MCQ_CACHE_BATCH_MAX_PARALLELISM, Math.trunc(parallelism)));
}

function normalizeEmbeddingDimension(dimension?: number) {
	if (dimension === undefined) return undefined;
	if (!Number.isFinite(dimension)) {
		throw new Error('Embedding dimension must be a finite number');
	}
	const normalized = Math.trunc(dimension);
	if (normalized < 1) {
		throw new Error('Embedding dimension must be greater than 0');
	}
	return normalized;
}

function buildMcqSimilarityText(mcq: {
	question: string;
	option_a: string;
	option_b: string;
	option_c: string;
	option_d: string;
	correct_option: string;
	exam: string;
	mcq_type: string;
	year: number;
	tags?: string[];
	search_text?: string;
}) {
	return [
		`Question: ${mcq.question}`,
		`Option A: ${mcq.option_a}`,
		`Option B: ${mcq.option_b}`,
		`Option C: ${mcq.option_c}`,
		`Option D: ${mcq.option_d}`
	]
		.filter(Boolean)
		.join('\n');
}

async function listMcqNamespaces(ctx: any): Promise<Array<RagNamespaceDoc>> {
	let cursor: string | null = null;
	const namespaces: Array<RagNamespaceDoc> = [];

	while (true) {
		const result: {
			page: Array<RagNamespaceDoc>;
			isDone: boolean;
			continueCursor: string;
		} = await ctx.runQuery(components.rag.namespaces.listNamespaceVersions, {
			namespace: RAG_CONFIG.mcqNamespace,
			paginationOpts: {
				numItems: 50,
				cursor
			}
		});

		namespaces.push(...result.page);
		if (result.isDone) break;
		cursor = result.continueCursor;
	}

	return namespaces;
}

function buildNamespaceVersionLookup(namespaces: Array<RagNamespaceDoc>) {
	const lookup = new Map<string, number>();
	for (const namespace of namespaces) {
		if (namespace.status !== 'ready') continue;
		const key = `${namespace.modelId}::${namespace.dimension}`;
		const existing = lookup.get(key);
		if (existing === undefined || namespace.version > existing) {
			lookup.set(key, namespace.version);
		}
	}
	return lookup;
}

async function requireAdmin(ctx: any) {
	const user = await authComponent.getAuthUser(ctx);
	if (!user) {
		throw new Error('Unauthorized');
	}

	const role = user.role;
	const isAdmin = Array.isArray(role) ? role.includes('admin') : role === 'admin';
	if (!isAdmin) {
		throw new Error('Unauthorized: Admin access required');
	}

	return user;
}

type McqStatsSnapshot = {
	total: number;
	vectorised: number;
	pending: number;
	similarityCached: number;
	similarityPending: number;
	updatedAt: number;
};

function toNonNegativeInt(value: number) {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.trunc(value));
}

async function getMcqStatsDoc(ctx: any) {
	return await ctx.db
		.query('mcq_stats')
		.withIndex('by_type', (q: any) => q.eq('type', 'aggregate'))
		.first();
}

function normalizeStatsSnapshot(input: {
	total: number;
	vectorised: number;
	similarityCached: number;
	updatedAt?: number;
}): McqStatsSnapshot {
	const total = toNonNegativeInt(input.total);
	const vectorised = Math.min(total, toNonNegativeInt(input.vectorised));
	const similarityCached = Math.min(total, toNonNegativeInt(input.similarityCached));
	return {
		total,
		vectorised,
		pending: total - vectorised,
		similarityCached,
		similarityPending: total - similarityCached,
		updatedAt: input.updatedAt ?? Date.now()
	};
}

async function applyMcqStatsDelta(
	ctx: any,
	delta: {
		total?: number;
		vectorised?: number;
		similarityCached?: number;
	}
) {
	const statsDoc = await getMcqStatsDoc(ctx);
	if (!statsDoc) return;

	const next = normalizeStatsSnapshot({
		total: statsDoc.total + (delta.total ?? 0),
		vectorised: statsDoc.vectorised + (delta.vectorised ?? 0),
		similarityCached: statsDoc.similarityCached + (delta.similarityCached ?? 0),
		updatedAt: Date.now()
	});

	await ctx.db.patch(statsDoc._id, next);
}

async function fetchBlogQueryText(ctx: any, sourceId: string) {
	const blog = await ctx.runQuery(api.blogs.get, { id: sourceId as Id<'blogs'> });
	if (!blog) throw new Error('Blog not found');

	let body = blog.body || '';
	if (blog.bodyUrl) {
		try {
			const response = await fetch(blog.bodyUrl);
			if (response.ok) {
				body = await response.text();
			}
		} catch (e) {
			console.warn(`[MCQ:Similarity] Failed to load full blog body for ${sourceId}:`, e);
		}
	}

	return `${blog.title}\n\n${body}`;
}

async function fetchContentQueryText(ctx: any, sourceId: string) {
	const content = await ctx.runQuery(api.content.getById, { id: sourceId as Id<'content'> });
	if (!content) throw new Error('Content not found');
	return `${content.title}\n\n${content.body}`;
}

async function fetchFlashcardQueryText(ctx: any, sourceId: string) {
	const flashcard = await ctx.runQuery(api.flashcards.getById, {
		id: sourceId as Id<'flashcards'>
	});
	if (!flashcard) throw new Error('Flashcard not found');
	return `${flashcard.front}\n\n${flashcard.back}`;
}

async function fetchChatMessageQueryText(ctx: any, sourceId: string, userId: string) {
	const message = await ctx.runQuery(unsafeInternal.messages.get, { id: sourceId });
	if (!message) throw new Error('Message not found');
	if (message.userId !== userId) {
		throw new Error('Unauthorized: You can only use your own chat messages');
	}
	return message.body;
}

async function searchSimilarMcqs(
	ctx: any,
	queryText: string,
	options?: {
		limit?: number;
		vectorScoreThreshold?: number;
		excludeMcqId?: Id<'mcqs'>;
	}
): Promise<SimilarMcqSearchResult> {
	const limit = normalizeLimit(options?.limit);
	const vectorScoreThreshold = normalizeThreshold(options?.vectorScoreThreshold);
	const configured = await getConfiguredRag(ctx);
	let activeModelId = configured.modelId;
	let activeDimension = configured.dimension;

	const searchArgs = {
		namespace: RAG_CONFIG.mcqNamespace,
		query: queryText,
		limit,
		vectorScoreThreshold,
		chunkContext: RAG_CONFIG.search.mcq.chunkContext
	};

	const configuredNamespace = await configured.rag.getNamespace(ctx, {
		namespace: RAG_CONFIG.mcqNamespace
	});

	const trySearchInNamespace = async (modelId: string, dimension: number) => {
		const rag =
			modelId === configured.modelId && dimension === configured.dimension
				? configured.rag
				: createRag(modelId, dimension);
		return await rag.search(ctx, searchArgs);
	};

	let searchResult: Awaited<ReturnType<typeof configured.rag.search>> | null = null;
	if (configuredNamespace) {
		searchResult = await configured.rag.search(ctx, searchArgs);

		// If configured namespace exists but returns no matches, try older ready
		// namespace versions (common during embedding dimension/model migrations).
		if (searchResult.entries.length === 0) {
			const fallbackCandidates = (await listMcqNamespaces(ctx))
				.filter(
					(namespace) =>
						namespace.status === 'ready' &&
						namespace.namespaceId !== configuredNamespace.namespaceId
				)
				.sort((a, b) => b.version - a.version);

			for (const namespace of fallbackCandidates) {
				const fallbackResult = await trySearchInNamespace(namespace.modelId, namespace.dimension);
				if (fallbackResult.entries.length === 0) continue;
				searchResult = fallbackResult;
				activeModelId = namespace.modelId;
				activeDimension = namespace.dimension;
				break;
			}
		}
	}

	if (!searchResult) {
		const allNamespaces = await listMcqNamespaces(ctx);
		const fallbackNamespaces = allNamespaces
			.filter((namespace) => namespace.status === 'ready')
			.sort((a, b) => b.version - a.version);

		if (fallbackNamespaces.length === 0) {
			return {
				modelId: configured.modelId,
				dimension: configured.dimension,
				limit,
				vectorScoreThreshold,
				mcqs: []
			};
		}

		for (const namespace of fallbackNamespaces) {
			const fallbackResult = await trySearchInNamespace(namespace.modelId, namespace.dimension);
			searchResult = fallbackResult;
			activeModelId = namespace.modelId;
			activeDimension = namespace.dimension;
			if (fallbackResult.entries.length > 0) {
				break;
			}
		}
	}

	if (!searchResult) {
		return {
			modelId: activeModelId,
			dimension: activeDimension,
			limit,
			vectorScoreThreshold,
			mcqs: []
		};
	}

	const { results, entries } = searchResult;

	if (entries.length === 0) {
		return {
			modelId: activeModelId,
			dimension: activeDimension,
			limit,
			vectorScoreThreshold,
			mcqs: []
		};
	}

	const scoreByEntryId = new Map<string, number>();
	for (const result of results) {
		const prev = scoreByEntryId.get(result.entryId);
		if (prev === undefined || result.score > prev) {
			scoreByEntryId.set(result.entryId, result.score);
		}
	}

	const typedEntries = entries as Array<{ key?: string; entryId: string }>;
	const enriched: Array<SimilarMcq | null> = await Promise.all(
		typedEntries.map(async (entry) => {
			if (!entry.key) return null;
			const mcq = (await ctx.runQuery(api.mcqs.getById, {
				id: entry.key as Id<'mcqs'>
			})) as Doc<'mcqs'> | null;
			if (!mcq) return null;
			if (options?.excludeMcqId && mcq._id === options.excludeMcqId) return null;
			return {
				...mcq,
				_score: scoreByEntryId.get(entry.entryId) ?? 0
			};
		})
	);

	const mcqs = enriched
		.filter((item): item is SimilarMcq => !!item)
		.sort((a, b) => b._score - a._score)
		.slice(0, limit);

	return {
		modelId: activeModelId,
		dimension: activeDimension,
		limit,
		vectorScoreThreshold,
		mcqs
	};
}

async function computeAndPersistSimilarityCacheForMcq(
	ctx: any,
	mcqId: Id<'mcqs'>,
	options?: {
		limit?: number;
		vectorScoreThreshold?: number;
		namespaceVersionLookup?: Map<string, number>;
	}
): Promise<SimilarityCacheComputationResult> {
	const mcq = (await ctx.runQuery(api.mcqs.getById, { id: mcqId })) as Doc<'mcqs'> | null;
	if (!mcq) {
		throw new Error('MCQ not found');
	}

	const result = await searchSimilarMcqs(ctx, buildMcqSimilarityText(mcq), {
		limit: options?.limit,
		vectorScoreThreshold: options?.vectorScoreThreshold,
		excludeMcqId: mcq._id
	});

	let namespaceVersion = 0;
	const namespaceKey = `${result.modelId}::${result.dimension}`;
	if (options?.namespaceVersionLookup) {
		namespaceVersion = options.namespaceVersionLookup.get(namespaceKey) ?? 0;
	} else {
		const namespaces = await listMcqNamespaces(ctx);
		namespaceVersion = buildNamespaceVersionLookup(namespaces).get(namespaceKey) ?? 0;
	}

	const similarities: Array<SimilarityCacheRowInput> = result.mcqs.map((candidate, index) => ({
		relatedMcqId: candidate._id,
		score: candidate._score,
		rank: index + 1
	}));

	const generatedAt = Date.now();
	await ctx.runMutation(unsafeInternal.mcqs.replaceSimilarityCacheForMcq, {
		mcqId,
		similarities,
		modelId: result.modelId,
		dimension: result.dimension,
		namespace: RAG_CONFIG.mcqNamespace,
		namespaceVersion,
		generatedAt,
		source: 'auto'
	});

	return {
		mcqId,
		cachedCount: similarities.length,
		modelId: result.modelId,
		dimension: result.dimension,
		namespaceVersion,
		limit: result.limit,
		vectorScoreThreshold: result.vectorScoreThreshold
	};
}

async function deleteMcqVectorsAcrossKnownNamespaces(ctx: any, mcqId: Id<'mcqs'>) {
	const configured = await getConfiguredRag(ctx);
	const allNamespaces = await listMcqNamespaces(ctx);
	const namespaceIds = Array.from(new Set(allNamespaces.map((namespace) => namespace.namespaceId)));
	const rag = createRag(configured.modelId, configured.dimension);
	let deletedNamespaces = 0;

	for (const namespaceId of namespaceIds) {
		await rag.deleteByKey(ctx, {
			namespaceId: namespaceId as any,
			key: mcqId
		});
		deletedNamespaces += 1;
	}

	return {
		deletedNamespaces,
		modelId: configured.modelId,
		dimension: configured.dimension
	};
}

async function deleteMcqVectorsInBulk(
	ctx: any,
	mcqIds: Array<Id<'mcqs'>>,
	options?: {
		parallelism?: number;
	}
) {
	const uniqueIds = Array.from(new Set(mcqIds));
	const configured = await getConfiguredRag(ctx);
	const allNamespaces = await listMcqNamespaces(ctx);
	const namespaceIds = Array.from(new Set(allNamespaces.map((namespace) => namespace.namespaceId)));
	const rag = createRag(configured.modelId, configured.dimension);
	const parallelism = normalizeParallelism(options?.parallelism);

	if (uniqueIds.length === 0) {
		return {
			requested: 0,
			succeededIds: [] as Array<Id<'mcqs'>>,
			failedIds: [] as Array<Id<'mcqs'>>,
			failedDetails: [] as Array<{ mcqId: Id<'mcqs'>; error: string }>,
			deletedNamespaces: namespaceIds.length,
			modelId: configured.modelId,
			dimension: configured.dimension,
			parallelism
		};
	}

	// If no namespaces exist yet, there are no vectors to delete.
	if (namespaceIds.length === 0) {
		return {
			requested: uniqueIds.length,
			succeededIds: uniqueIds,
			failedIds: [] as Array<Id<'mcqs'>>,
			failedDetails: [] as Array<{ mcqId: Id<'mcqs'>; error: string }>,
			deletedNamespaces: 0,
			modelId: configured.modelId,
			dimension: configured.dimension,
			parallelism
		};
	}

	const succeededIds: Array<Id<'mcqs'>> = [];
	const failedIds: Array<Id<'mcqs'>> = [];
	const failedDetails: Array<{ mcqId: Id<'mcqs'>; error: string }> = [];
	let cursor = 0;

	const workerCount = Math.min(parallelism, uniqueIds.length);
	const workers = Array.from({ length: workerCount }, async () => {
		while (true) {
			const index = cursor;
			cursor += 1;
			if (index >= uniqueIds.length) {
				return;
			}

			const mcqId = uniqueIds[index];
			try {
				for (const namespaceId of namespaceIds) {
					await rag.deleteByKey(ctx, {
						namespaceId: namespaceId as any,
						key: mcqId
					});
				}
				succeededIds.push(mcqId);
			} catch (error) {
				failedIds.push(mcqId);
				failedDetails.push({
					mcqId,
					error: error instanceof Error ? error.message : 'Unknown delete error'
				});
			}
		}
	});

	await Promise.all(workers);

	return {
		requested: uniqueIds.length,
		succeededIds,
		failedIds,
		failedDetails,
		deletedNamespaces: namespaceIds.length,
		modelId: configured.modelId,
		dimension: configured.dimension,
		parallelism
	};
}

export const list = query({
	args: {
		paginationOpts: paginationOptsValidator,
		exam: v.optional(v.string()),
		year: v.optional(v.number()),
		mcqType: v.optional(v.string()),
		search: v.optional(v.string()),
		isVectorised: v.optional(v.boolean()),
		isSimilarityCached: v.optional(v.boolean())
	},
	handler: async (ctx, args) => {
		if (args.search) {
			const results = await ctx.db
				.query('mcqs')
				.withSearchIndex('search_question', (q) => {
					let sq = q.search('question', args.search!);
					if (args.exam) sq = sq.eq('exam', args.exam);
					if (args.mcqType) sq = sq.eq('mcq_type', args.mcqType);
					if (args.year) sq = sq.eq('year', args.year);
					return sq;
				})
				.collect();

			const matchedById = new Map<Id<'mcqs'>, Doc<'mcqs'>>();
			for (const m of results) {
				if (args.isVectorised !== undefined && m.is_vectorised !== args.isVectorised) continue;
				if (
					args.isSimilarityCached !== undefined &&
					Boolean(m.is_similarity_cached) !== args.isSimilarityCached
				)
					continue;
				matchedById.set(m._id, m);
			}

			const filtered = Array.from(matchedById.values()).sort(
				(a, b) => b._creationTime - a._creationTime
			);

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
			if (args.mcqType)
				mcqsQuery = mcqsQuery.filter((q) => q.eq(q.field('mcq_type'), args.mcqType));
			if (args.isVectorised !== undefined)
				mcqsQuery = mcqsQuery.filter((q) => q.eq(q.field('is_vectorised'), args.isVectorised));
			if (args.isSimilarityCached !== undefined)
				mcqsQuery =
					args.isSimilarityCached === true
						? mcqsQuery.filter((q) => q.eq(q.field('is_similarity_cached'), true))
						: mcqsQuery.filter((q) => q.neq(q.field('is_similarity_cached'), true));
		} else if (args.year) {
			mcqsQuery = ctx.db.query('mcqs').withIndex('by_year', (q) => q.eq('year', args.year!));
			if (args.mcqType)
				mcqsQuery = mcqsQuery.filter((q) => q.eq(q.field('mcq_type'), args.mcqType));
			if (args.isVectorised !== undefined)
				mcqsQuery = mcqsQuery.filter((q) => q.eq(q.field('is_vectorised'), args.isVectorised));
			if (args.isSimilarityCached !== undefined)
				mcqsQuery =
					args.isSimilarityCached === true
						? mcqsQuery.filter((q) => q.eq(q.field('is_similarity_cached'), true))
						: mcqsQuery.filter((q) => q.neq(q.field('is_similarity_cached'), true));
		} else if (args.mcqType) {
			mcqsQuery = ctx.db
				.query('mcqs')
				.withIndex('by_mcq_type', (q) => q.eq('mcq_type', args.mcqType!));
			if (args.year) mcqsQuery = mcqsQuery.filter((q) => q.eq(q.field('year'), args.year));
			if (args.isVectorised !== undefined)
				mcqsQuery = mcqsQuery.filter((q) => q.eq(q.field('is_vectorised'), args.isVectorised));
			if (args.isSimilarityCached !== undefined)
				mcqsQuery =
					args.isSimilarityCached === true
						? mcqsQuery.filter((q) => q.eq(q.field('is_similarity_cached'), true))
						: mcqsQuery.filter((q) => q.neq(q.field('is_similarity_cached'), true));
		} else if (args.isVectorised !== undefined) {
			mcqsQuery = ctx.db
				.query('mcqs')
				.withIndex('by_is_vectorised', (q) => q.eq('is_vectorised', args.isVectorised!));
			if (args.isSimilarityCached !== undefined)
				mcqsQuery =
					args.isSimilarityCached === true
						? mcqsQuery.filter((q) => q.eq(q.field('is_similarity_cached'), true))
						: mcqsQuery.filter((q) => q.neq(q.field('is_similarity_cached'), true));
		} else if (args.isSimilarityCached === true) {
			mcqsQuery = ctx.db
				.query('mcqs')
				.withIndex('by_is_similarity_cached', (q) => q.eq('is_similarity_cached', true));
		} else if (args.isSimilarityCached === false) {
			mcqsQuery = ctx.db.query('mcqs').filter((q) => q.neq(q.field('is_similarity_cached'), true));
		} else {
			mcqsQuery = ctx.db.query('mcqs');
			if (args.year) mcqsQuery = mcqsQuery.filter((q) => q.eq(q.field('year'), args.year));
			if (args.mcqType)
				mcqsQuery = mcqsQuery.filter((q) => q.eq(q.field('mcq_type'), args.mcqType));
			if (args.isVectorised !== undefined)
				mcqsQuery = mcqsQuery.filter((q) => q.eq(q.field('is_vectorised'), args.isVectorised));
			if (args.isSimilarityCached !== undefined)
				mcqsQuery =
					args.isSimilarityCached === true
						? mcqsQuery.filter((q) => q.eq(q.field('is_similarity_cached'), true))
						: mcqsQuery.filter((q) => q.neq(q.field('is_similarity_cached'), true));
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

		const existing = await ctx.db
			.query('mcq_metadata')
			.withIndex('by_type', (q) => q.eq('type', 'aggregate'))
			.first();

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
		const metadata = await ctx.db
			.query('mcq_metadata')
			.withIndex('by_type', (q) => q.eq('type', 'aggregate'))
			.first();

		// Types always come from metadata — they don't depend on filters
		const types = metadata?.types ?? [];

		// Fast path: no filters active, return cached metadata
		if (metadata && !args.type && !args.exam && !args.year && !args.search) {
			return {
				types,
				exams: metadata.exams,
				years: metadata.years,
				tags: metadata.tags
			};
		}

		// Build an indexed query to narrow results instead of full table scan
		const exams = new Set<string>();
		const years = new Set<number>();
		const tags = new Set<string>();

		if (args.search) {
			// Use the search index with available filter fields
			let searchQuery = ctx.db.query('mcqs').withSearchIndex('search_question', (q) => {
				let sq = q.search('question', args.search!);
				if (args.exam) sq = sq.eq('exam', args.exam);
				if (args.type) sq = sq.eq('mcq_type', args.type);
				if (args.year) sq = sq.eq('year', args.year);
				return sq;
			});

			for await (const mcq of searchQuery) {
				exams.add(mcq.exam);
				years.add(mcq.year);
				for (const tag of mcq.tags) tags.add(tag);
			}
		} else {
			// Pick the best index based on which filters are active
			let indexedQuery;
			if (args.exam && args.year) {
				indexedQuery = ctx.db
					.query('mcqs')
					.withIndex('by_exam_year', (q) => q.eq('exam', args.exam!).eq('year', args.year!));
			} else if (args.exam) {
				indexedQuery = ctx.db.query('mcqs').withIndex('by_exam', (q) => q.eq('exam', args.exam!));
			} else if (args.type) {
				indexedQuery = ctx.db
					.query('mcqs')
					.withIndex('by_mcq_type', (q) => q.eq('mcq_type', args.type!));
			} else if (args.year) {
				indexedQuery = ctx.db.query('mcqs').withIndex('by_year', (q) => q.eq('year', args.year!));
			} else {
				// No indexed filter applicable — shouldn't reach here due to fast path above
				indexedQuery = ctx.db.query('mcqs');
			}

			// Stream and apply remaining in-memory filters, collecting only needed fields
			for await (const mcq of indexedQuery) {
				if (args.type && mcq.mcq_type !== args.type) continue;
				if (args.exam && mcq.exam !== args.exam) continue;
				if (args.year && mcq.year !== args.year) continue;

				exams.add(mcq.exam);
				years.add(mcq.year);
				for (const tag of mcq.tags) tags.add(tag);
			}
		}

		return {
			types,
			exams: Array.from(exams).sort(),
			years: Array.from(years).sort((a, b) => b - a),
			tags: Array.from(tags).sort()
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
	returns: v.number(),
	handler: async (ctx, args) => {
		const hasFilters = args.exam || args.year || args.mcqType;

		if (args.search) {
			// Use searchIndex instead of collect + JS filter
			let searchQuery = ctx.db.query('mcqs').withSearchIndex('search_question', (q) => {
				let sq = q.search('question', args.search!);
				if (args.exam) sq = sq.eq('exam', args.exam);
				if (args.mcqType) sq = sq.eq('mcq_type', args.mcqType);
				if (args.year) sq = sq.eq('year', args.year);
				return sq;
			});

			const matchedIds = new Set<Id<'mcqs'>>();
			for await (const _doc of searchQuery) {
				matchedIds.add(_doc._id);
			}

			return matchedIds.size;
		}

		// No filters: use pre-computed stats
		if (!hasFilters) {
			const stats = await getMcqStatsDoc(ctx);
			if (stats) return stats.total;
		}

		// Filtered: use best available index, stream count
		let mcqsQuery;
		if (args.exam && args.year) {
			mcqsQuery = ctx.db
				.query('mcqs')
				.withIndex('by_exam_year', (q) => q.eq('exam', args.exam!).eq('year', args.year!));
			if (args.mcqType)
				mcqsQuery = mcqsQuery.filter((q) => q.eq(q.field('mcq_type'), args.mcqType));
		} else if (args.exam) {
			mcqsQuery = ctx.db.query('mcqs').withIndex('by_exam', (q) => q.eq('exam', args.exam!));
			if (args.mcqType)
				mcqsQuery = mcqsQuery.filter((q) => q.eq(q.field('mcq_type'), args.mcqType));
		} else if (args.year) {
			mcqsQuery = ctx.db.query('mcqs').withIndex('by_year', (q) => q.eq('year', args.year!));
			if (args.mcqType)
				mcqsQuery = mcqsQuery.filter((q) => q.eq(q.field('mcq_type'), args.mcqType));
		} else if (args.mcqType) {
			mcqsQuery = ctx.db
				.query('mcqs')
				.withIndex('by_mcq_type', (q) => q.eq('mcq_type', args.mcqType!));
		} else {
			mcqsQuery = ctx.db.query('mcqs');
		}

		let count = 0;
		for await (const _doc of mcqsQuery) {
			count++;
		}
		return count;
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
		const mcqIds = [...new Set(responses.page.map((r) => r.mcqId))];
		const mcqs = await Promise.all(mcqIds.map((id) => ctx.db.get(id)));
		const mcqMap = new Map(
			mcqs.map((m) => (m ? ([m._id, m] as [Id<'mcqs'>, Doc<'mcqs'>]) : null)).filter(Boolean) as [
				Id<'mcqs'>,
				Doc<'mcqs'>
			][]
		);

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

		// Stream responses, collecting only what we need
		const responseData: Array<{ mcqId: Id<'mcqs'>; isCorrect: boolean }> = [];
		const uniqueMcqIds = new Set<Id<'mcqs'>>();

		for await (const resp of ctx.db
			.query('mcq_responses')
			.withIndex('by_user', (q) => q.eq('userId', user._id))) {
			responseData.push({ mcqId: resp.mcqId, isCorrect: resp.isCorrect });
			uniqueMcqIds.add(resp.mcqId);
		}

		if (responseData.length === 0) return null;

		const total = responseData.length;
		const correct = responseData.filter((r) => r.isCorrect).length;

		// Fetch unique MCQs in parallel
		const mcqs = await Promise.all([...uniqueMcqIds].map((id) => ctx.db.get(id)));
		const mcqMap = new Map(
			mcqs.map((m) => (m ? ([m._id, m] as [Id<'mcqs'>, Doc<'mcqs'>]) : null)).filter(Boolean) as [
				Id<'mcqs'>,
				Doc<'mcqs'>
			][]
		);

		// Group by Exam and Tag
		const examStats: Record<string, { total: number; correct: number }> = {};
		const tagStats: Record<string, { total: number; correct: number }> = {};

		for (const resp of responseData) {
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

export const updateVectorisationStatus = internalMutation({
	args: {
		mcqId: v.id('mcqs'),
		isVectorised: v.boolean(),
		ragEntryId: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const current = await ctx.db.get(args.mcqId);
		if (!current) return;
		const wasVectorised = current.is_vectorised;

		await ctx.db.patch(args.mcqId, {
			is_vectorised: args.isVectorised,
			ragEntryId: args.ragEntryId
		});

		if (wasVectorised !== args.isVectorised) {
			await applyMcqStatsDelta(ctx, {
				vectorised: args.isVectorised ? 1 : -1
			});
		}
	}
});

export const updateVectorisationStatusBulk = internalMutation({
	args: {
		mcqIds: v.array(v.id('mcqs')),
		isVectorised: v.boolean(),
		ragEntryId: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		let vectorisedDelta = 0;
		for (const mcqId of args.mcqIds) {
			const current = await ctx.db.get(mcqId);
			if (!current) continue;
			if (current.is_vectorised !== args.isVectorised) {
				vectorisedDelta += args.isVectorised ? 1 : -1;
			}

			await ctx.db.patch(mcqId, {
				is_vectorised: args.isVectorised,
				ragEntryId: args.ragEntryId
			});
		}

		if (vectorisedDelta !== 0) {
			await applyMcqStatsDelta(ctx, {
				vectorised: vectorisedDelta
			});
		}
	}
});

export const replaceSimilarityCacheForMcq = internalMutation({
	args: {
		mcqId: v.id('mcqs'),
		similarities: v.array(
			v.object({
				relatedMcqId: v.id('mcqs'),
				score: v.number(),
				rank: v.number()
			})
		),
		modelId: v.string(),
		dimension: v.number(),
		namespace: v.string(),
		namespaceVersion: v.number(),
		generatedAt: v.number(),
		source: v.union(v.literal('auto'), v.literal('manual'))
	},
	handler: async (ctx, args) => {
		const currentMcq = await ctx.db.get(args.mcqId);
		if (!currentMcq) return;
		const wasCached = Boolean(currentMcq.is_similarity_cached);

		const existing = await ctx.db
			.query('mcq_similarities')
			.withIndex('by_mcq_and_rank', (q) => q.eq('mcqId', args.mcqId))
			.collect();

		for (const row of existing) {
			await ctx.db.delete(row._id);
		}

		const uniqueRelatedIds = new Set<string>();
		let insertedCount = 0;
		for (const similarity of args.similarities) {
			if (similarity.relatedMcqId === args.mcqId) continue;
			if (uniqueRelatedIds.has(similarity.relatedMcqId)) continue;
			uniqueRelatedIds.add(similarity.relatedMcqId);

			await ctx.db.insert('mcq_similarities', {
				mcqId: args.mcqId,
				relatedMcqId: similarity.relatedMcqId,
				score: similarity.score,
				rank: similarity.rank,
				source: args.source,
				modelId: args.modelId,
				dimension: args.dimension,
				namespace: args.namespace,
				namespaceVersion: args.namespaceVersion,
				generatedAt: args.generatedAt,
				updatedAt: args.generatedAt
			});
			insertedCount += 1;
		}

		const isCachedNow = insertedCount > 0;
		await ctx.db.patch(args.mcqId, {
			is_similarity_cached: isCachedNow,
			similarity_cache_count: insertedCount,
			similarity_cache_updated_at: args.generatedAt,
			similarity_cache_model_id: args.modelId,
			similarity_cache_dimension: args.dimension,
			similarity_cache_namespace_version: args.namespaceVersion
		});

		if (wasCached !== isCachedNow) {
			await applyMcqStatsDelta(ctx, {
				similarityCached: isCachedNow ? 1 : -1
			});
		}
	}
});

export const clearSimilarityCacheForMcqIds = internalMutation({
	args: {
		mcqIds: v.array(v.id('mcqs'))
	},
	handler: async (ctx, args) => {
		const uniqueMcqIds = Array.from(new Set(args.mcqIds));
		let similarityCachedDelta = 0;

		for (const mcqId of uniqueMcqIds) {
			const currentMcq = await ctx.db.get(mcqId);
			const wasCached = Boolean(currentMcq?.is_similarity_cached);

			const cachedRows = await ctx.db
				.query('mcq_similarities')
				.withIndex('by_mcq_and_rank', (q) => q.eq('mcqId', mcqId))
				.collect();

			for (const row of cachedRows) {
				await ctx.db.delete(row._id);
			}

			await ctx.db.patch(mcqId, {
				is_similarity_cached: false,
				similarity_cache_count: 0,
				similarity_cache_updated_at: undefined,
				similarity_cache_model_id: undefined,
				similarity_cache_dimension: undefined,
				similarity_cache_namespace_version: undefined
			});

			if (wasCached) {
				similarityCachedDelta -= 1;
			}
		}

		if (similarityCachedDelta !== 0) {
			await applyMcqStatsDelta(ctx, {
				similarityCached: similarityCachedDelta
			});
		}
	}
});

export const rebuildMcqStatsInternal = internalMutation({
	args: {},
	handler: async (ctx) => {
		let vectorised = 0;
		for await (const _ of ctx.db
			.query('mcqs')
			.withIndex('by_is_vectorised', (q) => q.eq('is_vectorised', true))) {
			vectorised++;
		}
		let pending = 0;
		for await (const _ of ctx.db
			.query('mcqs')
			.withIndex('by_is_vectorised', (q) => q.eq('is_vectorised', false))) {
			pending++;
		}
		let similarityCached = 0;
		for await (const _ of ctx.db
			.query('mcqs')
			.withIndex('by_is_similarity_cached', (q) => q.eq('is_similarity_cached', true))) {
			similarityCached++;
		}

		const snapshot = normalizeStatsSnapshot({
			total: vectorised + pending,
			vectorised,
			similarityCached,
			updatedAt: Date.now()
		});

		const current = await getMcqStatsDoc(ctx);
		if (current) {
			await ctx.db.patch(current._id, snapshot);
		} else {
			await ctx.db.insert('mcq_stats', {
				type: 'aggregate',
				...snapshot
			});
		}

		return snapshot;
	}
});

export const rebuildMcqStats = action({
	args: {},
	handler: async (ctx) => {
		await requireAdmin(ctx);
		return await ctx.runMutation(unsafeInternal.mcqs.rebuildMcqStatsInternal, {});
	}
});

export const getVectorisationStats = query({
	args: {},
	handler: async (ctx) => {
		const stats = await getMcqStatsDoc(ctx);
		if (!stats) {
			return {
				total: 0,
				vectorised: 0,
				pending: 0,
				initialized: false
			};
		}

		return {
			total: stats.total,
			vectorised: stats.vectorised,
			pending: stats.pending,
			initialized: true
		};
	}
});

export const getSimilarityCacheStats = query({
	args: {},
	handler: async (ctx) => {
		const stats = await getMcqStatsDoc(ctx);
		if (!stats) {
			return {
				total: 0,
				cached: 0,
				pending: 0,
				initialized: false
			};
		}

		return {
			total: stats.total,
			cached: stats.similarityCached,
			pending: stats.similarityPending,
			initialized: true
		};
	}
});

export const getCachedSimilarForMcq = query({
	args: {
		mcqId: v.id('mcqs'),
		limit: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		const limit = normalizeLimit(args.limit);
		const rows = await ctx.db
			.query('mcq_similarities')
			.withIndex('by_mcq_and_rank', (q) => q.eq('mcqId', args.mcqId))
			.take(limit);

		const mcqs = await Promise.all(
			rows.map(async (row) => {
				const doc = await ctx.db.get(row.relatedMcqId);
				if (!doc) return null;
				return {
					...doc,
					_score: row.score,
					_rank: row.rank
				};
			})
		);

		const first = rows[0];
		return {
			cached: rows.length > 0,
			modelId: first?.modelId,
			dimension: first?.dimension,
			namespaceVersion: first?.namespaceVersion,
			generatedAt: first?.generatedAt,
			limit,
			mcqs: mcqs
				.filter((item): item is NonNullable<typeof item> => item !== null)
				.sort((a, b) => a._rank - b._rank)
		};
	}
});

export const backfillSimilarityIndex = action({
	args: {
		limit: v.optional(v.number()),
		embeddingDimension: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		await requireAdmin(ctx);
		const embeddingDimension = normalizeEmbeddingDimension(args.embeddingDimension);
		const maxToProcess =
			typeof args.limit === 'number' && Number.isFinite(args.limit)
				? Math.max(1, args.limit)
				: null;
		const pageSize = 50;
		const configured = await getConfiguredRag(ctx);
		const modelId = configured.modelId;
		const dimension = embeddingDimension ?? configured.dimension;
		const rag =
			embeddingDimension === undefined ? configured.rag : createRag(configured.modelId, dimension);

		let processed = 0;
		let indexed = 0;
		let failed = 0;
		let cursor: string | null = null;
		let done = false;

		while (!done) {
			const pageResult: {
				page: Array<Doc<'mcqs'>>;
				isDone: boolean;
				continueCursor: string;
			} = await ctx.runQuery(api.mcqs.list, {
				paginationOpts: { numItems: pageSize, cursor },
				exam: undefined,
				year: undefined,
				mcqType: undefined,
				search: undefined
			});

			for (const mcq of pageResult.page) {
				if (maxToProcess !== null && processed >= maxToProcess) {
					done = true;
					break;
				}

				processed++;
				try {
					const { entryId, replacedEntry } = await rag.add(ctx, {
						namespace: RAG_CONFIG.mcqNamespace,
						key: mcq._id,
						title: mcq.question.slice(0, 200),
						text: buildMcqSimilarityText(mcq)
					});

					await ctx.runMutation(unsafeInternal.mcqs.updateVectorisationStatus, {
						mcqId: mcq._id,
						isVectorised: true,
						ragEntryId: entryId
					});

					if (replacedEntry) {
						await rag.delete(ctx, { entryId: replacedEntry.entryId });
					}

					indexed++;
				} catch (error) {
					failed++;
					console.error(`[MCQ:Backfill] Failed to index ${mcq._id}:`, error);
				}
			}

			if (done || pageResult.isDone) {
				break;
			}

			cursor = pageResult.continueCursor;
		}

		return {
			processed,
			indexed,
			failed,
			modelId,
			dimension
		};
	}
});

export const syncSimilarityIndexById = action({
	args: {
		mcqId: v.id('mcqs'),
		embeddingDimension: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		await requireAdmin(ctx);
		const embeddingDimension = normalizeEmbeddingDimension(args.embeddingDimension);

		const mcq = (await ctx.runQuery(api.mcqs.getById, {
			id: args.mcqId
		})) as Doc<'mcqs'> | null;
		if (!mcq) {
			throw new Error('MCQ not found');
		}

		const configured = await getConfiguredRag(ctx);
		const modelId = configured.modelId;
		const dimension = embeddingDimension ?? configured.dimension;
		const rag =
			embeddingDimension === undefined ? configured.rag : createRag(configured.modelId, dimension);
		const { entryId, replacedEntry } = await rag.add(ctx, {
			namespace: RAG_CONFIG.mcqNamespace,
			key: mcq._id,
			title: mcq.question.slice(0, 200),
			text: buildMcqSimilarityText(mcq)
		});

		await ctx.runMutation(unsafeInternal.mcqs.updateVectorisationStatus, {
			mcqId: mcq._id,
			isVectorised: true,
			ragEntryId: entryId
		});

		if (replacedEntry) {
			await rag.delete(ctx, { entryId: replacedEntry.entryId });
		}

		return {
			mcqId: mcq._id,
			ragEntryId: entryId,
			modelId,
			dimension
		};
	}
});

export const deleteSimilarityIndexById = action({
	args: {
		mcqId: v.id('mcqs')
	},
	handler: async (ctx, args) => {
		await requireAdmin(ctx);

		const mcq = (await ctx.runQuery(api.mcqs.getById, {
			id: args.mcqId
		})) as Doc<'mcqs'> | null;
		if (!mcq) {
			throw new Error('MCQ not found');
		}

		const result = await deleteMcqVectorsAcrossKnownNamespaces(ctx, mcq._id);

		await ctx.runMutation(unsafeInternal.mcqs.updateVectorisationStatus, {
			mcqId: mcq._id,
			isVectorised: false,
			ragEntryId: undefined
		});
		await ctx.runMutation(unsafeInternal.mcqs.clearSimilarityCacheForMcqIds, {
			mcqIds: [mcq._id]
		});

		return {
			mcqId: mcq._id,
			deletedNamespaces: result.deletedNamespaces,
			modelId: result.modelId,
			dimension: result.dimension
		};
	}
});

export const deleteSimilarityIndexByIds = action({
	args: {
		mcqIds: v.array(v.id('mcqs')),
		parallelism: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		await requireAdmin(ctx);

		const result = await deleteMcqVectorsInBulk(ctx, args.mcqIds, {
			parallelism: args.parallelism
		});

		if (result.succeededIds.length > 0) {
			await ctx.runMutation(unsafeInternal.mcqs.updateVectorisationStatusBulk, {
				mcqIds: result.succeededIds,
				isVectorised: false,
				ragEntryId: undefined
			});
			await ctx.runMutation(unsafeInternal.mcqs.clearSimilarityCacheForMcqIds, {
				mcqIds: result.succeededIds
			});
		}

		return {
			requested: result.requested,
			succeeded: result.succeededIds.length,
			failed: result.failedIds.length,
			failedIds: result.failedIds,
			failedDetails: result.failedDetails,
			deletedNamespaces: result.deletedNamespaces,
			modelId: result.modelId,
			dimension: result.dimension,
			parallelism: result.parallelism
		};
	}
});

export const seedSimilarityCacheById = action({
	args: {
		mcqId: v.id('mcqs'),
		limit: v.optional(v.number()),
		vectorScoreThreshold: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		await requireAdmin(ctx);

		return await computeAndPersistSimilarityCacheForMcq(ctx, args.mcqId, {
			limit: args.limit,
			vectorScoreThreshold: args.vectorScoreThreshold
		});
	}
});

export const seedSimilarityCacheByIds = action({
	args: {
		mcqIds: v.array(v.id('mcqs')),
		limit: v.optional(v.number()),
		vectorScoreThreshold: v.optional(v.number()),
		parallelism: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		await requireAdmin(ctx);

		const uniqueIds = Array.from(new Set(args.mcqIds));
		const parallelism = normalizeCacheParallelism(args.parallelism);

		if (uniqueIds.length === 0) {
			return {
				requested: 0,
				succeeded: 0,
				failed: 0,
				failedIds: [] as Array<Id<'mcqs'>>,
				failedDetails: [] as Array<{ mcqId: Id<'mcqs'>; error: string }>
			};
		}

		const namespaces = await listMcqNamespaces(ctx);
		const namespaceVersionLookup = buildNamespaceVersionLookup(namespaces);
		const failedIds: Array<Id<'mcqs'>> = [];
		const failedDetails: Array<{ mcqId: Id<'mcqs'>; error: string }> = [];
		let succeeded = 0;
		let cursor = 0;

		const workers = Array.from({ length: Math.min(parallelism, uniqueIds.length) }, async () => {
			while (true) {
				const index = cursor;
				cursor += 1;
				if (index >= uniqueIds.length) {
					return;
				}

				const mcqId = uniqueIds[index];
				try {
					await computeAndPersistSimilarityCacheForMcq(ctx, mcqId, {
						limit: args.limit,
						vectorScoreThreshold: args.vectorScoreThreshold,
						namespaceVersionLookup
					});
					succeeded += 1;
				} catch (error) {
					failedIds.push(mcqId);
					failedDetails.push({
						mcqId,
						error: error instanceof Error ? error.message : 'Unknown cache seed error'
					});
				}
			}
		});

		await Promise.all(workers);

		return {
			requested: uniqueIds.length,
			succeeded,
			failed: failedIds.length,
			failedIds,
			failedDetails
		};
	}
});

export const deleteSimilarityCacheByIds = action({
	args: {
		mcqIds: v.array(v.id('mcqs'))
	},
	handler: async (ctx, args) => {
		await requireAdmin(ctx);
		const uniqueIds = Array.from(new Set(args.mcqIds));
		await ctx.runMutation(unsafeInternal.mcqs.clearSimilarityCacheForMcqIds, {
			mcqIds: uniqueIds
		});

		return {
			requested: uniqueIds.length,
			deleted: uniqueIds.length
		};
	}
});

export const findSimilarByText = action({
	args: {
		query: v.string(),
		limit: v.optional(v.number()),
		vectorScoreThreshold: v.optional(v.number()),
		excludeMcqId: v.optional(v.id('mcqs'))
	},
	handler: async (ctx, args) => {
		return await searchSimilarMcqs(ctx, args.query, {
			limit: args.limit,
			vectorScoreThreshold: args.vectorScoreThreshold,
			excludeMcqId: args.excludeMcqId
		});
	}
});

export const findSimilarBySource = action({
	args: {
		sourceType: v.union(
			v.literal('mcq'),
			v.literal('blog'),
			v.literal('content'),
			v.literal('chat_message'),
			v.literal('flashcard')
		),
		sourceId: v.string(),
		limit: v.optional(v.number()),
		vectorScoreThreshold: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		let queryText = '';
		let excludeMcqId: Id<'mcqs'> | undefined = undefined;

		if (args.sourceType === 'mcq') {
			const mcq = (await ctx.runQuery(api.mcqs.getById, {
				id: args.sourceId as Id<'mcqs'>
			})) as Doc<'mcqs'> | null;
			if (!mcq) {
				throw new Error('MCQ not found');
			}
			queryText = buildMcqSimilarityText(mcq);
			excludeMcqId = mcq._id;
		} else if (args.sourceType === 'blog') {
			queryText = await fetchBlogQueryText(ctx, args.sourceId);
		} else if (args.sourceType === 'content') {
			queryText = await fetchContentQueryText(ctx, args.sourceId);
		} else if (args.sourceType === 'flashcard') {
			queryText = await fetchFlashcardQueryText(ctx, args.sourceId);
		} else if (args.sourceType === 'chat_message') {
			const user = await authComponent.getAuthUser(ctx);
			if (!user) throw new Error('Unauthorized');
			queryText = await fetchChatMessageQueryText(ctx, args.sourceId, user._id);
		}

		const result = await searchSimilarMcqs(ctx, queryText, {
			limit: args.limit,
			vectorScoreThreshold: args.vectorScoreThreshold,
			excludeMcqId
		});

		return {
			sourceType: args.sourceType,
			sourceId: args.sourceId,
			queryText,
			...result
		};
	}
});
