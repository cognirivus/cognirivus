import type { Doc, Id } from '../_generated/dataModel';
import {
	deleteCollectionCascadeByDoc,
	type DeleteCollectionCascadeResult
} from './collectionDeletion';
import { deletePostCascadeByDoc, type DeletePostCascadeResult } from './postDeletion';

export type DeleteCommunityCascadeResult = {
	deleted: boolean;
	communityId: Id<'communities'>;
	membershipCount: number;
	followCount: number;
	chatMessageCount: number;
	chatReactionCount: number;
	collectionCount: number;
	collectionItemCount: number;
	collectionFollowCount: number;
	collectionSuggestionCount: number;
	postCount: number;
	postCommentCount: number;
	postCommentVoteCount: number;
	postVoteCount: number;
	postTagCount: number;
	embeddingCount: number;
	summaryCount: number;
	r2Keys: Array<string>;
};

const collectMembershipsForStatus = async (
	ctx: any,
	communityId: Id<'communities'>,
	status: 'active' | 'pending' | 'rejected'
) =>
	await ctx.db
		.query('community_memberships')
		.withIndex('by_communityId_and_status', (q: any) =>
			q.eq('communityId', communityId).eq('status', status)
		)
		.collect();

export const deleteCommunityCascadeByDoc = async (
	ctx: any,
	community: Doc<'communities'>
): Promise<DeleteCommunityCascadeResult> => {
	const [
		activeMemberships,
		pendingMemberships,
		rejectedMemberships,
		follows,
		messages,
		collections,
		posts
	] = await Promise.all([
		collectMembershipsForStatus(ctx, community._id, 'active'),
		collectMembershipsForStatus(ctx, community._id, 'pending'),
		collectMembershipsForStatus(ctx, community._id, 'rejected'),
		ctx.db
			.query('follows_communities')
			.withIndex('by_communityId_and_createdAt', (q: any) => q.eq('communityId', community._id))
			.collect(),
		ctx.db
			.query('community_chat_messages')
			.withIndex('by_communityId_and_createdAt', (q: any) => q.eq('communityId', community._id))
			.collect(),
		ctx.db
			.query('source_collections')
			.withIndex('by_ownerKind_and_ownerCommunityId_and_updatedAt', (q: any) =>
				q.eq('ownerKind', 'community').eq('ownerCommunityId', community._id)
			)
			.collect(),
		ctx.db
			.query('posts')
			.withIndex('by_communityId_and_createdAt', (q: any) => q.eq('communityId', community._id))
			.collect()
	]);

	let chatReactionCount = 0;
	for (const message of messages) {
		const reactions = await ctx.db
			.query('community_chat_reactions')
			.withIndex('by_communityId_and_messageId', (q: any) =>
				q.eq('communityId', community._id).eq('messageId', message._id)
			)
			.collect();
		chatReactionCount += reactions.length;
		for (const reaction of reactions) {
			await ctx.db.delete(reaction._id);
		}
		await ctx.db.delete(message._id);
	}

	let collectionItemCount = 0;
	let collectionFollowCount = 0;
	let collectionSuggestionCount = 0;
	for (const collection of collections) {
		const result: DeleteCollectionCascadeResult = await deleteCollectionCascadeByDoc(
			ctx,
			collection
		);
		collectionItemCount += result.itemCount;
		collectionFollowCount += result.followCount;
		collectionSuggestionCount += result.suggestionCount;
	}

	let postCommentCount = 0;
	let postCommentVoteCount = 0;
	let postVoteCount = 0;
	let postTagCount = 0;
	let embeddingCount = 0;
	let summaryCount = 0;
	const r2Keys: Array<string> = [];
	for (const post of posts) {
		const result: DeletePostCascadeResult = await deletePostCascadeByDoc(ctx, post);
		postCommentCount += result.commentCount;
		postCommentVoteCount += result.commentVoteCount;
		postVoteCount += result.voteCount;
		postTagCount += result.postTagCount;
		embeddingCount += result.embeddingCount;
		summaryCount += result.summaryCount;
		if (result.r2Key) {
			r2Keys.push(result.r2Key);
		}
	}

	const memberships = [...activeMemberships, ...pendingMemberships, ...rejectedMemberships];
	for (const membership of memberships) {
		await ctx.db.delete(membership._id);
	}
	for (const follow of follows) {
		await ctx.db.delete(follow._id);
	}

	await ctx.db.delete(community._id);

	return {
		deleted: true,
		communityId: community._id,
		membershipCount: memberships.length,
		followCount: follows.length,
		chatMessageCount: messages.length,
		chatReactionCount,
		collectionCount: collections.length,
		collectionItemCount,
		collectionFollowCount,
		collectionSuggestionCount,
		postCount: posts.length,
		postCommentCount,
		postCommentVoteCount,
		postVoteCount,
		postTagCount,
		embeddingCount,
		summaryCount,
		r2Keys
	};
};
