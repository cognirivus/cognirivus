import { action, query, internalMutation } from './_generated/server';
import { v } from 'convex/values';
import { api, internal } from './_generated/api';
import { getAuthUserId } from '@convex-dev/auth/server';

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

// Fetch image-capable models from OpenRouter
export const listImageModels = action({
	args: {},
	handler: async () => {
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
		// Filter for models with 'image' in output_modalities
		return data.data
			.filter((m: any) => m.architecture?.output_modalities?.includes('image'))
			.map((m: any) => ({
				id: m.id,
				name: m.name
			}));
	}
});

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
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new Error('Unauthorized');

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
					'HTTP-Referer': 'https://cognirivus-chat.vercel.app',
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

			const data = await response.json();
			const images = data.choices?.[0]?.message?.images;

			if (!images || images.length === 0) {
				throw new Error('No image generated');
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

export const saveGeneration = internalMutation({
	args: {
		userId: v.id('users'),
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

export const list = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) return [];

		// All images are now in generated_images table (both standalone and chat-generated)
		const images = await ctx.db
			.query('generated_images')
			.withIndex('by_user', (q) => q.eq('userId', userId))
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
