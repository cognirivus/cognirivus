// Tool: searchBlogs - Search blogs using text/vector search
import type { ToolDefinition } from './types';
import { internal } from '../_generated/api';

export const searchBlogsTool: ToolDefinition = {
	name: 'searchBlogs',
	description:
		'Search through published blogs using full-text search. Finds blogs matching the search query.',
	parameters: {
		type: 'object',
		properties: {
			query: {
				type: 'string',
				description: 'The search query text to find relevant blogs'
			},
			limit: {
				type: 'number',
				description: 'Maximum number of blogs to return (default: 10)',
				default: 10
			}
		},
		required: ['query']
	},
	handler: async (ctx, args, session) => {
		const results = await ctx.runQuery(internal.blogs.searchInternal, {
			query: args.query,
			limit: args.limit || 10
		});

		return {
			success: true,
			data: {
				blogs: results.map((blog: any) => ({
					id: blog._id,
					title: blog.title,
					snippet: blog.snippet,
					authorId: blog.authorId,
					createdAt: blog.createdAt
				})),
				count: results.length
			}
		};
	},
	isAdminOnly: false
};
