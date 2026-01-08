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
		createdAt: v.number()
	}).index('by_thread', ['threadId']),
	threads: defineTable({
		title: v.string(),
		userId: v.id('users'),
		updatedAt: v.number()
	}).index('by_user', ['userId'])
});

export default schema;
