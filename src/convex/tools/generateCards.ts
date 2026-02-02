// Tool: generateCards - Generate flashcards
import type { ToolDefinition } from './types';
import { api } from '../_generated/api';

export const generateCardsTool: ToolDefinition = {
	name: 'generateCards',
	description:
		'Generate flashcards for a specific content item. Creates question-answer pairs for study purposes.',
	parameters: {
		type: 'object',
		properties: {
			contentId: {
				type: 'string',
				description: 'ID of the content to generate flashcards for'
			}
		},
		required: ['contentId']
	},
	handler: async (ctx, args, session) => {
		// Get content first to verify it exists
		const content = await ctx.runQuery(api.content.getById, {
			id: args.contentId
		});

		if (!content) {
			return {
				success: false,
				error: 'Content not found'
			};
		}

		// Use existing flashcard generation action (has admin check internally)
		const result = await ctx.runAction(api.flashcards.generateFromContent, {
			contentId: args.contentId
		});

		return {
			success: result.success,
			data: {
				contentId: args.contentId,
				contentTitle: content.title,
				generatedCount: result.count,
				message: result.success
					? `Successfully generated ${result.count} flashcards`
					: `Failed to generate flashcards: ${result.error}`
			}
		};
	},
	isAdminOnly: true
};
