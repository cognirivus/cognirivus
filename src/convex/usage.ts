import { internalMutation } from './_generated/server';
import { v } from 'convex/values';

export const logUsage = internalMutation({
	args: {
		userId: v.id('users'),
		messageId: v.id('messages'),
		model: v.string(),
		promptTokens: v.number(),
		completionTokens: v.number(),
		totalTokens: v.number(),
		cost: v.optional(v.number()),
		metadata: v.optional(v.any())
	},
	handler: async (ctx, args) => {
		await ctx.db.insert('usage_logs', {
			...args,
			createdAt: Date.now()
		});
	}
});
