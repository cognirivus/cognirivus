import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

const schema = defineSchema({
	users_profile: defineTable({
		authId: v.string(),
		email: v.string(),
		name: v.string(),
		nameLower: v.string(),
		image: v.optional(v.union(v.null(), v.string())),
		username: v.optional(v.string()),
		usernameLower: v.optional(v.string()),
		usernameSetAt: v.optional(v.number()),
		bio: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_authId', ['authId'])
		.index('by_username', ['username'])
		.index('by_usernameLower', ['usernameLower'])
		.index('by_nameLower', ['nameLower']),
	communities: defineTable({
		slug: v.string(),
		name: v.string(),
		description: v.optional(v.string()),
		visibility: v.union(v.literal('public'), v.literal('private')),
		ownerAuthId: v.string(),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_slug', ['slug'])
		.index('by_ownerAuthId_and_createdAt', ['ownerAuthId', 'createdAt'])
		.index('by_visibility_and_createdAt', ['visibility', 'createdAt']),
	community_memberships: defineTable({
		communityId: v.id('communities'),
		userAuthId: v.string(),
		role: v.union(v.literal('owner'), v.literal('admin'), v.literal('member')),
		status: v.union(v.literal('active'), v.literal('pending'), v.literal('rejected')),
		requestedAt: v.number(),
		respondedAt: v.optional(v.number()),
		createdAt: v.number()
	})
		.index('by_communityId_and_userAuthId', ['communityId', 'userAuthId'])
		.index('by_communityId_and_status', ['communityId', 'status'])
		.index('by_userAuthId_and_status', ['userAuthId', 'status']),
	posts: defineTable({
		authorAuthId: v.string(),
		communityId: v.optional(v.id('communities')),
		scopeType: v.union(v.literal('global'), v.literal('community')),
		visibility: v.optional(v.union(v.literal('public'), v.literal('private'))),
		visibilityScope: v.union(
			v.literal('public_global'),
			v.literal('public_community'),
			v.literal('private')
		),
		type: v.union(v.literal('text'), v.literal('link'), v.literal('media')),
		title: v.string(),
		body: v.optional(v.string()),
		snippet: v.string(),
		r2Key: v.optional(v.string()),
		url: v.optional(v.string()),
		score: v.number(),
		likes: v.number(),
		dislikes: v.number(),
		commentCount: v.number(),
		tags: v.optional(v.array(v.string())),
		sourceType: v.optional(v.string()),
		sourceId: v.optional(v.id('sources')),
		sourceItemId: v.optional(v.id('source_items')),
		sourceTypeSnapshot: v.optional(v.string()),
		sourceTitleSnapshot: v.optional(v.string()),
		sourceUrlSnapshot: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_createdAt', ['createdAt'])
		.index('by_scopeType_and_createdAt', ['scopeType', 'createdAt'])
		.index('by_visibilityScope_and_createdAt', ['visibilityScope', 'createdAt'])
		.index('by_visibilityScope_and_score_and_createdAt', ['visibilityScope', 'score', 'createdAt'])
		.index('by_visibilityScope_and_commentCount_and_createdAt', [
			'visibilityScope',
			'commentCount',
			'createdAt'
		])
		.index('by_communityId_and_createdAt', ['communityId', 'createdAt'])
		.index('by_communityId_and_visibility_and_createdAt', [
			'communityId',
			'visibility',
			'createdAt'
		])
		.index('by_communityId_and_visibility_and_score_and_createdAt', [
			'communityId',
			'visibility',
			'score',
			'createdAt'
		])
		.index('by_communityId_and_visibility_and_commentCount_and_createdAt', [
			'communityId',
			'visibility',
			'commentCount',
			'createdAt'
		])
		.index('by_authorAuthId_and_createdAt', ['authorAuthId', 'createdAt'])
		.index('by_authorAuthId_and_visibility_and_createdAt', [
			'authorAuthId',
			'visibility',
			'createdAt'
		])
		.index('by_authorAuthId_and_visibility_and_score_and_createdAt', [
			'authorAuthId',
			'visibility',
			'score',
			'createdAt'
		])
		.index('by_authorAuthId_and_visibility_and_commentCount_and_createdAt', [
			'authorAuthId',
			'visibility',
			'commentCount',
			'createdAt'
		])
		.index('by_authorAuthId_and_sourceId_and_createdAt', ['authorAuthId', 'sourceId', 'createdAt'])
		.index('by_authorAuthId_and_sourceItemId_and_createdAt', [
			'authorAuthId',
			'sourceItemId',
			'createdAt'
		])
		.index('by_sourceId_and_createdAt', ['sourceId', 'createdAt'])
		.index('by_sourceItemId_and_createdAt', ['sourceItemId', 'createdAt'])
		.index('by_r2Key_and_createdAt', ['r2Key', 'createdAt']),
	sources: defineTable({
		type: v.union(v.literal('website'), v.literal('rss'), v.literal('youtube')),
		normalizedKey: v.string(),
		canonicalUrl: v.string(),
		rssFeedUrl: v.optional(v.string()),
		rssFeedNormalizedKey: v.optional(v.string()),
		title: v.string(),
		description: v.optional(v.string()),
		status: v.union(
			v.literal('active'),
			v.literal('paused'),
			v.literal('error'),
			v.literal('deleting')
		),
		lastFetchedAt: v.optional(v.number()),
		lastSuccessAt: v.optional(v.number()),
		lastError: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_normalizedKey', ['normalizedKey'])
		.index('by_rssFeedNormalizedKey', ['rssFeedNormalizedKey'])
		.index('by_type_and_updatedAt', ['type', 'updatedAt'])
		.index('by_status_and_updatedAt', ['status', 'updatedAt']),
	source_rss_feeds: defineTable({
		sourceId: v.id('sources'),
		feedUrl: v.string(),
		feedNormalizedKey: v.string(),
		title: v.optional(v.string()),
		status: v.union(v.literal('active'), v.literal('paused'), v.literal('error')),
		lastFetchedAt: v.optional(v.number()),
		lastSuccessAt: v.optional(v.number()),
		lastError: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_sourceId_and_updatedAt', ['sourceId', 'updatedAt'])
		.index('by_sourceId_and_feedNormalizedKey', ['sourceId', 'feedNormalizedKey'])
		.index('by_feedNormalizedKey', ['feedNormalizedKey'])
		.index('by_status_and_updatedAt', ['status', 'updatedAt']),
	source_collections: defineTable({
		slug: v.string(),
		title: v.string(),
		description: v.optional(v.string()),
		visibility: v.union(v.literal('public'), v.literal('private')),
		ownerKind: v.union(v.literal('user'), v.literal('community')),
		ownerAuthId: v.optional(v.string()),
		ownerCommunityId: v.optional(v.id('communities')),
		tags: v.optional(v.array(v.string())),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_slug', ['slug'])
		.index('by_visibility_and_updatedAt', ['visibility', 'updatedAt'])
		.index('by_ownerKind_and_ownerAuthId_and_updatedAt', ['ownerKind', 'ownerAuthId', 'updatedAt'])
		.index('by_ownerKind_and_ownerCommunityId_and_updatedAt', [
			'ownerKind',
			'ownerCommunityId',
			'updatedAt'
		]),
	source_collection_items: defineTable({
		collectionId: v.id('source_collections'),
		sourceId: v.id('sources'),
		sourceItemId: v.optional(v.id('source_items')),
		note: v.optional(v.string()),
		position: v.number(),
		addedByAuthId: v.string(),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_collectionId_and_position', ['collectionId', 'position'])
		.index('by_collectionId_and_sourceId', ['collectionId', 'sourceId'])
		.index('by_collectionId_and_sourceItemId', ['collectionId', 'sourceItemId'])
		.index('by_sourceId_and_createdAt', ['sourceId', 'createdAt'])
		.index('by_sourceItemId_and_createdAt', ['sourceItemId', 'createdAt']),
	source_collection_follows: defineTable({
		userAuthId: v.string(),
		collectionId: v.id('source_collections'),
		createdAt: v.number()
	})
		.index('by_userAuthId_and_collectionId', ['userAuthId', 'collectionId'])
		.index('by_userAuthId_and_createdAt', ['userAuthId', 'createdAt'])
		.index('by_collectionId_and_createdAt', ['collectionId', 'createdAt']),
	source_collection_suggestions: defineTable({
		collectionId: v.id('source_collections'),
		sourceId: v.id('sources'),
		sourceItemId: v.optional(v.id('source_items')),
		suggestedByAuthId: v.string(),
		note: v.optional(v.string()),
		status: v.union(v.literal('pending'), v.literal('approved'), v.literal('rejected')),
		createdAt: v.number(),
		updatedAt: v.number(),
		reviewedAt: v.optional(v.number()),
		reviewedByAuthId: v.optional(v.string())
	})
		.index('by_collectionId_and_status', ['collectionId', 'status'])
		.index('by_collectionId_and_sourceId_and_status', ['collectionId', 'sourceId', 'status'])
		.index('by_collectionId_and_sourceItemId_and_status', [
			'collectionId',
			'sourceItemId',
			'status'
		])
		.index('by_sourceId_and_updatedAt', ['sourceId', 'updatedAt'])
		.index('by_sourceItemId_and_updatedAt', ['sourceItemId', 'updatedAt'])
		.index('by_suggestedByAuthId_and_createdAt', ['suggestedByAuthId', 'createdAt']),
	source_subscriptions: defineTable({
		userAuthId: v.string(),
		sourceId: v.id('sources'),
		status: v.union(v.literal('active'), v.literal('paused')),
		addedVia: v.optional(v.literal('manual')),
		includeInSimilarLinks: v.optional(v.boolean()),
		createdAt: v.number(),
		updatedAt: v.number(),
		unsubscribedAt: v.optional(v.number())
	})
		.index('by_userAuthId_and_sourceId', ['userAuthId', 'sourceId'])
		.index('by_userAuthId_and_updatedAt', ['userAuthId', 'updatedAt'])
		.index('by_sourceId_and_updatedAt', ['sourceId', 'updatedAt'])
		.index('by_sourceId_and_status', ['sourceId', 'status']),
	source_items: defineTable({
		sourceId: v.id('sources'),
		rssFeedId: v.optional(v.id('source_rss_feeds')),
		externalId: v.optional(v.string()),
		url: v.string(),
		urlHash: v.string(),
		title: v.string(),
		snippet: v.string(),
		body: v.optional(v.string()),
		r2Key: v.optional(v.string()),
		publishedAt: v.number(),
		createdAt: v.number(),
		updatedAt: v.number(),
		contentHash: v.optional(v.string()),
		contentType: v.optional(v.string()),
		originHost: v.optional(v.string()),
		originSiteUrl: v.optional(v.string()),
		suggestedSourceType: v.optional(v.string()),
		suggestedSourceNormalizedKey: v.optional(v.string()),
		suggestedSourceCanonicalUrl: v.optional(v.string())
	})
		.index('by_sourceId_and_publishedAt', ['sourceId', 'publishedAt'])
		.index('by_sourceId_and_externalId', ['sourceId', 'externalId'])
		.index('by_sourceId_and_urlHash', ['sourceId', 'urlHash'])
		.index('by_sourceId_and_suggestedSourceNormalizedKey', [
			'sourceId',
			'suggestedSourceNormalizedKey'
		])
		.index('by_rssFeedId_and_publishedAt', ['rssFeedId', 'publishedAt'])
		.index('by_r2Key_and_publishedAt', ['r2Key', 'publishedAt'])
		.index('by_publishedAt', ['publishedAt']),
	user_source_items: defineTable({
		userAuthId: v.string(),
		sourceId: v.id('sources'),
		sourceItemId: v.id('source_items'),
		publishedAt: v.number(),
		deliveredAt: v.number()
	})
		.index('by_userAuthId_and_publishedAt', ['userAuthId', 'publishedAt'])
		.index('by_userAuthId_and_sourceId_and_publishedAt', ['userAuthId', 'sourceId', 'publishedAt'])
		.index('by_userAuthId_and_sourceItemId', ['userAuthId', 'sourceItemId'])
		.index('by_sourceItemId', ['sourceItemId'])
		.index('by_sourceId_and_publishedAt', ['sourceId', 'publishedAt']),
	// =====================================================
	// KNOWLEDGE SYSTEM TABLES (36 tables)
	// =====================================================

	// Layer 1: Information Sources
	information_sources: defineTable({
		userId: v.string(),
		sourceType: v.union(v.literal('url'), v.literal('upload'), v.literal('text')),
		title: v.string(),
		url: v.optional(v.string()),
		r2Key: v.optional(v.string()),
		rawText: v.optional(v.string()),
		sourceItemId: v.optional(v.id('source_items')),
		status: v.union(
			v.literal('pending'),
			v.literal('processing'),
			v.literal('ready'),
			v.literal('failed')
		),
		currentVersionId: v.optional(v.id('source_versions')),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_userId', ['userId'])
		.index('by_userId_and_createdAt', ['userId', 'createdAt'])
		.index('by_status_and_updatedAt', ['status', 'updatedAt'])
		.index('by_sourceItemId', ['sourceItemId']),

	source_versions: defineTable({
		sourceId: v.id('information_sources'),
		versionNumber: v.number(),
		contentHash: v.string(),
		r2Key: v.string(),
		changeDescription: v.optional(v.string()),
		createdAt: v.number()
	})
		.index('by_sourceId', ['sourceId'])
		.index('by_sourceId_and_versionNumber', ['sourceId', 'versionNumber']),

	source_item_embeddings: defineTable({
		sourceItemId: v.id('source_items'),
		model: v.string(),
		embedding: v.array(v.number()),
		createdAt: v.number()
	}).index('by_sourceItemId', ['sourceItemId']),

	source_quality_assessments: defineTable({
		sourceId: v.id('information_sources'),
		assessorType: v.union(v.literal('llm'), v.literal('human'), v.literal('community')),
		assessorId: v.optional(v.string()),
		factualReliability: v.number(),
		biasScore: v.number(),
		expertiseScore: v.number(),
		rationale: v.optional(v.string()),
		createdAt: v.number()
	})
		.index('by_sourceId', ['sourceId'])
		.index('by_sourceId_and_assessorType', ['sourceId', 'assessorType']),

	// Layer 2: Extraction
	knowledge_extraction_jobs: defineTable({
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
	})
		.index('by_sourceId', ['sourceId'])
		.index('by_userId_and_startedAt', ['userId', 'startedAt'])
		.index('by_userId_and_status', ['userId', 'status']),

	knowledge_extracted_candidates: defineTable({
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
	})
		.index('by_sourceId', ['sourceId'])
		.index('by_extractionJobId', ['extractionJobId'])
		.index('by_userId_and_createdAt', ['userId', 'createdAt'])
		.index('by_status', ['status']),

	knowledge_candidate_citations: defineTable({
		candidateId: v.id('knowledge_extracted_candidates'),
		sourceItemId: v.optional(v.id('source_items')),
		quote: v.string(),
		confidence: v.number(),
		createdAt: v.number()
	})
		.index('by_candidateId', ['candidateId'])
		.index('by_sourceItemId', ['sourceItemId']),

	knowledge_candidate_relationships: defineTable({
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
		confidence: v.number(),
		createdAt: v.number()
	})
		.index('by_sourceCandidateId', ['sourceCandidateId'])
		.index('by_targetCandidateId', ['targetCandidateId']),

	knowledge_candidate_versions: defineTable({
		candidateId: v.id('knowledge_extracted_candidates'),
		content: v.string(),
		model: v.string(),
		promptVersion: v.string(),
		extractionJobId: v.id('knowledge_extraction_jobs'),
		createdAt: v.number()
	}).index('by_candidateId', ['candidateId']),

	knowledge_candidate_votes: defineTable({
		candidateId: v.id('knowledge_extracted_candidates'),
		model: v.string(),
		agrees: v.boolean(),
		confidence: v.number(),
		rationale: v.optional(v.string()),
		createdAt: v.number()
	}).index('by_candidateId', ['candidateId']),

	// Layer 3: Knowledge Graph
	knowledge_domains: defineTable({
		name: v.string(),
		description: v.optional(v.string()),
		icon: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number()
	}).index('by_name', ['name']),

	domain_topics: defineTable({
		domainId: v.id('knowledge_domains'),
		topicId: v.id('knowledge_cell_topics'),
		createdAt: v.number()
	})
		.index('by_domainId', ['domainId'])
		.index('by_topicId', ['topicId']),

	knowledge_cells: defineTable({
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
		topicId: v.id('knowledge_cell_topics'),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_cellKey', ['cellKey'])
		.index('by_topicId', ['topicId'])
		.index('by_source', ['source'])
		.index('by_createdAt', ['createdAt']),

	knowledge_cell_versions: defineTable({
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
		validFrom: v.number(),
		validUntil: v.optional(v.number()),
		changedBy: v.optional(v.string()),
		changeReason: v.optional(v.string()),
		createdAt: v.number()
	})
		.index('by_cellId', ['cellId'])
		.index('by_cellId_and_validFrom', ['cellId', 'validFrom']),

	knowledge_claims: defineTable({
		cellId: v.id('knowledge_cells'),
		claimKey: v.string(),
		statement: v.string(),
		source: v.union(v.literal('llm_extracted'), v.literal('human_created'), v.literal('community')),
		status: v.union(v.literal('active'), v.literal('superseded'), v.literal('refuted')),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_cellId', ['cellId'])
		.index('by_claimKey', ['claimKey'])
		.index('by_status', ['status']),

	claim_evidence: defineTable({
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
		sampleSize: v.optional(v.number()),
		createdAt: v.number()
	})
		.index('by_claimId', ['claimId'])
		.index('by_sourceItemId', ['sourceItemId']),

	claim_assessments: defineTable({
		claimId: v.id('knowledge_claims'),
		assessmentType: v.union(v.literal('llm'), v.literal('human'), v.literal('community')),
		userId: v.optional(v.string()),
		consensus: v.number(),
		rationale: v.optional(v.string()),
		createdAt: v.number()
	})
		.index('by_claimId', ['claimId'])
		.index('by_claimId_and_assessmentType', ['claimId', 'assessmentType']),

	knowledge_cell_citations: defineTable({
		cellId: v.id('knowledge_cells'),
		sourceItemId: v.optional(v.id('source_items')),
		quote: v.string(),
		confidence: v.number(),
		createdAt: v.number()
	})
		.index('by_cellId', ['cellId'])
		.index('by_sourceItemId', ['sourceItemId']),

	knowledge_cell_relationships: defineTable({
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
		confidence: v.number(),
		createdAt: v.number()
	})
		.index('by_sourceCellId', ['sourceCellId'])
		.index('by_targetCellId', ['targetCellId'])
		.index('by_relationshipType', ['relationshipType']),

	knowledge_cell_topics: defineTable({
		name: v.string(),
		description: v.optional(v.string()),
		parentId: v.optional(v.id('knowledge_cell_topics')),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_name', ['name'])
		.index('by_parentId', ['parentId']),

	knowledge_cell_origins: defineTable({
		cellId: v.id('knowledge_cells'),
		candidateId: v.id('knowledge_extracted_candidates'),
		extractionRunId: v.id('knowledge_extraction_jobs'),
		contributionWeight: v.number(),
		createdAt: v.number()
	})
		.index('by_cellId', ['cellId'])
		.index('by_candidateId', ['candidateId']),

	knowledge_cell_quality: defineTable({
		cellId: v.id('knowledge_cells'),
		score: v.number(),
		citationCount: v.number(),
		averageSourceQuality: v.number(),
		assessmentCount: v.number(),
		contradictionCount: v.number(),
		ageDays: v.number(),
		lastVerifiedAt: v.number(),
		verificationStatus: v.union(
			v.literal('fresh'),
			v.literal('aging'),
			v.literal('stale'),
			v.literal('needs_review')
		),
		verificationDue: v.optional(v.number()),
		computedAt: v.number()
	})
		.index('by_cellId', ['cellId'])
		.index('by_score', ['score'])
		.index('by_verificationStatus', ['verificationStatus']),

	knowledge_cell_metrics: defineTable({
		cellId: v.id('knowledge_cells'),
		certainty: v.number(),
		evidenceStrength: v.number(),
		scientificConsensus: v.number(),
		controversyLevel: v.number(),
		recency: v.number(),
		createdAt: v.number(),
		updatedAt: v.number()
	}).index('by_cellId', ['cellId']),

	knowledge_views: defineTable({
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
		generatedBy: v.string(),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_cellId', ['cellId'])
		.index('by_cellId_and_audience', ['cellId', 'audience']),

	// Layer 4: Personal Knowledge
	user_knowledge_cells: defineTable({
		userId: v.string(),
		cellId: v.id('knowledge_cells'),
		relationship: v.union(
			v.literal('learning'),
			v.literal('learned'),
			v.literal('teaching'),
			v.literal('reviewing')
		),
		progress: v.number(),
		lastInteractionAt: v.number(),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_userId', ['userId'])
		.index('by_userId_and_cellId', ['userId', 'cellId'])
		.index('by_userId_and_relationship', ['userId', 'relationship']),

	user_cell_mastery: defineTable({
		userId: v.string(),
		cellId: v.id('knowledge_cells'),
		remember: v.boolean(),
		understand: v.boolean(),
		apply: v.boolean(),
		analyze: v.boolean(),
		evaluate: v.boolean(),
		create: v.boolean(),
		lastAssessedAt: v.number(),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_userId', ['userId'])
		.index('by_userId_and_cellId', ['userId', 'cellId']),

	knowledge_cell_assessments: defineTable({
		cellId: v.id('knowledge_cells'),
		assessmentType: v.union(v.literal('llm'), v.literal('human'), v.literal('community')),
		userId: v.optional(v.string()),
		confidence: v.number(),
		importance: v.number(),
		difficulty: v.number(),
		rationale: v.optional(v.string()),
		createdAt: v.number()
	})
		.index('by_cellId', ['cellId'])
		.index('by_cellId_and_assessmentType', ['cellId', 'assessmentType']),

	knowledge_cell_embeddings: defineTable({
		cellId: v.id('knowledge_cells'),
		versionId: v.optional(v.id('knowledge_cell_versions')),
		contentHash: v.optional(v.string()),
		model: v.string(),
		embedding: v.array(v.number()),
		createdAt: v.number()
	})
		.index('by_cellId', ['cellId'])
		.index('by_cellId_and_versionId', ['cellId', 'versionId']),

	knowledge_cell_events: defineTable({
		userId: v.string(),
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
		durationMs: v.optional(v.number()),
		createdAt: v.number()
	})
		.index('by_userId', ['userId'])
		.index('by_userId_and_cellId', ['userId', 'cellId'])
		.index('by_userId_and_eventType', ['userId', 'eventType'])
		.index('by_cellId', ['cellId']),

	knowledge_cell_reminders: defineTable({
		userId: v.string(),
		cellId: v.id('knowledge_cells'),
		nextReviewAt: v.number(),
		intervalMs: v.number(),
		easeFactor: v.number(),
		repetitionCount: v.number(),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_userId', ['userId'])
		.index('by_userId_and_nextReviewAt', ['userId', 'nextReviewAt'])
		.index('by_userId_and_cellId', ['userId', 'cellId'])
		.index('by_cellId', ['cellId']),

	// Layer 5: Synthesis
	knowledge_notes: defineTable({
		userId: v.string(),
		title: v.string(),
		summary: v.string(),
		content: v.string(),
		r2Key: v.string(),
		sourceId: v.optional(v.id('information_sources')),
		status: v.union(
			v.literal('draft'),
			v.literal('review'),
			v.literal('published'),
			v.literal('archived')
		),
		version: v.number(),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_userId', ['userId'])
		.index('by_userId_and_createdAt', ['userId', 'createdAt'])
		.index('by_userId_and_status', ['userId', 'status'])
		.index('by_sourceId', ['sourceId']),

	knowledge_note_contributions: defineTable({
		noteId: v.id('knowledge_notes'),
		cellId: v.id('knowledge_cells'),
		contributionWeight: v.number(),
		blockId: v.optional(v.id('knowledge_note_blocks')),
		createdAt: v.number()
	})
		.index('by_noteId', ['noteId'])
		.index('by_cellId', ['cellId']),

	knowledge_note_blocks: defineTable({
		noteId: v.id('knowledge_notes'),
		blockType: v.union(
			v.literal('paragraph'),
			v.literal('list'),
			v.literal('quote'),
			v.literal('diagram'),
			v.literal('question')
		),
		content: v.string(),
		order: v.number(),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_noteId', ['noteId'])
		.index('by_noteId_and_order', ['noteId', 'order']),

	// Layer 6: Learning & Education
	learning_goals: defineTable({
		userId: v.string(),
		title: v.string(),
		description: v.optional(v.string()),
		goalType: v.union(
			v.literal('course'),
			v.literal('curriculum'),
			v.literal('training'),
			v.literal('self_study')
		),
		status: v.union(
			v.literal('active'),
			v.literal('completed'),
			v.literal('paused'),
			v.literal('abandoned')
		),
		targetDate: v.optional(v.number()),
		progress: v.number(),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_userId', ['userId'])
		.index('by_userId_and_status', ['userId', 'status']),

	learning_goal_topics: defineTable({
		goalId: v.id('learning_goals'),
		topicId: v.id('knowledge_cell_topics'),
		priority: v.number(),
		createdAt: v.number()
	})
		.index('by_goalId', ['goalId'])
		.index('by_topicId', ['topicId']),

	learning_goal_cells: defineTable({
		goalId: v.id('learning_goals'),
		cellId: v.id('knowledge_cells'),
		status: v.union(v.literal('pending'), v.literal('learning'), v.literal('mastered')),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_goalId', ['goalId'])
		.index('by_cellId', ['cellId']),

	knowledge_paths: defineTable({
		userId: v.string(),
		title: v.string(),
		description: v.optional(v.string()),
		domainId: v.optional(v.id('knowledge_domains')),
		status: v.union(v.literal('draft'), v.literal('active'), v.literal('completed')),
		totalSteps: v.number(),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_userId', ['userId'])
		.index('by_userId_and_status', ['userId', 'status']),

	path_steps: defineTable({
		pathId: v.id('knowledge_paths'),
		cellId: v.id('knowledge_cells'),
		stepOrder: v.number(),
		isOptional: v.boolean(),
		createdAt: v.number()
	})
		.index('by_pathId', ['pathId'])
		.index('by_pathId_and_stepOrder', ['pathId', 'stepOrder'])
		.index('by_cellId', ['cellId']),

	knowledge_recommendations: defineTable({
		userId: v.string(),
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
		priority: v.number(),
		status: v.union(v.literal('pending'), v.literal('viewed'), v.literal('completed')),
		goalId: v.optional(v.id('learning_goals')),
		pathId: v.optional(v.id('knowledge_paths')),
		createdAt: v.number()
	})
		.index('by_userId', ['userId'])
		.index('by_userId_and_status', ['userId', 'status'])
		.index('by_userId_and_priority', ['userId', 'priority'])
		.index('by_recommendedCellId', ['recommendedCellId'])
		.index('by_goalId', ['goalId'])
		.index('by_pathId', ['pathId']),

	conflict_cases: defineTable({
		cellAId: v.id('knowledge_cells'),
		cellBId: v.id('knowledge_cells'),
		conflictType: v.union(
			v.literal('contradiction'),
			v.literal('inconsistency'),
			v.literal('ambiguity')
		),
		status: v.union(
			v.literal('open'),
			v.literal('investigating'),
			v.literal('resolved'),
			v.literal('dismissed')
		),
		resolution: v.optional(
			v.union(
				v.literal('favor_a'),
				v.literal('favor_b'),
				v.literal('both_valid'),
				v.literal('both_invalid'),
				v.literal('merged')
			)
		),
		resolutionReason: v.optional(v.string()),
		resolvedBy: v.optional(v.string()),
		resolvedAt: v.optional(v.number()),
		createdAt: v.number()
	})
		.index('by_cellAId', ['cellAId'])
		.index('by_cellBId', ['cellBId'])
		.index('by_status', ['status']),

	// Layer 7: Agent Orchestration
	agent_runs: defineTable({
		agentType: v.string(),
		workflowId: v.optional(v.id('agent_workflows')),
		userId: v.optional(v.string()),
		inputHash: v.string(),
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
		error: v.optional(v.string()),
		startedAt: v.number(),
		completedAt: v.optional(v.number()),
		durationMs: v.optional(v.number())
	})
		.index('by_agentType', ['agentType'])
		.index('by_userId', ['userId'])
		.index('by_userId_and_createdAt', ['userId', 'startedAt'])
		.index('by_status', ['status']),

	agent_memories: defineTable({
		agentType: v.string(),
		memoryType: v.union(
			v.literal('source_quality'),
			v.literal('user_preference'),
			v.literal('extraction_pattern'),
			v.literal('verification_rule')
		),
		key: v.string(),
		value: v.any(),
		confidence: v.number(),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_agentType', ['agentType'])
		.index('by_agentType_and_memoryType', ['agentType', 'memoryType']),

	agent_workflows: defineTable({
		name: v.string(),
		description: v.optional(v.string()),
		triggerType: v.union(v.literal('manual'), v.literal('scheduled'), v.literal('event')),
		status: v.union(v.literal('active'), v.literal('paused'), v.literal('archived')),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_name', ['name'])
		.index('by_status', ['status']),

	workflow_steps: defineTable({
		workflowId: v.id('agent_workflows'),
		agentType: v.string(),
		stepOrder: v.number(),
		config: v.optional(v.any()),
		createdAt: v.number()
	})
		.index('by_workflowId', ['workflowId'])
		.index('by_workflowId_and_stepOrder', ['workflowId', 'stepOrder']),

	// Layer 8: Semantic Graph
	knowledge_entities: defineTable({
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
		externalIds: v.optional(v.any()),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_canonicalName', ['canonicalName'])
		.index('by_entityType', ['entityType']),

	knowledge_entity_relationships: defineTable({
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
		confidence: v.number(),
		createdAt: v.number()
	})
		.index('by_sourceEntityId', ['sourceEntityId'])
		.index('by_targetEntityId', ['targetEntityId'])
		.index('by_relationshipType', ['relationshipType']),

	knowledge_cell_entity_links: defineTable({
		cellId: v.id('knowledge_cells'),
		entityId: v.id('knowledge_entities'),
		relevance: v.number(),
		createdAt: v.number()
	})
		.index('by_cellId', ['cellId'])
		.index('by_entityId', ['entityId']),

	knowledge_cell_perspective_embeddings: defineTable({
		cellId: v.id('knowledge_cells'),
		perspective: v.union(
			v.literal('general'),
			v.literal('student'),
			v.literal('researcher'),
			v.literal('domain_specific')
		),
		domainId: v.optional(v.id('knowledge_domains')),
		model: v.string(),
		embedding: v.array(v.number()),
		createdAt: v.number()
	})
		.index('by_cellId', ['cellId'])
		.index('by_cellId_and_perspective', ['cellId', 'perspective']),

	knowledge_cell_confidence: defineTable({
		cellId: v.id('knowledge_cells'),
		confidence: v.number(),
		confidenceInterval: v.array(v.number()),
		evidenceCount: v.number(),
		sampleSize: v.optional(v.number()),
		computedAt: v.number()
	}).index('by_cellId', ['cellId']),
	source_jobs: defineTable({
		jobType: v.union(
			v.literal('sync_source'),
			v.literal('bulk_unsubscribe'),
			v.literal('resubscribe_backfill')
		),
		userAuthId: v.optional(v.string()),
		sourceId: v.optional(v.id('sources')),
		status: v.union(
			v.literal('queued'),
			v.literal('running'),
			v.literal('done'),
			v.literal('failed')
		),
		cursor: v.optional(v.string()),
		processed: v.number(),
		error: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
		finishedAt: v.optional(v.number())
	})
		.index('by_status_and_updatedAt', ['status', 'updatedAt'])
		.index('by_userAuthId_and_createdAt', ['userAuthId', 'createdAt'])
		.index('by_sourceId_and_createdAt', ['sourceId', 'createdAt']),
	source_nightly_runs: defineTable({
		runDate: v.string(),
		status: v.union(v.literal('running'), v.literal('done'), v.literal('failed')),
		startedAt: v.number(),
		finishedAt: v.optional(v.number()),
		processedSources: v.number(),
		queuedJobs: v.number(),
		cursor: v.optional(v.string()),
		error: v.optional(v.string()),
		updatedAt: v.number()
	})
		.index('by_runDate', ['runDate'])
		.index('by_startedAt', ['startedAt'])
		.index('by_status_and_updatedAt', ['status', 'updatedAt']),
	security_events: defineTable({
		eventType: v.string(),
		severity: v.union(
			v.literal('info'),
			v.literal('warn'),
			v.literal('error'),
			v.literal('critical')
		),
		surface: v.string(),
		message: v.string(),
		actorAuthId: v.optional(v.string()),
		entityType: v.optional(v.string()),
		entityId: v.optional(v.string()),
		metadata: v.optional(v.string()),
		createdAt: v.number()
	})
		.index('by_createdAt', ['createdAt'])
		.index('by_severity_and_createdAt', ['severity', 'createdAt'])
		.index('by_eventType_and_createdAt', ['eventType', 'createdAt'])
		.index('by_actorAuthId_and_createdAt', ['actorAuthId', 'createdAt']),
	admin_audit_logs: defineTable({
		actorAuthId: v.string(),
		action: v.string(),
		targetType: v.string(),
		targetId: v.string(),
		status: v.union(v.literal('started'), v.literal('succeeded'), v.literal('failed')),
		details: v.optional(v.string()),
		createdAt: v.number()
	})
		.index('by_createdAt', ['createdAt'])
		.index('by_actorAuthId_and_createdAt', ['actorAuthId', 'createdAt'])
		.index('by_action_and_createdAt', ['action', 'createdAt'])
		.index('by_targetType_and_targetId_and_createdAt', ['targetType', 'targetId', 'createdAt']),
	deletion_jobs: defineTable({
		requestKey: v.string(),
		requestedByAuthId: v.string(),
		targetType: v.union(
			v.literal('source'),
			v.literal('source_item'),
			v.literal('post'),
			v.literal('community'),
			v.literal('user'),
			v.literal('knowledge_cell'),
			v.literal('knowledge_note'),
			v.literal('information_source'),
			v.literal('domain'),
			v.literal('entity'),
			v.literal('goal'),
			v.literal('path')
		),
		targetId: v.string(),
		status: v.union(
			v.literal('queued'),
			v.literal('running'),
			v.literal('done'),
			v.literal('failed'),
			v.literal('cancelled')
		),
		processed: v.number(),
		result: v.optional(v.string()),
		error: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
		finishedAt: v.optional(v.number())
	})
		.index('by_requestKey', ['requestKey'])
		.index('by_status_and_updatedAt', ['status', 'updatedAt'])
		.index('by_requestedByAuthId_and_createdAt', ['requestedByAuthId', 'createdAt'])
		.index('by_targetType_and_targetId_and_createdAt', ['targetType', 'targetId', 'createdAt']),
	r2_retry_jobs: defineTable({
		entityType: v.string(),
		entityId: v.string(),
		r2Key: v.string(),
		operation: v.literal('delete'),
		stage: v.optional(v.union(v.literal('object_delete'), v.literal('metadata_delete'))),
		status: v.union(
			v.literal('queued'),
			v.literal('running'),
			v.literal('done'),
			v.literal('failed')
		),
		attemptCount: v.number(),
		nextRunAt: v.number(),
		lastError: v.optional(v.string()),
		objectDeletedAt: v.optional(v.number()),
		metadataDeletedAt: v.optional(v.number()),
		createdAt: v.number(),
		updatedAt: v.number(),
		finishedAt: v.optional(v.number())
	})
		.index('by_status_and_nextRunAt', ['status', 'nextRunAt'])
		.index('by_entityType_and_entityId_and_r2Key', ['entityType', 'entityId', 'r2Key'])
		.index('by_entityType_and_entityId_and_createdAt', ['entityType', 'entityId', 'createdAt'])
		.index('by_r2Key_and_createdAt', ['r2Key', 'createdAt']),
	scheduler_locks: defineTable({
		lockKey: v.string(),
		owner: v.string(),
		leaseExpiresAt: v.number(),
		heartbeatAt: v.number(),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_lockKey', ['lockKey'])
		.index('by_leaseExpiresAt', ['leaseExpiresAt'])
		.index('by_owner_and_updatedAt', ['owner', 'updatedAt']),
	post_tags: defineTable({
		postId: v.id('posts'),
		tagLower: v.string(),
		createdAt: v.number()
	})
		.index('by_postId', ['postId'])
		.index('by_postId_and_tagLower', ['postId', 'tagLower'])
		.index('by_tagLower_and_createdAt', ['tagLower', 'createdAt']),
	post_votes: defineTable({
		postId: v.id('posts'),
		userAuthId: v.string(),
		value: v.union(v.literal(1), v.literal(-1)),
		createdAt: v.number()
	})
		.index('by_postId_and_userAuthId', ['postId', 'userAuthId'])
		.index('by_postId_and_createdAt', ['postId', 'createdAt'])
		.index('by_userAuthId_and_createdAt', ['userAuthId', 'createdAt']),
	post_comments: defineTable({
		postId: v.id('posts'),
		authorAuthId: v.string(),
		parentId: v.optional(v.id('post_comments')),
		body: v.string(),
		score: v.number(),
		likes: v.number(),
		dislikes: v.number(),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_postId_and_createdAt', ['postId', 'createdAt'])
		.index('by_parentId_and_createdAt', ['parentId', 'createdAt'])
		.index('by_authorAuthId_and_createdAt', ['authorAuthId', 'createdAt']),
	post_comment_votes: defineTable({
		commentId: v.id('post_comments'),
		userAuthId: v.string(),
		value: v.union(v.literal(1), v.literal(-1)),
		createdAt: v.number()
	})
		.index('by_commentId_and_userAuthId', ['commentId', 'userAuthId'])
		.index('by_commentId_and_createdAt', ['commentId', 'createdAt'])
		.index('by_userAuthId_and_createdAt', ['userAuthId', 'createdAt']),
	follows_users: defineTable({
		followerAuthId: v.string(),
		targetAuthId: v.string(),
		createdAt: v.number()
	})
		.index('by_followerAuthId_and_targetAuthId', ['followerAuthId', 'targetAuthId'])
		.index('by_followerAuthId_and_createdAt', ['followerAuthId', 'createdAt'])
		.index('by_targetAuthId_and_createdAt', ['targetAuthId', 'createdAt']),
	follows_communities: defineTable({
		followerAuthId: v.string(),
		communityId: v.id('communities'),
		createdAt: v.number()
	})
		.index('by_followerAuthId_and_communityId', ['followerAuthId', 'communityId'])
		.index('by_followerAuthId_and_createdAt', ['followerAuthId', 'createdAt'])
		.index('by_communityId_and_createdAt', ['communityId', 'createdAt']),
	community_chat_messages: defineTable({
		communityId: v.id('communities'),
		userAuthId: v.string(),
		userName: v.string(),
		userImage: v.optional(v.string()),
		body: v.string(),
		replyTo: v.optional(v.id('community_chat_messages')),
		editedAt: v.optional(v.number()),
		isDeleted: v.boolean(),
		createdAt: v.number()
	})
		.index('by_communityId_and_createdAt', ['communityId', 'createdAt'])
		.index('by_userAuthId_and_createdAt', ['userAuthId', 'createdAt']),
	community_chat_reactions: defineTable({
		communityId: v.id('communities'),
		messageId: v.id('community_chat_messages'),
		userAuthId: v.string(),
		emoji: v.string(),
		createdAt: v.number()
	})
		.index('by_communityId_and_messageId', ['communityId', 'messageId'])
		.index('by_messageId_and_userAuthId', ['messageId', 'userAuthId'])
		.index('by_userAuthId_and_createdAt', ['userAuthId', 'createdAt']),
	post_embeddings: defineTable({
		postId: v.id('posts'),
		model: v.optional(v.string()),
		embedding: v.optional(v.array(v.number())),
		createdAt: v.number()
	}).index('by_postId', ['postId']),
	ai_summary_cache: defineTable({
		entityType: v.union(v.literal('post'), v.literal('thread')),
		entityId: v.string(),
		summary: v.string(),
		model: v.string(),
		createdAt: v.number()
	}).index('by_entityType_and_entityId', ['entityType', 'entityId']),
	similar_links_cache: defineTable({
		viewerKey: v.string(),
		normalizedUrl: v.string(),
		scope: v.union(v.literal('sources'), v.literal('web')),
		sourceHost: v.string(),
		sourceDomainFingerprint: v.optional(v.string()),
		sourceDomainCount: v.optional(v.number()),
		sourceDomainsSnapshot: v.optional(v.array(v.string())),
		status: v.union(v.literal('ready'), v.literal('empty'), v.literal('error')),
		results: v.array(
			v.object({
				id: v.string(),
				url: v.string(),
				title: v.string(),
				publishedDate: v.optional(v.string()),
				author: v.optional(v.string()),
				image: v.optional(v.string()),
				favicon: v.optional(v.string()),
				highlights: v.array(v.string()),
				highlightScores: v.array(v.number())
			})
		),
		lastFetchedAt: v.optional(v.number()),
		expiresAt: v.number(),
		lastAttemptAt: v.optional(v.number()),
		lastError: v.optional(v.string()),
		refreshState: v.union(v.literal('idle'), v.literal('refreshing')),
		refreshLeaseExpiresAt: v.optional(v.number()),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_viewerKey_and_normalizedUrl_and_scope', ['viewerKey', 'normalizedUrl', 'scope'])
		.index('by_expiresAt', ['expiresAt'])
		.index('by_refreshState_and_refreshLeaseExpiresAt', ['refreshState', 'refreshLeaseExpiresAt'])
		.index('by_status_and_updatedAt', ['status', 'updatedAt']),
	similar_links_domain_exclusions: defineTable({
		userAuthId: v.string(),
		domain: v.string(),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_userAuthId_and_domain', ['userAuthId', 'domain'])
		.index('by_userAuthId_and_updatedAt', ['userAuthId', 'updatedAt']),
	dm_conversations: defineTable({
		participant1: v.string(),
		participant2: v.string(),
		lastMessageAt: v.number(),
		createdAt: v.number()
	})
		.index('by_participant1', ['participant1'])
		.index('by_participant2', ['participant2'])
		.index('by_pair', ['participant1', 'participant2']),
	dm_participants: defineTable({
		conversationId: v.id('dm_conversations'),
		userAuthId: v.string(),
		otherUserAuthId: v.string(),
		unreadCount: v.number(),
		lastReadAt: v.number(),
		lastReadMessageAt: v.number(),
		lastMessageAt: v.number(),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_conversationId_and_userAuthId', ['conversationId', 'userAuthId'])
		.index('by_userAuthId_and_lastMessageAt', ['userAuthId', 'lastMessageAt'])
		.index('by_userAuthId_and_otherUserAuthId', ['userAuthId', 'otherUserAuthId']),
	dm_messages: defineTable({
		conversationId: v.id('dm_conversations'),
		senderAuthId: v.string(),
		senderName: v.string(),
		senderImage: v.optional(v.string()),
		body: v.string(),
		replyTo: v.optional(v.id('dm_messages')),
		editedAt: v.optional(v.number()),
		isDeleted: v.boolean(),
		createdAt: v.number()
	})
		.index('by_conversationId_and_createdAt', ['conversationId', 'createdAt'])
		.index('by_senderAuthId_and_createdAt', ['senderAuthId', 'createdAt']),
	dm_reactions: defineTable({
		messageId: v.id('dm_messages'),
		userAuthId: v.string(),
		emoji: v.string(),
		createdAt: v.number()
	})
		.index('by_messageId', ['messageId'])
		.index('by_messageId_and_userAuthId', ['messageId', 'userAuthId'])
		.index('by_userAuthId_and_createdAt', ['userAuthId', 'createdAt']),
	dm_read_cursors: defineTable({
		conversationId: v.id('dm_conversations'),
		userAuthId: v.string(),
		lastReadAt: v.number()
	})
		.index('by_conversationId_and_userAuthId', ['conversationId', 'userAuthId'])
		.index('by_userAuthId', ['userAuthId'])
});

export default schema;
