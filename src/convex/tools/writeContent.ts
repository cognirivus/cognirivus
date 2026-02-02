// Tool: writeContent - Write blog/content entries
import type { ToolDefinition } from './types';
import { api } from '../_generated/api';

export const writeContentTool: ToolDefinition = {
	name: 'writeContent',
	description:
		'Write a new blog post or content entry. Creates a blog with title, snippet, and optional full content stored in R2.',
	parameters: {
		type: 'object',
		properties: {
			title: {
				type: 'string',
				description: 'Title of the blog post'
			},
			body: {
				type: 'string',
				description: 'Full blog content (will be stored in R2)'
			},
			published: {
				type: 'boolean',
				description: 'Whether to publish the blog immediately (default: true)',
				default: true
			}
		},
		required: ['title', 'body']
	},
	handler: async (ctx, args, session) => {
		// Create blog using existing action (blogs.create is an action, not mutation)
		const blogId = await ctx.runAction(api.blogs.create, {
			title: args.title,
			body: args.body,
			published: args.published !== false
		});

		return {
			success: true,
			data: {
				id: blogId,
				title: args.title,
				published: args.published !== false,
				authorId: session.userId,
				createdAt: Date.now(),
				message: 'Blog created successfully'
			}
		};
	},
	isAdminOnly: false
};
