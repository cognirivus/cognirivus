import { defineSchema, defineTable } from 'convex/server';
import { authTables } from '@convex-dev/auth/server';
import { v } from 'convex/values';

const schema = defineSchema({
	...authTables,
	messages: defineTable({
		body: v.string(),
		userId: v.id('users')
	})
});

export default schema;
