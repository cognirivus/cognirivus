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
import { authTables } from '@convex-dev/auth/server';
import { v } from 'convex/values';

const schema = defineSchema({
	...authTables,
	messages: defineTable({
		body: v.string(),
		reasoning: v.optional(v.string()),
		userId: v.id('users'),
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
		userId: v.id('users'),
		updatedAt: v.number()
	}).index('by_user', ['userId']),
	usage_logs: defineTable({
		userId: v.id('users'),
		messageId: v.optional(v.id('messages')),
		purpose: v.optional(v.string()), // 'chat', 'memory_extraction', 'embedding', 'dedupe_judge', 'standalone_query'
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
		userId: v.id('users'),
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
		userId: v.id('users'),
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
		attributes: v.any(), // Raw JSON from OpenRouter
		isEnabled: v.boolean(),
		lastUpdated: v.number()
	})
		.index('by_model_id', ['modelId'])
		.index('by_enabled', ['isEnabled'])
});

export default schema;
