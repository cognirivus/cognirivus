import { action, query, mutation, internalMutation } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { authComponent } from './auth';
import { getGenerationStats } from './lib/llm_client';

// Aspect ratio to dimensions mapping
const ASPECT_DIMENSIONS: Record<string, { width: number; height: number }> = {
	'1:1': { width: 1024, height: 1024 },
	'16:9': { width: 1344, height: 768 },
	'9:16': { width: 768, height: 1344 },
	'4:3': { width: 1184, height: 864 },
	'3:4': { width: 864, height: 1184 },
	'3:2': { width: 1248, height: 832 },
	'2:3': { width: 832, height: 1248 }
};

/**
 * Fetches a list of AI models capable of generating images from OpenRouter.
 *
 * Filters OpenRouter's model list for architectures that support 'image' output modalities.
 *
 * @returns A list of image-capable models with their IDs and names.
 * @throws {Error} if the user is not authenticated or the OpenRouter API call fails.
 */
export const listImageModels = action({
	args: {},
	handler: async (ctx) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Unauthorized');

		const response = await fetch('https://openrouter.ai/api/v1/models', {
			headers: {
				Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
				'HTTP-Referer': 'https://cognirivus.vercel.app',
				'X-Title': 'Cognirivus Chat'
			}
		});

		if (!response.ok) {
			throw new Error(`OpenRouter error: ${response.statusText}`);
		}

		const data = await response.json();
		// Filter for models with 'image' in output_modalities
		return data.data
			.filter((m: any) => m.architecture?.output_modalities?.includes('image'))
			.map((m: any) => ({
				id: m.id,
				name: m.name,
				pricing: m.pricing
			}));
	}
});

/**
 * Generates an image based on a text prompt.
 *
 * Supports multiple providers (OpenRouter, Modal).
 * Performs the following:
 * 1. Calls the selected provider's API with the prompt and parameters.
 * 2. Stores the resulting image in Convex Storage.
 * 3. Saves a record of the generation in the database.
 * 4. Returns a signed URL for immediate display.
 *
 * @param provider - The image generation provider ('openrouter' or 'modal').
 * @param prompt - The text description of the image to generate.
 * @param aspectRatio - The desired aspect ratio (e.g., '1:1', '16:9').
 * @param model - Optional. Specific model ID for OpenRouter.
 * @param negativePrompt - Optional. What to exclude from the image.
 * @param steps - Optional. Number of inference steps (default 30).
 * @param guidance - Optional. Guidance scale (default 7.5).
 * @param seed - Optional. Random seed for reproducibility.
 * @returns An object containing the signed URL and the storage ID.
 * @throws {Error} if the user is not authenticated or generation fails.
 */
export const generate = action({
	args: {
		provider: v.union(v.literal('openrouter'), v.literal('modal')),
		prompt: v.string(),
		aspectRatio: v.string(),
		model: v.optional(v.string()),
		negativePrompt: v.optional(v.string()),
		steps: v.optional(v.number()),
		guidance: v.optional(v.number()),
		seed: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Unauthorized');
		const userId = user._id;

		const { provider, prompt, aspectRatio, model, negativePrompt, steps, guidance, seed } = args;
		const dimensions = ASPECT_DIMENSIONS[aspectRatio] || ASPECT_DIMENSIONS['1:1'];

		let imageBlob: Blob;

		if (provider === 'modal') {
			const modalEndpoint = process.env.MODAL_IMAGE_ENDPOINT;
			if (!modalEndpoint) {
				throw new Error('MODAL_IMAGE_ENDPOINT environment variable is not set');
			}

			const response = await fetch(modalEndpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					accept: 'application/json'
				},
				body: JSON.stringify({
					prompt,
					negative_prompt: negativePrompt || '',
					height: dimensions.height,
					width: dimensions.width,
					seed: seed || Math.floor(Math.random() * 1000000),
					num_inference_steps: steps || 30,
					guidance_scale: guidance || 7.5
				})
			});

			if (!response.ok) {
				throw new Error(`Modal error: ${response.statusText}`);
			}

			imageBlob = await response.blob();
		} else {
			// OpenRouter image generation
			const modelToUse = model || 'google/gemini-2.5-flash-image-preview';

			const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
					'HTTP-Referer': 'https://cognirivus.vercel.app',
					'X-Title': 'Cognirivus Chat',
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					model: modelToUse,
					messages: [{ role: 'user', content: prompt }],
					modalities: ['image', 'text'],
					image_config: { aspect_ratio: aspectRatio }
				})
			});

			if (!response.ok) {
				throw new Error(`OpenRouter error: ${response.statusText}`);
			}

			// Get generation ID for usage tracking
			const generationId = response.headers.get('x-openrouter-id');

			const data = await response.json();
			const images = data.choices?.[0]?.message?.images;

			if (!images || images.length === 0) {
				throw new Error('No image generated');
			}

			// Log usage for OpenRouter image generation
			if (generationId) {
				try {
					const stats = await getGenerationStats(generationId);
					if (stats) {
						await ctx.runMutation(internal.usage.logUsage, {
							userId,
							purpose: 'image_generation',
							model: stats.model || modelToUse,
							promptTokens: stats.native_tokens_prompt ?? stats.tokens_prompt ?? 0,
							completionTokens: stats.native_tokens_completion ?? stats.tokens_completion ?? 0,
							totalTokens:
								(stats.native_tokens_prompt ?? stats.tokens_prompt ?? 0) +
								(stats.native_tokens_completion ?? stats.tokens_completion ?? 0),
							cost: stats.usage ?? stats.total_cost ?? 0,
							raw_response: stats
						});
					}
				} catch (e) {
					console.warn('[Image] Failed to log usage:', e);
				}
			}

			// Parse base64 image
			const imageData = images[0].image_url?.url;
			if (!imageData) throw new Error('No image URL in response');

			const match = imageData.match(/^data:(image\/[a-z]+);base64,(.*)$/);
			if (!match) throw new Error('Invalid image data format');

			const contentType = match[1];
			const base64Data = match[2];
			const binaryString = atob(base64Data);
			const bytes = new Uint8Array(binaryString.length);
			for (let i = 0; i < binaryString.length; i++) {
				bytes[i] = binaryString.charCodeAt(i);
			}
			imageBlob = new Blob([bytes], { type: contentType });
		}

		// Store image in Convex Storage
		const storageId = await ctx.storage.store(imageBlob);

		// Save to database
		await ctx.runMutation(internal.image.saveGeneration, {
			userId,
			prompt,
			negativePrompt,
			provider,
			model: provider === 'openrouter' ? model : undefined,
			aspectRatio,
			width: dimensions.width,
			height: dimensions.height,
			imageId: storageId
		});

		// Get signed URL
		const url = await ctx.storage.getUrl(storageId);

		return { url, storageId };
	}
});

/**
 * Internal mutation to save a generated image record to the database.
 *
 * @param userId - ID of the user who generated the image.
 * @param prompt - The generation prompt.
 * @param negativePrompt - Optional. The negative prompt used.
 * @param provider - The generation provider.
 * @param model - Optional. The model used.
 * @param aspectRatio - The aspect ratio.
 * @param width - The image width in pixels.
 * @param height - The image height in pixels.
 * @param imageId - The Convex storage ID.
 * @param messageId - Optional. The chat message ID if generated within a thread.
 */
export const saveGeneration = internalMutation({
	args: {
		userId: v.string(),
		prompt: v.string(),
		negativePrompt: v.optional(v.string()),
		provider: v.string(),
		model: v.optional(v.string()),
		aspectRatio: v.string(),
		width: v.number(),
		height: v.number(),
		imageId: v.id('_storage'),
		messageId: v.optional(v.id('messages'))
	},
	handler: async (ctx, args) => {
		await ctx.db.insert('generated_images', {
			...args,
			createdAt: Date.now()
		});
	}
});

/**
 * Lists the most recent generated images for the authenticated user.
 *
 * Returns both standalone images and those generated during chat sessions.
 *
 * @returns A list of generated images with signed URLs and metadata.
 */
export const list = query({
	args: {},
	handler: async (ctx) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return [];

		// All images are now in generated_images table (both standalone and chat-generated)
		const images = await ctx.db
			.query('generated_images')
			.withIndex('by_user', (q) => q.eq('userId', user._id))
			.order('desc')
			.take(50);

		return Promise.all(
			images.map(async (img) => ({
				id: img._id,
				prompt: img.prompt,
				negativePrompt: img.negativePrompt,
				url: await ctx.storage.getUrl(img.imageId),
				createdAt: img.createdAt,
				source: img.messageId ? ('chat' as const) : ('image' as const),
				messageId: img.messageId,
				provider: img.provider,
				model: img.model,
				aspectRatio: img.aspectRatio,
				width: img.width,
				height: img.height
			}))
		);
	}
});

/**
 * Removes a generated image from the database and storage.
 *
 * If the image was part of a chat message, it updates the message's
 * image lists accordingly.
 *
 * @param id - The ID of the `generated_images` record to remove.
 * @throws {Error} if the user is not authenticated, image not found, or unauthorized.
 */
export const remove = mutation({
	args: {
		id: v.id('generated_images')
	},
	handler: async (ctx, { id }) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Unauthorized');

		const image = await ctx.db.get(id);
		if (!image) throw new Error('Image not found');
		if (image.userId !== user._id) throw new Error('Unauthorized');

		// Delete from storage
		await ctx.storage.delete(image.imageId);

		// If this was a chat image, move from images to deletedImages
		if (image.messageId) {
			const message = await ctx.db.get(image.messageId);
			if (message && message.images) {
				const updatedImages = message.images.filter((imgId) => imgId !== image.imageId);
				const deletedImages = [...(message.deletedImages || []), image.imageId];
				await ctx.db.patch(image.messageId, {
					images: updatedImages.length > 0 ? updatedImages : undefined,
					deletedImages
				});
			}
		}

		// Delete from generated_images table
		await ctx.db.delete(id);
	}
});
