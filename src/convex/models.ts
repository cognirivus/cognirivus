import { action, internalMutation, internalQuery, query } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { authComponent } from './auth';

// ============================================================================
// Pricing Types
// ============================================================================

export interface ModelPricing {
	modelId: string;
	promptCostPer1k: number;
	completionCostPer1k: number;
	source: 'database' | 'default';
}

// Default pricing fallback (per 1k tokens)
const DEFAULT_PRICING = {
	promptCostPer1k: 0.001,
	completionCostPer1k: 0.002
};

/**
 * Lists all enabled AI models, optionally filtered by type.
 *
 * Models are synced from OpenRouter and stored in the database.
 *
 * @param type - Optional filter: 'chat' or 'embedding'
 * @returns A list of enabled models.
 */
export const list = query({
	args: {
		type: v.optional(v.union(v.literal('chat'), v.literal('embedding')))
	},
	handler: async (ctx, { type }) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return [];

		if (type) {
			return ctx.db
				.query('models')
				.withIndex('by_type_enabled', (q) => q.eq('type', type).eq('isEnabled', true))
				.collect();
		}

		return ctx.db
			.query('models')
			.withIndex('by_enabled', (q) => q.eq('isEnabled', true))
			.collect();
	}
});

/**
 * Action to sync available models from the OpenRouter API.
 *
 * Fetches both chat and embedding models and updates the database.
 *
 * @returns An object containing the number of synced chat and embedding models.
 * @throws {Error} if the user is not authenticated or the OpenRouter API call fails.
 */
export const syncFromOpenRouter = action({
	args: {},
	handler: async (ctx) => {
		const user = await authComponent.getAuthUser(ctx);
		const isAdmin =
			user?.role &&
			(Array.isArray(user.role) ? user.role.includes('admin') : user.role === 'admin');

		if (!isAdmin) {
			throw new Error('Unauthorized access to syncFromOpenRouter: Admin only');
		}

		const headers = {
			Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
			'HTTP-Referer': 'https://cognirivus.vercel.app',
			'X-Title': 'Cognirivus Chat'
		};

		// Fetch chat models
		const chatResponse = await fetch('https://openrouter.ai/api/v1/models', { headers });
		if (!chatResponse.ok) {
			throw new Error(`OpenRouter chat models error: ${chatResponse.statusText}`);
		}
		const chatData = await chatResponse.json();
		const chatModels = chatData.data;

		// Fetch embedding models
		const embeddingResponse = await fetch('https://openrouter.ai/api/v1/embeddings/models', {
			headers
		});
		if (!embeddingResponse.ok) {
			throw new Error(`OpenRouter embedding models error: ${embeddingResponse.statusText}`);
		}
		const embeddingData = await embeddingResponse.json();
		const embeddingModels = embeddingData.data;

		// Update both in database
		await ctx.runMutation(internal.models.updateModels, {
			models: chatModels,
			type: 'chat'
		});
		await ctx.runMutation(internal.models.updateModels, {
			models: embeddingModels,
			type: 'embedding'
		});

		return { chatCount: chatModels.length, embeddingCount: embeddingModels.length };
	}
});

/**
 * Internal mutation to update or insert models in the database.
 *
 * @param models - An array of raw model objects from OpenRouter.
 * @param type - The model type: 'chat' or 'embedding'.
 */
export const updateModels = internalMutation({
	args: {
		models: v.array(v.any()),
		type: v.union(v.literal('chat'), v.literal('embedding'))
	},
	handler: async (ctx, { models, type }) => {
		const now = Date.now();

		for (const model of models) {
			const existing = await ctx.db
				.query('models')
				.withIndex('by_model_id', (q) => q.eq('modelId', model.id))
				.unique();

			if (existing) {
				await ctx.db.patch(existing._id, {
					name: model.name,
					type,
					attributes: model,
					lastUpdated: now
				});
			} else {
				await ctx.db.insert('models', {
					modelId: model.id,
					name: model.name,
					type,
					attributes: model,
					isEnabled: true,
					lastUpdated: now
				});
			}
		}
	}
});

// ============================================================================
// Pricing Queries
// ============================================================================

/**
 * Get pricing information for a specific model.
 * Extracts pricing from OpenRouter model attributes stored in the database.
 *
 * @param modelId - The OpenRouter model ID (e.g., 'openai/gpt-4o')
 * @returns Pricing per 1k tokens for prompt and completion
 */
export const getPricing = internalQuery({
	args: {
		modelId: v.string()
	},
	handler: async (ctx, { modelId }): Promise<ModelPricing> => {
		const model = await ctx.db
			.query('models')
			.withIndex('by_model_id', (q) => q.eq('modelId', modelId))
			.unique();

		if (!model?.attributes?.pricing) {
			return {
				modelId,
				...DEFAULT_PRICING,
				source: 'default'
			};
		}

		// OpenRouter stores pricing per token, we convert to per 1k tokens
		const pricing = model.attributes.pricing;
		const promptCostPer1k = (parseFloat(pricing.prompt) || 0) * 1000;
		const completionCostPer1k = (parseFloat(pricing.completion) || 0) * 1000;

		return {
			modelId,
			promptCostPer1k: promptCostPer1k || DEFAULT_PRICING.promptCostPer1k,
			completionCostPer1k: completionCostPer1k || DEFAULT_PRICING.completionCostPer1k,
			source: 'database'
		};
	}
});

/**
 * Calculate cost for a given model and token usage.
 *
 * @param modelId - The OpenRouter model ID
 * @param promptTokens - Number of prompt tokens
 * @param completionTokens - Number of completion tokens
 * @returns Total cost in USD
 */
export const calculateCost = internalQuery({
	args: {
		modelId: v.string(),
		promptTokens: v.number(),
		completionTokens: v.number()
	},
	handler: async (ctx, { modelId, promptTokens, completionTokens }): Promise<number> => {
		const model = await ctx.db
			.query('models')
			.withIndex('by_model_id', (q) => q.eq('modelId', modelId))
			.unique();

		let promptCostPer1k = DEFAULT_PRICING.promptCostPer1k;
		let completionCostPer1k = DEFAULT_PRICING.completionCostPer1k;

		if (model?.attributes?.pricing) {
			const pricing = model.attributes.pricing;
			promptCostPer1k = (parseFloat(pricing.prompt) || 0) * 1000 || DEFAULT_PRICING.promptCostPer1k;
			completionCostPer1k =
				(parseFloat(pricing.completion) || 0) * 1000 || DEFAULT_PRICING.completionCostPer1k;
		}

		const promptCost = (promptTokens / 1000) * promptCostPer1k;
		const completionCost = (completionTokens / 1000) * completionCostPer1k;

		return promptCost + completionCost;
	}
});
