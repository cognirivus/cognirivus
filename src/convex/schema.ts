import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { tables as authTables } from './betterAuth/schema';

const schema = defineSchema({
	...authTables,
	messages: defineTable({
		body: v.string(),
		reasoning: v.optional(v.string()),
		userId: v.string(),
		threadId: v.id('threads'),
		role: v.union(v.literal('user'), v.literal('assistant')),
		createdAt: v.number(),
		model: v.optional(v.string()),
		usage: v.optional(
			v.object({
				promptTokens: v.number(),
				completionTokens: v.number(),
				totalTokens: v.number()
			})
		),
		isCancelled: v.optional(v.boolean()),
		cost: v.optional(v.number()),
		metadata: v.optional(v.any()),
		images: v.optional(v.array(v.id('_storage'))),
		deletedImages: v.optional(v.array(v.id('_storage')))
	})
		.index('by_thread', ['threadId'])
		.index('by_user', ['userId']),
	threads: defineTable({
		title: v.string(),
		userId: v.string(),
		updatedAt: v.number(),
		totalTokens: v.optional(v.number()),
		totalPromptTokens: v.optional(v.number()),
		totalCompletionTokens: v.optional(v.number()),
		totalCost: v.optional(v.number())
	}).index('by_user', ['userId', 'updatedAt']),
	usage_logs: defineTable({
		userId: v.string(),
		threadId: v.optional(v.id('threads')),
		messageId: v.optional(v.id('messages')),
		agentSessionId: v.optional(v.id('agent_sessions')),
		agentName: v.optional(v.string()),
		purpose: v.optional(v.string()),
		model: v.string(),
		promptTokens: v.number(),
		completionTokens: v.number(),
		totalTokens: v.number(),
		cost: v.optional(v.number()),
		createdAt: v.number(),
		raw_response: v.optional(v.any())
	})
		.index('by_user', ['userId'])
		.index('by_thread', ['threadId'])
		.index('by_agent_session', ['agentSessionId'])
		.index('by_created_at', ['createdAt']),
	generated_images: defineTable({
		userId: v.string(),
		prompt: v.string(),
		negativePrompt: v.optional(v.string()),
		provider: v.string(),
		model: v.optional(v.string()),
		aspectRatio: v.string(),
		width: v.number(),
		height: v.number(),
		imageId: v.id('_storage'),
		messageId: v.optional(v.id('messages')),
		createdAt: v.number()
	})
		.index('by_user', ['userId'])
		.index('by_created_at', ['createdAt'])
		.index('by_message', ['messageId']),
	cancellations: defineTable({
		messageId: v.id('messages')
	}).index('by_message', ['messageId']),
	user_memories: defineTable({
		userId: v.string(),
		text: v.string(),
		category: v.optional(v.string()),
		embedding: v.array(v.number()),
		messageId: v.optional(v.id('messages')),
		createdAt: v.number()
	})
		.vectorIndex('by_embedding', {
			vectorField: 'embedding',
			dimensions: 4096,
			filterFields: ['userId']
		})
		.index('by_user', ['userId']),
	models: defineTable({
		modelId: v.string(),
		name: v.string(),
		type: v.union(v.literal('chat'), v.literal('embedding')),
		attributes: v.any(),
		isEnabled: v.boolean(),
		lastUpdated: v.number()
	})
		.index('by_model_id', ['modelId'])
		.index('by_enabled', ['isEnabled'])
		.index('by_type_enabled', ['type', 'isEnabled']),
	blogs: defineTable({
		title: v.string(),
		snippet: v.string(),
		r2Key: v.optional(v.string()),
		authorId: v.string(),
		createdAt: v.number(),
		published: v.boolean(),
		ragEntryId: v.optional(v.string())
	})
		.index('by_created_at', ['createdAt'])
		.index('by_published', ['published'])
		.searchIndex('search_snippet', {
			searchField: 'snippet',
			filterFields: ['published']
		}),
	blog_reactions: defineTable({
		blogId: v.id('blogs'),
		userId: v.string(),
		like_dislike: v.number(),
		groupId: v.optional(v.id('groups'))
	})
		.index('by_blog', ['blogId'])
		.index('by_blog_user', ['blogId', 'userId'])
		.index('by_group', ['groupId']),
	blog_comments: defineTable({
		blogId: v.id('blogs'),
		userId: v.string(),
		userName: v.optional(v.string()),
		body: v.string(),
		parentId: v.optional(v.id('blog_comments')),
		createdAt: v.number(),
		groupId: v.optional(v.id('groups'))
	})
		.index('by_blog', ['blogId'])
		.index('by_blog_created_at', ['blogId', 'createdAt'])
		.index('by_parent', ['parentId'])
		.index('by_group', ['groupId']),
	comment_reactions: defineTable({
		commentId: v.id('blog_comments'),
		userId: v.string(),
		like_dislike: v.number(),
		groupId: v.optional(v.id('groups'))
	})
		.index('by_comment', ['commentId'])
		.index('by_comment_user', ['commentId', 'userId'])
		.index('by_group', ['groupId']),
	news: defineTable({
		date: v.string(),
		snippet: v.string(),
		r2Key: v.optional(v.string()),
		bodyHash: v.optional(v.string())
	})
		.index('by_date', ['date'])
		.index('by_bodyHash', ['bodyHash'])
		.searchIndex('search_snippet', {
			searchField: 'snippet'
		}),
	content: defineTable({
		title: v.string(),
		body: v.string(),
		subjectId: v.id('subjects'),
		topic: v.string(),
		source: v.optional(v.string()),
		newsId: v.optional(v.id('news')),
		date: v.optional(v.string()),
		flashcardCount: v.optional(v.number()),
		sourceType: v.optional(v.string()),
		sourceId: v.optional(v.string()),
		extractionType: v.optional(v.string()),
		jobId: v.optional(v.id('extraction_jobs')),
		createdAt: v.number()
	})
		.index('by_subjectId', ['subjectId'])
		.index('by_topic', ['topic'])
		.index('by_date', ['date'])
		.index('by_topic_date', ['topic', 'date'])
		.index('by_created_at', ['createdAt'])
		.index('by_newsId', ['newsId'])
		.index('by_sourceType', ['sourceType'])
		.index('by_jobId', ['jobId'])
		.searchIndex('search_all', {
			searchField: 'body',
			filterFields: ['topic']
		}),
	subjects: defineTable({
		name: v.string(),
		gsPaper: v.number(),
		slug: v.string()
	})
		.index('by_gsPaper', ['gsPaper'])
		.index('by_slug', ['slug'])
		.index('by_name', ['name']),
	entities: defineTable({
		name: v.string(),
		type: v.string(),
		slug: v.string(),
		article: v.optional(v.string()),
		articleGeneratedAt: v.optional(v.number())
	})
		.index('by_type', ['type'])
		.index('by_slug', ['slug'])
		.index('by_name', ['name'])
		.index('by_slug_and_type', ['slug', 'type']),
	entity_aliases: defineTable({
		slug: v.string(),
		type: v.string(),
		entityId: v.id('entities'),
		sourceEntityId: v.id('entities'),
		sourceName: v.string(),
		createdAt: v.number()
	})
		.index('by_slug_and_type', ['slug', 'type'])
		.index('by_entity', ['entityId'])
		.index('by_source_entity', ['sourceEntityId']),
	content_entities: defineTable({
		contentId: v.id('content'),
		entityId: v.id('entities')
	})
		.index('by_content', ['contentId'])
		.index('by_entity', ['entityId'])
		.index('by_content_and_entity', ['contentId', 'entityId']),
	article_archive: defineTable({
		entityId: v.id('entities'),
		article: v.string(),
		createdAt: v.number()
	}).index('by_entity', ['entityId']),
	user_content_progress: defineTable({
		userId: v.string(),
		contentId: v.id('content'),
		completedAt: v.number()
	})
		.index('by_user', ['userId'])
		.index('by_user_content', ['userId', 'contentId']),
	flashcards: defineTable({
		contentId: v.id('content'),
		front: v.string(),
		back: v.string(),
		type: v.string(),
		difficulty: v.number(),
		createdAt: v.number()
	})
		.index('by_content', ['contentId'])
		.index('by_created_at', ['createdAt']),
	user_flashcard_progress: defineTable({
		userId: v.string(),
		flashcardId: v.id('flashcards'),
		interval: v.number(),
		easeFactor: v.number(),
		repetitions: v.number(),
		nextReviewAt: v.number(),
		lastReviewedAt: v.number()
	})
		.index('by_user', ['userId'])
		.index('by_user_flashcard', ['userId', 'flashcardId'])
		.index('by_flashcard', ['flashcardId'])
		.index('by_next_review', ['userId', 'nextReviewAt']),
	flashcard_reviews: defineTable({
		userId: v.string(),
		flashcardId: v.id('flashcards'),
		contentId: v.id('content'),
		score: v.number(), // 0-5
		reviewTime: v.number(),
		duration: v.optional(v.number())
	})
		.index('by_user', ['userId'])
		.index('by_flashcard', ['flashcardId'])
		.index('by_content', ['contentId'])
		.index('by_user_time', ['userId', 'reviewTime']),
	syllabus: defineTable({
		title: v.string(),
		snippet: v.string(),
		r2Key: v.optional(v.string()),
		subjectId: v.id('subjects'),
		topic: v.string(),
		exams: v.array(v.string()),
		createdAt: v.number()
	})
		.index('by_subjectId', ['subjectId'])
		.index('by_topic', ['topic'])
		.index('by_created_at', ['createdAt']),
	content_reactions: defineTable({
		contentId: v.id('content'),
		userId: v.string(),
		like_dislike: v.number(),
		groupId: v.optional(v.id('groups'))
	})
		.index('by_content', ['contentId'])
		.index('by_content_user', ['contentId', 'userId'])
		.index('by_group', ['groupId'])
		.index('by_group_content', ['groupId', 'contentId']),
	content_comments: defineTable({
		contentId: v.id('content'),
		userId: v.string(),
		userName: v.optional(v.string()),
		body: v.string(),
		parentId: v.optional(v.id('content_comments')),
		createdAt: v.number(),
		groupId: v.optional(v.id('groups'))
	})
		.index('by_content', ['contentId'])
		.index('by_content_created_at', ['contentId', 'createdAt'])
		.index('by_parent', ['parentId'])
		.index('by_group', ['groupId'])
		.index('by_group_content', ['groupId', 'contentId']),
	content_comment_reactions: defineTable({
		commentId: v.id('content_comments'),
		userId: v.string(),
		like_dislike: v.number(),
		groupId: v.optional(v.id('groups'))
	})
		.index('by_comment', ['commentId'])
		.index('by_comment_user', ['commentId', 'userId'])
		.index('by_group', ['groupId'])
		.index('by_group_comment', ['groupId', 'commentId']),
	extraction_jobs: defineTable({
		sourceType: v.string(),
		sourceIds: v.array(v.string()),
		selectedFields: v.array(v.string()),
		extractionType: v.string(),
		status: v.union(
			v.literal('pending'),
			v.literal('running'),
			v.literal('completed'),
			v.literal('failed'),
			v.literal('cancelled')
		),
		batchSize: v.number(),
		totalItems: v.number(),
		processedItems: v.number(),
		failedItems: v.number(),
		extractedCount: v.number(),
		resultIds: v.array(v.string()),
		error: v.optional(v.string()),
		startedAt: v.optional(v.number()),
		completedAt: v.optional(v.number()),
		createdBy: v.string(),
		createdAt: v.number()
	})
		.index('by_status', ['status'])
		.index('by_sourceType', ['sourceType'])
		.index('by_extractionType', ['extractionType'])
		.index('by_createdAt', ['createdAt'])
		.index('by_createdBy', ['createdBy']),
	groups: defineTable({
		name: v.string(),
		groupname: v.string(),
		description: v.optional(v.string()),
		ownerId: v.string(), // userId from better-auth
		inviteCode: v.string(),
		icon: v.optional(v.string()),
		isPublic: v.boolean(),
		createdAt: v.number()
	})
		.index('by_invite_code', ['inviteCode'])
		.index('by_groupname', ['groupname'])
		.index('by_public', ['isPublic'])
		.searchIndex('search_name', {
			searchField: 'name',
			filterFields: ['isPublic']
		}),
	group_memberships: defineTable({
		userId: v.string(),
		groupId: v.id('groups'),
		role: v.union(v.literal('admin'), v.literal('member')),
		status: v.union(v.literal('active'), v.literal('pending')),
		joinedAt: v.number()
	})
		.index('by_user', ['userId'])
		.index('by_group', ['groupId'])
		.index('by_user_group', ['userId', 'groupId'])
		.index('by_group_status', ['groupId', 'status']),
	group_shared_content: defineTable({
		groupId: v.id('groups'),
		contentId: v.optional(v.id('content')),
		blogId: v.optional(v.id('blogs')),
		newsId: v.optional(v.id('news')),
		entityId: v.optional(v.id('entities')),
		sharedById: v.string(),
		sharedAt: v.number()
	})
		.index('by_group', ['groupId'])
		.index('by_shared_by', ['sharedById'])
		.index('by_entity', ['entityId'])
		.index('by_group_content', ['groupId', 'contentId'])
		.index('by_group_blog', ['groupId', 'blogId'])
		.index('by_group_news', ['groupId', 'newsId'])
		.index('by_group_entity', ['groupId', 'entityId']),

	highlights: defineTable({
		userId: v.string(),
		userName: v.optional(v.string()),
		groupId: v.optional(v.id('groups')),
		contentId: v.optional(v.id('content')),
		blogId: v.optional(v.id('blogs')),
		serializedRange: v.string(),
		text: v.string(),
		color: v.string(),
		createdAt: v.number()
	})
		.index('by_user', ['userId'])
		.index('by_user_content', ['userId', 'contentId'])
		.index('by_user_blog', ['userId', 'blogId'])
		.index('by_group_content', ['groupId', 'contentId'])
		.index('by_group_blog', ['groupId', 'blogId']),

	group_shared_highlights: defineTable({
		groupId: v.id('groups'),
		contentId: v.optional(v.id('content')),
		blogId: v.optional(v.id('blogs')),
		sharedById: v.string(),
		sharedAt: v.number()
	})
		.index('by_group_content', ['groupId', 'contentId'])
		.index('by_group_blog', ['groupId', 'blogId'])
		.index('by_shared_by', ['sharedById']),

	inline_comments: defineTable({
		highlightId: v.id('highlights'),
		userId: v.string(),
		userName: v.optional(v.string()),
		body: v.string(),
		parentId: v.optional(v.id('inline_comments')),
		createdAt: v.number()
	})
		.index('by_highlight', ['highlightId'])
		.index('by_parent', ['parentId']),

	inline_comment_reactions: defineTable({
		commentId: v.id('inline_comments'),
		userId: v.string(),
		like_dislike: v.number()
	})
		.index('by_comment', ['commentId'])
		.index('by_comment_user', ['commentId', 'userId']),

	// Multi-Agent System Tables
	agents: defineTable({
		name: v.string(),
		displayName: v.string(),
		description: v.string(),
		mode: v.union(v.literal('primary'), v.literal('subagent')),
		model: v.string(),
		temperature: v.number(),
		instructions: v.string(),
		maxSteps: v.number(),
		isEnabled: v.boolean(),
		isAdminOnly: v.boolean(),
		availableTools: v.array(v.string()),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_name', ['name'])
		.index('by_enabled', ['isEnabled'])
		.index('by_admin_only', ['isAdminOnly'])
		.index('by_enabled_and_admin_only', ['isEnabled', 'isAdminOnly']),

	agent_sessions: defineTable({
		threadId: v.id('threads'),
		parentSessionId: v.optional(v.id('agent_sessions')),
		agentName: v.string(),
		userId: v.string(),
		promptMessageId: v.id('messages'),
		status: v.union(
			v.literal('idle'),
			v.literal('running'),
			v.literal('completed'),
			v.literal('error')
		),
		depth: v.number(),
		toolCalls: v.optional(v.array(v.any())),
		startedAt: v.number(),
		completedAt: v.optional(v.number()),
		cost: v.optional(v.number()),
		errorMessage: v.optional(v.string())
	})
		.index('by_thread', ['threadId'])
		.index('by_parent', ['parentSessionId'])
		.index('by_user', ['userId'])
		.index('by_prompt_message', ['promptMessageId'])
		.index('by_depth', ['threadId', 'depth'])
		.index('by_status', ['status']),

	tool_executions: defineTable({
		sessionId: v.id('agent_sessions'),
		toolName: v.string(),
		status: v.union(v.literal('running'), v.literal('completed'), v.literal('error')),
		input: v.any(),
		output: v.optional(v.any()),
		startedAt: v.number(),
		completedAt: v.optional(v.number()),
		errorMessage: v.optional(v.string())
	})
		.index('by_session', ['sessionId'])
		.index('by_status', ['sessionId', 'status']),

	intent_rules: defineTable({
		pattern: v.string(),
		agentName: v.string(),
		priority: v.number(),
		isEnabled: v.boolean(),
		confidence: v.number()
	})
		.index('by_pattern', ['pattern'])
		.index('by_priority', ['priority'])
		.index('by_agent', ['agentName']),

	task_configs: defineTable({
		task: v.string(), // e.g., 'extraction', 'flashcards', 'synthesis'
		modelId: v.string(), // references models.modelId
		temperature: v.optional(v.number()),
		maxTokens: v.optional(v.number()),
		updatedAt: v.number()
	}).index('by_task', ['task']),
	group_chat_messages: defineTable({
		groupId: v.id('groups'),
		userId: v.string(),
		userName: v.string(),
		userImage: v.optional(v.string()),
		body: v.string(),
		replyTo: v.optional(v.id('group_chat_messages')),
		editedAt: v.optional(v.number()),
		isDeleted: v.optional(v.boolean()),
		createdAt: v.number()
	})
		.index('by_group_created_at', ['groupId', 'createdAt'])
		.index('by_reply_to', ['replyTo']),
	group_chat_reactions: defineTable({
		groupId: v.id('groups'),
		messageId: v.id('group_chat_messages'),
		userId: v.string(),
		emoji: v.string(),
		createdAt: v.number()
	})
		.index('by_message', ['messageId'])
		.index('by_message_user_emoji', ['messageId', 'userId', 'emoji'])
		.index('by_group', ['groupId'])
		.index('by_group_message', ['groupId', 'messageId']),
	mcqs: defineTable({
		question: v.string(),
		option_a: v.string(),
		option_b: v.string(),
		option_c: v.string(),
		option_d: v.string(),
		correct_option: v.union(
			v.literal('A'),
			v.literal('B'),
			v.literal('C'),
			v.literal('D'),
			v.literal('X')
		),
		exam: v.string(),
		mcq_type: v.string(),
		year: v.number(),
		question_no: v.number(),
		tags: v.array(v.string()),
		search_text: v.string(),
		is_vectorised: v.boolean(),
		ragEntryId: v.optional(v.string()),
		is_similarity_cached: v.optional(v.boolean()),
		similarity_cache_count: v.optional(v.number()),
		similarity_cache_updated_at: v.optional(v.number()),
		similarity_cache_model_id: v.optional(v.string()),
		similarity_cache_dimension: v.optional(v.number()),
		similarity_cache_namespace_version: v.optional(v.number())
	})
		.index('by_exam', ['exam'])
		.index('by_year', ['year'])
		.index('by_mcq_type', ['mcq_type'])
		.index('by_is_vectorised', ['is_vectorised'])
		.index('by_is_similarity_cached', ['is_similarity_cached'])
		.index('by_exam_year', ['exam', 'year'])
		.searchIndex('search_question', {
			searchField: 'question',
			filterFields: ['exam', 'mcq_type', 'year']
		}),
	mcq_similarities: defineTable({
		mcqId: v.id('mcqs'),
		relatedMcqId: v.id('mcqs'),
		score: v.number(),
		rank: v.number(),
		source: v.union(v.literal('auto'), v.literal('manual')),
		modelId: v.string(),
		dimension: v.number(),
		namespace: v.string(),
		namespaceVersion: v.number(),
		generatedAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_mcq_and_rank', ['mcqId', 'rank'])
		.index('by_mcq_and_related', ['mcqId', 'relatedMcqId'])
		.index('by_related_mcq', ['relatedMcqId'])
		.index('by_generated_at', ['generatedAt']),
	mcq_responses: defineTable({
		userId: v.string(),
		mcqId: v.id('mcqs'),
		selectedOption: v.string(),
		isCorrect: v.boolean(),
		createdAt: v.number()
	})
		.index('by_user', ['userId'])
		.index('by_user_mcq', ['userId', 'mcqId'])
		.index('by_created_at', ['createdAt']),
	mcq_metadata: defineTable({
		type: v.literal('aggregate'),
		exams: v.array(v.string()),
		years: v.array(v.number()),
		tags: v.array(v.string()),
		types: v.array(v.string()),
		updatedAt: v.number()
	}).index('by_type', ['type']),
	mcq_stats: defineTable({
		type: v.literal('aggregate'),
		total: v.number(),
		vectorised: v.number(),
		pending: v.number(),
		similarityCached: v.number(),
		similarityPending: v.number(),
		updatedAt: v.number()
	}).index('by_type', ['type'])
});

export default schema;
