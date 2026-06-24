import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getAuthUser } from './auth';
import type { Id } from './_generated/dataModel';

// =====================================================
// KNOWLEDGE SYSTEM MODULE
// =====================================================

// Layer 1: Information Sources

export const createInformationSource = mutation({
	args: {
		sourceType: v.union(v.literal('url'), v.literal('upload'), v.literal('text')),
		title: v.string(),
		url: v.optional(v.string()),
		r2Key: v.optional(v.string()),
		rawText: v.optional(v.string())
	},
	returns: v.id('information_sources'),
	handler: async (ctx, args) => {
		const authUser = await getAuthUser(ctx);
		const now = Date.now();
		return await ctx.db.insert('information_sources', {
			userId: authUser._id,
			sourceType: args.sourceType,
			title: args.title,
			url: args.url,
			r2Key: args.r2Key,
			rawText: args.rawText,
			status: 'pending',
			createdAt: now,
			updatedAt: now
		});
	}
});

export const getInformationSource = query({
	args: {
		sourceId: v.id('information_sources')
	},
	returns: v.union(v.null(), v.any()),
	handler: async (ctx, args) => {
		return await ctx.db.get(args.sourceId);
	}
});

// Layer 2: Extraction

export const createExtractionJob = mutation({
	args: {
		sourceId: v.id('information_sources'),
		sourceVersionId: v.optional(v.id('source_versions')),
		model: v.string(),
		promptVersion: v.string()
	},
	returns: v.id('knowledge_extraction_jobs'),
	handler: async (ctx, args) => {
		const authUser = await getAuthUser(ctx);
		const now = Date.now();
		return await ctx.db.insert('knowledge_extraction_jobs', {
			sourceId: args.sourceId,
			sourceVersionId: args.sourceVersionId,
			userId: authUser._id,
			status: 'pending',
			model: args.model,
			promptVersion: args.promptVersion,
			startedAt: now
		});
	}
});

export const getExtractionJob = query({
	args: {
		jobId: v.id('knowledge_extraction_jobs')
	},
	returns: v.union(v.null(), v.any()),
	handler: async (ctx, args) => {
		return await ctx.db.get(args.jobId);
	}
});

// Layer 3: Knowledge Graph

export const createKnowledgeCell = mutation({
	args: {
		cellKey: v.string(),
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
		source: v.union(v.literal('llm_extracted'), v.literal('human_created'), v.literal('community')),
		topicId: v.id('knowledge_cell_topics')
	},
	returns: v.id('knowledge_cells'),
	handler: async (ctx, args) => {
		const now = Date.now();
		return await ctx.db.insert('knowledge_cells', {
			cellKey: args.cellKey,
			cellType: args.cellType,
			title: args.title,
			summary: args.summary,
			content: args.content,
			r2Key: args.r2Key,
			source: args.source,
			topicId: args.topicId,
			createdAt: now,
			updatedAt: now
		});
	}
});

export const getKnowledgeCell = query({
	args: {
		cellId: v.id('knowledge_cells')
	},
	returns: v.union(v.null(), v.any()),
	handler: async (ctx, args) => {
		return await ctx.db.get(args.cellId);
	}
});

export const listKnowledgeCells = query({
	args: {
		topicId: v.optional(v.id('knowledge_cell_topics')),
		limit: v.optional(v.number())
	},
	returns: v.array(v.any()),
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

// Layer 4: Personal Knowledge

export const addUserKnowledgeCell = mutation({
	args: {
		cellId: v.id('knowledge_cells'),
		relationship: v.union(
			v.literal('learning'),
			v.literal('learned'),
			v.literal('teaching'),
			v.literal('reviewing')
		)
	},
	returns: v.id('user_knowledge_cells'),
	handler: async (ctx, args) => {
		const authUser = await getAuthUser(ctx);
		const now = Date.now();
		return await ctx.db.insert('user_knowledge_cells', {
			userId: authUser._id,
			cellId: args.cellId,
			relationship: args.relationship,
			progress: 0,
			lastInteractionAt: now,
			createdAt: now,
			updatedAt: now
		});
	}
});

export const getUserKnowledgeCells = query({
	args: {
		relationship: v.optional(
			v.union(
				v.literal('learning'),
				v.literal('learned'),
				v.literal('teaching'),
				v.literal('reviewing')
			)
		),
		limit: v.optional(v.number())
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		const authUser = await getAuthUser(ctx);
		if (args.relationship) {
			return await ctx.db
				.query('user_knowledge_cells')
				.withIndex('by_userId_and_relationship', (q: any) =>
					q.eq('userId', authUser._id).eq('relationship', args.relationship!)
				)
				.order('desc')
				.take(Math.min(args.limit ?? 50, 100));
		}
		return await ctx.db
			.query('user_knowledge_cells')
			.withIndex('by_userId', (q: any) => q.eq('userId', authUser._id))
			.order('desc')
			.take(Math.min(args.limit ?? 50, 100));
	}
});

// Layer 5: Synthesis

export const createKnowledgeNote = mutation({
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

export const listKnowledgeNotes = query({
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
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		const authUser = await getAuthUser(ctx);
		if (args.status) {
			return await ctx.db
				.query('knowledge_notes')
				.withIndex('by_userId_and_status', (q: any) =>
					q.eq('userId', authUser._id).eq('status', args.status!)
				)
				.order('desc')
				.take(Math.min(args.limit ?? 50, 100));
		}
		return await ctx.db
			.query('knowledge_notes')
			.withIndex('by_userId', (q: any) => q.eq('userId', authUser._id))
			.order('desc')
			.take(Math.min(args.limit ?? 50, 100));
	}
});

// Layer 6: Learning & Education

export const createLearningGoal = mutation({
	args: {
		title: v.string(),
		description: v.optional(v.string()),
		goalType: v.union(
			v.literal('course'),
			v.literal('curriculum'),
			v.literal('training'),
			v.literal('self_study')
		),
		targetDate: v.optional(v.number())
	},
	returns: v.id('learning_goals'),
	handler: async (ctx, args) => {
		const authUser = await getAuthUser(ctx);
		const now = Date.now();
		return await ctx.db.insert('learning_goals', {
			userId: authUser._id,
			title: args.title,
			description: args.description,
			goalType: args.goalType,
			status: 'active',
			targetDate: args.targetDate,
			progress: 0,
			createdAt: now,
			updatedAt: now
		});
	}
});

export const listLearningGoals = query({
	args: {
		status: v.optional(
			v.union(
				v.literal('active'),
				v.literal('completed'),
				v.literal('paused'),
				v.literal('abandoned')
			)
		),
		limit: v.optional(v.number())
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		const authUser = await getAuthUser(ctx);
		if (args.status) {
			return await ctx.db
				.query('learning_goals')
				.withIndex('by_userId_and_status', (q: any) =>
					q.eq('userId', authUser._id).eq('status', args.status!)
				)
				.order('desc')
				.take(Math.min(args.limit ?? 50, 100));
		}
		return await ctx.db
			.query('learning_goals')
			.withIndex('by_userId', (q: any) => q.eq('userId', authUser._id))
			.order('desc')
			.take(Math.min(args.limit ?? 50, 100));
	}
});

// Layer 7: Agent Orchestration

export const createAgentRun = mutation({
	args: {
		agentType: v.string(),
		workflowId: v.optional(v.id('agent_workflows')),
		inputHash: v.string()
	},
	returns: v.id('agent_runs'),
	handler: async (ctx, args) => {
		const authUser = await getAuthUser(ctx);
		const now = Date.now();
		return await ctx.db.insert('agent_runs', {
			agentType: args.agentType,
			workflowId: args.workflowId,
			userId: authUser._id,
			inputHash: args.inputHash,
			status: 'pending',
			startedAt: now
		});
	}
});

export const updateAgentRun = mutation({
	args: {
		runId: v.id('agent_runs'),
		status: v.union(
			v.literal('pending'),
			v.literal('running'),
			v.literal('completed'),
			v.literal('failed')
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
		const updates: any = {
			status: args.status,
			updatedAt: now
		};
		if (args.outputSummary) updates.outputSummary = args.outputSummary;
		if (args.outputR2Key) updates.outputR2Key = args.outputR2Key;
		if (args.tokenUsage) updates.tokenUsage = args.tokenUsage;
		if (args.cost !== undefined) updates.cost = args.cost;
		if (args.error) updates.error = args.error;
		if (args.status === 'completed' || args.status === 'failed') {
			updates.completedAt = now;
			const run = await ctx.db.get(args.runId);
			if (run) {
				updates.durationMs = now - run.startedAt;
			}
		}
		await ctx.db.patch(args.runId, updates);
		return null;
	}
});

// Layer 8: Semantic Graph

export const createKnowledgeEntity = mutation({
	args: {
		entityType: v.union(
			v.literal('person'),
			v.literal('organization'),
			v.literal('place'),
			v.literal('concept'),
			v.literal('event'),
			v.literal('technology')
		),
		name: v.string(),
		canonicalName: v.string(),
		aliases: v.array(v.string()),
		description: v.optional(v.string()),
		externalIds: v.optional(v.any())
	},
	returns: v.id('knowledge_entities'),
	handler: async (ctx, args) => {
		const now = Date.now();
		return await ctx.db.insert('knowledge_entities', {
			entityType: args.entityType,
			name: args.name,
			canonicalName: args.canonicalName,
			aliases: args.aliases,
			description: args.description,
			externalIds: args.externalIds,
			createdAt: now,
			updatedAt: now
		});
	}
});

export const findKnowledgeEntity = query({
	args: {
		canonicalName: v.string()
	},
	returns: v.union(v.null(), v.any()),
	handler: async (ctx, args) => {
		return await ctx.db
			.query('knowledge_entities')
			.withIndex('by_canonicalName', (q: any) => q.eq('canonicalName', args.canonicalName))
			.unique();
	}
});

export const listKnowledgeEntities = query({
	args: {
		entityType: v.optional(
			v.union(
				v.literal('person'),
				v.literal('organization'),
				v.literal('place'),
				v.literal('concept'),
				v.literal('event'),
				v.literal('technology')
			)
		),
		limit: v.optional(v.number())
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		if (args.entityType) {
			return await ctx.db
				.query('knowledge_entities')
				.withIndex('by_entityType', (q: any) => q.eq('entityType', args.entityType!))
				.order('desc')
				.take(Math.min(args.limit ?? 50, 100));
		}
		return await ctx.db
			.query('knowledge_entities')
			.order('desc')
			.take(Math.min(args.limit ?? 50, 100));
	}
});

// =====================================================
// TOPIC CRUD
// =====================================================

export const createTopic = mutation({
	args: {
		name: v.string(),
		description: v.optional(v.string()),
		parentId: v.optional(v.id('knowledge_cell_topics'))
	},
	returns: v.id('knowledge_cell_topics'),
	handler: async (ctx, args) => {
		const now = Date.now();
		return await ctx.db.insert('knowledge_cell_topics', {
			name: args.name,
			description: args.description,
			parentId: args.parentId,
			createdAt: now,
			updatedAt: now
		});
	}
});

export const updateTopic = mutation({
	args: {
		topicId: v.id('knowledge_cell_topics'),
		name: v.optional(v.string()),
		description: v.optional(v.string()),
		parentId: v.optional(v.id('knowledge_cell_topics'))
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const updates: any = { updatedAt: Date.now() };
		if (args.name !== undefined) updates.name = args.name;
		if (args.description !== undefined) updates.description = args.description;
		if (args.parentId !== undefined) updates.parentId = args.parentId;
		await ctx.db.patch(args.topicId, updates);
		return null;
	}
});

export const deleteTopic = mutation({
	args: {
		topicId: v.id('knowledge_cell_topics')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const cellsInTopic = await ctx.db
			.query('knowledge_cells')
			.withIndex('by_topicId', (q: any) => q.eq('topicId', args.topicId))
			.take(1);
		if (cellsInTopic.length > 0) {
			throw new Error('Cannot delete topic with assigned cells.');
		}
		const children = await ctx.db
			.query('knowledge_cell_topics')
			.withIndex('by_parentId', (q: any) => q.eq('parentId', args.topicId))
			.take(1);
		if (children.length > 0) {
			throw new Error('Cannot delete topic with child topics.');
		}
		await ctx.db.delete(args.topicId);
		return null;
	}
});

export const listTopics = query({
	args: {
		parentId: v.optional(v.id('knowledge_cell_topics'))
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		if (args.parentId) {
			return await ctx.db
				.query('knowledge_cell_topics')
				.withIndex('by_parentId', (q: any) => q.eq('parentId', args.parentId))
				.collect();
		}
		return await ctx.db.query('knowledge_cell_topics').collect();
	}
});

export const getTopic = query({
	args: {
		topicId: v.id('knowledge_cell_topics')
	},
	returns: v.union(v.null(), v.any()),
	handler: async (ctx, args) => {
		return await ctx.db.get(args.topicId);
	}
});

export const moveCellToTopic = mutation({
	args: {
		cellId: v.id('knowledge_cells'),
		topicId: v.id('knowledge_cell_topics')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ctx.db.patch(args.cellId, {
			topicId: args.topicId,
			updatedAt: Date.now()
		});
		return null;
	}
});

// =====================================================
// DOMAIN CRUD
// =====================================================

export const createDomain = mutation({
	args: {
		name: v.string(),
		description: v.optional(v.string()),
		icon: v.optional(v.string())
	},
	returns: v.id('knowledge_domains'),
	handler: async (ctx, args) => {
		const now = Date.now();
		return await ctx.db.insert('knowledge_domains', {
			name: args.name,
			description: args.description,
			icon: args.icon,
			createdAt: now,
			updatedAt: now
		});
	}
});

export const updateDomain = mutation({
	args: {
		domainId: v.id('knowledge_domains'),
		name: v.optional(v.string()),
		description: v.optional(v.string()),
		icon: v.optional(v.string())
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const updates: any = { updatedAt: Date.now() };
		if (args.name !== undefined) updates.name = args.name;
		if (args.description !== undefined) updates.description = args.description;
		if (args.icon !== undefined) updates.icon = args.icon;
		await ctx.db.patch(args.domainId, updates);
		return null;
	}
});

export const deleteDomain = mutation({
	args: {
		domainId: v.id('knowledge_domains')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const links = await ctx.db
			.query('domain_topics')
			.withIndex('by_domainId', (q: any) => q.eq('domainId', args.domainId))
			.take(1);
		if (links.length > 0) {
			throw new Error('Cannot delete domain with assigned topics.');
		}
		await ctx.db.delete(args.domainId);
		return null;
	}
});

export const listDomains = query({
	args: {},
	returns: v.array(v.any()),
	handler: async (ctx) => {
		return await ctx.db.query('knowledge_domains').collect();
	}
});

export const assignTopicToDomain = mutation({
	args: {
		domainId: v.id('knowledge_domains'),
		topicId: v.id('knowledge_cell_topics')
	},
	returns: v.id('domain_topics'),
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query('domain_topics')
			.withIndex('by_domainId', (q: any) => q.eq('domainId', args.domainId))
			.filter((q: any) => q.eq(q.field('topicId'), args.topicId))
			.first();
		if (existing) return existing._id;
		return await ctx.db.insert('domain_topics', {
			domainId: args.domainId,
			topicId: args.topicId,
			createdAt: Date.now()
		});
	}
});

export const getDomainTopics = query({
	args: {
		domainId: v.id('knowledge_domains')
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		const links = await ctx.db
			.query('domain_topics')
			.withIndex('by_domainId', (q: any) => q.eq('domainId', args.domainId))
			.collect();
		return Promise.all(
			links.map(async (link) => {
				const topic = await ctx.db.get(link.topicId);
				return topic;
			})
		);
	}
});

// =====================================================
// CLAIM SYSTEM
// =====================================================

export const createClaim = mutation({
	args: {
		cellId: v.id('knowledge_cells'),
		statement: v.string(),
		source: v.union(v.literal('llm_extracted'), v.literal('human_created'), v.literal('community'))
	},
	returns: v.id('knowledge_claims'),
	handler: async (ctx, args) => {
		const now = Date.now();
		return await ctx.db.insert('knowledge_claims', {
			cellId: args.cellId,
			claimKey: `${args.cellId}-${now}`,
			statement: args.statement,
			source: args.source,
			status: 'active',
			createdAt: now,
			updatedAt: now
		});
	}
});

export const listClaims = query({
	args: {
		cellId: v.optional(v.id('knowledge_cells'))
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		if (args.cellId) {
			return await ctx.db
				.query('knowledge_claims')
				.withIndex('by_cellId', (q: any) => q.eq('cellId', args.cellId))
				.collect();
		}
		return await ctx.db.query('knowledge_claims').collect();
	}
});

export const addEvidence = mutation({
	args: {
		claimId: v.id('knowledge_claims'),
		sourceItemId: v.id('source_items'),
		quote: v.string(),
		confidence: v.number(),
		evidenceType: v.union(
			v.literal('study'),
			v.literal('expert_opinion'),
			v.literal('data'),
			v.literal('anecdote')
		),
		sampleSize: v.optional(v.number())
	},
	returns: v.id('claim_evidence'),
	handler: async (ctx, args) => {
		return await ctx.db.insert('claim_evidence', {
			claimId: args.claimId,
			sourceItemId: args.sourceItemId,
			quote: args.quote,
			confidence: args.confidence,
			evidenceType: args.evidenceType,
			sampleSize: args.sampleSize,
			createdAt: Date.now()
		});
	}
});

export const listEvidence = query({
	args: {
		claimId: v.id('knowledge_claims')
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		return await ctx.db
			.query('claim_evidence')
			.withIndex('by_claimId', (q: any) => q.eq('claimId', args.claimId))
			.collect();
	}
});

export const assessClaim = mutation({
	args: {
		claimId: v.id('knowledge_claims'),
		assessmentType: v.union(v.literal('llm'), v.literal('human'), v.literal('community')),
		userId: v.optional(v.string()),
		consensus: v.number(),
		rationale: v.optional(v.string())
	},
	returns: v.id('claim_assessments'),
	handler: async (ctx, args) => {
		return await ctx.db.insert('claim_assessments', {
			claimId: args.claimId,
			assessmentType: args.assessmentType,
			userId: args.userId,
			consensus: args.consensus,
			rationale: args.rationale,
			createdAt: Date.now()
		});
	}
});

// =====================================================
// CELL RELATIONSHIPS
// =====================================================

export const createCellRelationship = mutation({
	args: {
		sourceCellId: v.id('knowledge_cells'),
		targetCellId: v.id('knowledge_cells'),
		relationshipType: v.union(
			v.literal('prerequisite_for'),
			v.literal('contradicts'),
			v.literal('supports'),
			v.literal('related_to'),
			v.literal('part_of'),
			v.literal('example_of')
		),
		confidence: v.number()
	},
	returns: v.id('knowledge_cell_relationships'),
	handler: async (ctx, args) => {
		return await ctx.db.insert('knowledge_cell_relationships', {
			sourceCellId: args.sourceCellId,
			targetCellId: args.targetCellId,
			relationshipType: args.relationshipType,
			confidence: args.confidence,
			createdAt: Date.now()
		});
	}
});

export const getCellRelationships = query({
	args: {
		cellId: v.id('knowledge_cells')
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		const asSource = await ctx.db
			.query('knowledge_cell_relationships')
			.withIndex('by_sourceCellId', (q: any) => q.eq('sourceCellId', args.cellId))
			.collect();
		const asTarget = await ctx.db
			.query('knowledge_cell_relationships')
			.withIndex('by_targetCellId', (q: any) => q.eq('targetCellId', args.cellId))
			.collect();
		return [...asSource, ...asTarget];
	}
});

export const deleteCellRelationship = mutation({
	args: {
		relationshipId: v.id('knowledge_cell_relationships')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ctx.db.delete(args.relationshipId);
		return null;
	}
});

// =====================================================
// CELL CITATIONS
// =====================================================

export const addCellCitation = mutation({
	args: {
		cellId: v.id('knowledge_cells'),
		sourceItemId: v.id('source_items'),
		quote: v.string(),
		confidence: v.number()
	},
	returns: v.id('knowledge_cell_citations'),
	handler: async (ctx, args) => {
		return await ctx.db.insert('knowledge_cell_citations', {
			cellId: args.cellId,
			sourceItemId: args.sourceItemId,
			quote: args.quote,
			confidence: args.confidence,
			createdAt: Date.now()
		});
	}
});

export const getCellCitations = query({
	args: {
		cellId: v.id('knowledge_cells')
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		return await ctx.db
			.query('knowledge_cell_citations')
			.withIndex('by_cellId', (q: any) => q.eq('cellId', args.cellId))
			.collect();
	}
});

// =====================================================
// QUALITY SCORING
// =====================================================

export const computeCellQuality = mutation({
	args: {
		cellId: v.id('knowledge_cells')
	},
	returns: v.id('knowledge_cell_quality'),
	handler: async (ctx, args) => {
		const now = Date.now();
		const cell = await ctx.db.get(args.cellId);
		if (!cell) throw new Error('Cell not found.');

		const citations = await ctx.db
			.query('knowledge_cell_citations')
			.withIndex('by_cellId', (q: any) => q.eq('cellId', args.cellId))
			.collect();

		const assessments = await ctx.db
			.query('knowledge_cell_assessments')
			.withIndex('by_cellId', (q: any) => q.eq('cellId', args.cellId))
			.collect();

		const relationships = await ctx.db
			.query('knowledge_cell_relationships')
			.withIndex('by_sourceCellId', (q: any) => q.eq('sourceCellId', args.cellId))
			.collect();

		const contradictionCount = relationships.filter(
			(r) => r.relationshipType === 'contradicts'
		).length;

		const ageDays = Math.floor((now - cell.createdAt) / 86400000);
		let verificationStatus: 'fresh' | 'aging' | 'stale' | 'needs_review' = 'fresh';
		if (ageDays >= 180) verificationStatus = 'needs_review';
		else if (ageDays >= 90) verificationStatus = 'stale';
		else if (ageDays >= 30) verificationStatus = 'aging';

		const averageSourceQuality = 0.5;
		const assessmentCount = assessments.length;
		const score =
			Math.min(citations.length / 5, 1) * 0.3 +
			(1 - contradictionCount / Math.max(assessmentCount + 1, 1)) * 0.3 +
			averageSourceQuality * 0.2 +
			(verificationStatus === 'fresh' ? 1 : verificationStatus === 'aging' ? 0.7 : 0.3) * 0.2;

		const existing = await ctx.db
			.query('knowledge_cell_quality')
			.withIndex('by_cellId', (q: any) => q.eq('cellId', args.cellId))
			.first();

		const qualityData = {
			cellId: args.cellId,
			score,
			citationCount: citations.length,
			averageSourceQuality,
			assessmentCount,
			contradictionCount,
			ageDays,
			lastVerifiedAt: now,
			verificationStatus,
			computedAt: now
		};

		if (existing) {
			await ctx.db.patch(existing._id, qualityData);
			return existing._id;
		}
		return await ctx.db.insert('knowledge_cell_quality', qualityData);
	}
});

export const getCellQuality = query({
	args: {
		cellId: v.id('knowledge_cells')
	},
	returns: v.union(v.null(), v.any()),
	handler: async (ctx, args) => {
		return await ctx.db
			.query('knowledge_cell_quality')
			.withIndex('by_cellId', (q: any) => q.eq('cellId', args.cellId))
			.first();
	}
});

// =====================================================
// CELL VIEWS (Perspective-aware)
// =====================================================

export const createView = mutation({
	args: {
		cellId: v.id('knowledge_cells'),
		audience: v.union(
			v.literal('child'),
			v.literal('student'),
			v.literal('upsc'),
			v.literal('expert'),
			v.literal('general')
		),
		explanation: v.string(),
		simplifiedContent: v.optional(v.string()),
		generatedBy: v.string()
	},
	returns: v.id('knowledge_views'),
	handler: async (ctx, args) => {
		const now = Date.now();
		return await ctx.db.insert('knowledge_views', {
			cellId: args.cellId,
			audience: args.audience,
			explanation: args.explanation,
			simplifiedContent: args.simplifiedContent,
			generatedBy: args.generatedBy,
			createdAt: now,
			updatedAt: now
		});
	}
});

export const getViews = query({
	args: {
		cellId: v.id('knowledge_cells')
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		return await ctx.db
			.query('knowledge_views')
			.withIndex('by_cellId', (q: any) => q.eq('cellId', args.cellId))
			.collect();
	}
});

// =====================================================
// CELL EMBEDDINGS
// =====================================================

export const addCellEmbedding = mutation({
	args: {
		cellId: v.id('knowledge_cells'),
		versionId: v.optional(v.id('knowledge_cell_versions')),
		contentHash: v.optional(v.string()),
		model: v.string(),
		embedding: v.array(v.number())
	},
	returns: v.id('knowledge_cell_embeddings'),
	handler: async (ctx, args) => {
		return await ctx.db.insert('knowledge_cell_embeddings', {
			cellId: args.cellId,
			versionId: args.versionId,
			contentHash: args.contentHash,
			model: args.model,
			embedding: args.embedding,
			createdAt: Date.now()
		});
	}
});

// =====================================================
// CELL EVENTS (Tracking)
// =====================================================

export const logCellEvent = mutation({
	args: {
		cellId: v.id('knowledge_cells'),
		eventType: v.union(
			v.literal('read'),
			v.literal('practice'),
			v.literal('review'),
			v.literal('teach'),
			v.literal('failed_recall'),
			v.literal('forgotten'),
			v.literal('incorrect_answer')
		),
		context: v.optional(v.string()),
		durationMs: v.optional(v.number())
	},
	returns: v.id('knowledge_cell_events'),
	handler: async (ctx, args) => {
		const authUser = await getAuthUser(ctx);
		return await ctx.db.insert('knowledge_cell_events', {
			userId: authUser._id,
			cellId: args.cellId,
			eventType: args.eventType,
			context: args.context,
			durationMs: args.durationMs,
			createdAt: Date.now()
		});
	}
});

// =====================================================
// SPACED REPETITION
// =====================================================

export const scheduleReview = mutation({
	args: {
		cellId: v.id('knowledge_cells'),
		nextReviewAt: v.number(),
		intervalMs: v.number(),
		easeFactor: v.number()
	},
	returns: v.id('knowledge_cell_reminders'),
	handler: async (ctx, args) => {
		const authUser = await getAuthUser(ctx);
		const now = Date.now();
		const existing = await ctx.db
			.query('knowledge_cell_reminders')
			.withIndex('by_userId_and_cellId', (q: any) =>
				q.eq('userId', authUser._id).eq('cellId', args.cellId)
			)
			.first();
		if (existing) {
			await ctx.db.patch(existing._id, {
				nextReviewAt: args.nextReviewAt,
				intervalMs: args.intervalMs,
				easeFactor: args.easeFactor,
				updatedAt: now
			});
			return existing._id;
		}
		return await ctx.db.insert('knowledge_cell_reminders', {
			userId: authUser._id,
			cellId: args.cellId,
			nextReviewAt: args.nextReviewAt,
			intervalMs: args.intervalMs,
			easeFactor: args.easeFactor,
			repetitionCount: 0,
			createdAt: now,
			updatedAt: now
		});
	}
});

export const getDueReviews = query({
	args: {},
	returns: v.array(v.any()),
	handler: async (ctx) => {
		const authUser = await getAuthUser(ctx);
		const now = Date.now();
		const reminders = await ctx.db
			.query('knowledge_cell_reminders')
			.withIndex('by_userId_and_nextReviewAt', (q: any) =>
				q.eq('userId', authUser._id).lte('nextReviewAt', now)
			)
			.take(20);
		return Promise.all(
			reminders.map(async (r) => {
				const cell = await ctx.db.get(r.cellId);
				return { ...r, cell };
			})
		);
	}
});

export const completeReview = mutation({
	args: {
		cellId: v.id('knowledge_cells'),
		quality: v.number()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const authUser = await getAuthUser(ctx);
		const now = Date.now();
		const reminder = await ctx.db
			.query('knowledge_cell_reminders')
			.withIndex('by_userId_and_cellId', (q: any) =>
				q.eq('userId', authUser._id).eq('cellId', args.cellId)
			)
			.first();
		if (!reminder) return null;

		let { intervalMs, easeFactor, repetitionCount } = reminder;

		if (args.quality >= 3) {
			if (repetitionCount === 0) {
				intervalMs = 86400000;
			} else if (repetitionCount === 1) {
				intervalMs = 518400000;
			} else {
				intervalMs = Math.round(intervalMs * easeFactor);
			}
			easeFactor = Math.max(
				1.3,
				easeFactor + 0.1 - (5 - args.quality) * (0.08 + (5 - args.quality) * 0.02)
			);
			repetitionCount += 1;
		} else {
			repetitionCount = 0;
			intervalMs = 86400000;
			easeFactor = Math.max(1.3, easeFactor - 0.2);
		}

		await ctx.db.patch(reminder._id, {
			nextReviewAt: now + intervalMs,
			intervalMs,
			easeFactor,
			repetitionCount,
			updatedAt: now
		});
		return null;
	}
});

// =====================================================
// MASTERY (Bloom's Taxonomy)
// =====================================================

export const updateMastery = mutation({
	args: {
		cellId: v.id('knowledge_cells'),
		remember: v.optional(v.boolean()),
		understand: v.optional(v.boolean()),
		apply: v.optional(v.boolean()),
		analyze: v.optional(v.boolean()),
		evaluate: v.optional(v.boolean()),
		create: v.optional(v.boolean())
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const authUser = await getAuthUser(ctx);
		const now = Date.now();
		const existing = await ctx.db
			.query('user_cell_mastery')
			.withIndex('by_userId_and_cellId', (q: any) =>
				q.eq('userId', authUser._id).eq('cellId', args.cellId)
			)
			.first();
		const updates: any = { lastAssessedAt: now, updatedAt: now };
		if (args.remember !== undefined) updates.remember = args.remember;
		if (args.understand !== undefined) updates.understand = args.understand;
		if (args.apply !== undefined) updates.apply = args.apply;
		if (args.analyze !== undefined) updates.analyze = args.analyze;
		if (args.evaluate !== undefined) updates.evaluate = args.evaluate;
		if (args.create !== undefined) updates.create = args.create;

		if (existing) {
			await ctx.db.patch(existing._id, updates);
		} else {
			await ctx.db.insert('user_cell_mastery', {
				userId: authUser._id,
				cellId: args.cellId,
				remember: args.remember ?? false,
				understand: args.understand ?? false,
				apply: args.apply ?? false,
				analyze: args.analyze ?? false,
				evaluate: args.evaluate ?? false,
				create: args.create ?? false,
				lastAssessedAt: now,
				createdAt: now,
				updatedAt: now
			});
		}
		return null;
	}
});

export const getMastery = query({
	args: {
		cellId: v.id('knowledge_cells')
	},
	returns: v.union(v.null(), v.any()),
	handler: async (ctx, args) => {
		const authUser = await getAuthUser(ctx);
		return await ctx.db
			.query('user_cell_mastery')
			.withIndex('by_userId_and_cellId', (q: any) =>
				q.eq('userId', authUser._id).eq('cellId', args.cellId)
			)
			.first();
	}
});

// =====================================================
// LEARNING PATHS
// =====================================================

export const createPath = mutation({
	args: {
		title: v.string(),
		description: v.optional(v.string()),
		domainId: v.optional(v.id('knowledge_domains'))
	},
	returns: v.id('knowledge_paths'),
	handler: async (ctx, args) => {
		const authUser = await getAuthUser(ctx);
		const now = Date.now();
		return await ctx.db.insert('knowledge_paths', {
			userId: authUser._id,
			title: args.title,
			description: args.description,
			domainId: args.domainId,
			status: 'draft',
			totalSteps: 0,
			createdAt: now,
			updatedAt: now
		});
	}
});

export const listKnowledgePaths = query({
	args: {},
	returns: v.array(v.any()),
	handler: async (ctx) => {
		const authUser = await getAuthUser(ctx);
		return await ctx.db
			.query('knowledge_paths')
			.withIndex('by_userId', (q: any) => q.eq('userId', authUser._id))
			.order('desc')
			.take(50);
	}
});

// =====================================================
// KNOWLEDGE RECOMMENDATIONS
// =====================================================

export const listKnowledgeRecommendations = query({
	args: {},
	returns: v.array(v.any()),
	handler: async (ctx) => {
		const authUser = await getAuthUser(ctx);
		return await ctx.db
			.query('knowledge_recommendations')
			.withIndex('by_userId', (q: any) => q.eq('userId', authUser._id))
			.order('desc')
			.take(20);
	}
});

// =====================================================
// CONFLICTS
// =====================================================

export const listConflicts = query({
	args: {
		status: v.optional(
			v.union(
				v.literal('open'),
				v.literal('investigating'),
				v.literal('resolved'),
				v.literal('dismissed')
			)
		)
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		if (args.status) {
			return await ctx.db
				.query('conflict_cases')
				.withIndex('by_status', (q: any) => q.eq('status', args.status!))
				.collect();
		}
		return await ctx.db.query('conflict_cases').collect();
	}
});

// =====================================================
// AGENT RUNS
// =====================================================

export const listAgentRuns = query({
	args: {
		limit: v.optional(v.number())
	},
	returns: v.array(v.any()),
	handler: async (ctx) => {
		const authUser = await getAuthUser(ctx);
		return await ctx.db
			.query('agent_runs')
			.withIndex('by_userId', (q: any) => q.eq('userId', authUser._id))
			.order('desc')
			.take(50);
	}
});

// =====================================================
// ENTITY RELATIONSHIPS
// =====================================================

export const createEntityRelationship = mutation({
	args: {
		sourceEntityId: v.id('knowledge_entities'),
		targetEntityId: v.id('knowledge_entities'),
		relationshipType: v.union(
			v.literal('participated_in'),
			v.literal('located_in'),
			v.literal('founded'),
			v.literal('invented'),
			v.literal('related_to'),
			v.literal('member_of')
		),
		confidence: v.number()
	},
	returns: v.id('knowledge_entity_relationships'),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		return await ctx.db.insert('knowledge_entity_relationships', {
			sourceEntityId: args.sourceEntityId,
			targetEntityId: args.targetEntityId,
			relationshipType: args.relationshipType,
			confidence: args.confidence,
			createdAt: Date.now()
		});
	}
});

export const getEntityRelationships = query({
	args: {
		entityId: v.id('knowledge_entities')
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		const outgoing = await ctx.db
			.query('knowledge_entity_relationships')
			.withIndex('by_sourceEntityId', (q: any) => q.eq('sourceEntityId', args.entityId))
			.collect();
		const incoming = await ctx.db
			.query('knowledge_entity_relationships')
			.withIndex('by_targetEntityId', (q: any) => q.eq('targetEntityId', args.entityId))
			.collect();
		return [...outgoing, ...incoming];
	}
});

// =====================================================
// AGENT MEMORIES
// =====================================================

export const createAgentMemory = mutation({
	args: {
		agentType: v.string(),
		memoryType: v.union(
			v.literal('source_quality'),
			v.literal('user_preference'),
			v.literal('extraction_pattern'),
			v.literal('verification_rule')
		),
		key: v.string(),
		value: v.any(),
		confidence: v.number()
	},
	returns: v.id('agent_memories'),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		const now = Date.now();
		const existing = await ctx.db
			.query('agent_memories')
			.withIndex('by_agentType_and_memoryType', (q: any) =>
				q.eq('agentType', args.agentType).eq('memoryType', args.memoryType)
			)
			.filter((q: any) => q.eq(q.field('key'), args.key))
			.first();
		if (existing) {
			await ctx.db.patch(existing._id, {
				value: args.value,
				confidence: args.confidence,
				updatedAt: now
			});
			return existing._id;
		}
		return await ctx.db.insert('agent_memories', {
			agentType: args.agentType,
			memoryType: args.memoryType,
			key: args.key,
			value: args.value,
			confidence: args.confidence,
			createdAt: now,
			updatedAt: now
		});
	}
});

export const listAgentMemories = query({
	args: {
		agentType: v.optional(v.string()),
		memoryType: v.optional(
			v.union(
				v.literal('source_quality'),
				v.literal('user_preference'),
				v.literal('extraction_pattern'),
				v.literal('verification_rule')
			)
		)
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		if (args.agentType && args.memoryType) {
			return await ctx.db
				.query('agent_memories')
				.withIndex('by_agentType_and_memoryType', (q: any) =>
					q.eq('agentType', args.agentType!).eq('memoryType', args.memoryType!)
				)
				.collect();
		}
		if (args.agentType) {
			return await ctx.db
				.query('agent_memories')
				.withIndex('by_agentType', (q: any) => q.eq('agentType', args.agentType!))
				.collect();
		}
		return await ctx.db.query('agent_memories').take(100);
	}
});

// =====================================================
// AGENT WORKFLOWS
// =====================================================

export const createAgentWorkflow = mutation({
	args: {
		name: v.string(),
		description: v.optional(v.string()),
		triggerType: v.union(v.literal('manual'), v.literal('scheduled'), v.literal('event'))
	},
	returns: v.id('agent_workflows'),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		const now = Date.now();
		return await ctx.db.insert('agent_workflows', {
			name: args.name,
			description: args.description,
			triggerType: args.triggerType,
			status: 'active',
			createdAt: now,
			updatedAt: now
		});
	}
});

export const listAgentWorkflows = query({
	args: {},
	returns: v.array(v.any()),
	handler: async (ctx) => {
		return await ctx.db.query('agent_workflows').collect();
	}
});

export const getAgentWorkflow = query({
	args: {
		workflowId: v.id('agent_workflows')
	},
	returns: v.union(v.null(), v.any()),
	handler: async (ctx, args) => {
		const workflow = await ctx.db.get(args.workflowId);
		if (!workflow) return null;
		const steps = await ctx.db
			.query('workflow_steps')
			.withIndex('by_workflowId_and_stepOrder', (q: any) => q.eq('workflowId', args.workflowId))
			.collect();
		return { ...workflow, steps };
	}
});

export const updateAgentWorkflow = mutation({
	args: {
		workflowId: v.id('agent_workflows'),
		name: v.optional(v.string()),
		description: v.optional(v.string()),
		status: v.optional(v.union(v.literal('active'), v.literal('paused'), v.literal('archived')))
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		const updates: any = { updatedAt: Date.now() };
		if (args.name !== undefined) updates.name = args.name;
		if (args.description !== undefined) updates.description = args.description;
		if (args.status !== undefined) updates.status = args.status;
		await ctx.db.patch(args.workflowId, updates);
	}
});

export const deleteAgentWorkflow = mutation({
	args: {
		workflowId: v.id('agent_workflows')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		const steps = await ctx.db
			.query('workflow_steps')
			.withIndex('by_workflowId', (q: any) => q.eq('workflowId', args.workflowId))
			.collect();
		for (const step of steps) {
			await ctx.db.delete(step._id);
		}
		await ctx.db.delete(args.workflowId);
	}
});

// =====================================================
// WORKFLOW STEPS
// =====================================================

export const addWorkflowStep = mutation({
	args: {
		workflowId: v.id('agent_workflows'),
		agentType: v.string(),
		stepOrder: v.number(),
		config: v.optional(v.any())
	},
	returns: v.id('workflow_steps'),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		return await ctx.db.insert('workflow_steps', {
			workflowId: args.workflowId,
			agentType: args.agentType,
			stepOrder: args.stepOrder,
			config: args.config,
			createdAt: Date.now()
		});
	}
});

export const deleteWorkflowStep = mutation({
	args: {
		stepId: v.id('workflow_steps')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		await ctx.db.delete(args.stepId);
	}
});

// =====================================================
// SOURCE VERSIONS
// =====================================================

export const createSourceVersion = mutation({
	args: {
		sourceId: v.id('information_sources'),
		versionNumber: v.number(),
		contentHash: v.string(),
		r2Key: v.string(),
		changeDescription: v.optional(v.string())
	},
	returns: v.id('source_versions'),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		return await ctx.db.insert('source_versions', {
			sourceId: args.sourceId,
			versionNumber: args.versionNumber,
			contentHash: args.contentHash,
			r2Key: args.r2Key,
			changeDescription: args.changeDescription,
			createdAt: Date.now()
		});
	}
});

export const listSourceVersions = query({
	args: {
		sourceId: v.id('information_sources')
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		return await ctx.db
			.query('source_versions')
			.withIndex('by_sourceId', (q: any) => q.eq('sourceId', args.sourceId))
			.order('desc')
			.collect();
	}
});

// =====================================================
// SOURCE ITEM EMBEDDINGS
// =====================================================

export const createSourceItemEmbedding = mutation({
	args: {
		sourceItemId: v.id('source_items'),
		model: v.string(),
		embedding: v.array(v.number())
	},
	returns: v.id('source_item_embeddings'),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		return await ctx.db.insert('source_item_embeddings', {
			sourceItemId: args.sourceItemId,
			model: args.model,
			embedding: args.embedding,
			createdAt: Date.now()
		});
	}
});

export const getSourceItemEmbeddings = query({
	args: {
		sourceItemId: v.id('source_items')
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		return await ctx.db
			.query('source_item_embeddings')
			.withIndex('by_sourceItemId', (q: any) => q.eq('sourceItemId', args.sourceItemId))
			.collect();
	}
});

// =====================================================
// SOURCE QUALITY ASSESSMENTS
// =====================================================

export const createSourceQualityAssessment = mutation({
	args: {
		sourceId: v.id('information_sources'),
		assessorType: v.union(v.literal('llm'), v.literal('human'), v.literal('community')),
		assessorId: v.optional(v.string()),
		factualReliability: v.number(),
		biasScore: v.number(),
		expertiseScore: v.number(),
		rationale: v.optional(v.string())
	},
	returns: v.id('source_quality_assessments'),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		return await ctx.db.insert('source_quality_assessments', {
			sourceId: args.sourceId,
			assessorType: args.assessorType,
			assessorId: args.assessorId,
			factualReliability: args.factualReliability,
			biasScore: args.biasScore,
			expertiseScore: args.expertiseScore,
			rationale: args.rationale,
			createdAt: Date.now()
		});
	}
});

export const getSourceQualityAssessments = query({
	args: {
		sourceId: v.id('information_sources')
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		return await ctx.db
			.query('source_quality_assessments')
			.withIndex('by_sourceId', (q: any) => q.eq('sourceId', args.sourceId))
			.collect();
	}
});

// =====================================================
// KNOWLEDGE CELL ASSESSMENTS
// =====================================================

export const createCellAssessment = mutation({
	args: {
		cellId: v.id('knowledge_cells'),
		assessmentType: v.union(v.literal('llm'), v.literal('human'), v.literal('community')),
		userId: v.optional(v.string()),
		confidence: v.number(),
		importance: v.number(),
		difficulty: v.number(),
		rationale: v.optional(v.string())
	},
	returns: v.id('knowledge_cell_assessments'),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		return await ctx.db.insert('knowledge_cell_assessments', {
			cellId: args.cellId,
			assessmentType: args.assessmentType,
			userId: args.userId,
			confidence: args.confidence,
			importance: args.importance,
			difficulty: args.difficulty,
			rationale: args.rationale,
			createdAt: Date.now()
		});
	}
});

export const getCellAssessments = query({
	args: {
		cellId: v.id('knowledge_cells')
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		return await ctx.db
			.query('knowledge_cell_assessments')
			.withIndex('by_cellId', (q: any) => q.eq('cellId', args.cellId))
			.collect();
	}
});

// =====================================================
// KNOWLEDGE CANDIDATE VERSIONS
// =====================================================

export const createCandidateVersion = mutation({
	args: {
		candidateId: v.id('knowledge_extracted_candidates'),
		content: v.string(),
		model: v.string(),
		promptVersion: v.string(),
		extractionJobId: v.id('knowledge_extraction_jobs')
	},
	returns: v.id('knowledge_candidate_versions'),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		return await ctx.db.insert('knowledge_candidate_versions', {
			candidateId: args.candidateId,
			content: args.content,
			model: args.model,
			promptVersion: args.promptVersion,
			extractionJobId: args.extractionJobId,
			createdAt: Date.now()
		});
	}
});

export const getCandidateVersions = query({
	args: {
		candidateId: v.id('knowledge_extracted_candidates')
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		return await ctx.db
			.query('knowledge_candidate_versions')
			.withIndex('by_candidateId', (q: any) => q.eq('candidateId', args.candidateId))
			.order('desc')
			.collect();
	}
});

// =====================================================
// KNOWLEDGE CANDIDATE VOTES
// =====================================================

export const createCandidateVote = mutation({
	args: {
		candidateId: v.id('knowledge_extracted_candidates'),
		model: v.string(),
		agrees: v.boolean(),
		confidence: v.number(),
		rationale: v.optional(v.string())
	},
	returns: v.id('knowledge_candidate_votes'),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		return await ctx.db.insert('knowledge_candidate_votes', {
			candidateId: args.candidateId,
			model: args.model,
			agrees: args.agrees,
			confidence: args.confidence,
			rationale: args.rationale,
			createdAt: Date.now()
		});
	}
});

export const getCandidateVotes = query({
	args: {
		candidateId: v.id('knowledge_extracted_candidates')
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		return await ctx.db
			.query('knowledge_candidate_votes')
			.withIndex('by_candidateId', (q: any) => q.eq('candidateId', args.candidateId))
			.collect();
	}
});

// =====================================================
// PATH STEPS
// =====================================================

export const addPathStep = mutation({
	args: {
		pathId: v.id('knowledge_paths'),
		cellId: v.id('knowledge_cells'),
		stepOrder: v.number(),
		isOptional: v.boolean()
	},
	returns: v.id('path_steps'),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		return await ctx.db.insert('path_steps', {
			pathId: args.pathId,
			cellId: args.cellId,
			stepOrder: args.stepOrder,
			isOptional: args.isOptional,
			createdAt: Date.now()
		});
	}
});

export const getPathSteps = query({
	args: {
		pathId: v.id('knowledge_paths')
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		return await ctx.db
			.query('path_steps')
			.withIndex('by_pathId_and_stepOrder', (q: any) => q.eq('pathId', args.pathId))
			.order('asc')
			.collect();
	}
});

export const deletePathStep = mutation({
	args: {
		stepId: v.id('path_steps')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		await ctx.db.delete(args.stepId);
	}
});

// =====================================================
// LEARNING GOAL TOPICS
// =====================================================

export const addGoalTopic = mutation({
	args: {
		goalId: v.id('learning_goals'),
		topicId: v.id('knowledge_cell_topics'),
		priority: v.number()
	},
	returns: v.id('learning_goal_topics'),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		return await ctx.db.insert('learning_goal_topics', {
			goalId: args.goalId,
			topicId: args.topicId,
			priority: args.priority,
			createdAt: Date.now()
		});
	}
});

export const getGoalTopics = query({
	args: {
		goalId: v.id('learning_goals')
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		return await ctx.db
			.query('learning_goal_topics')
			.withIndex('by_goalId', (q: any) => q.eq('goalId', args.goalId))
			.collect();
	}
});

// =====================================================
// LEARNING GOAL CELLS
// =====================================================

export const addGoalCell = mutation({
	args: {
		goalId: v.id('learning_goals'),
		cellId: v.id('knowledge_cells'),
		status: v.union(v.literal('pending'), v.literal('learning'), v.literal('mastered'))
	},
	returns: v.id('learning_goal_cells'),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		const now = Date.now();
		return await ctx.db.insert('learning_goal_cells', {
			goalId: args.goalId,
			cellId: args.cellId,
			status: args.status,
			createdAt: now,
			updatedAt: now
		});
	}
});

export const updateGoalCellStatus = mutation({
	args: {
		goalCellId: v.id('learning_goal_cells'),
		status: v.union(v.literal('pending'), v.literal('learning'), v.literal('mastered'))
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		await ctx.db.patch(args.goalCellId, {
			status: args.status,
			updatedAt: Date.now()
		});
	}
});

export const getGoalCells = query({
	args: {
		goalId: v.id('learning_goals')
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		return await ctx.db
			.query('learning_goal_cells')
			.withIndex('by_goalId', (q: any) => q.eq('goalId', args.goalId))
			.collect();
	}
});

// =====================================================
// LEARNING GOALS - ENHANCED
// =====================================================

export const updateLearningGoal = mutation({
	args: {
		goalId: v.id('learning_goals'),
		title: v.optional(v.string()),
		description: v.optional(v.string()),
		targetDate: v.optional(v.number()),
		status: v.optional(v.union(v.literal('active'), v.literal('completed'), v.literal('paused')))
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		const updates: any = { updatedAt: Date.now() };
		if (args.title !== undefined) updates.title = args.title;
		if (args.description !== undefined) updates.description = args.description;
		if (args.targetDate !== undefined) updates.targetDate = args.targetDate;
		if (args.status !== undefined) updates.status = args.status;
		await ctx.db.patch(args.goalId, updates);
	}
});

export const deleteLearningGoal = mutation({
	args: {
		goalId: v.id('learning_goals')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		const goalTopics = await ctx.db
			.query('learning_goal_topics')
			.withIndex('by_goalId', (q: any) => q.eq('goalId', args.goalId))
			.collect();
		for (const gt of goalTopics) {
			await ctx.db.delete(gt._id);
		}
		const goalCells = await ctx.db
			.query('learning_goal_cells')
			.withIndex('by_goalId', (q: any) => q.eq('goalId', args.goalId))
			.collect();
		for (const gc of goalCells) {
			await ctx.db.delete(gc._id);
		}
		await ctx.db.delete(args.goalId);
	}
});

// =====================================================
// KNOWLEDGE PATHS - ENHANCED
// =====================================================

export const updatePath = mutation({
	args: {
		pathId: v.id('knowledge_paths'),
		title: v.optional(v.string()),
		description: v.optional(v.string()),
		status: v.optional(v.union(v.literal('draft'), v.literal('active'), v.literal('completed')))
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		const updates: any = { updatedAt: Date.now() };
		if (args.title !== undefined) updates.title = args.title;
		if (args.description !== undefined) updates.description = args.description;
		if (args.status !== undefined) updates.status = args.status;
		await ctx.db.patch(args.pathId, updates);
	}
});

export const deletePath = mutation({
	args: {
		pathId: v.id('knowledge_paths')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		const steps = await ctx.db
			.query('path_steps')
			.withIndex('by_pathId', (q: any) => q.eq('pathId', args.pathId))
			.collect();
		for (const step of steps) {
			await ctx.db.delete(step._id);
		}
		await ctx.db.delete(args.pathId);
	}
});

// =====================================================
// CONFLICT CASES - ENHANCED
// =====================================================

export const createConflictCase = mutation({
	args: {
		cellIdA: v.id('knowledge_cells'),
		cellIdB: v.id('knowledge_cells'),
		conflictType: v.union(
			v.literal('contradiction'),
			v.literal('inconsistency'),
			v.literal('ambiguity')
		),
		resolutionReason: v.optional(v.string())
	},
	returns: v.id('conflict_cases'),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		return await ctx.db.insert('conflict_cases', {
			cellAId: args.cellIdA,
			cellBId: args.cellIdB,
			conflictType: args.conflictType,
			resolutionReason: args.resolutionReason,
			status: 'open',
			createdAt: Date.now()
		});
	}
});

export const resolveConflict = mutation({
	args: {
		conflictId: v.id('conflict_cases'),
		status: v.union(v.literal('investigating'), v.literal('resolved'), v.literal('dismissed')),
		resolution: v.optional(
			v.union(
				v.literal('favor_a'),
				v.literal('favor_b'),
				v.literal('both_valid'),
				v.literal('both_invalid'),
				v.literal('merged')
			)
		),
		resolutionReason: v.optional(v.string())
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		const updates: any = { status: args.status };
		if (args.resolution !== undefined) updates.resolution = args.resolution;
		if (args.resolutionReason !== undefined) updates.resolutionReason = args.resolutionReason;
		if (args.status === 'resolved' || args.status === 'dismissed') {
			updates.resolvedAt = Date.now();
		}
		await ctx.db.patch(args.conflictId, updates);
	}
});

// =====================================================
// KNOWLEDGE RECOMMENDATIONS - ENHANCED
// =====================================================

export const createRecommendation = mutation({
	args: {
		recommendedCellId: v.id('knowledge_cells'),
		reason: v.union(
			v.literal('gap'),
			v.literal('prerequisite'),
			v.literal('related'),
			v.literal('review'),
			v.literal('goal'),
			v.literal('path')
		),
		explanation: v.string(),
		priority: v.number()
	},
	returns: v.id('knowledge_recommendations'),
	handler: async (ctx, args) => {
		const authUser = await getAuthUser(ctx);
		return await ctx.db.insert('knowledge_recommendations', {
			userId: authUser._id,
			recommendedCellId: args.recommendedCellId,
			reason: args.reason,
			explanation: args.explanation,
			priority: args.priority,
			status: 'pending',
			createdAt: Date.now()
		});
	}
});

export const dismissRecommendation = mutation({
	args: {
		recommendationId: v.id('knowledge_recommendations')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		await ctx.db.patch(args.recommendationId, {
			status: 'completed'
		});
	}
});

export const acceptRecommendation = mutation({
	args: {
		recommendationId: v.id('knowledge_recommendations')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		await ctx.db.patch(args.recommendationId, {
			status: 'completed'
		});
	}
});

// =====================================================
// KNOWLEDGE NOTES - ENHANCED
// =====================================================

export const deleteNote = mutation({
	args: {
		noteId: v.id('knowledge_notes')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		const contributions = await ctx.db
			.query('knowledge_note_contributions')
			.withIndex('by_noteId', (q: any) => q.eq('noteId', args.noteId))
			.collect();
		for (const c of contributions) {
			await ctx.db.delete(c._id);
		}
		await ctx.db.delete(args.noteId);
	}
});

// =====================================================
// KNOWLEDGE CELLS - ENHANCED
// =====================================================

export const updateKnowledgeCell = mutation({
	args: {
		cellId: v.id('knowledge_cells'),
		title: v.optional(v.string()),
		summary: v.optional(v.string()),
		cellType: v.optional(
			v.union(
				v.literal('CONCEPT'),
				v.literal('FACT'),
				v.literal('PRINCIPLE'),
				v.literal('PROCEDURE'),
				v.literal('HEURISTIC'),
				v.literal('QUESTION')
			)
		),
		importance: v.optional(v.number()),
		difficulty: v.optional(v.number())
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		const updates: any = { updatedAt: Date.now() };
		if (args.title !== undefined) updates.title = args.title;
		if (args.summary !== undefined) updates.summary = args.summary;
		if (args.cellType !== undefined) updates.cellType = args.cellType;
		if (args.importance !== undefined) updates.importance = args.importance;
		if (args.difficulty !== undefined) updates.difficulty = args.difficulty;
		await ctx.db.patch(args.cellId, updates);
	}
});

export const deleteKnowledgeCell = mutation({
	args: {
		cellId: v.id('knowledge_cells')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		const citations = await ctx.db
			.query('knowledge_cell_citations')
			.withIndex('by_cellId', (q: any) => q.eq('cellId', args.cellId))
			.collect();
		for (const c of citations) {
			await ctx.db.delete(c._id);
		}
		const sourceRels = await ctx.db
			.query('knowledge_cell_relationships')
			.withIndex('by_sourceCellId', (q: any) => q.eq('sourceCellId', args.cellId))
			.collect();
		for (const r of sourceRels) {
			await ctx.db.delete(r._id);
		}
		const targetRels = await ctx.db
			.query('knowledge_cell_relationships')
			.withIndex('by_targetCellId', (q: any) => q.eq('targetCellId', args.cellId))
			.collect();
		for (const r of targetRels) {
			await ctx.db.delete(r._id);
		}
		await ctx.db.delete(args.cellId);
	}
});

export const listCellsByTopic = query({
	args: {
		topicId: v.id('knowledge_cell_topics')
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		return await ctx.db
			.query('knowledge_cells')
			.withIndex('by_topicId', (q: any) => q.eq('topicId', args.topicId))
			.collect();
	}
});

// =====================================================
// TOPICS - ENHANCED
// =====================================================

export const getTopicCells = query({
	args: {
		topicId: v.id('knowledge_cell_topics')
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		return await ctx.db
			.query('knowledge_cells')
			.withIndex('by_topicId', (q: any) => q.eq('topicId', args.topicId))
			.collect();
	}
});

// =====================================================
// INFORMATION SOURCES - ENHANCED
// =====================================================

export const updateInformationSource = mutation({
	args: {
		sourceId: v.id('information_sources'),
		title: v.optional(v.string()),
		contentType: v.optional(v.string()),
		importance: v.optional(v.number()),
		status: v.optional(
			v.union(v.literal('active'), v.literal('archived'), v.literal('needs_review'))
		)
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		const updates: any = { updatedAt: Date.now() };
		if (args.title !== undefined) updates.title = args.title;
		if (args.contentType !== undefined) updates.contentType = args.contentType;
		if (args.importance !== undefined) updates.importance = args.importance;
		if (args.status !== undefined) updates.status = args.status;
		await ctx.db.patch(args.sourceId, updates);
	}
});

export const listInformationSources = query({
	args: {},
	returns: v.array(v.any()),
	handler: async (ctx) => {
		const authUser = await getAuthUser(ctx);
		return await ctx.db
			.query('information_sources')
			.withIndex('by_userId', (q: any) => q.eq('userId', authUser._id))
			.order('desc')
			.take(50);
	}
});

export const deleteInformationSource = mutation({
	args: {
		sourceId: v.id('information_sources')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		const sourceItems = await ctx.db
			.query('source_items')
			.withIndex('by_sourceId_and_publishedAt', (q: any) => q.eq('sourceId', args.sourceId))
			.collect();
		for (const item of sourceItems) {
			const embeddings = await ctx.db
				.query('source_item_embeddings')
				.withIndex('by_sourceItemId', (q: any) => q.eq('sourceItemId', item._id))
				.collect();
			for (const emb of embeddings) {
				await ctx.db.delete(emb._id);
			}
			await ctx.db.delete(item._id);
		}
		const versions = await ctx.db
			.query('source_versions')
			.withIndex('by_sourceId', (q: any) => q.eq('sourceId', args.sourceId))
			.collect();
		for (const v of versions) {
			await ctx.db.delete(v._id);
		}
		const assessments = await ctx.db
			.query('source_quality_assessments')
			.withIndex('by_sourceId', (q: any) => q.eq('sourceId', args.sourceId))
			.collect();
		for (const a of assessments) {
			await ctx.db.delete(a._id);
		}
		await ctx.db.delete(args.sourceId);
	}
});

// =====================================================
// CANDIDATE RELATIONSHIPS
// =====================================================

export const createCandidateRelationship = mutation({
	args: {
		sourceCandidateId: v.id('knowledge_extracted_candidates'),
		targetCandidateId: v.id('knowledge_extracted_candidates'),
		relationshipType: v.union(
			v.literal('prerequisite_for'),
			v.literal('contradicts'),
			v.literal('supports'),
			v.literal('related_to'),
			v.literal('part_of'),
			v.literal('example_of')
		),
		confidence: v.number()
	},
	returns: v.id('knowledge_candidate_relationships'),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		return await ctx.db.insert('knowledge_candidate_relationships', {
			sourceCandidateId: args.sourceCandidateId,
			targetCandidateId: args.targetCandidateId,
			relationshipType: args.relationshipType,
			confidence: args.confidence,
			createdAt: Date.now()
		});
	}
});

export const getCandidateRelationships = query({
	args: {
		candidateId: v.id('knowledge_extracted_candidates')
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		const outgoing = await ctx.db
			.query('knowledge_candidate_relationships')
			.withIndex('by_sourceCandidateId', (q: any) => q.eq('sourceCandidateId', args.candidateId))
			.collect();
		const incoming = await ctx.db
			.query('knowledge_candidate_relationships')
			.withIndex('by_targetCandidateId', (q: any) => q.eq('targetCandidateId', args.candidateId))
			.collect();
		return [...outgoing, ...incoming];
	}
});

// =====================================================
// CELL VERSIONS
// =====================================================

export const createCellVersion = mutation({
	args: {
		cellId: v.id('knowledge_cells'),
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
		metadata: v.optional(v.any()),
		changedBy: v.optional(v.string()),
		changeReason: v.optional(v.string())
	},
	returns: v.id('knowledge_cell_versions'),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		const now = Date.now();
		const prev = await ctx.db
			.query('knowledge_cell_versions')
			.withIndex('by_cellId', (q: any) => q.eq('cellId', args.cellId))
			.order('desc')
			.first();
		if (prev && !prev.validUntil) {
			await ctx.db.patch(prev._id, { validUntil: now });
		}
		return await ctx.db.insert('knowledge_cell_versions', {
			cellId: args.cellId,
			title: args.title,
			summary: args.summary,
			content: args.content,
			cellType: args.cellType,
			metadata: args.metadata,
			validFrom: now,
			validUntil: undefined,
			changedBy: args.changedBy,
			changeReason: args.changeReason,
			createdAt: now
		});
	}
});

export const getCellVersions = query({
	args: {
		cellId: v.id('knowledge_cells')
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		return await ctx.db
			.query('knowledge_cell_versions')
			.withIndex('by_cellId_and_validFrom', (q: any) => q.eq('cellId', args.cellId))
			.order('desc')
			.collect();
	}
});

// =====================================================
// CELL ORIGINS
// =====================================================

export const createCellOrigin = mutation({
	args: {
		cellId: v.id('knowledge_cells'),
		candidateId: v.id('knowledge_extracted_candidates'),
		extractionRunId: v.id('knowledge_extraction_jobs'),
		contributionWeight: v.number()
	},
	returns: v.id('knowledge_cell_origins'),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		return await ctx.db.insert('knowledge_cell_origins', {
			cellId: args.cellId,
			candidateId: args.candidateId,
			extractionRunId: args.extractionRunId,
			contributionWeight: args.contributionWeight,
			createdAt: Date.now()
		});
	}
});

export const getCellOrigins = query({
	args: {
		cellId: v.id('knowledge_cells')
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		return await ctx.db
			.query('knowledge_cell_origins')
			.withIndex('by_cellId', (q: any) => q.eq('cellId', args.cellId))
			.collect();
	}
});

// =====================================================
// CELL METRICS
// =====================================================

export const upsertCellMetrics = mutation({
	args: {
		cellId: v.id('knowledge_cells'),
		certainty: v.number(),
		evidenceStrength: v.number(),
		scientificConsensus: v.number(),
		controversyLevel: v.number(),
		recency: v.number()
	},
	returns: v.id('knowledge_cell_metrics'),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		const now = Date.now();
		const existing = await ctx.db
			.query('knowledge_cell_metrics')
			.withIndex('by_cellId', (q: any) => q.eq('cellId', args.cellId))
			.first();
		if (existing) {
			await ctx.db.patch(existing._id, {
				certainty: args.certainty,
				evidenceStrength: args.evidenceStrength,
				scientificConsensus: args.scientificConsensus,
				controversyLevel: args.controversyLevel,
				recency: args.recency,
				updatedAt: now
			});
			return existing._id;
		}
		return await ctx.db.insert('knowledge_cell_metrics', {
			cellId: args.cellId,
			certainty: args.certainty,
			evidenceStrength: args.evidenceStrength,
			scientificConsensus: args.scientificConsensus,
			controversyLevel: args.controversyLevel,
			recency: args.recency,
			createdAt: now,
			updatedAt: now
		});
	}
});

export const getCellMetrics = query({
	args: {
		cellId: v.id('knowledge_cells')
	},
	returns: v.union(v.null(), v.any()),
	handler: async (ctx, args) => {
		return await ctx.db
			.query('knowledge_cell_metrics')
			.withIndex('by_cellId', (q: any) => q.eq('cellId', args.cellId))
			.first();
	}
});

// =====================================================
// CELL ENTITY LINKS
// =====================================================

export const createCellEntityLink = mutation({
	args: {
		cellId: v.id('knowledge_cells'),
		entityId: v.id('knowledge_entities'),
		relevance: v.number()
	},
	returns: v.id('knowledge_cell_entity_links'),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		return await ctx.db.insert('knowledge_cell_entity_links', {
			cellId: args.cellId,
			entityId: args.entityId,
			relevance: args.relevance,
			createdAt: Date.now()
		});
	}
});

export const getCellEntityLinks = query({
	args: {
		cellId: v.id('knowledge_cells')
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		return await ctx.db
			.query('knowledge_cell_entity_links')
			.withIndex('by_cellId', (q: any) => q.eq('cellId', args.cellId))
			.collect();
	}
});

export const getEntityCellLinks = query({
	args: {
		entityId: v.id('knowledge_entities')
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		return await ctx.db
			.query('knowledge_cell_entity_links')
			.withIndex('by_entityId', (q: any) => q.eq('entityId', args.entityId))
			.collect();
	}
});

export const deleteCellEntityLink = mutation({
	args: {
		linkId: v.id('knowledge_cell_entity_links')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		await ctx.db.delete(args.linkId);
	}
});

// =====================================================
// CELL PERSPECTIVE EMBEDDINGS
// =====================================================

export const createPerspectiveEmbedding = mutation({
	args: {
		cellId: v.id('knowledge_cells'),
		perspective: v.union(
			v.literal('general'),
			v.literal('student'),
			v.literal('researcher'),
			v.literal('domain_specific')
		),
		domainId: v.optional(v.id('knowledge_domains')),
		model: v.string(),
		embedding: v.array(v.number())
	},
	returns: v.id('knowledge_cell_perspective_embeddings'),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		return await ctx.db.insert('knowledge_cell_perspective_embeddings', {
			cellId: args.cellId,
			perspective: args.perspective,
			domainId: args.domainId,
			model: args.model,
			embedding: args.embedding,
			createdAt: Date.now()
		});
	}
});

export const getPerspectiveEmbeddings = query({
	args: {
		cellId: v.id('knowledge_cells')
	},
	returns: v.array(v.any()),
	handler: async (ctx, args) => {
		return await ctx.db
			.query('knowledge_cell_perspective_embeddings')
			.withIndex('by_cellId', (q: any) => q.eq('cellId', args.cellId))
			.collect();
	}
});

// =====================================================
// CELL CONFIDENCE
// =====================================================

export const upsertCellConfidence = mutation({
	args: {
		cellId: v.id('knowledge_cells'),
		confidence: v.number(),
		confidenceInterval: v.array(v.number()),
		evidenceCount: v.number(),
		sampleSize: v.optional(v.number())
	},
	returns: v.id('knowledge_cell_confidence'),
	handler: async (ctx, args) => {
		await getAuthUser(ctx);
		const now = Date.now();
		const existing = await ctx.db
			.query('knowledge_cell_confidence')
			.withIndex('by_cellId', (q: any) => q.eq('cellId', args.cellId))
			.first();
		if (existing) {
			await ctx.db.patch(existing._id, {
				confidence: args.confidence,
				confidenceInterval: args.confidenceInterval,
				evidenceCount: args.evidenceCount,
				sampleSize: args.sampleSize,
				computedAt: now
			});
			return existing._id;
		}
		return await ctx.db.insert('knowledge_cell_confidence', {
			cellId: args.cellId,
			confidence: args.confidence,
			confidenceInterval: args.confidenceInterval,
			evidenceCount: args.evidenceCount,
			sampleSize: args.sampleSize,
			computedAt: now
		});
	}
});

export const getCellConfidence = query({
	args: {
		cellId: v.id('knowledge_cells')
	},
	returns: v.union(v.null(), v.any()),
	handler: async (ctx, args) => {
		return await ctx.db
			.query('knowledge_cell_confidence')
			.withIndex('by_cellId', (q: any) => q.eq('cellId', args.cellId))
			.first();
	}
});
