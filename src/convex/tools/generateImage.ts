// Tool: generateImage - Generate images using existing image generation
import type { ToolDefinition } from './types';
import { api } from '../_generated/api';

export const generateImageTool: ToolDefinition = {
	name: 'generateImage',
	description:
		'Generate an image using AI image generation models. Creates an image based on a text prompt.',
	parameters: {
		type: 'object',
		properties: {
			prompt: {
				type: 'string',
				description: 'The text prompt describing the image to generate'
			},
			provider: {
				type: 'string',
				enum: ['openrouter', 'modal'],
				description: 'Image generation provider to use',
				default: 'modal'
			},
			aspectRatio: {
				type: 'string',
				description: 'Aspect ratio of the image (1:1, 16:9, 9:16, 4:3, 3:4)',
				default: '1:1'
			},
			negativePrompt: {
				type: 'string',
				description: 'Things to avoid in the generated image',
				default: ''
			}
		},
		required: ['prompt']
	},
	handler: async (ctx, args, session) => {
		// Use the existing image generation action
		const result = await ctx.runAction(api.image.generate, {
			provider: args.provider || 'modal',
			prompt: args.prompt,
			aspectRatio: args.aspectRatio || '1:1',
			negativePrompt: args.negativePrompt
		});

		return {
			success: true,
			data: {
				storageId: result.storageId,
				url: result.url,
				prompt: args.prompt
			}
		};
	},
	isAdminOnly: false
};
