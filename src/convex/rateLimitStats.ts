import { query } from './_generated/server';
import { v, ConvexError } from 'convex/values';
import { rateLimiter } from './lib/rateLimits';
import { authComponent } from './auth';
import { calculateRateLimit } from '@convex-dev/rate-limiter';

/**
 * Get real-time rate limit status for the authenticated user.
 */
export const getStatus = query({
	args: {
		userId: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const currentUser = await authComponent.getAuthUser(ctx);
		if (!currentUser) return null;

		// If userId provided, must be admin
		let targetUserId: string = currentUser._id;
		if (args.userId && args.userId !== currentUser._id) {
			if (currentUser.role !== 'admin') {
				throw new ConvexError("Only admins can view other users' rate limits");
			}
			targetUserId = args.userId;
		}

		const limits = [
			// Chat / AI
			{ name: 'sendMessage', label: 'Send Messages', category: 'Chat', isImportant: true },
			{ name: 'aiGenerate', label: 'AI Responses', category: 'Chat', isImportant: true },

			// Threads
			{ name: 'createThread', label: 'Create Threads', category: 'Chat', isImportant: false },

			// Blogs
			{ name: 'createBlog', label: 'Create Blogs', category: 'Community', isImportant: true },
			{ name: 'blogReaction', label: 'Blog Reactions', category: 'Community', isImportant: false },
			{ name: 'blogComment', label: 'Blog Comments', category: 'Community', isImportant: false },

			// Content
			{
				name: 'contentReaction',
				label: 'Content Reactions',
				category: 'Library',
				isImportant: false
			},
			{
				name: 'contentComment',
				label: 'Content Comments',
				category: 'Library',
				isImportant: false
			},

			// Groups
			{ name: 'createGroup', label: 'Create Groups', category: 'Community', isImportant: true },
			{ name: 'joinGroup', label: 'Join Groups', category: 'Community', isImportant: false },
			{
				name: 'groupChatMessage',
				label: 'Group Chat Messages',
				category: 'Community',
				isImportant: false
			},

			// Highlights
			{
				name: 'createHighlight',
				label: 'Create Highlights',
				category: 'Library',
				isImportant: false
			},
			{ name: 'inlineComment', label: 'Section Comments', category: 'Library', isImportant: false },

			// Flashcards
			{
				name: 'flashcardReview',
				label: 'Flashcard Reviews',
				category: 'Learning',
				isImportant: true
			},
			{
				name: 'flashcardGenerate',
				label: 'Generate Flashcards',
				category: 'Learning',
				isImportant: true
			}
		];

		const now = Date.now();
		const results = await Promise.all(
			limits.map(async (limit) => {
				const status = await rateLimiter.getValue(ctx, limit.name as any, {
					key: targetUserId
				});

				const calculated = calculateRateLimit(status, status.config, now, 0);

				return {
					...limit,
					value: calculated.value,
					capacity: status.config.capacity ?? (status.config as any).rate,
					config: status.config,
					ts: calculated.ts
				};
			})
		);

		return results;
	}
});
