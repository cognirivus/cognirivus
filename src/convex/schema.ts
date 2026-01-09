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
		images: v.optional(v.array(v.id('_storage')))
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
		messageId: v.id('messages'),
		model: v.string(),
		promptTokens: v.number(),
		completionTokens: v.number(),
		totalTokens: v.number(),
		cost: v.optional(v.number()),
		createdAt: v.number(),
		metadata: v.optional(v.any())
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
		createdAt: v.number()
	})
		.index('by_user', ['userId'])
		.index('by_created_at', ['createdAt']),
	cancellations: defineTable({
		messageId: v.id('messages')
	}).index('by_message', ['messageId'])
});

export default schema;
