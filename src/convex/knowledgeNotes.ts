import { v } from 'convex/values';
import {
	action,
	internalAction,
	internalMutation,
	internalQuery,
	mutation,
	query
} from './_generated/server';
import { internal } from './_generated/api';
import { getAuthUser } from './auth';
import { r2 } from './lib/r2';
import type { Id } from './_generated/dataModel';
import { z } from 'zod';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateObject } from 'ai';

const AGENT_NAME = 'note-synthesis';
const AGENT_VERSION = '2026-06-18';
const NOTE_INLINE_BODY_LIMIT = 1000;
const SNIPPET_LIMIT = 500;
const SOURCE_BODY_CONTEXT_LIMIT = 12000;
const NOTE_BODY_CONTEXT_LIMIT = 4000;
const CANDIDATE_NOTE_LIMIT = 8;
const DEFAULT_SUGGESTED_CONTENT_LIMIT = 5000;
const OPENROUTER_MODEL = 'google/gemma-4-31b-it:free';

const SYNTHESIS_SYSTEM_PROMPT = [
	'You are the Cognirivus knowledge system synthesis agent.',
	'Return ONLY a single JSON object. No markdown, no explanation, no code fences.',
	'The JSON must match this exact schema: { action: "update_existing_note" | "create_new_note" | "skip", cells: Array<{ title: string, cellType: "FACT" | "CONCEPT" | "PRINCIPLE" | "PROCEDURE" | "HEURISTIC" | "QUESTION", content: string, summary: string, topic?: string }>, changeSummary: string, aiReasoning: string, citations: Array<{ sourceItemId: string, title: string, url: string }>, entities?: Array<{ name: string, canonicalName: string, entityType: "person" | "organization" | "place" | "concept" | "event" | "technology", aliases: string[] }>, confidence: "low" | "medium" | "high", skipReason?: string }',
	'BREAK the source into multiple ATOMIC knowledge cells. Each cell covers ONE concept, fact, procedure, or principle.',
	'Maximum 8 cells per extraction. Each cell content should be 300-800 characters — concise, cited, self-contained.',
	'Never dump the entire source into a single cell. Split by topic/section/concept.',
	'Classify each cell as one of: FACT, CONCEPT, PRINCIPLE, PROCEDURE, HEURISTIC, QUESTION.',
	'Extract key entities (people, organizations, concepts, technologies, places, events) mentioned.',
	'For each entity, provide a canonical name, type, and optional aliases.',
	'Keep each cell concise and useful as durable knowledge prose.',
	'Skip when the source item is too thin, off-topic, or not useful.'
].join('\n');

const jobStatusValidator = v.union(
	v.literal('queued'),
	v.literal('running'),
	v.literal('ready_for_review'),
	v.literal('skipped'),
	v.literal('failed'),
	v.literal('cancelled')
);

const jobStageValidator = v.union(
	v.literal('queued'),
	v.literal('preparing_context'),
	v.literal('loading_source_body'),
	v.literal('matching_notes'),
	v.literal('calling_model'),
	v.literal('analyzing'),
	v.literal('validating_output'),
	v.literal('saving_suggestion'),
	v.literal('ready_for_review'),
	v.literal('failed')
);

const confidenceValidator = v.union(v.literal('low'), v.literal('medium'), v.literal('high'));

const citationValidator = v.object({
	sourceItemId: v.string(),
	title: v.string(),
	url: v.string()
});

const extractionJobValidator = v.object({
	_id: v.id('knowledge_extraction_jobs'),
	_creationTime: v.number(),
	sourceId: v.id('information_sources'),
	sourceVersionId: v.optional(v.id('source_versions')),
	userId: v.string(),
	status: v.union(
		v.literal('pending'),
		v.literal('running'),
		v.literal('completed'),
		v.literal('failed')
	),
	stage: v.optional(
		v.union(
			v.literal('queued'),
			v.literal('loading_source'),
			v.literal('synthesizing'),
			v.literal('saving'),
			v.literal('completed'),
			v.literal('failed')
		)
	),
	model: v.string(),
	promptVersion: v.string(),
	outputSummary: v.optional(v.string()),
	outputR2Key: v.optional(v.string()),
	tokenUsage: v.optional(
		v.object({
			input: v.number(),
			output: v.number()
		})
	),
	cost: v.optional(v.number()),
	error: v.optional(v.string()),
	startedAt: v.number(),
	completedAt: v.optional(v.number())
});

const pendingChangeDetailValidator = v.object({
	_id: v.id('knowledge_extracted_candidates'),
	_creationTime: v.number(),
	sourceId: v.id('information_sources'),
	extractionJobId: v.id('knowledge_extraction_jobs'),
	userId: v.string(),
	candidateKey: v.string(),
	cellType: v.union(
		v.literal('FACT'),
		v.literal('CONCEPT'),
		v.literal('PRINCIPLE'),
		v.literal('PROCEDURE'),
		v.literal('HEURISTIC'),
		v.literal('QUESTION')
	),
	title: v.string(),
	summary: v.string(),
	content: v.string(),
	r2Key: v.string(),
	status: v.union(
		v.literal('pending'),
		v.literal('approved'),
		v.literal('merged'),
		v.literal('rejected')
	),
	mergedIntoCellId: v.optional(v.id('knowledge_cells')),
	createdAt: v.number(),
	updatedAt: v.number()
});

const extractedCandidateValidator = v.object({
	_id: v.id('knowledge_extracted_candidates'),
	_creationTime: v.number(),
	sourceId: v.id('information_sources'),
	resolvedSourceItemId: v.optional(v.string()),
	extractionJobId: v.id('knowledge_extraction_jobs'),
	userId: v.string(),
	candidateKey: v.string(),
	cellType: v.union(
		v.literal('FACT'),
		v.literal('CONCEPT'),
		v.literal('PRINCIPLE'),
		v.literal('PROCEDURE'),
		v.literal('HEURISTIC'),
		v.literal('QUESTION')
	),
	title: v.string(),
	summary: v.string(),
	content: v.string(),
	r2Key: v.string(),
	status: v.union(
		v.literal('pending'),
		v.literal('approved'),
		v.literal('merged'),
		v.literal('rejected')
	),
	mergedIntoCellId: v.optional(v.id('knowledge_cells')),
	createdAt: v.number(),
	updatedAt: v.number()
});

const cellSummaryValidator = v.object({
	_id: v.id('knowledge_cells'),
	_creationTime: v.number(),
	cellKey: v.string(),
	title: v.string(),
	summary: v.string(),
	content: v.string(),
	cellType: v.union(
		v.literal('FACT'),
		v.literal('CONCEPT'),
		v.literal('PRINCIPLE'),
		v.literal('PROCEDURE'),
		v.literal('HEURISTIC'),
		v.literal('QUESTION')
	),
	topicId: v.id('knowledge_cell_topics'),
	source: v.union(v.literal('llm_extracted'), v.literal('human_created'), v.literal('community')),
	r2Key: v.string(),
	createdAt: v.number(),
	updatedAt: v.number()
});

const noteSummaryValidator = v.object({
	_id: v.id('knowledge_notes'),
	_creationTime: v.number(),
	title: v.string(),
	summary: v.string(),
	status: v.union(
		v.literal('draft'),
		v.literal('review'),
		v.literal('published'),
		v.literal('archived')
	),
	version: v.number(),
	cellCount: v.number(),
	createdAt: v.number(),
	updatedAt: v.number()
});

const sourceItemContextValidator = v.object({
	_id: v.string(),
	sourceId: v.string(),
	sourceTitle: v.string(),
	sourceType: v.union(v.literal('website'), v.literal('rss'), v.literal('youtube')),
	title: v.string(),
	url: v.string(),
	snippet: v.string(),
	body: v.optional(v.string()),
	bodyUrl: v.optional(v.string()),
	publishedAt: v.number()
});

const candidateNoteContextValidator = v.object({
	id: v.id('knowledge_cells'),
	title: v.string(),
	summary: v.string(),
	content: v.string(),
	updatedAt: v.number()
});

const synthesisContextValidator = v.object({
	job: extractionJobValidator,
	sourceItem: sourceItemContextValidator,
	candidateNotes: v.array(candidateNoteContextValidator)
});

const synthesisActionValidator = v.union(
	v.literal('update_existing_note'),
	v.literal('create_new_note'),
	v.literal('skip')
);

const synthesisCellValidator = v.object({
	title: v.string(),
	cellType: v.union(
		v.literal('FACT'),
		v.literal('CONCEPT'),
		v.literal('PRINCIPLE'),
		v.literal('PROCEDURE'),
		v.literal('HEURISTIC'),
		v.literal('QUESTION')
	),
	content: v.string(),
	summary: v.string(),
	topic: v.optional(v.string())
});

const synthesisOutputValidator = v.object({
	runId: v.optional(v.string()),
	action: synthesisActionValidator,
	cells: v.array(synthesisCellValidator),
	changeSummary: v.string(),
	aiReasoning: v.string(),
	citations: v.array(citationValidator),
	entities: v.array(
		v.object({
			name: v.string(),
			canonicalName: v.string(),
			entityType: v.union(
				v.literal('person'),
				v.literal('organization'),
				v.literal('place'),
				v.literal('concept'),
				v.literal('event'),
				v.literal('technology')
			),
			aliases: v.array(v.string())
		})
	),
	confidence: confidenceValidator,
	skipReason: v.optional(v.string())
});

const createSnippet = (value: string) => value.trim().replace(/\s+/g, ' ').slice(0, SNIPPET_LIMIT);

const createIdempotencyKey = (userAuthId: string, sourceItemId: Id<'source_items'>) =>
	`${userAuthId}:${sourceItemId}:${AGENT_VERSION}`;

type SynthesisCell = {
	title: string;
	cellType: 'FACT' | 'CONCEPT' | 'PRINCIPLE' | 'PROCEDURE' | 'HEURISTIC' | 'QUESTION';
	content: string;
	summary: string;
	topic?: string;
};

type SynthesisOutput = {
	runId?: string;
	action: 'update_existing_note' | 'create_new_note' | 'skip';
	cells: SynthesisCell[];
	changeSummary: string;
	aiReasoning: string;
	citations: Array<{ sourceItemId: string; title: string; url: string }>;
	entities: Array<{
		name: string;
		canonicalName: string;
		entityType: 'person' | 'organization' | 'place' | 'concept' | 'event' | 'technology';
		aliases: string[];
	}>;
	confidence: 'low' | 'medium' | 'high';
	skipReason?: string;
};

const canAccessSourceItem = async (
	ctx: any,
	userAuthId: string,
	sourceItemId: Id<'source_items'>
) => {
	const delivery = (
		await ctx.db
			.query('user_source_items')
			.withIndex('by_userAuthId_and_sourceItemId', (q: any) =>
				q.eq('userAuthId', userAuthId).eq('sourceItemId', sourceItemId)
			)
			.take(1)
	)[0];
	if (delivery) {
		return true;
	}
	const ownedShare = await ctx.db
		.query('posts')
		.withIndex('by_authorAuthId_and_sourceItemId_and_createdAt', (q: any) =>
			q.eq('authorAuthId', userAuthId).eq('sourceItemId', sourceItemId)
		)
		.take(1);
	return ownedShare.length > 0;
};

const parseSynthesisOutput = (value: unknown): SynthesisOutput => {
	console.log(
		`[parseSynthesisOutput] Input type: ${typeof value}, keys: ${value && typeof value === 'object' ? Object.keys(value as object).join(', ') : 'N/A'}`
	);
	if (!value || typeof value !== 'object') {
		throw new Error('AI returned an invalid response.');
	}
	const row = value as Record<string, unknown>;
	const action = row.action;
	console.log(`[parseSynthesisOutput] action=${action}, confidence=${row.confidence}`);
	if (action !== 'update_existing_note' && action !== 'create_new_note' && action !== 'skip') {
		throw new Error('AI returned an unsupported action.');
	}
	const confidence = row.confidence;
	if (confidence !== 'low' && confidence !== 'medium' && confidence !== 'high') {
		throw new Error('AI returned an invalid confidence value.');
	}
	const citations = Array.isArray(row.citations) ? row.citations : [];
	console.log(`[parseSynthesisOutput] Raw citations count: ${citations.length}`);
	if (citations.length > 0) {
		console.log(`[parseSynthesisOutput] First citation:`, JSON.stringify(citations[0]));
	}

	const rawCells = Array.isArray(row.cells) ? row.cells : [];
	const cells: SynthesisCell[] = rawCells
		.slice(0, CANDIDATE_NOTE_LIMIT)
		.map((c: any) => {
			if (!c || typeof c !== 'object') return null;
			const cellType = c.cellType;
			if (
				cellType !== 'FACT' &&
				cellType !== 'CONCEPT' &&
				cellType !== 'PRINCIPLE' &&
				cellType !== 'PROCEDURE' &&
				cellType !== 'HEURISTIC' &&
				cellType !== 'QUESTION'
			)
				return null;
			const content = typeof c.content === 'string' ? c.content.trim() : '';
			const title = typeof c.title === 'string' ? c.title.trim() : '';
			const summary = typeof c.summary === 'string' ? c.summary.trim() : '';
			if (!content || !title) return null;
			const cell: SynthesisCell = {
				title,
				cellType,
				content,
				summary: summary || title
			};
			if (typeof c.topic === 'string') {
				cell.topic = c.topic;
			}
			return cell;
		})
		.filter((c): c is SynthesisCell => c !== null);

	console.log(`[parseSynthesisOutput] Valid cells count: ${cells.length}`);

	return {
		runId: typeof row.runId === 'string' ? row.runId : undefined,
		action,
		cells,
		changeSummary: typeof row.changeSummary === 'string' ? row.changeSummary : '',
		aiReasoning: typeof row.aiReasoning === 'string' ? row.aiReasoning : '',
		citations: citations
			.map((citation) => {
				const item = citation as Record<string, unknown>;
				return {
					sourceItemId:
						typeof item.sourceItemId === 'string'
							? (item.sourceItemId as Id<'source_items'>)
							: undefined,
					title: typeof item.title === 'string' ? item.title : '',
					url: typeof item.url === 'string' ? item.url : ''
				};
			})
			.filter(
				(citation): citation is { sourceItemId: Id<'source_items'>; title: string; url: string } =>
					!!citation.sourceItemId && !!citation.title && !!citation.url
			),
		entities: Array.isArray(row.entities)
			? row.entities
					.map((e: any) => {
						if (!e || typeof e !== 'object') return null;
						const entityType = e.entityType;
						if (
							entityType !== 'person' &&
							entityType !== 'organization' &&
							entityType !== 'place' &&
							entityType !== 'concept' &&
							entityType !== 'event' &&
							entityType !== 'technology'
						)
							return null;
						const canonicalName = typeof e.canonicalName === 'string' ? e.canonicalName : '';
						const name =
							typeof e.name === 'string' && e.name.trim() ? e.name.trim() : canonicalName;
						if (!name) return null;
						return {
							name,
							canonicalName,
							entityType,
							aliases: Array.isArray(e.aliases)
								? e.aliases.filter((a: any) => typeof a === 'string')
								: []
						};
					})
					.filter((e): e is NonNullable<typeof e> => e !== null && e.name !== '')
			: [],
		confidence,
		skipReason: typeof row.skipReason === 'string' ? row.skipReason : undefined
	};
};

export const listSynthesisJobs = query({
	args: {
		limit: v.optional(v.number())
	},
	returns: v.array(extractionJobValidator),
	handler: async (ctx, args) => {
		const authUser = await getAuthUser(ctx);
		return await ctx.db
			.query('knowledge_extraction_jobs')
			.withIndex('by_userId_and_startedAt', (q: any) => q.eq('userId', authUser._id))
			.order('desc')
			.take(Math.min(args.limit ?? 20, 50));
	}
});

export const listPendingChanges = query({
	args: {
		status: v.optional(
			v.union(
				v.literal('pending'),
				v.literal('approved'),
				v.literal('rejected'),
				v.literal('merged')
			)
		),
		limit: v.optional(v.number())
	},
	returns: v.array(extractedCandidateValidator),
	handler: async (ctx, args) => {
		const authUser = await getAuthUser(ctx);
		let q = ctx.db
			.query('knowledge_extracted_candidates')
			.withIndex('by_userId_and_createdAt', (q: any) => q.eq('userId', authUser._id));
		if (args.status) {
			q = q.filter((q: any) => q.eq(q.field('status'), args.status));
		}
		const candidates = await q.order('desc').take(Math.min(args.limit ?? 50, 100));
		return await Promise.all(
			candidates.map(async (c) => {
				let resolvedSourceItemId: string | undefined;
				if (c.sourceId) {
					const infoSource = await ctx.db.get(c.sourceId);
					if (infoSource?.sourceItemId) {
						resolvedSourceItemId = infoSource.sourceItemId;
					}
				}
				return { ...c, resolvedSourceItemId };
			})
		);
	}
});

export const listHandledChanges = query({
	args: {
		limit: v.optional(v.number())
	},
	returns: v.array(extractedCandidateValidator),
	handler: async (ctx, args) => {
		const authUser = await getAuthUser(ctx);
		const all = await ctx.db
			.query('knowledge_extracted_candidates')
			.withIndex('by_userId_and_createdAt', (q: any) => q.eq('userId', authUser._id))
			.order('desc')
			.take(100);
		const handled = all.filter((c: any) => c.status !== 'pending');
		return handled.slice(0, Math.min(args.limit ?? 20, 50));
	}
});

export const getPendingReviewCount = query({
	args: {},
	returns: v.object({
		pendingCount: v.number(),
		runningCount: v.number()
	}),
	handler: async (ctx) => {
		const authUser = await getAuthUser(ctx);
		const pending = await ctx.db
			.query('knowledge_extracted_candidates')
			.withIndex('by_userId_and_createdAt', (q) => q.eq('userId', authUser._id))
			.filter((q) => q.eq(q.field('status'), 'pending'))
			.take(100);
		const queued = await ctx.db
			.query('knowledge_extraction_jobs')
			.withIndex('by_userId_and_status', (q) =>
				q.eq('userId', authUser._id).eq('status', 'pending')
			)
			.take(100);
		const running = await ctx.db
			.query('knowledge_extraction_jobs')
			.withIndex('by_userId_and_status', (q) =>
				q.eq('userId', authUser._id).eq('status', 'running')
			)
			.take(100);
		return {
			pendingCount: pending.length,
			runningCount: queued.length + running.length
		};
	}
});

export const getSourceItemJob = query({
	args: {
		sourceItemId: v.id('source_items')
	},
	returns: v.union(v.null(), extractionJobValidator),
	handler: async (ctx, args) => {
		const sourceItem = await ctx.db.get(args.sourceItemId);
		if (!sourceItem) return null;
		const infoSource = await ctx.db
			.query('information_sources')
			.filter((q: any) => q.eq(q.field('url'), sourceItem.url))
			.first();
		if (!infoSource) return null;
		return await ctx.db
			.query('knowledge_extraction_jobs')
			.withIndex('by_sourceId', (q: any) => q.eq('sourceId', infoSource._id))
			.unique();
	}
});

export const listCells = query({
	args: {
		topicId: v.optional(v.id('knowledge_cell_topics')),
		limit: v.optional(v.number())
	},
	returns: v.array(cellSummaryValidator),
	handler: async (ctx, args) => {
		if (args.topicId) {
			return await ctx.db
				.query('knowledge_cells')
				.withIndex('by_topicId', (q: any) => q.eq('topicId', args.topicId))
				.order('desc')
				.take(Math.min(args.limit ?? 50, 100));
		}
		return await ctx.db
			.query('knowledge_cells')
			.order('desc')
			.take(Math.min(args.limit ?? 50, 100));
	}
});

export const listNotes = query({
	args: {
		status: v.optional(
			v.union(
				v.literal('draft'),
				v.literal('review'),
				v.literal('published'),
				v.literal('archived')
			)
		),
		limit: v.optional(v.number())
	},
	returns: v.array(noteSummaryValidator),
	handler: async (ctx, args) => {
		const authUser = await getAuthUser(ctx);
		if (args.status) {
			const notes = await ctx.db
				.query('knowledge_notes')
				.withIndex('by_userId_and_status', (q: any) =>
					q.eq('userId', authUser._id).eq('status', args.status!)
				)
				.order('desc')
				.take(Math.min(args.limit ?? 50, 100));
			return await enrichNotes(ctx, notes);
		}
		const notes = await ctx.db
			.query('knowledge_notes')
			.withIndex('by_userId', (q: any) => q.eq('userId', authUser._id))
			.order('desc')
			.take(Math.min(args.limit ?? 50, 100));
		return await enrichNotes(ctx, notes);
	}
});

const enrichNotes = async (ctx: any, notes: any[]) => {
	return Promise.all(
		notes.map(async (note) => {
			const contributions = await ctx.db
				.query('knowledge_note_contributions')
				.withIndex('by_noteId', (q: any) => q.eq('noteId', note._id))
				.collect();
			return {
				_id: note._id,
				_creationTime: note._creationTime,
				title: note.title,
				summary: note.summary,
				status: note.status,
				version: note.version,
				cellCount: contributions.length,
				createdAt: note.createdAt,
				updatedAt: note.updatedAt
			};
		})
	);
};

export const markSourceItemConsumed = mutation({
	args: {
		sourceItemId: v.id('source_items'),
		contributionType: v.optional(v.string())
	},
	returns: v.id('knowledge_extraction_jobs'),
	handler: async (ctx, args) => {
		const authUser = await getAuthUser(ctx);

		const sourceItem = await ctx.db.get(args.sourceItemId);
		if (!sourceItem) {
			throw new Error('Source item not found.');
		}

		let infoSource = await ctx.db
			.query('information_sources')
			.withIndex('by_userId', (q: any) => q.eq('userId', authUser._id))
			.filter((q: any) => q.eq(q.field('url'), sourceItem.url))
			.first();

		let infoSourceId: Id<'information_sources'>;
		if (infoSource) {
			if (!infoSource.sourceItemId) {
				await ctx.db.patch(infoSource._id, { sourceItemId: sourceItem._id });
			}
			infoSourceId = infoSource._id;
		} else {
			const now = Date.now();
			infoSourceId = await ctx.db.insert('information_sources', {
				userId: authUser._id,
				sourceType: 'url',
				title: sourceItem.title,
				url: sourceItem.url,
				r2Key: sourceItem.r2Key,
				rawText: sourceItem.body,
				sourceItemId: sourceItem._id,
				status: 'ready',
				createdAt: now,
				updatedAt: now
			});
		}

		const now = Date.now();
		const existing = await ctx.db
			.query('knowledge_extraction_jobs')
			.withIndex('by_sourceId', (q: any) => q.eq('sourceId', infoSourceId))
			.unique();
		if (existing) {
			if (existing.status === 'failed') {
				await ctx.db.patch(existing._id, {
					status: 'pending',
					stage: 'queued',
					error: undefined,
					completedAt: undefined
				});
				await ctx.scheduler.runAfter(0, internal.knowledgeNotes.runSynthesisJob, {
					jobId: existing._id
				});
			}
			return existing._id;
		}

		const jobId = await ctx.db.insert('knowledge_extraction_jobs', {
			sourceId: infoSourceId,
			userId: authUser._id,
			status: 'pending',
			stage: 'queued',
			model: OPENROUTER_MODEL,
			promptVersion: AGENT_VERSION,
			startedAt: now
		});
		await ctx.scheduler.runAfter(0, internal.knowledgeNotes.runSynthesisJob, { jobId });
		return jobId;
	}
});

export const retrySynthesisJob = mutation({
	args: {
		jobId: v.id('knowledge_extraction_jobs')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const authUser = await getAuthUser(ctx);
		const job = await ctx.db.get(args.jobId);
		if (!job || job.userId !== authUser._id) {
			throw new Error('Job not found.');
		}
		const now = Date.now();
		await ctx.db.patch(job._id, {
			status: 'pending',
			stage: 'queued',
			error: undefined,
			completedAt: undefined
		});
		await ctx.scheduler.runAfter(0, internal.knowledgeNotes.runSynthesisJob, {
			jobId: job._id
		});
		return null;
	}
});

export const cancelSynthesisJob = mutation({
	args: {
		jobId: v.id('knowledge_extraction_jobs')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const authUser = await getAuthUser(ctx);
		const job = await ctx.db.get(args.jobId);
		if (!job || job.userId !== authUser._id) {
			throw new Error('Job not found.');
		}
		if (job.status !== 'pending' && job.status !== 'running') {
			throw new Error('Job cannot be cancelled.');
		}
		await ctx.db.patch(job._id, {
			status: 'failed',
			error: 'Cancelled by user',
			completedAt: Date.now()
		});
		return null;
	}
});

export const deleteSynthesisJob = mutation({
	args: {
		jobId: v.id('knowledge_extraction_jobs')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const authUser = await getAuthUser(ctx);
		const job = await ctx.db.get(args.jobId);
		if (!job || job.userId !== authUser._id) {
			throw new Error('Job not found.');
		}
		if (job.status === 'running') {
			throw new Error('Cannot delete a running job. Cancel it first.');
		}
		await ctx.db.delete(job._id);
		return null;
	}
});

export const rejectPendingChange = mutation({
	args: {
		pendingChangeId: v.id('knowledge_extracted_candidates')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const authUser = await getAuthUser(ctx);
		const pending = await ctx.db.get(args.pendingChangeId);
		if (!pending || pending.userId !== authUser._id) {
			throw new Error('Pending change not found.');
		}
		await ctx.db.patch(pending._id, {
			status: 'rejected'
		});
		return null;
	}
});

export const approvePendingChange = action({
	args: {
		pendingChangeId: v.id('knowledge_extracted_candidates'),
		editedContent: v.optional(v.string())
	},
	returns: v.id('knowledge_cells'),
	handler: async (ctx, args): Promise<Id<'knowledge_cells'>> => {
		const authUser = await getAuthUser(ctx);
		const pending: any = await ctx.runQuery(internal.knowledgeNotes.getPendingChangeForApproval, {
			pendingChangeId: args.pendingChangeId,
			userAuthId: authUser._id
		});
		if (!pending) {
			throw new Error('Pending change not found.');
		}
		const content = (args.editedContent ?? pending.content).trim();
		if (!content) {
			throw new Error('Approved note content cannot be empty.');
		}
		const now = Date.now();
		let r2Key: string | undefined;
		let inlineBody: string | undefined = content;
		if (content.length > NOTE_INLINE_BODY_LIMIT) {
			r2Key = `knowledge-notes/${authUser._id}/${pending._id}-${now}.md`;
			await r2.store(ctx, new Blob([content], { type: 'text/markdown' }), { key: r2Key });
			inlineBody = undefined;
		}
		return await ctx.runMutation(internal.knowledgeNotes.applyPendingChange, {
			pendingChangeId: pending._id,
			userAuthId: authUser._id,
			body: inlineBody,
			r2Key,
			fullBody: content
		});
	}
});

export const getPendingChangeForApproval = internalQuery({
	args: {
		pendingChangeId: v.id('knowledge_extracted_candidates'),
		userAuthId: v.string()
	},
	returns: v.union(v.null(), pendingChangeDetailValidator),
	handler: async (ctx, args) => {
		const pending = await ctx.db.get(args.pendingChangeId);
		if (!pending || pending.userId !== args.userAuthId || pending.status !== 'pending') {
			return null;
		}
		return pending;
	}
});

export const loadSynthesisContext = internalQuery({
	args: {
		jobId: v.id('knowledge_extraction_jobs')
	},
	returns: v.union(v.null(), synthesisContextValidator),
	handler: async (ctx, args) => {
		const job = await ctx.db.get(args.jobId);
		if (!job || job.status === 'failed') {
			return null;
		}
		const source = await ctx.db.get(job.sourceId);
		if (!source) {
			return null;
		}
		const bodyUrl = source.r2Key ? await r2.getUrl(source.r2Key) : undefined;
		const notes = await ctx.db.query('knowledge_cells').order('desc').take(CANDIDATE_NOTE_LIMIT);
		const sourceItemId = source.sourceItemId;
		return {
			job,
			sourceItem: {
				_id: sourceItemId ?? source._id,
				sourceId: sourceItemId ?? source._id,
				sourceTitle: source.title,
				sourceType:
					source.sourceType === 'url'
						? ('website' as const)
						: source.sourceType === 'upload'
							? ('website' as const)
							: ('website' as const),
				title: source.title,
				url: source.url ?? '',
				snippet: source.rawText?.slice(0, SNIPPET_LIMIT) ?? '',
				body: source.rawText,
				bodyUrl: bodyUrl ?? undefined,
				publishedAt: source.createdAt
			},
			candidateNotes: notes.map((note) => ({
				id: note._id,
				title: note.title,
				summary: note.summary,
				content: (note.content ?? note.summary).slice(0, NOTE_BODY_CONTEXT_LIMIT),
				updatedAt: note.updatedAt
			}))
		};
	}
});

export const updateSynthesisJobStage = internalMutation({
	args: {
		jobId: v.id('knowledge_extraction_jobs'),
		status: v.union(
			v.literal('pending'),
			v.literal('running'),
			v.literal('completed'),
			v.literal('failed')
		),
		stage: v.optional(
			v.union(
				v.literal('queued'),
				v.literal('loading_source'),
				v.literal('synthesizing'),
				v.literal('saving'),
				v.literal('completed'),
				v.literal('failed')
			)
		),
		outputSummary: v.optional(v.string()),
		outputR2Key: v.optional(v.string()),
		tokenUsage: v.optional(
			v.object({
				input: v.number(),
				output: v.number()
			})
		),
		cost: v.optional(v.number()),
		error: v.optional(v.string())
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const now = Date.now();
		const job = await ctx.db.get(args.jobId);
		if (!job) {
			return null;
		}
		const updates: any = {
			status: args.status
		};
		if (args.stage !== undefined) updates.stage = args.stage;
		if (args.outputSummary !== undefined) updates.outputSummary = args.outputSummary;
		if (args.outputR2Key !== undefined) updates.outputR2Key = args.outputR2Key;
		if (args.tokenUsage !== undefined) updates.tokenUsage = args.tokenUsage;
		if (args.cost !== undefined) updates.cost = args.cost;
		if (args.error !== undefined) updates.error = args.error;
		if (args.status === 'completed' || args.status === 'failed') {
			updates.completedAt = now;
		}
		await ctx.db.patch(args.jobId, updates);
		return null;
	}
});

export const incrementSynthesisAttempt = internalMutation({
	args: {
		jobId: v.id('knowledge_extraction_jobs')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const job = await ctx.db.get(args.jobId);
		if (!job) {
			return null;
		}
		await ctx.db.patch(job._id, {
			status: 'running'
		});
		return null;
	}
});

export const saveSynthesisResult = internalMutation({
	args: {
		jobId: v.id('knowledge_extraction_jobs'),
		result: synthesisOutputValidator
	},
	returns: v.array(v.id('knowledge_extracted_candidates')),
	handler: async (ctx, args) => {
		console.log(
			`[saveSynthesisResult] Job: ${args.jobId}, action: ${args.result.action}, confidence: ${args.result.confidence}`
		);
		console.log(
			`[saveSynthesisResult] Cells: ${args.result.cells.length}, Citations: ${args.result.citations.length}, Entities: ${args.result.entities.length}`
		);
		const job = await ctx.db.get(args.jobId);
		if (!job) {
			return [];
		}
		const existing = await ctx.db
			.query('knowledge_extracted_candidates')
			.withIndex('by_extractionJobId', (q: any) => q.eq('extractionJobId', job._id))
			.take(CANDIDATE_NOTE_LIMIT);
		if (existing.length > 0) {
			return existing.map((e) => e._id);
		}
		const now = Date.now();
		if (args.result.action === 'skip') {
			await ctx.db.patch(job._id, {
				status: 'completed',
				outputSummary: args.result.skipReason ?? 'No useful note update found'
			});
			return [];
		}
		if (args.result.confidence === 'low') {
			await ctx.db.patch(job._id, {
				status: 'completed',
				outputSummary: args.result.skipReason ?? 'Skipped: low confidence suggestion'
			});
			return [];
		}
		if (args.result.cells.length === 0) {
			await ctx.db.patch(job._id, {
				status: 'completed',
				outputSummary: 'AI returned no valid cells'
			});
			return [];
		}

		const candidateIds: Id<'knowledge_extracted_candidates'>[] = [];
		for (const cell of args.result.cells) {
			const suggestedContent = cell.content.trim();
			if (!suggestedContent) continue;
			const pendingChangeId = await ctx.db.insert('knowledge_extracted_candidates', {
				sourceId: job.sourceId,
				extractionJobId: job._id,
				userId: job.userId,
				candidateKey: `${job._id}-${now}-${candidateIds.length}`,
				cellType: cell.cellType,
				title: cell.title,
				summary: cell.summary,
				content: suggestedContent,
				r2Key: `knowledge-candidates/${job.userId}/${now}-${candidateIds.length}.md`,
				status: 'pending',
				createdAt: now,
				updatedAt: now
			});
			candidateIds.push(pendingChangeId);
		}

		for (const citation of args.result.citations) {
			const trimmedId = citation.sourceItemId.trim();
			const validId =
				trimmedId.length >= 10 && !trimmedId.includes(' ')
					? (trimmedId as Id<'source_items'>)
					: undefined;
			if (!validId) continue;
			try {
				await ctx.db.insert('knowledge_candidate_citations', {
					candidateId: candidateIds[0],
					sourceItemId: validId,
					quote: citation.title,
					confidence: 0.8,
					createdAt: now
				});
			} catch {
				// Skip citation if sourceItemId is not a valid Convex ID
			}
		}

		for (const entity of args.result.entities) {
			const canonicalLower = entity.canonicalName.toLowerCase();
			let entityId: Id<'knowledge_entities'> | undefined;
			const existing = await ctx.db
				.query('knowledge_entities')
				.withIndex('by_canonicalName', (q: any) => q.eq('canonicalName', canonicalLower))
				.unique();
			if (existing) {
				entityId = existing._id;
			} else {
				entityId = await ctx.db.insert('knowledge_entities', {
					entityType: entity.entityType,
					name: entity.name,
					canonicalName: canonicalLower,
					aliases: entity.aliases,
					createdAt: now,
					updatedAt: now
				});
			}
		}

		await ctx.db.patch(job._id, {
			status: 'completed',
			outputSummary: `${candidateIds.length} knowledge cell(s) ready for review`
		});
		return candidateIds;
	}
});

export const applyPendingChange = internalMutation({
	args: {
		pendingChangeId: v.id('knowledge_extracted_candidates'),
		userAuthId: v.string(),
		body: v.optional(v.string()),
		r2Key: v.optional(v.string()),
		fullBody: v.string()
	},
	returns: v.id('knowledge_cells'),
	handler: async (ctx, args) => {
		const pending = await ctx.db.get(args.pendingChangeId);
		if (!pending || pending.userId !== args.userAuthId || pending.status !== 'pending') {
			throw new Error('Pending change not found.');
		}
		const now = Date.now();
		let cellId = pending.mergedIntoCellId;
		if (cellId) {
			const cell = await ctx.db.get(cellId);
			if (!cell) {
				throw new Error('Cell not found.');
			}
			await ctx.db.patch(cellId, {
				summary: pending.summary,
				content: args.body ?? pending.content,
				r2Key: args.r2Key ?? pending.r2Key,
				updatedAt: now
			});
		} else {
			cellId = await ctx.db.insert('knowledge_cells', {
				cellKey: `${args.userAuthId}-${now}`,
				cellType: pending.cellType,
				title: pending.title,
				summary: pending.summary,
				content: args.body ?? pending.content,
				r2Key: args.r2Key ?? pending.r2Key,
				source: 'llm_extracted',
				topicId:
					(await ctx.db.query('knowledge_cell_topics').first())?._id ??
					(await ctx.db.insert('knowledge_cell_topics', {
						name: 'General',
						createdAt: now,
						updatedAt: now
					})),
				createdAt: now,
				updatedAt: now
			});
		}

		const candidateCitations = await ctx.db
			.query('knowledge_candidate_citations')
			.withIndex('by_candidateId', (q: any) => q.eq('candidateId', pending._id))
			.collect();
		for (const citation of candidateCitations) {
			if (!citation.sourceItemId) continue;
			const alreadyExists = await ctx.db
				.query('knowledge_cell_citations')
				.withIndex('by_cellId', (q: any) => q.eq('cellId', cellId!))
				.filter((q: any) => q.eq(q.field('sourceItemId'), citation.sourceItemId))
				.first();
			if (!alreadyExists) {
				await ctx.db.insert('knowledge_cell_citations', {
					cellId: cellId!,
					sourceItemId: citation.sourceItemId,
					quote: citation.quote,
					confidence: citation.confidence,
					createdAt: now
				});
			}
		}

		let noteId: Id<'knowledge_notes'> | undefined;
		const existingNote = pending.mergedIntoCellId
			? (
					await ctx.db
						.query('knowledge_note_contributions')
						.withIndex('by_cellId', (q: any) => q.eq('cellId', cellId!))
						.take(1)
				)[0]
			: null;
		if (existingNote) {
			noteId = existingNote.noteId;
			const note = await ctx.db.get(noteId);
			if (note) {
				await ctx.db.patch(noteId, {
					summary: pending.summary,
					updatedAt: now
				});
			}
		} else {
			noteId = await ctx.db.insert('knowledge_notes', {
				userId: args.userAuthId,
				title: pending.title,
				summary: pending.summary,
				content: args.fullBody,
				r2Key: args.r2Key ?? pending.r2Key,
				sourceId: pending.sourceId,
				status: 'draft',
				version: 1,
				createdAt: now,
				updatedAt: now
			});
		}

		const existingContribution = await ctx.db
			.query('knowledge_note_contributions')
			.withIndex('by_noteId', (q: any) => q.eq('noteId', noteId!))
			.filter((q: any) => q.eq(q.field('cellId'), cellId))
			.first();
		if (!existingContribution) {
			await ctx.db.insert('knowledge_note_contributions', {
				noteId: noteId!,
				cellId: cellId!,
				contributionWeight: 1.0,
				createdAt: now
			});
		}

		await ctx.db.patch(pending._id, {
			status: 'merged',
			mergedIntoCellId: cellId
		});
		return cellId!;
	}
});

export const runSynthesisJob = internalAction({
	args: {
		jobId: v.id('knowledge_extraction_jobs')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		console.log(`[Synthesis ${args.jobId}] Starting runSynthesisJob`);
		await ctx.runMutation(internal.knowledgeNotes.incrementSynthesisAttempt, { jobId: args.jobId });
		await ctx.runMutation(internal.knowledgeNotes.updateSynthesisJobStage, {
			jobId: args.jobId,
			status: 'running',
			stage: 'loading_source'
		});
		console.log(`[Synthesis ${args.jobId}] Stage: loading_source`);
		try {
			const context: any = await ctx.runQuery(internal.knowledgeNotes.loadSynthesisContext, {
				jobId: args.jobId
			});
			console.log(
				`[Synthesis ${args.jobId}] loadSynthesisContext returned:`,
				JSON.stringify(context, null, 2)?.slice(0, 2000)
			);
			if (!context) {
				throw new Error('Synthesis context is unavailable.');
			}
			let body = context.sourceItem.body ?? '';
			if (!body && context.sourceItem.bodyUrl) {
				console.log(
					`[Synthesis ${args.jobId}] Fetching body from R2: ${context.sourceItem.bodyUrl}`
				);
				const response = await fetch(context.sourceItem.bodyUrl);
				if (!response.ok) {
					throw new Error(
						`Unable to fetch source body from R2: ${response.status} ${response.statusText}`
					);
				}
				body = await response.text();
			}
			console.log(
				`[Synthesis ${args.jobId}] Source body length: ${body.length}, snippet: ${body.slice(0, 300)}`
			);
			console.log(
				`[Synthesis ${args.jobId}] Candidate notes count: ${context.candidateNotes?.length}`
			);
			const apiKey = process.env.OPENROUTER_API_KEY?.trim();
			if (!apiKey) {
				throw new Error('OPENROUTER_API_KEY is not configured.');
			}
			console.log(`[Synthesis ${args.jobId}] API key present: ${apiKey.slice(0, 8)}...`);
			await ctx.runMutation(internal.knowledgeNotes.updateSynthesisJobStage, {
				jobId: args.jobId,
				status: 'running',
				stage: 'synthesizing'
			});
			console.log(`[Synthesis ${args.jobId}] Stage: synthesizing`);
			const openrouter = createOpenRouter({ apiKey });
			const sourceBody = body.slice(0, SOURCE_BODY_CONTEXT_LIMIT);
			const prompt = [
				SYNTHESIS_SYSTEM_PROMPT,
				'',
				`Source item JSON:\n${JSON.stringify(
					{
						id: context.sourceItem._id,
						title: context.sourceItem.title,
						url: context.sourceItem.url,
						snippet: context.sourceItem.snippet,
						body: sourceBody,
						publishedAt: context.sourceItem.publishedAt,
						sourceTitle: context.sourceItem.sourceTitle,
						sourceType: context.sourceItem.sourceType
					},
					null,
					2
				)}`,
				'',
				`Candidate cells JSON:\n${JSON.stringify(context.candidateNotes, null, 2)}`,
				'',
				`Constraints: break source into up to ${CANDIDATE_NOTE_LIMIT} atomic cells, each 300-800 chars, require citations, output mode is pending_change_only.`
			].join('\n');

			console.log(`[Synthesis ${args.jobId}] Prompt length: ${prompt.length}`);
			console.log(`[Synthesis ${args.jobId}] Model: ${OPENROUTER_MODEL}`);

			const synthesisSchema = z.object({
				action: z.enum(['update_existing_note', 'create_new_note', 'skip']),
				cells: z
					.array(
						z.object({
							title: z.string(),
							cellType: z.enum([
								'FACT',
								'CONCEPT',
								'PRINCIPLE',
								'PROCEDURE',
								'HEURISTIC',
								'QUESTION'
							]),
							content: z.string(),
							summary: z.string(),
							topic: z.string().optional()
						})
					)
					.max(CANDIDATE_NOTE_LIMIT),
				changeSummary: z.string(),
				aiReasoning: z.string(),
				citations: z.array(
					z.object({
						sourceItemId: z.string(),
						title: z.string(),
						url: z.string()
					})
				),
				entities: z
					.array(
						z.object({
							name: z.string().optional(),
							canonicalName: z.string(),
							entityType: z.enum([
								'person',
								'organization',
								'place',
								'concept',
								'event',
								'technology'
							]),
							aliases: z.array(z.string())
						})
					)
					.optional(),
				confidence: z.enum(['low', 'medium', 'high']),
				skipReason: z.string().optional()
			});

			console.log(`[Synthesis ${args.jobId}] Calling generateObject...`);
			const startTime = Date.now();
			const { object: rawResult } = await generateObject({
				model: openrouter(OPENROUTER_MODEL, {
					plugins: [{ id: 'response-healing' }]
				}),
				schema: synthesisSchema,
				prompt
			});
			const elapsed = Date.now() - startTime;
			console.log(`[Synthesis ${args.jobId}] generateObject completed in ${elapsed}ms`);
			console.log(`[Synthesis ${args.jobId}] Raw AI result:`, JSON.stringify(rawResult, null, 2));

			const result = parseSynthesisOutput(rawResult);
			console.log(
				`[Synthesis ${args.jobId}] Parsed result action=${result.action}, confidence=${result.confidence}, citations=${result.citations.length}, entities=${result.entities.length}`
			);

			await ctx.runMutation(internal.knowledgeNotes.updateSynthesisJobStage, {
				jobId: args.jobId,
				status: 'running',
				stage: 'saving'
			});
			console.log(`[Synthesis ${args.jobId}] Stage: saving`);
			await ctx.runMutation(internal.knowledgeNotes.saveSynthesisResult, {
				jobId: args.jobId,
				result
			});
			console.log(`[Synthesis ${args.jobId}] saveSynthesisResult completed successfully`);
		} catch (error: unknown) {
			console.error(`[Synthesis ${args.jobId}] ERROR:`, error);
			await ctx.runMutation(internal.knowledgeNotes.updateSynthesisJobStage, {
				jobId: args.jobId,
				status: 'failed',
				error: error instanceof Error ? error.message : 'Unknown synthesis failure'
			});
		}
		return null;
	}
});

// =====================================================
// NOTE CRUD
// =====================================================

export const getNote = query({
	args: {
		noteId: v.id('knowledge_notes')
	},
	returns: v.union(v.null(), v.any()),
	handler: async (ctx, args) => {
		return await ctx.db.get(args.noteId);
	}
});

export const getNoteCells = query({
	args: {
		noteId: v.id('knowledge_notes')
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		const contributions = await ctx.db
			.query('knowledge_note_contributions')
			.withIndex('by_noteId', (q: any) => q.eq('noteId', args.noteId))
			.collect();
		const cells = await Promise.all(
			contributions.map(async (c) => {
				const cell = await ctx.db.get(c.cellId);
				return { ...cell, contributionWeight: c.contributionWeight, contributionId: c._id };
			})
		);
		return cells.filter(Boolean);
	}
});

export const createNote = mutation({
	args: {
		title: v.string(),
		summary: v.string(),
		content: v.string(),
		r2Key: v.string(),
		sourceId: v.optional(v.id('information_sources'))
	},
	returns: v.id('knowledge_notes'),
	handler: async (ctx, args) => {
		const authUser = await getAuthUser(ctx);
		const now = Date.now();
		return await ctx.db.insert('knowledge_notes', {
			userId: authUser._id,
			title: args.title,
			summary: args.summary,
			content: args.content,
			r2Key: args.r2Key,
			sourceId: args.sourceId,
			status: 'draft',
			version: 1,
			createdAt: now,
			updatedAt: now
		});
	}
});

export const updateNote = mutation({
	args: {
		noteId: v.id('knowledge_notes'),
		title: v.optional(v.string()),
		summary: v.optional(v.string()),
		content: v.optional(v.string()),
		r2Key: v.optional(v.string()),
		status: v.optional(
			v.union(
				v.literal('draft'),
				v.literal('review'),
				v.literal('published'),
				v.literal('archived')
			)
		)
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const authUser = await getAuthUser(ctx);
		const note = await ctx.db.get(args.noteId);
		if (!note || note.userId !== authUser._id) {
			throw new Error('Note not found.');
		}
		const updates: any = { updatedAt: Date.now() };
		if (args.title !== undefined) updates.title = args.title;
		if (args.summary !== undefined) updates.summary = args.summary;
		if (args.content !== undefined) updates.content = args.content;
		if (args.r2Key !== undefined) updates.r2Key = args.r2Key;
		if (args.status !== undefined) {
			updates.status = args.status;
			updates.version = note.version + 1;
		}
		await ctx.db.patch(args.noteId, updates);
		return null;
	}
});

export const addCellToNote = mutation({
	args: {
		noteId: v.id('knowledge_notes'),
		cellId: v.id('knowledge_cells'),
		contributionWeight: v.number()
	},
	returns: v.id('knowledge_note_contributions'),
	handler: async (ctx, args) => {
		const authUser = await getAuthUser(ctx);
		const note = await ctx.db.get(args.noteId);
		if (!note || note.userId !== authUser._id) {
			throw new Error('Note not found.');
		}
		const existing = await ctx.db
			.query('knowledge_note_contributions')
			.withIndex('by_noteId', (q: any) => q.eq('noteId', args.noteId))
			.filter((q: any) => q.eq(q.field('cellId'), args.cellId))
			.first();
		if (existing) {
			await ctx.db.patch(existing._id, { contributionWeight: args.contributionWeight });
			return existing._id;
		}
		return await ctx.db.insert('knowledge_note_contributions', {
			noteId: args.noteId,
			cellId: args.cellId,
			contributionWeight: args.contributionWeight,
			createdAt: Date.now()
		});
	}
});

export const removeCellFromNote = mutation({
	args: {
		noteId: v.id('knowledge_notes'),
		cellId: v.id('knowledge_cells')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const authUser = await getAuthUser(ctx);
		const note = await ctx.db.get(args.noteId);
		if (!note || note.userId !== authUser._id) {
			throw new Error('Note not found.');
		}
		const contribution = await ctx.db
			.query('knowledge_note_contributions')
			.withIndex('by_noteId', (q: any) => q.eq('noteId', args.noteId))
			.filter((q: any) => q.eq(q.field('cellId'), args.cellId))
			.first();
		if (contribution) {
			await ctx.db.delete(contribution._id);
		}
		return null;
	}
});

export const getNoteBlocks = query({
	args: {
		noteId: v.id('knowledge_notes')
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		return await ctx.db
			.query('knowledge_note_blocks')
			.withIndex('by_noteId_and_order', (q: any) => q.eq('noteId', args.noteId))
			.collect();
	}
});

export const createNoteBlock = mutation({
	args: {
		noteId: v.id('knowledge_notes'),
		blockType: v.union(
			v.literal('paragraph'),
			v.literal('list'),
			v.literal('quote'),
			v.literal('diagram'),
			v.literal('question')
		),
		content: v.string(),
		order: v.number()
	},
	returns: v.id('knowledge_note_blocks'),
	handler: async (ctx, args) => {
		const authUser = await getAuthUser(ctx);
		const note = await ctx.db.get(args.noteId);
		if (!note || note.userId !== authUser._id) {
			throw new Error('Note not found.');
		}
		const now = Date.now();
		return await ctx.db.insert('knowledge_note_blocks', {
			noteId: args.noteId,
			blockType: args.blockType,
			content: args.content,
			order: args.order,
			createdAt: now,
			updatedAt: now
		});
	}
});

export const updateNoteBlock = mutation({
	args: {
		blockId: v.id('knowledge_note_blocks'),
		content: v.optional(v.string()),
		order: v.optional(v.number())
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const updates: any = { updatedAt: Date.now() };
		if (args.content !== undefined) updates.content = args.content;
		if (args.order !== undefined) updates.order = args.order;
		await ctx.db.patch(args.blockId, updates);
		return null;
	}
});

export const deleteNoteBlock = mutation({
	args: {
		blockId: v.id('knowledge_note_blocks')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ctx.db.delete(args.blockId);
		return null;
	}
});
