// Tool: analyzeContent - Analyze content structure
import type { ToolDefinition } from './types';
import { api } from '../_generated/api';

export const analyzeContentTool: ToolDefinition = {
	name: 'analyzeContent',
	description:
		'Analyze content structure and extract key information. Identifies topics, entities, and provides content summary.',
	parameters: {
		type: 'object',
		properties: {
			contentId: {
				type: 'string',
				description: 'The ID of the content to analyze'
			}
		},
		required: ['contentId']
	},
	handler: async (ctx, args, session) => {
		const content = await ctx.runQuery(api.content.getById, {
			id: args.contentId
		});

		if (!content) {
			return {
				success: false,
				error: 'Content not found'
			};
		}

		// Get flashcards count
		const flashcards = await ctx.runQuery(api.flashcards.listByContent, {
			contentId: args.contentId
		});

		return {
			success: true,
			data: {
				id: content._id,
				title: content.title,
				topic: content.topic,
				source: content.source,
				date: content.date,
				flashcardCount: flashcards.length,
				createdAt: content.createdAt
			}
		};
	},
	isAdminOnly: false
};
