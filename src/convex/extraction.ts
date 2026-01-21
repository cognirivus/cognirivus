/**
 * Unified Extraction System
 *
 * This module provides a centralized extraction orchestrator that allows admins to:
 * - Run various extraction types on different source data
 * - Track extraction jobs with progress, retry, and history
 * - Configure extraction prompts dynamically
 */

import { v } from 'convex/values';
import {
	action,
	internalAction,
	internalMutation,
	internalQuery,
	mutation,
	query
} from './_generated/server';
import { internal, api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { authComponent } from './auth';
import {
	type SourceType,
	type ExtractionType,
	type JobStatus,
	type SourceItem,
	SOURCE_FIELDS,
	DEFAULT_MODEL
} from './lib/extractors/types';

// ============== Auth Helper ==============

const checkAdmin = async (ctx: any) => {
	const user = await authComponent.getAuthUser(ctx);
	const isAdmin =
		user?.role && (Array.isArray(user.role) ? user.role.includes('admin') : user.role === 'admin');
	if (!isAdmin) throw new Error('Unauthorized: Admin access required');
	return user;
};

// ============== Extraction Prompts (Default) ==============

// ============== Configuration & Ontology ==============

export const ENTITY_CATEGORIES = [
	'Place-Landform',
	'Protected Site',
	'Organization-Office',
	'Doctrine-Concept',
	'Initiative-Scheme',
	'Statute-Judgment',
	'Event-Summit',
	'Biological-Species',
	'Tribe-Community',
	'Benchmark-Report',
	'Treaty-Accord',
	'Historical Term',
	'Literature-Work',
	'Artistic Feature',
	'Technology-Tool',
	'Financial Asset',
	'Other'
] as const;

export type EntityCategory = (typeof ENTITY_CATEGORIES)[number];

const EXTRACTION_PROMPTS: Record<
	ExtractionType,
	{ name: string; description: string; prompt: string }
> = {
	current_affairs: {
		name: 'Current Affairs',
		description: 'Extract individual news stories and facts for UPSC preparation',
		prompt: `You are a UPSC preparation expert. Extract individual, significant news stories from the provided content.

GUIDELINES:
1. ATOMIC & SELF-CONTAINED: Each extracted story must be self-explanatory and standalone.
2. COMPREHENSIVE TITLE: A short, comprehensive headline (Fact Title).
3. SUBJECT CATEGORIZATION: Choose the most relevant subject from the provided list.
4. ENTITY DEDUCTION: Identify all significant Keywords/Entities mentioned or implied in the content.
5. TONE: Professional, educational, and factual.`
	},
	locations: {
		name: 'Location Extraction',
		description: 'Extract geographical locations mentioned in the content',
		prompt: `You are a UPSC preparation expert specializing in Mapping. Extract physical geographical locations (cities, towns, rivers, mountains, borders, regions, straits, glaciers) mentioned in the content.

GUIDELINES:
1. ATOMIC & SELF-CONTAINED: Each fact must be standalone.
2. PHYSICAL LOCATIONS ONLY: Focus strictly on places that can be mapped.
3. SUBJECT CATEGORIZATION: Choose based on context.
4. ENTITY DEDUCTION: Delineate the specific landforms, cities, or water bodies as entities.
5. MULTIPLE ENTRIES: If a location has multiple facts, provide separate objects.`
	},
	concepts: {
		name: 'Key Concepts',
		description: 'Extract important terms, definitions, and concepts',
		prompt: `You are an educational content expert. Extract key concepts, terms, and definitions from the provided content.

GUIDELINES:
1. DEFINITION-FOCUSED: Each item should define or explain a concept.
2. EXAM-RELEVANT: Focus on concepts likely to appear in competitive exams (UPSC style).
3. CLEAR TITLE: The title should be the concept name.
4. ENTITY DEDUCTION: Link the concept to related organizations, doctrines, or historical context as entities.
5. COMPREHENSIVE BODY: Include definition, significance, and context.`
	},
	questions: {
		name: 'Question Generation',
		description: 'Generate exam-style questions from the content',
		prompt: `You are a UPSC exam preparation expert. Generate potential exam questions from the provided content.

GUIDELINES:
1. VARIETY: Include factual, analytical, and application-based questions.
2. EXAM-STYLE: Questions should match UPSC/competitive exam patterns.
3. CLEAR FORMAT: Title is the question, body is the expected answer.
4. ENTITY DEDUCTION: Tag the core subjects of the question as entities.
5. DIFFICULTY RANGE: Include easy to hard questions.`
	},
	entities: {
		name: 'Entity Extraction',
		description: 'Extract named entities (people, organizations, events)',
		prompt: `You are an information extraction expert. Extract named entities from the provided content.

GUIDELINES:
1. ENTITY TYPES: Focus on actors, organizations, historical figures, and landmark events.
2. CONTEXT: Include relevant context about each entity.
3. ENTITY DEDUCTION: Deeply analyze the text to identify all interconnected entities.
4. SIGNIFICANCE: Explain why the entity is important.
5. CATEGORIZE: Assign appropriate subject category.`
	},
	topics: {
		name: 'Topic Breakdown',
		description: 'Break content into smaller, learnable sub-topics',
		prompt: `You are an educational content organizer. Break down the provided content into smaller, digestible sub-topics.

GUIDELINES:
1. HIERARCHICAL: Create logical sub-divisions of the main topic.
2. LEARNABLE: Each sub-topic should be independently learnable.
3. COMPREHENSIVE: Cover all aspects of the main content.
4. ENTITY DEDUCTION: Identify the specific "nodes" of knowledge within each sub-topic.
5. STRUCTURED: Provide clear titles and detailed explanations.`
	},
	flashcards: {
		name: 'Flashcard Generation',
		description: 'Generate Anki-style flashcards for spaced repetition',
		prompt: `You are an expert at creating educational flashcards. Generate Anki-style flashcards from the provided content.

GUIDELINES:
1. VARIETY: Use basic, cloze, and MCQ formats.
2. ATOMIC: One concept per card.
3. CLEAR: Front should be a clear question/prompt.
4. ENTITY DEDUCTION: Tag the entities involved in the flashcard concept.
5. COMPLETE: Back should be a complete, standalone answer.
6. DIFFICULTY: Assign difficulty 1-5.`
	}
};

// ============== QUERIES ==============

/**
 * List extraction jobs with optional filters
 */
export const listJobs = query({
	args: {
		status: v.optional(v.string()),
		sourceType: v.optional(v.string()),
		extractionType: v.optional(v.string()),
		limit: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		await checkAdmin(ctx);

		let queryBuilder = ctx.db.query('extraction_jobs').order('desc');

		const jobs = await queryBuilder.take(args.limit ?? 50);

		// Filter in memory if needed
		let filtered = jobs;
		if (args.status) {
			filtered = filtered.filter((j) => j.status === args.status);
		}
		if (args.sourceType) {
			filtered = filtered.filter((j) => j.sourceType === args.sourceType);
		}
		if (args.extractionType) {
			filtered = filtered.filter((j) => j.extractionType === args.extractionType);
		}

		return filtered;
	}
});

/**
 * Get a single job by ID
 */
export const getJob = query({
	args: { jobId: v.id('extraction_jobs') },
	handler: async (ctx, args) => {
		await checkAdmin(ctx);
		return await ctx.db.get(args.jobId);
	}
});

/**
 * Get dashboard statistics
 */
export const getStats = query({
	args: {},
	handler: async (ctx) => {
		await checkAdmin(ctx);

		const allJobs = await ctx.db.query('extraction_jobs').collect();

		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const todayStart = today.getTime();

		const todayJobs = allJobs.filter((j) => j.createdAt >= todayStart);

		return {
			total: allJobs.length,
			todayTotal: todayJobs.length,
			pending: allJobs.filter((j) => j.status === 'pending').length,
			running: allJobs.filter((j) => j.status === 'running').length,
			completed: todayJobs.filter((j) => j.status === 'completed').length,
			failed: todayJobs.filter((j) => j.status === 'failed').length
		};
	}
});

/**
 * Get available extraction types with metadata
 */
export const listExtractionTypes = query({
	args: {},
	handler: async (ctx) => {
		await checkAdmin(ctx);
		return Object.entries(EXTRACTION_PROMPTS).map(([key, value]) => ({
			type: key as ExtractionType,
			name: value.name,
			description: value.description
		}));
	}
});

/**
 * Get available fields for a source type
 */
export const getSourceFields = query({
	args: { sourceType: v.string() },
	handler: async (ctx, args) => {
		await checkAdmin(ctx);
		return SOURCE_FIELDS[args.sourceType as SourceType] ?? [];
	}
});

/**
 * Get count of unprocessed items for a source type
 */
export const getSourceItemCount = query({
	args: { sourceType: v.string() },
	handler: async (ctx, args) => {
		await checkAdmin(ctx);

		switch (args.sourceType) {
			case 'news':
				return (await ctx.db.query('news').collect()).length;
			case 'syllabus':
				return (await ctx.db.query('syllabus').collect()).length;
			case 'blog':
				return (
					await ctx.db
						.query('blogs')
						.withIndex('by_published', (q) => q.eq('published', true))
						.collect()
				).length;
			case 'content':
				return (await ctx.db.query('content').collect()).length;
			default:
				return 0;
		}
	}
});

// ============== Internal Queries ==============

/**
 * Fetch source items for extraction
 */
export const fetchSourceItems = internalQuery({
	args: {
		sourceType: v.string(),
		ids: v.optional(v.array(v.string())),
		limit: v.optional(v.number())
	},
	handler: async (ctx, args): Promise<SourceItem[]> => {
		const { sourceType, ids, limit } = args;

		let items: any[] = [];

		switch (sourceType) {
			case 'news':
				items = ids
					? await Promise.all(ids.map((id) => ctx.db.get(id as Id<'news'>)))
					: await ctx.db
							.query('news')
							.order('desc')
							.take(limit ?? 10);
				break;
			case 'syllabus':
				items = ids
					? await Promise.all(ids.map((id) => ctx.db.get(id as Id<'syllabus'>)))
					: await ctx.db
							.query('syllabus')
							.order('desc')
							.take(limit ?? 10);
				break;
			case 'blog':
				items = ids
					? await Promise.all(ids.map((id) => ctx.db.get(id as Id<'blogs'>)))
					: await ctx.db
							.query('blogs')
							.withIndex('by_published', (q) => q.eq('published', true))
							.order('desc')
							.take(limit ?? 10);
				break;
			case 'content':
				items = ids
					? await Promise.all(ids.map((id) => ctx.db.get(id as Id<'content'>)))
					: await ctx.db
							.query('content')
							.order('desc')
							.take(limit ?? 10);
				break;
		}

		// Normalize to SourceItem
		return items
			.filter((item): item is NonNullable<typeof item> => !!item)
			.map((item) => ({
				_id: item._id,
				title: item.title ?? '',
				body: item.body ?? '',
				date:
					item.date ??
					(item.createdAt ? new Date(item.createdAt).toISOString().split('T')[0] : undefined),
				subjectId: item.subjectId,
				topic: item.topic
			}));
	}
});

// ============== Internal Mutations ==============

/**
 * Update job progress
 */
export const updateJobProgress = internalMutation({
	args: {
		jobId: v.id('extraction_jobs'),
		processedItems: v.optional(v.number()),
		failedItems: v.optional(v.number()),
		extractedCount: v.optional(v.number()),
		resultIds: v.optional(v.array(v.string())),
		status: v.optional(v.string()),
		error: v.optional(v.string()),
		startedAt: v.optional(v.number()),
		completedAt: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		const { jobId, ...updates } = args;
		const cleanUpdates = Object.fromEntries(
			Object.entries(updates).filter(([_, v]) => v !== undefined)
		);
		await ctx.db.patch(jobId, cleanUpdates as any);
	}
});

/**
 * Save extracted content item
 */
export const saveExtractedContent = internalMutation({
	args: {
		title: v.string(),
		body: v.string(),
		subjectName: v.string(),
		topic: v.string(),
		sourceType: v.string(),
		sourceId: v.string(),
		extractionType: v.string(),
		jobId: v.id('extraction_jobs'),
		entities: v.optional(
			v.array(
				v.object({
					name: v.string(),
					type: v.string()
				})
			)
		),
		date: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const {
			title,
			body,
			subjectName,
			topic,
			sourceType,
			sourceId,
			extractionType,
			jobId,
			entities,
			date
		} = args;

		// Resolve subject
		let subject = await ctx.db
			.query('subjects')
			.withIndex('by_name', (q) => q.eq('name', subjectName))
			.unique();

		if (!subject) {
			subject = await ctx.db
				.query('subjects')
				.withIndex('by_name', (q) => q.eq('name', 'Other'))
				.unique();
		}

		if (!subject) {
			throw new Error('Subject "Other" not found. Please run seed mutation.');
		}

		// Insert content
		const contentId = await ctx.db.insert('content', {
			title,
			body,
			subjectId: subject._id,
			topic,
			sourceType,
			sourceId,
			extractionType,
			jobId,
			date,
			flashcardCount: 0,
			createdAt: Date.now()
		});

		// Handle entity linking
		if (entities && entities.length > 0) {
			for (const entityInput of entities) {
				const entityName = entityInput.name.trim();
				const entityType = entityInput.type;

				let entity = await ctx.db
					.query('entities')
					.withIndex('by_name', (q) => q.eq('name', entityName))
					.filter((q) => q.eq(q.field('type'), entityType))
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
			}
		}

		return contentId;
	}
});

// ============== MUTATIONS ==============

/**
 * Create a new extraction job
 */
export const createJob = mutation({
	args: {
		sourceType: v.string(),
		extractionType: v.string(),
		selectedFields: v.array(v.string()),
		sourceIds: v.optional(v.array(v.string())),
		batchSize: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		const user = await checkAdmin(ctx);

		// Validate extraction type
		if (!EXTRACTION_PROMPTS[args.extractionType as ExtractionType]) {
			throw new Error(`Invalid extraction type: ${args.extractionType}`);
		}

		// Validate source type
		if (!['news', 'syllabus', 'blog', 'content'].includes(args.sourceType)) {
			throw new Error(`Invalid source type: ${args.sourceType}`);
		}

		// Get total items count
		let totalItems = 0;
		if (args.sourceIds && args.sourceIds.length > 0) {
			totalItems = args.sourceIds.length;
		} else {
			switch (args.sourceType) {
				case 'news':
					totalItems = (await ctx.db.query('news').collect()).length;
					break;
				case 'syllabus':
					totalItems = (await ctx.db.query('syllabus').collect()).length;
					break;
				case 'blog':
					totalItems = (await ctx.db.query('blogs').collect()).length;
					break;
				case 'content':
					totalItems = (await ctx.db.query('content').collect()).length;
					break;
			}
		}

		const batchSize = args.batchSize ?? 10;

		const jobId = await ctx.db.insert('extraction_jobs', {
			sourceType: args.sourceType,
			extractionType: args.extractionType,
			selectedFields: args.selectedFields,
			sourceIds: args.sourceIds ?? [],
			status: 'pending',
			batchSize,
			totalItems,
			processedItems: 0,
			failedItems: 0,
			extractedCount: 0,
			resultIds: [],
			createdBy: user._id,
			createdAt: Date.now()
		});

		return jobId;
	}
});

/**
 * Cancel a running job
 */
export const cancelJob = mutation({
	args: { jobId: v.id('extraction_jobs') },
	handler: async (ctx, args) => {
		await checkAdmin(ctx);

		const job = await ctx.db.get(args.jobId);
		if (!job) throw new Error('Job not found');

		if (job.status === 'completed' || job.status === 'cancelled') {
			throw new Error('Cannot cancel a completed or already cancelled job');
		}

		await ctx.db.patch(args.jobId, {
			status: 'cancelled',
			completedAt: Date.now()
		});

		return args.jobId;
	}
});

// ============== ACTIONS ==============

/**
 * Run an extraction job
 */
export const runJob = action({
	args: { jobId: v.id('extraction_jobs') },
	handler: async (ctx, args) => {
		// Get job details
		const job = await ctx.runQuery(api.extraction.getJob, { jobId: args.jobId });
		if (!job) throw new Error('Job not found');

		if (job.status !== 'pending') {
			throw new Error(`Job is not in pending state: ${job.status}`);
		}

		// Mark as running
		await ctx.runMutation(internal.extraction.updateJobProgress, {
			jobId: args.jobId,
			status: 'running',
			startedAt: Date.now()
		});

		// Get subjects
		const subjects = await ctx.runQuery(api.subjects.list);
		const subjectNames = subjects.map((s: any) => s.name);

		// Get source items
		const sourceItems = await ctx.runQuery(internal.extraction.fetchSourceItems, {
			sourceType: job.sourceType,
			ids: job.sourceIds.length > 0 ? job.sourceIds : undefined,
			limit: job.batchSize
		});

		// Get extraction config
		const config = EXTRACTION_PROMPTS[job.extractionType as ExtractionType];
		if (!config) throw new Error(`Invalid extraction type: ${job.extractionType}`);

		let processedItems = 0;
		let failedItems = 0;
		let extractedCount = 0;
		const resultIds: string[] = [];

		for (const sourceItem of sourceItems) {
			try {
				// Build input text from selected fields
				const inputParts: string[] = [];
				for (const field of job.selectedFields) {
					const value = (sourceItem as any)[field];
					if (value) {
						if (Array.isArray(value)) {
							inputParts.push(`${field}: ${value.join(', ')}`);
						} else {
							inputParts.push(`${field}: ${value}`);
						}
					}
				}
				const inputText = inputParts.join('\n\n');

				if (!inputText.trim()) {
					console.warn(`Empty input for source item ${sourceItem._id}, skipping`);
					failedItems++;
					continue;
				}

				// Call OpenRouter
				const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
						'Content-Type': 'application/json',
						'HTTP-Referer': 'https://cognirivus.vercel.app',
						'X-Title': `Cognirivus ${config.name} Extractor`
					},
					body: JSON.stringify({
						model: DEFAULT_MODEL,
						messages: [
							{
								role: 'system',
								content: `${config.prompt}

VALID SUBJECTS:
${subjectNames.join(', ')}

VALID ENTITY TYPES:
${ENTITY_CATEGORIES.join(', ')}`
							},
							{
								role: 'user',
								content: inputText
							}
						],
						response_format: {
							type: 'json_schema',
							json_schema: {
								name: `${job.extractionType}_extraction`,
								strict: true,
								schema: {
									type: 'object',
									properties: {
										items: {
											type: 'array',
											items: {
												type: 'object',
												properties: {
													title: { type: 'string', description: 'Fact Title (Headline)' },
													body: { type: 'string', description: 'Fact Content (Markdown)' },
													subject: {
														type: 'string',
														enum: subjectNames,
														description: 'Relevant UPSC Subject'
													},
													entities: {
														type: 'array',
														items: {
															type: 'object',
															properties: {
																name: { type: 'string', description: 'Entity Name' },
																type: {
																	type: 'string',
																	enum: ENTITY_CATEGORIES,
																	description: 'Entity Category'
																}
															},
															required: ['name', 'type'],
															additionalProperties: false
														}
													}
												},
												required: ['title', 'body', 'subject', 'entities'],
												additionalProperties: false
											}
										}
									},
									required: ['items'],
									additionalProperties: false
								}
							}
						}
					})
				});

				if (!response.ok) {
					console.error(`OpenRouter failed for ${sourceItem._id}:`, await response.text());
					failedItems++;
					continue;
				}

				const data = (await response.json()) as any;
				const rawContent = data.choices[0]?.message?.content || '{"items":[]}';

				let extractedItems: {
					title: string;
					body: string;
					subject: string;
					entities: { name: string; type: string }[];
				}[] = [];
				try {
					const parsed = JSON.parse(rawContent);
					extractedItems = parsed.items || [];
				} catch (e) {
					console.error(`Failed to parse AI response for ${sourceItem._id}:`, rawContent);
					failedItems++;
					continue;
				}

				// Determine topic based on extraction type
				const topicMap: Record<string, string> = {
					current_affairs: 'Current Affairs',
					locations: 'Mapping',
					concepts: 'Key Concepts',
					questions: 'Questions',
					entities: 'Entities',
					topics: 'Topics'
				};

				// Save extracted items
				for (const item of extractedItems) {
					if (item.title && item.body) {
						const contentId = await ctx.runMutation(internal.extraction.saveExtractedContent, {
							title: item.title,
							body: item.body,
							subjectName: item.subject,
							topic: topicMap[job.extractionType] || job.extractionType,
							sourceType: job.sourceType,
							sourceId: sourceItem._id,
							extractionType: job.extractionType,
							jobId: args.jobId,
							entities: item.entities,
							date: sourceItem.date
						});
						resultIds.push(contentId);
						extractedCount++;
					}
				}

				processedItems++;

				// Update progress periodically
				if (processedItems % 5 === 0) {
					await ctx.runMutation(internal.extraction.updateJobProgress, {
						jobId: args.jobId,
						processedItems,
						failedItems,
						extractedCount,
						resultIds
					});
				}
			} catch (err) {
				console.error(`Error processing source item ${sourceItem._id}:`, err);
				failedItems++;
			}
		}

		// Mark job as completed
		await ctx.runMutation(internal.extraction.updateJobProgress, {
			jobId: args.jobId,
			status: failedItems === sourceItems.length ? 'failed' : 'completed',
			processedItems,
			failedItems,
			extractedCount,
			resultIds,
			completedAt: Date.now(),
			error: failedItems > 0 ? `${failedItems} items failed to process` : undefined
		});

		return {
			processed: processedItems,
			failed: failedItems,
			extracted: extractedCount
		};
	}
});

/**
 * Retry a failed job - resets status and schedules job execution
 */
export const retryJob = action({
	args: { jobId: v.id('extraction_jobs') },
	handler: async (ctx, args): Promise<string> => {
		const job = await ctx.runQuery(api.extraction.getJob, { jobId: args.jobId });
		if (!job) throw new Error('Job not found');

		if (job.status !== 'failed' && job.status !== 'cancelled') {
			throw new Error('Can only retry failed or cancelled jobs');
		}

		// Reset job status
		await ctx.runMutation(internal.extraction.updateJobProgress, {
			jobId: args.jobId,
			status: 'pending',
			processedItems: 0,
			failedItems: 0,
			extractedCount: 0,
			resultIds: [],
			error: undefined,
			startedAt: undefined,
			completedAt: undefined
		});

		// Schedule the job to run (avoiding circular reference)
		await ctx.scheduler.runAfter(0, internal.extraction.executeJob, { jobId: args.jobId });

		return 'Job scheduled for retry';
	}
});

/**
 * Internal action to execute a job (avoids circular reference)
 */
export const executeJob = internalAction({
	args: { jobId: v.id('extraction_jobs') },
	handler: async (ctx, args): Promise<{ processed: number; failed: number; extracted: number }> => {
		// Get job details
		const job = await ctx.runQuery(api.extraction.getJob, { jobId: args.jobId });
		if (!job) throw new Error('Job not found');

		if (job.status !== 'pending') {
			throw new Error(`Job is not in pending state: ${job.status}`);
		}

		// Mark as running
		await ctx.runMutation(internal.extraction.updateJobProgress, {
			jobId: args.jobId,
			status: 'running',
			startedAt: Date.now()
		});

		// Get subjects
		const subjects = await ctx.runQuery(api.subjects.list);
		const subjectNames = subjects.map((s: any) => s.name);

		// Get source items
		const sourceItems = await ctx.runQuery(internal.extraction.fetchSourceItems, {
			sourceType: job.sourceType,
			ids: job.sourceIds.length > 0 ? job.sourceIds : undefined,
			limit: job.batchSize
		});

		// Get extraction config
		const config = EXTRACTION_PROMPTS[job.extractionType as ExtractionType];
		if (!config) throw new Error(`Invalid extraction type: ${job.extractionType}`);

		let processedItems = 0;
		let failedItems = 0;
		let extractedCount = 0;
		const resultIds: string[] = [];

		for (const sourceItem of sourceItems) {
			try {
				// Build input text from selected fields
				const inputParts: string[] = [];
				for (const field of job.selectedFields) {
					const value = (sourceItem as any)[field];
					if (value) {
						if (Array.isArray(value)) {
							inputParts.push(`${field}: ${value.join(', ')}`);
						} else {
							inputParts.push(`${field}: ${value}`);
						}
					}
				}
				const inputText = inputParts.join('\n\n');

				if (!inputText.trim()) {
					console.warn(`Empty input for source item ${sourceItem._id}, skipping`);
					failedItems++;
					continue;
				}

				// Call OpenRouter
				const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
						'Content-Type': 'application/json',
						'HTTP-Referer': 'https://cognirivus.vercel.app',
						'X-Title': `Cognirivus ${config.name} Extractor`
					},
					body: JSON.stringify({
						model: DEFAULT_MODEL,
						messages: [
							{
								role: 'system',
								content: `${config.prompt}

VALID SUBJECTS:
${subjectNames.join(', ')}

VALID ENTITY TYPES:
${ENTITY_CATEGORIES.join(', ')}`
							},
							{
								role: 'user',
								content: inputText
							}
						],
						response_format: {
							type: 'json_schema',
							json_schema: {
								name: `${job.extractionType}_extraction`,
								strict: true,
								schema: {
									type: 'object',
									properties: {
										items: {
											type: 'array',
											items: {
												type: 'object',
												properties: {
													title: { type: 'string', description: 'Fact Title (Headline)' },
													body: { type: 'string', description: 'Fact Content (Markdown)' },
													subject: {
														type: 'string',
														enum: subjectNames,
														description: 'Relevant UPSC Subject'
													},
													entities: {
														type: 'array',
														items: {
															type: 'object',
															properties: {
																name: { type: 'string', description: 'Entity Name' },
																type: {
																	type: 'string',
																	enum: ENTITY_CATEGORIES,
																	description: 'Entity Category'
																}
															},
															required: ['name', 'type'],
															additionalProperties: false
														}
													}
												},
												required: ['title', 'body', 'subject', 'entities'],
												additionalProperties: false
											}
										}
									},
									required: ['items'],
									additionalProperties: false
								}
							}
						}
					})
				});

				if (!response.ok) {
					console.error(`OpenRouter failed for ${sourceItem._id}:`, await response.text());
					failedItems++;
					continue;
				}

				const data = (await response.json()) as any;
				const rawContent = data.choices[0]?.message?.content || '{"items":[]}';

				let extractedItems: {
					title: string;
					body: string;
					subject: string;
					entities: { name: string; type: string }[];
				}[] = [];
				try {
					const parsed = JSON.parse(rawContent);
					extractedItems = parsed.items || [];
				} catch (e) {
					console.error(`Failed to parse AI response for ${sourceItem._id}:`, rawContent);
					failedItems++;
					continue;
				}

				// Determine topic based on extraction type
				const topicMap: Record<string, string> = {
					current_affairs: 'Current Affairs',
					locations: 'Mapping',
					concepts: 'Key Concepts',
					questions: 'Questions',
					entities: 'Entities',
					topics: 'Topics'
				};

				// Save extracted items
				for (const item of extractedItems) {
					if (item.title && item.body) {
						const contentId = await ctx.runMutation(internal.extraction.saveExtractedContent, {
							title: item.title,
							body: item.body,
							subjectName: item.subject,
							topic: topicMap[job.extractionType] || job.extractionType,
							sourceType: job.sourceType,
							sourceId: sourceItem._id,
							extractionType: job.extractionType,
							jobId: args.jobId,
							entities: item.entities,
							date: sourceItem.date
						});
						resultIds.push(contentId);
						extractedCount++;
					}
				}

				processedItems++;

				// Update progress periodically
				if (processedItems % 5 === 0) {
					await ctx.runMutation(internal.extraction.updateJobProgress, {
						jobId: args.jobId,
						processedItems,
						failedItems,
						extractedCount,
						resultIds
					});
				}
			} catch (err) {
				console.error(`Error processing source item ${sourceItem._id}:`, err);
				failedItems++;
			}
		}

		// Mark job as completed
		await ctx.runMutation(internal.extraction.updateJobProgress, {
			jobId: args.jobId,
			status: failedItems === sourceItems.length ? 'failed' : 'completed',
			processedItems,
			failedItems,
			extractedCount,
			resultIds,
			completedAt: Date.now(),
			error: failedItems > 0 ? `${failedItems} items failed to process` : undefined
		});

		return {
			processed: processedItems,
			failed: failedItems,
			extracted: extractedCount
		};
	}
});
