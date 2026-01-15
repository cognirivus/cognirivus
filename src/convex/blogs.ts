import { v } from 'convex/values';
import { mutation, query, type QueryCtx, type MutationCtx } from './_generated/server';
import { authComponent } from './auth';
import { TableAggregate } from '@convex-dev/aggregate';
import { components } from './_generated/api';
import { DataModel } from './_generated/dataModel';

const likesAggregate = new TableAggregate<{
	Key: string;
	DataModel: DataModel;
	TableName: 'blog_likes';
}>(components.aggregateLikes, {
	sortKey: (doc) => doc.blogId
});

const dislikesAggregate = new TableAggregate<{
	Key: string;
	DataModel: DataModel;
	TableName: 'blog_dislikes';
}>(components.aggregateDislikes, {
	sortKey: (doc) => doc.blogId
});

const commentsAggregate = new TableAggregate<{
	Key: string;
	DataModel: DataModel;
	TableName: 'blog_comments';
}>(components.aggregateComments, {
	sortKey: (doc) => doc.blogId
});

const commentLikesAggregate = new TableAggregate<{
	Key: string;
	DataModel: DataModel;
	TableName: 'comment_likes';
}>(components.aggregateCommentLikes, {
	sortKey: (doc) => doc.commentId
});

const commentDislikesAggregate = new TableAggregate<{
	Key: string;
	DataModel: DataModel;
	TableName: 'comment_dislikes';
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
						namespace: undefined,
						bounds: { lower: { key: blog._id, inclusive: true }, upper: { key: blog._id, inclusive: true } }
					}),
					dislikesAggregate.count(ctx, {
						namespace: undefined,
						bounds: { lower: { key: blog._id, inclusive: true }, upper: { key: blog._id, inclusive: true } }
					}),
					commentsAggregate.count(ctx, {
						namespace: undefined,
						bounds: { lower: { key: blog._id, inclusive: true }, upper: { key: blog._id, inclusive: true } }
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
				namespace: undefined,
				bounds: { lower: { key: args.id, inclusive: true }, upper: { key: args.id, inclusive: true } }
			}),
			dislikesAggregate.count(ctx, {
				namespace: undefined,
				bounds: { lower: { key: args.id, inclusive: true }, upper: { key: args.id, inclusive: true } }
			}),
			commentsAggregate.count(ctx, {
				namespace: undefined,
				bounds: { lower: { key: args.id, inclusive: true }, upper: { key: args.id, inclusive: true } }
			})
		]);

		const user = await authComponent.getAuthUser(ctx);
		let userReaction: 'like' | 'dislike' | null = null;
		if (user) {
			const like = await ctx.db
				.query('blog_likes')
				.withIndex('by_blog_user', (q) => q.eq('blogId', args.id).eq('userId', user._id))
				.unique();
			if (like) {
				userReaction = 'like';
			} else {
				const dislike = await ctx.db
					.query('blog_dislikes')
					.withIndex('by_blog_user', (q) => q.eq('blogId', args.id).eq('userId', user._id))
					.unique();
				if (dislike) {
					userReaction = 'dislike';
				}
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

export const getComments = query({
	args: { blogId: v.id('blogs') },
	handler: async (ctx, args) => {
		const comments = await ctx.db
			.query('blog_comments')
			.withIndex('by_blog_created_at', (q) => q.eq('blogId', args.blogId))
			.order('desc')
			.collect();

		const user = await authComponent.getAuthUser(ctx);

		const enrichedComments = await Promise.all(
			comments.map(async (comment) => {
				const [likes, dislikes] = await Promise.all([
					commentLikesAggregate.count(ctx, {
						namespace: undefined,
						bounds: {
							lower: { key: comment._id, inclusive: true },
							upper: { key: comment._id, inclusive: true }
						}
					}),
					commentDislikesAggregate.count(ctx, {
						namespace: undefined,
						bounds: {
							lower: { key: comment._id, inclusive: true },
							upper: { key: comment._id, inclusive: true }
						}
					})
				]);

				let userReaction: 'like' | 'dislike' | null = null;
				if (user) {
					const like = await ctx.db
						.query('comment_likes')
						.withIndex('by_comment_user', (q) => q.eq('commentId', comment._id).eq('userId', user._id))
						.unique();
					if (like) {
						userReaction = 'like';
					} else {
						const dislike = await ctx.db
							.query('comment_dislikes')
							.withIndex('by_comment_user', (q) =>
								q.eq('commentId', comment._id).eq('userId', user._id)
							)
							.unique();
						if (dislike) {
							userReaction = 'dislike';
						}
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

		const existingLike = await ctx.db
			.query('blog_likes')
			.withIndex('by_blog_user', (q) => q.eq('blogId', args.blogId).eq('userId', user._id))
			.unique();

		const existingDislike = await ctx.db
			.query('blog_dislikes')
			.withIndex('by_blog_user', (q) => q.eq('blogId', args.blogId).eq('userId', user._id))
			.unique();

		if (existingLike) {
			await ctx.db.delete(existingLike._id);
			await likesAggregate.delete(ctx, existingLike);
		} else {
			if (existingDislike) {
				await ctx.db.delete(existingDislike._id);
				await dislikesAggregate.delete(ctx, existingDislike);
			}
			const id = await ctx.db.insert('blog_likes', { blogId: args.blogId, userId: user._id });
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

		const existingLike = await ctx.db
			.query('blog_likes')
			.withIndex('by_blog_user', (q) => q.eq('blogId', args.blogId).eq('userId', user._id))
			.unique();

		const existingDislike = await ctx.db
			.query('blog_dislikes')
			.withIndex('by_blog_user', (q) => q.eq('blogId', args.blogId).eq('userId', user._id))
			.unique();

		if (existingDislike) {
			await ctx.db.delete(existingDislike._id);
			await dislikesAggregate.delete(ctx, existingDislike);
		} else {
			if (existingLike) {
				await ctx.db.delete(existingLike._id);
				await likesAggregate.delete(ctx, existingLike);
			}
			const id = await ctx.db.insert('blog_dislikes', { blogId: args.blogId, userId: user._id });
			const doc = await ctx.db.get(id);
			await dislikesAggregate.insert(ctx, doc!);
		}
	}
});

export const addComment = mutation({
	args: { blogId: v.id('blogs'), content: v.string() },
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Unauthorized');

		const id = await ctx.db.insert('blog_comments', {
			blogId: args.blogId,
			userId: user._id,
			content: args.content,
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

		// Only author or admin can remove
		const isAdmin = Array.isArray(user.role) ? user.role.includes('admin') : user.role === 'admin';
		if (comment.userId !== user._id && !isAdmin) {
			throw new Error('Forbidden');
		}

		await ctx.db.delete(args.id);
		await commentsAggregate.delete(ctx, comment);
	}
});

export const toggleCommentLike = mutation({
	args: { commentId: v.id('blog_comments') },
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Unauthorized');

		const existingLike = await ctx.db
			.query('comment_likes')
			.withIndex('by_comment_user', (q) => q.eq('commentId', args.commentId).eq('userId', user._id))
			.unique();

		const existingDislike = await ctx.db
			.query('comment_dislikes')
			.withIndex('by_comment_user', (q) => q.eq('commentId', args.commentId).eq('userId', user._id))
			.unique();

		if (existingLike) {
			await ctx.db.delete(existingLike._id);
			await commentLikesAggregate.delete(ctx, existingLike);
		} else {
			if (existingDislike) {
				await ctx.db.delete(existingDislike._id);
				await commentDislikesAggregate.delete(ctx, existingDislike);
			}
			const id = await ctx.db.insert('comment_likes', { commentId: args.commentId, userId: user._id });
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

		const existingLike = await ctx.db
			.query('comment_likes')
			.withIndex('by_comment_user', (q) => q.eq('commentId', args.commentId).eq('userId', user._id))
			.unique();

		const existingDislike = await ctx.db
			.query('comment_dislikes')
			.withIndex('by_comment_user', (q) => q.eq('commentId', args.commentId).eq('userId', user._id))
			.unique();

		if (existingDislike) {
			await ctx.db.delete(existingDislike._id);
			await commentDislikesAggregate.delete(ctx, existingDislike);
		} else {
			if (existingLike) {
				await ctx.db.delete(existingLike._id);
				await commentLikesAggregate.delete(ctx, existingLike);
			}
			const id = await ctx.db.insert('comment_dislikes', {
				commentId: args.commentId,
				userId: user._id
			});
			const doc = await ctx.db.get(id);
			await commentDislikesAggregate.insert(ctx, doc!);
		}
	}
});
