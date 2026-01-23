import { v } from 'convex/values';
import {
	action,
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
import { components, internal, api } from './_generated/api';
import type { DataModel, Id } from './_generated/dataModel';
import { rag, RAG_CONFIG } from './rag';
import { r2 } from './lib/r2';

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

async function deleteCommentWithReactions(ctx: MutationCtx, commentId: Id<'blog_comments'>) {
	const comment = await ctx.db.get(commentId);
	if (!comment) return;

	// Delete all child comments recursively
	const childComments = await ctx.db
		.query('blog_comments')
		.withIndex('by_parent', (q) => q.eq('parentId', commentId))
		.collect();
	for (const child of childComments) {
		await deleteCommentWithReactions(ctx, child._id);
	}

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

	await ctx.db.delete(commentId);
	await commentsAggregate.delete(ctx, comment);
}

export const updateRagEntryId = internalMutation({
	args: { blogId: v.id('blogs'), ragEntryId: v.string() },
	handler: async (ctx, args) => {
		await ctx.db.patch(args.blogId, { ragEntryId: args.ragEntryId });
	}
});

export const getRagEntryId = internalQuery({
	args: { blogId: v.id('blogs') },
	handler: async (ctx, args) => {
		const blog = await ctx.db.get(args.blogId);
		return blog?.ragEntryId;
	}
});

export const syncRag = internalAction({
	args: { blogId: v.id('blogs'), title: v.string(), body: v.string() },
	handler: async (ctx, args) => {
		try {
			const { entryId, replacedEntry } = await rag.add(ctx, {
				namespace: RAG_CONFIG.namespace,
				key: args.blogId,
				text: `${args.title}\n\n${args.body}`
			});

			await ctx.runMutation(internal.blogs.updateRagEntryId, {
				blogId: args.blogId,
				ragEntryId: entryId
			});

			if (replacedEntry) {
				await rag.delete(ctx, { entryId: replacedEntry.entryId });
			}
		} catch (e) {
			console.error(`Failed to sync RAG for blog ${args.blogId}:`, e);
		}
	}
});

export const backfillRag = internalAction({
	args: {},
	handler: async (ctx) => {
		const blogs = await ctx.runQuery(internal.blogs.listInternal);
		for (const blog of blogs) {
			try {
				let body = blog.snippet;
				if (blog.r2Key) {
					const url = await r2.getUrl(blog.r2Key);
					body = await (await fetch(url)).text();
				}

				const { entryId } = await rag.add(ctx, {
					namespace: RAG_CONFIG.namespace,
					key: blog._id,
					text: `${blog.title}\n\n${body}`
				});

				await ctx.runMutation(internal.blogs.updateRagEntryId, {
					blogId: blog._id,
					ragEntryId: entryId
				});
			} catch (e) {
				console.error(`Failed to backfill RAG for blog ${blog._id}:`, e);
			}
		}
	}
});

export const deleteRag = internalAction({
	args: { ragEntryId: v.string() },
	handler: async (ctx, args) => {
		try {
			await rag.delete(ctx, { entryId: args.ragEntryId as any });
		} catch (e) {
			console.error(`Failed to delete RAG entry ${args.ragEntryId}:`, e);
		}
	}
});

export const cleanupRag = internalAction({
	args: {},
	handler: async (ctx) => {
		const blogs = await ctx.runQuery(internal.blogs.listInternal);
		let syncedCount = 0;

		for (const blog of blogs) {
			if (!blog.ragEntryId) {
				let body = blog.snippet;
				if (blog.r2Key) {
					const url = await r2.getUrl(blog.r2Key);
					body = await (await fetch(url)).text();
				}

				await ctx.runAction(internal.blogs.syncRag, {
					blogId: blog._id,
					title: blog.title,
					body
				});
				syncedCount++;
			}
		}
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
			.withSearchIndex('search_snippet', (q) =>
				q.search('snippet', args.query).eq('published', true)
			)
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
				let bodyUrl = null;
				if (blog.r2Key) {
					bodyUrl = await r2.getUrl(blog.r2Key);
				}

				return {
					...blog,
					body: blog.snippet,
					bodyUrl,
					likes,
					dislikes,
					commentCount
				};
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

		let bodyUrl = null;
		if (blog.r2Key) {
			bodyUrl = await r2.getUrl(blog.r2Key);
		}

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
			bodyUrl,
			body: blog.snippet,
			likes,
			dislikes,
			commentCount,
			userReaction
		};
	}
});

export const insertMetadata = mutation({
	args: {
		title: v.string(),
		snippet: v.string(),
		published: v.boolean(),
		r2Key: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const user = await checkAdmin(ctx);
		if (!user) throw new Error('Unauthorized');

		return await ctx.db.insert('blogs', {
			...args,
			authorId: user._id,
			createdAt: Date.now()
		});
	}
});

export const create = action({
	args: {
		title: v.string(),
		body: v.string(),
		published: v.boolean()
	},
	handler: async (ctx, args): Promise<Id<'blogs'>> => {
		const r2Key = `blogs/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.txt`;

		await r2.store(ctx, new Blob([args.body], { type: 'text/plain' }), {
			key: r2Key,
			type: 'text/plain'
		});

		const blogId = await ctx.runMutation(api.blogs.insertMetadata, {
			title: args.title,
			snippet: args.body.substring(0, 500),
			published: args.published,
			r2Key
		});

		await ctx.scheduler.runAfter(0, internal.blogs.syncRag, {
			blogId,
			title: args.title,
			body: args.body
		});

		return blogId;
	}
});

export const updateMetadata = mutation({
	args: {
		id: v.id('blogs'),
		title: v.string(),
		snippet: v.string(),
		published: v.boolean(),
		r2Key: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const user = await checkAdmin(ctx);
		if (!user) throw new Error('Unauthorized');

		const { id, ...updates } = args;
		await ctx.db.patch(id, updates);
		return id;
	}
});

export const update = action({
	args: {
		id: v.id('blogs'),
		title: v.string(),
		body: v.string(),
		published: v.boolean()
	},
	handler: async (ctx, args): Promise<void> => {
		const blog = await ctx.runQuery(api.blogs.get, { id: args.id });
		if (!blog) throw new Error('Blog not found');

		let r2Key = blog.r2Key;
		if (!r2Key) {
			r2Key = `blogs/${args.id}-${Date.now()}.txt`;
		}

		await r2.store(ctx, new Blob([args.body], { type: 'text/plain' }), {
			key: r2Key,
			type: 'text/plain'
		});

		await ctx.runMutation(api.blogs.updateMetadata, {
			id: args.id,
			title: args.title,
			snippet: args.body.substring(0, 500),
			published: args.published,
			r2Key
		});

		await ctx.scheduler.runAfter(0, internal.blogs.syncRag, {
			blogId: args.id,
			title: args.title,
			body: args.body
		});
	}
});

export const remove = mutation({
	args: { id: v.id('blogs') },
	handler: async (ctx, args) => {
		const user = await checkAdmin(ctx);
		if (!user) {
			throw new Error('Unauthorized: Admin access required');
		}

		const blog = await ctx.db.get(args.id);
		if (!blog) {
			throw new Error('Blog not found');
		}

		if (blog.r2Key) {
			await r2.deleteObject(ctx, blog.r2Key);
		}

		await deleteBlogReactionsAndComments(ctx, args.id);

		await ctx.db.delete(args.id);

		if (blog.ragEntryId) {
			await ctx.scheduler.runAfter(0, internal.blogs.deleteRag, {
				ragEntryId: blog.ragEntryId
			});
		}
	}
});

async function deleteBlogReactionsAndComments(ctx: MutationCtx, blogId: Id<'blogs'>) {
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

	const comments = await ctx.db
		.query('blog_comments')
		.withIndex('by_blog', (q) => q.eq('blogId', blogId))
		.collect();
	for (const comment of comments) {
		await deleteCommentWithReactions(ctx, comment._id);
	}
}

export const getComments = query({
	args: { blogId: v.id('blogs') },
	handler: async (ctx, args) => {
		const comments = await ctx.db
			.query('blog_comments')
			.withIndex('by_blog_created_at', (q) => q.eq('blogId', args.blogId))
			.order('asc')
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
	args: {
		blogId: v.id('blogs'),
		body: v.string(),
		parentId: v.optional(v.id('blog_comments'))
	},
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Unauthorized');

		const id = await ctx.db.insert('blog_comments', {
			blogId: args.blogId,
			userId: user._id,
			userName: user.name,
			body: args.body,
			parentId: args.parentId,
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

		// Check if it has child comments
		const childComments = await ctx.db
			.query('blog_comments')
			.withIndex('by_parent', (q) => q.eq('parentId', args.id))
			.first();

		if (childComments) {
			// Soft delete: keep node but mask content
			await ctx.db.patch(args.id, {
				userName: 'Deleted',
				body: 'This message was deleted by the user'
			});
		} else {
			// Hard delete: remove normally
			await deleteCommentWithReactions(ctx, args.id);
		}
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
