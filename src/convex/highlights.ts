import { v } from 'convex/values';
import { mutation, query, type MutationCtx } from './_generated/server';
import { authComponent } from './auth';
import type { Id } from './_generated/dataModel';
import { rateLimiter } from './lib/rateLimits';

export const createHighlight = mutation({
	args: {
		contentId: v.optional(v.id('content')),
		blogId: v.optional(v.id('blogs')),
		groupId: v.optional(v.id('groups')),
		serializedRange: v.string(),
		text: v.string(),
		color: v.string()
	},
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Unauthorized');
		await rateLimiter.limit(ctx, 'createHighlight', { key: user._id, throws: true });

		if (args.groupId) {
			// Verify membership
			const membership = await ctx.db
				.query('group_memberships')
				.withIndex('by_user_group', (q) => q.eq('userId', user._id).eq('groupId', args.groupId!))
				.unique();

			if (!membership || membership.status !== 'active') {
				throw new Error('Not a member of this group');
			}
		}

		return await ctx.db.insert('highlights', {
			userId: user._id,
			userName: user.name,
			groupId: args.groupId,
			contentId: args.contentId,
			blogId: args.blogId,
			serializedRange: args.serializedRange,
			text: args.text,
			color: args.color,
			createdAt: Date.now()
		});
	}
});

export const listHighlights = query({
	args: {
		contentId: v.optional(v.id('content')),
		blogId: v.optional(v.id('blogs')),
		groupId: v.optional(v.id('groups'))
	},
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return [];

		// Case 1: Viewing in a specific Group Space
		if (args.groupId) {
			if (args.contentId) {
				return await ctx.db
					.query('highlights')
					.withIndex('by_group_content', (q) =>
						q.eq('groupId', args.groupId!).eq('contentId', args.contentId!)
					)
					.collect();
			} else if (args.blogId) {
				return await ctx.db
					.query('highlights')
					.withIndex('by_group_blog', (q) =>
						q.eq('groupId', args.groupId!).eq('blogId', args.blogId!)
					)
					.collect();
			}
			return [];
		}

		// Case 2: Viewing in Personal Space
		// Fetch only my private highlights (where groupId is undefined)
		if (args.contentId) {
			return await ctx.db
				.query('highlights')
				.withIndex('by_user_content', (q) =>
					q.eq('userId', user._id).eq('contentId', args.contentId!)
				)
				.filter((q) => q.eq(q.field('groupId'), undefined))
				.collect();
		} else if (args.blogId) {
			return await ctx.db
				.query('highlights')
				.withIndex('by_user_blog', (q) => q.eq('userId', user._id).eq('blogId', args.blogId!))
				.filter((q) => q.eq(q.field('groupId'), undefined))
				.collect();
		}

		return [];
	}
});

export const getSharingStatus = query({
	args: {
		contentId: v.optional(v.id('content')),
		blogId: v.optional(v.id('blogs'))
	},
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return false;

		let existing;
		if (args.contentId) {
			existing = await ctx.db
				.query('group_shared_highlights')
				.withIndex('by_shared_by', (q) => q.eq('sharedById', user._id))
				.filter((q) => q.eq(q.field('contentId'), args.contentId))
				.first();
		} else if (args.blogId) {
			existing = await ctx.db
				.query('group_shared_highlights')
				.withIndex('by_shared_by', (q) => q.eq('sharedById', user._id))
				.filter((q) => q.eq(q.field('blogId'), args.blogId))
				.first();
		}
		return !!existing;
	}
});

export const removeHighlight = mutation({
	args: { id: v.id('highlights') },
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Unauthorized');

		const highlight = await ctx.db.get(args.id);
		if (!highlight || highlight.userId !== user._id) throw new Error('Forbidden');

		// Delete associated comments and reactions
		const comments = await ctx.db
			.query('inline_comments')
			.withIndex('by_highlight', (q) => q.eq('highlightId', args.id))
			.collect();

		for (const comment of comments) {
			await deleteInlineCommentRecursive(ctx, comment._id);
		}

		await ctx.db.delete(args.id);
	}
});

async function deleteInlineCommentRecursive(ctx: MutationCtx, commentId: Id<'inline_comments'>) {
	const children = await ctx.db
		.query('inline_comments')
		.withIndex('by_parent', (q) => q.eq('parentId', commentId))
		.collect();

	for (const child of children) {
		await deleteInlineCommentRecursive(ctx, child._id);
	}

	const reactions = await ctx.db
		.query('inline_comment_reactions')
		.withIndex('by_comment', (q) => q.eq('commentId', commentId))
		.collect();

	for (const reaction of reactions) {
		await ctx.db.delete(reaction._id);
	}

	await ctx.db.delete(commentId);
}

export const addInlineComment = mutation({
	args: {
		highlightId: v.id('highlights'),
		body: v.string(),
		parentId: v.optional(v.id('inline_comments'))
	},
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Unauthorized');
		await rateLimiter.limit(ctx, 'inlineComment', { key: user._id, throws: true });

		return await ctx.db.insert('inline_comments', {
			highlightId: args.highlightId,
			userId: user._id,
			userName: user.name,
			body: args.body,
			parentId: args.parentId,
			createdAt: Date.now()
		});
	}
});

export const getInlineComments = query({
	args: { highlightId: v.id('highlights') },
	handler: async (ctx, args) => {
		const comments = await ctx.db
			.query('inline_comments')
			.withIndex('by_highlight', (q) => q.eq('highlightId', args.highlightId))
			.collect();

		const user = await authComponent.getAuthUser(ctx);

		return await Promise.all(
			comments.map(async (comment) => {
				const reactions = await ctx.db
					.query('inline_comment_reactions')
					.withIndex('by_comment', (q) => q.eq('commentId', comment._id))
					.collect();

				const likes = reactions.filter((r) => r.like_dislike === 1).length;
				const dislikes = reactions.filter((r) => r.like_dislike === -1).length;

				let userReaction: 'like' | 'dislike' | null = null;
				if (user) {
					const reaction = reactions.find((r) => r.userId === user._id);
					if (reaction) {
						userReaction = reaction.like_dislike === 1 ? 'like' : 'dislike';
					}
				}

				return {
					...comment,
					likes,
					dislikes,
					userReaction
				};
			})
		);
	}
});

export const toggleInlineCommentReaction = mutation({
	args: {
		commentId: v.id('inline_comments'),
		reaction: v.union(v.literal(1), v.literal(-1))
	},
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Unauthorized');
		await rateLimiter.limit(ctx, 'contentReaction', { key: user._id, throws: true });

		const existing = await ctx.db
			.query('inline_comment_reactions')
			.withIndex('by_comment_user', (q) => q.eq('commentId', args.commentId).eq('userId', user._id))
			.unique();

		if (existing) {
			if (existing.like_dislike === args.reaction) {
				await ctx.db.delete(existing._id);
			} else {
				await ctx.db.patch(existing._id, { like_dislike: args.reaction });
			}
		} else {
			await ctx.db.insert('inline_comment_reactions', {
				commentId: args.commentId,
				userId: user._id,
				like_dislike: args.reaction
			});
		}
	}
});

export const removeInlineComment = mutation({
	args: { id: v.id('inline_comments') },
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Unauthorized');

		const comment = await ctx.db.get(args.id);
		if (!comment) throw new Error('Comment not found');

		if (comment.userId !== user._id) throw new Error('Forbidden');

		await deleteInlineCommentRecursive(ctx, args.id);
	}
});

export const getHighlight = query({
	args: { id: v.id('highlights') },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.id);
	}
});

export const getAllUserHighlights = query({
	args: {},
	handler: async (ctx) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return [];

		const highlights = await ctx.db
			.query('highlights')
			.withIndex('by_user', (q) => q.eq('userId', user._id))
			.collect();

		return await Promise.all(
			highlights.map(async (h) => {
				let contextTitle = 'Unknown Content';
				let groupName = undefined;

				if (h.contentId) {
					const content = await ctx.db.get(h.contentId);
					if (content) contextTitle = content.title;
				} else if (h.blogId) {
					const blog = await ctx.db.get(h.blogId);
					if (blog) contextTitle = blog.title;
				}

				if (h.groupId) {
					const group = await ctx.db.get(h.groupId);
					if (group) groupName = group.name;
				}

				return {
					...h,
					contextTitle,
					groupName
				};
			})
		);
	}
});

export const removeAllUserHighlights = mutation({
	args: {},
	handler: async (ctx) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Unauthorized');

		const highlights = await ctx.db
			.query('highlights')
			.withIndex('by_user', (q) => q.eq('userId', user._id))
			.collect();

		for (const h of highlights) {
			const comments = await ctx.db
				.query('inline_comments')
				.withIndex('by_highlight', (q) => q.eq('highlightId', h._id))
				.collect();

			for (const c of comments) {
				await deleteInlineCommentRecursive(ctx, c._id);
			}
			await ctx.db.delete(h._id);
		}
	}
});

export const removeHighlightsByContext = mutation({
	args: {
		contentId: v.optional(v.id('content')),
		blogId: v.optional(v.id('blogs')),
		groupId: v.optional(v.id('groups'))
	},
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Unauthorized');

		let highlightsQuery;
		if (args.contentId) {
			highlightsQuery = ctx.db
				.query('highlights')
				.withIndex('by_user_content', (q) =>
					q.eq('userId', user._id).eq('contentId', args.contentId!)
				);
		} else if (args.blogId) {
			highlightsQuery = ctx.db
				.query('highlights')
				.withIndex('by_user_blog', (q) => q.eq('userId', user._id).eq('blogId', args.blogId!));
		} else {
			return;
		}

		const highlights = (await highlightsQuery.collect()).filter((h) => h.groupId === args.groupId);

		for (const h of highlights) {
			const comments = await ctx.db
				.query('inline_comments')
				.withIndex('by_highlight', (q) => q.eq('highlightId', h._id))
				.collect();

			for (const c of comments) {
				await deleteInlineCommentRecursive(ctx, c._id);
			}
			await ctx.db.delete(h._id);
		}
	}
});
