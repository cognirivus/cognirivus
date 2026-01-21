import { v } from 'convex/values';
import {
	mutation,
	query,
	internalAction,
	internalQuery,
	internalMutation,
	type QueryCtx,
	type MutationCtx
} from './_generated/server';
import { authComponent } from './auth';

import { TableAggregate } from '@convex-dev/aggregate';
import { components, internal } from './_generated/api';
import type { DataModel, Id } from './_generated/dataModel';
import { rag, RAG_CONFIG } from './rag';

const likesAggregate = new TableAggregate<{
	Key: Id<'blogs'>;
	DataModel: DataModel;
	TableName: 'blog_reactions';
}>(components.aggregateLikes, {
	sortKey: (doc) => doc.blogId
});

const dislikesAggregate = new TableAggregate<{
	Key: Id<'blogs'>;
	DataModel: DataModel;
	TableName: 'blog_reactions';
}>(components.aggregateDislikes, {
	sortKey: (doc) => doc.blogId
});

const commentsAggregate = new TableAggregate<{
	Key: Id<'blogs'>;
	DataModel: DataModel;
	TableName: 'blog_comments';
}>(components.aggregateComments, {
	sortKey: (doc) => doc.blogId
});

const commentLikesAggregate = new TableAggregate<{
	Key: Id<'blog_comments'>;
	DataModel: DataModel;
	TableName: 'comment_reactions';
}>(components.aggregateCommentLikes, {
	sortKey: (doc) => doc.commentId
});

const commentDislikesAggregate = new TableAggregate<{
	Key: Id<'blog_comments'>;
	DataModel: DataModel;
	TableName: 'comment_reactions';
}>(components.aggregateCommentDislikes, {
	sortKey: (doc) => doc.commentId
});

async function checkAdmin(ctx: QueryCtx | MutationCtx) {
	const user = await authComponent.getAuthUser(ctx);
	if (!user) return null;

	const role = user.role;
	const isAdmin = Array.isArray(role) ? role.includes('admin') : role === 'admin';

	if (!isAdmin) return null;
	return user;
}

/**
 * Helper to delete a comment and its associated likes/dislikes.
 * Updates aggregates for consistency.
 */
async function deleteCommentWithReactions(ctx: MutationCtx, commentId: Id<'blog_comments'>) {
	const comment = await ctx.db.get(commentId);
	if (!comment) return;

	// Delete comment reactions
	const reactions = await ctx.db
		.query('comment_reactions')
		.withIndex('by_comment', (q) => q.eq('commentId', commentId))
		.collect();
	for (const reaction of reactions) {
		await ctx.db.delete(reaction._id);
		if (reaction.like_dislike === 1) {
			await commentLikesAggregate.delete(ctx, reaction);
		} else {
			await commentDislikesAggregate.delete(ctx, reaction);
		}
	}

	// Delete the comment
	await ctx.db.delete(commentId);
	await commentsAggregate.delete(ctx, comment);
}

// Internal Actions for RAG

/**
 * Internal mutation to update blog with RAG entry ID.
 * Called after RAG entry is created/updated.
 */
export const updateRagEntryId = internalMutation({
	args: { blogId: v.id('blogs'), ragEntryId: v.string() },
	handler: async (ctx, args) => {
		await ctx.db.patch(args.blogId, { ragEntryId: args.ragEntryId });
	}
});

/**
 * Internal query to get blog's RAG entry ID for deletion.
 */
export const getRagEntryId = internalQuery({
	args: { blogId: v.id('blogs') },
	handler: async (ctx, args) => {
		const blog = await ctx.db.get(args.blogId);
		return blog?.ragEntryId;
	}
});

/**
 * Syncs blog content to RAG for vector search.
 * Stores the returned entryId in the blog for later cleanup.
 */
export const syncRag = internalAction({
	args: { blogId: v.id('blogs'), title: v.string(), body: v.string() },
	handler: async (ctx, args) => {
		try {
			const { entryId, replacedEntry } = await rag.add(ctx, {
				namespace: RAG_CONFIG.namespace,
				key: args.blogId,
				text: `${args.title}\n\n${args.body}`
			});

			// Store the entryId in the blog for later deletion
			await ctx.runMutation(internal.blogs.updateRagEntryId, {
				blogId: args.blogId,
				ragEntryId: entryId
			});

			// Clean up replaced entry if any
			if (replacedEntry) {
				await rag.delete(ctx, { entryId: replacedEntry.entryId });
				console.log(`Deleted replaced RAG entry ${replacedEntry.entryId} for blog ${args.blogId}`);
			}

			console.log(`Synced RAG entry ${entryId} for blog ${args.blogId}`);
		} catch (e) {
			console.error(`Failed to sync RAG for blog ${args.blogId}:`, e);
		}
	}
});

/**
 * Backfills all existing blogs to RAG.
 * Run this once after enabling RAG to index existing content.
 */
export const backfillRag = internalAction({
	args: {},
	handler: async (ctx) => {
		const blogs = await ctx.runQuery(internal.blogs.listInternal);
		for (const blog of blogs) {
			try {
				const { entryId } = await rag.add(ctx, {
					namespace: RAG_CONFIG.namespace,
					key: blog._id,
					text: `${blog.title}\n\n${blog.body}`
				});

				// Store the entryId
				await ctx.runMutation(internal.blogs.updateRagEntryId, {
					blogId: blog._id,
					ragEntryId: entryId
				});

				console.log(`Backfilled RAG entry ${entryId} for blog ${blog._id}`);
			} catch (e) {
				console.error(`Failed to backfill RAG for blog ${blog._id}:`, e);
			}
		}
	}
});

/**
 * Deletes RAG entry for a blog when it's removed.
 * Uses the stored ragEntryId for direct deletion.
 */
export const deleteRag = internalAction({
	args: { ragEntryId: v.string() },
	handler: async (ctx, args) => {
		try {
			await rag.delete(ctx, { entryId: args.ragEntryId as any });
			console.log(`Deleted RAG entry ${args.ragEntryId}`);
		} catch (e) {
			console.error(`Failed to delete RAG entry ${args.ragEntryId}:`, e);
			// Don't throw - blog deletion should still succeed even if RAG cleanup fails
		}
	}
});

/**
 * Periodically ensures all blogs are synced to RAG.
 * Can be called by a cron job.
 */
export const cleanupRag = internalAction({
	args: {},
	handler: async (ctx) => {
		const blogs = await ctx.runQuery(internal.blogs.listInternal);
		let syncedCount = 0;

		for (const blog of blogs) {
			// If blog is published and missing RAG entry, or just to ensure it's up to date
			// We can be more selective, but for cleanup, we ensure consistency
			if (!blog.ragEntryId) {
				console.log(`Cleanup: Syncing missing RAG entry for blog ${blog._id}`);
				await ctx.runAction(internal.blogs.syncRag, {
					blogId: blog._id,
					title: blog.title,
					body: blog.body
				});
				syncedCount++;
			}
		}

		console.log(`RAG Cleanup finished. Synced ${syncedCount} blogs.`);
	}
});

export const listInternal = internalQuery({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query('blogs').collect();
	}
});

export const searchInternal = internalQuery({
	args: { query: v.string(), limit: v.number() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query('blogs')
			.withSearchIndex('search_body', (q) => q.search('body', args.query).eq('published', true))
			.take(args.limit);
	}
});

export const list = query({
	args: { onlyPublished: v.boolean() },
	handler: async (ctx, args) => {
		let blogs;
		if (args.onlyPublished) {
			blogs = await ctx.db
				.query('blogs')
				.withIndex('by_published', (q) => q.eq('published', true))
				.order('desc')
				.collect();
		} else {
			blogs = await ctx.db.query('blogs').order('desc').collect();
		}

		const enrichedBlogs = await Promise.all(
			blogs.map(async (blog) => {
				const [likes, dislikes, commentCount] = await Promise.all([
					likesAggregate.count(ctx, {
						bounds: {
							lower: { key: blog._id, inclusive: true },
							upper: { key: blog._id, inclusive: true }
						}
					}),
					dislikesAggregate.count(ctx, {
						bounds: {
							lower: { key: blog._id, inclusive: true },
							upper: { key: blog._id, inclusive: true }
						}
					}),
					commentsAggregate.count(ctx, {
						bounds: {
							lower: { key: blog._id, inclusive: true },
							upper: { key: blog._id, inclusive: true }
						}
					})
				]);
				return { ...blog, likes, dislikes, commentCount };
			})
		);

		return enrichedBlogs;
	}
});

export const get = query({
	args: { id: v.id('blogs') },
	handler: async (ctx, args) => {
		const blog = await ctx.db.get(args.id);
		if (!blog) return null;

		const [likes, dislikes, commentCount] = await Promise.all([
			likesAggregate.count(ctx, {
				bounds: {
					lower: { key: args.id, inclusive: true },
					upper: { key: args.id, inclusive: true }
				}
			}),
			dislikesAggregate.count(ctx, {
				bounds: {
					lower: { key: args.id, inclusive: true },
					upper: { key: args.id, inclusive: true }
				}
			}),
			commentsAggregate.count(ctx, {
				bounds: {
					lower: { key: args.id, inclusive: true },
					upper: { key: args.id, inclusive: true }
				}
			})
		]);

		const identity = await ctx.auth.getUserIdentity();
		const user = identity ? await authComponent.getAuthUser(ctx) : null;

		let userReaction: 'like' | 'dislike' | null = null;

		if (user) {
			const reaction = await ctx.db
				.query('blog_reactions')
				.withIndex('by_blog_user', (q) => q.eq('blogId', args.id).eq('userId', user._id))
				.unique();
			if (reaction) {
				userReaction = reaction.like_dislike === 1 ? 'like' : 'dislike';
			}
		}

		return {
			...blog,
			likes,
			dislikes,
			commentCount,
			userReaction
		};
	}
});

export const create = mutation({
	args: {
		title: v.string(),
		body: v.string(),
		published: v.boolean()
	},
	handler: async (ctx, args) => {
		const user = await checkAdmin(ctx);
		if (!user) {
			throw new Error('Unauthorized: Admin access required');
		}

		const id = await ctx.db.insert('blogs', {
			...args,
			authorId: user._id,
			createdAt: Date.now()
		});

		await ctx.scheduler.runAfter(0, internal.blogs.syncRag, {
			blogId: id,
			title: args.title,
			body: args.body
		});

		return id;
	}
});

export const update = mutation({
	args: {
		id: v.id('blogs'),
		title: v.string(),
		body: v.string(),
		published: v.boolean()
	},
	handler: async (ctx, args) => {
		const user = await checkAdmin(ctx);
		if (!user) {
			throw new Error('Unauthorized: Admin access required');
		}

		const { id, ...data } = args;
		await ctx.db.patch(id, data);

		await ctx.scheduler.runAfter(0, internal.blogs.syncRag, {
			blogId: id,
			title: data.title,
			body: data.body
		});
	}
});

/**
 * Helper to delete all blog-level reactions and comments.
 * Recursively deletes comment reactions as well.
 */
async function deleteBlogReactionsAndComments(ctx: MutationCtx, blogId: Id<'blogs'>) {
	// Delete blog reactions
	const reactions = await ctx.db
		.query('blog_reactions')
		.withIndex('by_blog', (q) => q.eq('blogId', blogId))
		.collect();
	for (const reaction of reactions) {
		await ctx.db.delete(reaction._id);
		if (reaction.like_dislike === 1) {
			await likesAggregate.delete(ctx, reaction);
		} else {
			await dislikesAggregate.delete(ctx, reaction);
		}
	}

	// Delete comments and their reactions
	const comments = await ctx.db
		.query('blog_comments')
		.withIndex('by_blog', (q) => q.eq('blogId', blogId))
		.collect();
	for (const comment of comments) {
		await deleteCommentWithReactions(ctx, comment._id);
	}
}

export const remove = mutation({
	args: { id: v.id('blogs') },
	handler: async (ctx, args) => {
		const user = await checkAdmin(ctx);
		if (!user) {
			throw new Error('Unauthorized: Admin access required');
		}

		// Get the blog to retrieve ragEntryId before deletion
		const blog = await ctx.db.get(args.id);
		if (!blog) {
			throw new Error('Blog not found');
		}

		// Delete all associated content first
		await deleteBlogReactionsAndComments(ctx, args.id);

		// Delete the blog
		await ctx.db.delete(args.id);

		// Schedule RAG entry deletion if we have the entryId
		if (blog.ragEntryId) {
			await ctx.scheduler.runAfter(0, internal.blogs.deleteRag, {
				ragEntryId: blog.ragEntryId
			});
		}
	}
});

export const getComments = query({
	args: { blogId: v.id('blogs') },
	handler: async (ctx, args) => {
		const comments = await ctx.db
			.query('blog_comments')
			.withIndex('by_blog_created_at', (q) => q.eq('blogId', args.blogId))
			.order('desc')
			.collect();

		const identity = await ctx.auth.getUserIdentity();
		const user = identity ? await authComponent.getAuthUser(ctx) : null;

		const enrichedComments = await Promise.all(
			comments.map(async (comment) => {
				const [likes, dislikes] = await Promise.all([
					commentLikesAggregate.count(ctx, {
						bounds: {
							lower: { key: comment._id, inclusive: true },
							upper: { key: comment._id, inclusive: true }
						}
					}),
					commentDislikesAggregate.count(ctx, {
						bounds: {
							lower: { key: comment._id, inclusive: true },
							upper: { key: comment._id, inclusive: true }
						}
					})
				]);

				let userReaction: 'like' | 'dislike' | null = null;
				if (user) {
					const reaction = await ctx.db
						.query('comment_reactions')
						.withIndex('by_comment_user', (q) =>
							q.eq('commentId', comment._id).eq('userId', user._id)
						)
						.unique();
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

		return enrichedComments;
	}
});

export const toggleLike = mutation({
	args: { blogId: v.id('blogs') },
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Unauthorized');

		const existing = await ctx.db
			.query('blog_reactions')
			.withIndex('by_blog_user', (q) => q.eq('blogId', args.blogId).eq('userId', user._id))
			.unique();

		if (existing) {
			await ctx.db.delete(existing._id);
			if (existing.like_dislike === 1) {
				await likesAggregate.delete(ctx, existing);
			} else {
				await dislikesAggregate.delete(ctx, existing);
				const id = await ctx.db.insert('blog_reactions', {
					blogId: args.blogId,
					userId: user._id,
					like_dislike: 1
				});
				const doc = await ctx.db.get(id);
				await likesAggregate.insert(ctx, doc!);
			}
		} else {
			const id = await ctx.db.insert('blog_reactions', {
				blogId: args.blogId,
				userId: user._id,
				like_dislike: 1
			});
			const doc = await ctx.db.get(id);
			await likesAggregate.insert(ctx, doc!);
		}
	}
});

export const toggleDislike = mutation({
	args: { blogId: v.id('blogs') },
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Unauthorized');

		const existing = await ctx.db
			.query('blog_reactions')
			.withIndex('by_blog_user', (q) => q.eq('blogId', args.blogId).eq('userId', user._id))
			.unique();

		if (existing) {
			await ctx.db.delete(existing._id);
			if (existing.like_dislike === -1) {
				await dislikesAggregate.delete(ctx, existing);
			} else {
				await likesAggregate.delete(ctx, existing);
				const id = await ctx.db.insert('blog_reactions', {
					blogId: args.blogId,
					userId: user._id,
					like_dislike: -1
				});
				const doc = await ctx.db.get(id);
				await dislikesAggregate.insert(ctx, doc!);
			}
		} else {
			const id = await ctx.db.insert('blog_reactions', {
				blogId: args.blogId,
				userId: user._id,
				like_dislike: -1
			});
			const doc = await ctx.db.get(id);
			await dislikesAggregate.insert(ctx, doc!);
		}
	}
});

export const addComment = mutation({
	args: { blogId: v.id('blogs'), body: v.string() },
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Unauthorized');

		const id = await ctx.db.insert('blog_comments', {
			blogId: args.blogId,
			userId: user._id,
			body: args.body,
			createdAt: Date.now()
		});
		const doc = await ctx.db.get(id);
		await commentsAggregate.insert(ctx, doc!);
		return id;
	}
});

export const removeComment = mutation({
	args: { id: v.id('blog_comments') },
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Unauthorized');

		const comment = await ctx.db.get(args.id);
		if (!comment) throw new Error('Comment not found');

		const isAdmin = Array.isArray(user.role) ? user.role.includes('admin') : user.role === 'admin';
		if (comment.userId !== user._id && !isAdmin) {
			throw new Error('Forbidden');
		}

		await deleteCommentWithReactions(ctx, args.id);
	}
});

export const toggleCommentLike = mutation({
	args: { commentId: v.id('blog_comments') },
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Unauthorized');

		const existing = await ctx.db
			.query('comment_reactions')
			.withIndex('by_comment_user', (q) => q.eq('commentId', args.commentId).eq('userId', user._id))
			.unique();

		if (existing) {
			await ctx.db.delete(existing._id);
			if (existing.like_dislike === 1) {
				await commentLikesAggregate.delete(ctx, existing);
			} else {
				await commentDislikesAggregate.delete(ctx, existing);
				const id = await ctx.db.insert('comment_reactions', {
					commentId: args.commentId,
					userId: user._id,
					like_dislike: 1
				});
				const doc = await ctx.db.get(id);
				await commentLikesAggregate.insert(ctx, doc!);
			}
		} else {
			const id = await ctx.db.insert('comment_reactions', {
				commentId: args.commentId,
				userId: user._id,
				like_dislike: 1
			});
			const doc = await ctx.db.get(id);
			await commentLikesAggregate.insert(ctx, doc!);
		}
	}
});

export const toggleCommentDislike = mutation({
	args: { commentId: v.id('blog_comments') },
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Unauthorized');

		const existing = await ctx.db
			.query('comment_reactions')
			.withIndex('by_comment_user', (q) => q.eq('commentId', args.commentId).eq('userId', user._id))
			.unique();

		if (existing) {
			await ctx.db.delete(existing._id);
			if (existing.like_dislike === -1) {
				await commentDislikesAggregate.delete(ctx, existing);
			} else {
				await commentLikesAggregate.delete(ctx, existing);
				const id = await ctx.db.insert('comment_reactions', {
					commentId: args.commentId,
					userId: user._id,
					like_dislike: -1
				});
				const doc = await ctx.db.get(id);
				await commentDislikesAggregate.insert(ctx, doc!);
			}
		} else {
			const id = await ctx.db.insert('comment_reactions', {
				commentId: args.commentId,
				userId: user._id,
				like_dislike: -1
			});
			const doc = await ctx.db.get(id);
			await commentDislikesAggregate.insert(ctx, doc!);
		}
	}
});
