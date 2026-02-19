// Tool: searchMemories - Search user memories using vector search
import type { ToolDefinition } from './types';
import { internal } from '../_generated/api';

export const searchMemoriesTool: ToolDefinition = {
	name: 'searchMemories',
	description:
		'Search through user memories using semantic vector search. Finds memories related to a given query text.',
	parameters: {
		type: 'object',
		properties: {
			query: {
				type: 'string',
				description: 'The search query text to find relevant memories'
			},
			limit: {
				type: 'number',
				description: 'Maximum number of memories to return (default: 5)',
				default: 5
			},
			similarityThreshold: {
				type: 'number',
				description: 'Minimum similarity score between 0 and 1 to include a memory (default: 0.6).',
				default: 0.6
			}
		},
		required: ['query']
	},
	handler: async (ctx, args, session) => {
		const results = await ctx.runAction(internal.memories.searchMemories, {
			userId: session.userId,
			queryText: args.query,
			limit: args.limit || 5,
			similarityThreshold: args.similarityThreshold
		});

		return {
			success: true,
			data: {
				memories: results.map((memory: any) => ({
					id: memory._id,
					text: memory.text,
					category: memory.category,
					score: memory._score,
					createdAt: memory.createdAt
				})),
				count: results.length
			}
		};
	},
	isAdminOnly: false
};
