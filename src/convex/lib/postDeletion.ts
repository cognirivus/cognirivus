import type { Doc, Id } from '../_generated/dataModel';
import { trackPostDeleted } from './aggregates';

export type DeletePostCascadeResult = {
	deleted: boolean;
	postId: Id<'posts'>;
	commentCount: number;
	commentVoteCount: number;
	voteCount: number;
	postTagCount: number;
	embeddingCount: number;
	summaryCount: number;
	r2Key?: string;
};

export const deletePostCascadeByDoc = async (
	ctx: any,
	post: Doc<'posts'>
): Promise<DeletePostCascadeResult> => {
	const votes = await ctx.db
		.query('post_votes')
		.withIndex('by_postId_and_createdAt', (q: any) => q.eq('postId', post._id))
		.collect();
	for (const vote of votes) {
		await ctx.db.delete(vote._id);
	}

	const comments = await ctx.db
		.query('post_comments')
		.withIndex('by_postId_and_createdAt', (q: any) => q.eq('postId', post._id))
		.collect();
	let commentVoteCount = 0;
	for (const comment of comments) {
		const commentVotes = await ctx.db
			.query('post_comment_votes')
			.withIndex('by_commentId_and_createdAt', (q: any) => q.eq('commentId', comment._id))
			.collect();
		for (const commentVote of commentVotes) {
			await ctx.db.delete(commentVote._id);
		}
		commentVoteCount += commentVotes.length;
		await ctx.db.delete(comment._id);
	}

	const postTags = await ctx.db
		.query('post_tags')
		.withIndex('by_postId', (q: any) => q.eq('postId', post._id))
		.collect();
	for (const postTag of postTags) {
		await ctx.db.delete(postTag._id);
	}

	const embeddings = await ctx.db
		.query('post_embeddings')
		.withIndex('by_postId', (q: any) => q.eq('postId', post._id))
		.collect();
	for (const embedding of embeddings) {
		await ctx.db.delete(embedding._id);
	}

	const summaries = await ctx.db
		.query('ai_summary_cache')
		.withIndex('by_entityType_and_entityId', (q: any) =>
			q.eq('entityType', 'post').eq('entityId', post._id)
		)
		.collect();
	for (const summary of summaries) {
		await ctx.db.delete(summary._id);
	}

	await trackPostDeleted(ctx, post);
	await ctx.db.delete(post._id);

	return {
		deleted: true,
		postId: post._id,
		commentCount: comments.length,
		commentVoteCount,
		voteCount: votes.length,
		postTagCount: postTags.length,
		embeddingCount: embeddings.length,
		summaryCount: summaries.length,
		r2Key: post.r2Key
	};
};
