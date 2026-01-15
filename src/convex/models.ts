import { action, internalMutation, query } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { authComponent } from './auth';

/**
 * Lists all enabled AI models.
 *
 * models are synced from OpenRouter and stored in the database.
 *
 * @returns A list of enabled models.
 */
export const list = query({
	args: {},
	handler: async (ctx) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return [];

		return ctx.db
			.query('models')
			.withIndex('by_enabled', (q) => q.eq('isEnabled', true))
			.collect();
	}
});

/**
 * Action to sync available models from the OpenRouter API.
 *
 * Fetches the latest model list and updates the database via an internal mutation.
 *
 * @returns An object containing the number of synced models.
 * @throws {Error} if the user is not authenticated or the OpenRouter API call fails.
 */
export const syncFromOpenRouter = action({
	args: {},
	handler: async (ctx) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Unauthorized');

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

/**
 * Internal mutation to update or insert models in the database.
 *
 * @param models - An array of raw model objects from OpenRouter.
 */
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
