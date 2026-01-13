import { action, internalMutation, query } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { getAuthUserId } from '@convex-dev/auth/server';

export const list = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) return [];

		return await ctx.db
			.query('models')
			.withIndex('by_enabled', (q) => q.eq('isEnabled', true))
			.collect();
	}
});

export const syncFromOpenRouter = action({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new Error('Unauthorized');

		const response = await fetch('https://openrouter.ai/api/v1/models', {
			headers: {
				Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
				'HTTP-Referer': 'https://cognirivus-chat.vercel.app',
				'X-Title': 'Cognirivus Chat'
			}
		});

		if (!response.ok) {
			throw new Error(`OpenRouter error: ${response.statusText}`);
		}

		const data = await response.json();
		const models = data.data;

		await ctx.runMutation(internal.models.updateModels, { models });
		return { count: models.length };
	}
});

export const updateModels = internalMutation({
	args: {
		models: v.array(v.any())
	},
	handler: async (ctx, { models }) => {
		const now = Date.now();

		for (const model of models) {
			const existing = await ctx.db
				.query('models')
				.withIndex('by_model_id', (q) => q.eq('modelId', model.id))
				.unique();

			if (existing) {
				await ctx.db.patch(existing._id, {
					name: model.name,
					attributes: model,
					lastUpdated: now
				});
			} else {
				await ctx.db.insert('models', {
					modelId: model.id,
					name: model.name,
					attributes: model,
					isEnabled: true,
					lastUpdated: now
				});
			}
		}
	}
});
