/**
 * Defines the database schema for the Cognirivus Chat application.
 *
 * Includes tables for:
 * - `messages`: Chat message history with metadata and image associations.
 * - `threads`: Conversation threads.
 * - `usage_logs`: Tracking AI token usage and estimated costs.
 * - `generated_images`: Unified gallery for images generated standalone or in chat.
 * - `cancellations`: Signals for stopping background AI actions.
 * - `user_memories`: Semantic storage for long-term user personalization.
 * - `models`: Available AI models synced from OpenRouter.
 */
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

const schema = defineSchema({
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
		updatedAt: v.number()
	}).index('by_user', ['userId', 'updatedAt']),
	usage_logs: defineTable({
		userId: v.string(),
		messageId: v.optional(v.id('messages')),
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
		attributes: v.any(),
		isEnabled: v.boolean(),
		lastUpdated: v.number()
	})
		.index('by_model_id', ['modelId'])
		.index('by_enabled', ['isEnabled']),
	blogs: defineTable({
		title: v.string(),
		content: v.string(),
		authorId: v.string(),
		createdAt: v.number(),
		published: v.boolean(),
		/** RAG entry ID for vector search (used for cleanup on deletion) */
		ragEntryId: v.optional(v.string())
	})
		.index('by_created_at', ['createdAt'])
		.index('by_published', ['published'])
		.searchIndex('search_content', {
			searchField: 'content',
			filterFields: ['published']
		}),
	blog_reactions: defineTable({
		blogId: v.id('blogs'),
		userId: v.string(),
		like_dislike: v.number() // 1 for like, -1 for dislike
	})
		.index('by_blog', ['blogId'])
		.index('by_blog_user', ['blogId', 'userId']),
	blog_comments: defineTable({
		blogId: v.id('blogs'),
		userId: v.string(),
		content: v.string(),
		createdAt: v.number()
	})
		.index('by_blog', ['blogId'])
		.index('by_blog_created_at', ['blogId', 'createdAt']),
	comment_reactions: defineTable({
		commentId: v.id('blog_comments'),
		userId: v.string(),
		like_dislike: v.number() // 1 for like, -1 for dislike
	})
		.index('by_comment', ['commentId'])
		.index('by_comment_user', ['commentId', 'userId']),
	news: defineTable({
		date: v.string(),
		content: v.string()
	})
		.index('by_date', ['date'])
		.searchIndex('search_content', {
			searchField: 'content'
		}),
	content: defineTable({
		title: v.string(),
		text: v.string(),
		subjectId: v.id('subjects'),
		topic: v.string(),
		source: v.optional(v.string()),
		newsId: v.optional(v.id('news')),
		date: v.optional(v.string()),
		createdAt: v.number()
	})
		.index('by_subjectId', ['subjectId'])
		.index('by_topic', ['topic'])
		.index('by_topic_date', ['topic', 'date'])
		.index('by_created_at', ['createdAt'])
		.index('by_newsId', ['newsId'])
		.searchIndex('search_all', {
			searchField: 'text',
			filterFields: ['topic']
		}),
	subjects: defineTable({
		name: v.string(),
		gsPaper: v.number(), // 0, 1, 2, 3, 4
		slug: v.string()
	})
		.index('by_gsPaper', ['gsPaper'])
		.index('by_slug', ['slug'])
		.index('by_name', ['name']),
	entities: defineTable({
		name: v.string(),
		type: v.string(), // e.g., 'location'
		slug: v.string(),
		report: v.optional(v.string()),
		reportGeneratedAt: v.optional(v.number())
	})
		.index('by_type', ['type'])
		.index('by_slug', ['slug'])
		.index('by_name', ['name']),
	content_entities: defineTable({
		contentId: v.id('content'),
		entityId: v.id('entities')
	})
		.index('by_content', ['contentId'])
		.index('by_entity', ['entityId']),
	report_archive: defineTable({
		entityId: v.id('entities'),
		report: v.string(),
		createdAt: v.number()
	}).index('by_entity', ['entityId']),
	user_content_progress: defineTable({
		userId: v.string(),
		contentId: v.id('content'),
		completedAt: v.number()
	})
		.index('by_user', ['userId'])
		.index('by_user_content', ['userId', 'contentId'])
});

export default schema;
