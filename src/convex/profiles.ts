import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import {
	action,
	internalQuery,
	internalMutation,
	mutation,
	query,
	type MutationCtx,
	type QueryCtx
} from './_generated/server';
import type { Id } from './_generated/dataModel';
import { getAuthUser } from './auth';
import { rateLimiter } from './lib/rateLimits';
import { deleteCollectionCascadeByDoc } from './lib/collectionDeletion';
import { deleteCommunityCascadeByDoc } from './lib/communityDeletion';
import { deletePostCascadeByDoc } from './lib/postDeletion';

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
const RESERVED_USERNAMES = new Set([
	'admin',
	'api',
	'auth',
	'c',
	'feed',
	'post',
	'settings',
	'signin',
	'signup',
	'submit',
	'u'
]);

const normalizeUsername = (value: string) => value.trim().toLowerCase();
const normalizeSearchText = (value: string) => value.trim().toLowerCase();

const profileSummaryValidator = v.object({
	authId: v.string(),
	email: v.string(),
	name: v.string(),
	image: v.optional(v.union(v.null(), v.string())),
	username: v.union(v.null(), v.string()),
	bio: v.optional(v.string()),
	createdAt: v.number(),
	updatedAt: v.number(),
	postCount: v.number(),
	followerCount: v.number(),
	followingCount: v.number()
});

const deleteMyAccountDbResultValidator = v.object({
	deletedCommunityCount: v.number(),
	deletedCollectionCount: v.number(),
	deletedPostCount: v.number(),
	deletedSubscriptionCount: v.number(),
	scrubbedCommentCount: v.number(),
	scrubbedCommunityChatMessageCount: v.number(),
	scrubbedDmMessageCount: v.number(),
	r2Keys: v.array(v.string())
});

const deleteMyAccountResultValidator = v.object({
	deletedCommunityCount: v.number(),
	deletedCollectionCount: v.number(),
	deletedPostCount: v.number(),
	deletedSubscriptionCount: v.number(),
	scrubbedCommentCount: v.number(),
	scrubbedCommunityChatMessageCount: v.number(),
	scrubbedDmMessageCount: v.number(),
	r2DeletedCount: v.number()
});

const getOptionalAuthUser = async (ctx: QueryCtx | MutationCtx) => {
	try {
		return await getAuthUser(ctx);
	} catch {
		return null;
	}
};

const requireAuthenticatedUser = async (ctx: QueryCtx | MutationCtx) => {
	const authUser = await getOptionalAuthUser(ctx);
	if (!authUser) {
		throw new Error('Authentication required');
	}
	return authUser;
};

const toProfileSummary = async (ctx: QueryCtx | MutationCtx, authId: string) => {
	const profile = await ctx.db
		.query('users_profile')
		.withIndex('by_authId', (q) => q.eq('authId', authId))
		.unique();

	if (!profile) {
		return null;
	}

	const [postCount, followerCount, followingCount] = await Promise.all([
		ctx.db
			.query('posts')
			.withIndex('by_authorAuthId_and_createdAt', (q) => q.eq('authorAuthId', authId))
			.filter((q) => q.neq(q.field('visibility'), 'private'))
			.collect()
			.then((rows) => rows.length),
		ctx.db
			.query('follows_users')
			.withIndex('by_targetAuthId_and_createdAt', (q) => q.eq('targetAuthId', authId))
			.collect()
			.then((rows) => rows.length),
		ctx.db
			.query('follows_users')
			.withIndex('by_followerAuthId_and_createdAt', (q) => q.eq('followerAuthId', authId))
			.collect()
			.then((rows) => rows.length)
	]);

	return {
		authId: profile.authId,
		email: profile.email,
		name: profile.name,
		image: profile.image,
		username: profile.username ?? null,
		bio: profile.bio,
		createdAt: profile.createdAt,
		updatedAt: profile.updatedAt,
		postCount,
		followerCount,
		followingCount
	};
};

const scrubPostCommentsForUser = async (ctx: MutationCtx, authId: string) => {
	const comments = await ctx.db
		.query('post_comments')
		.withIndex('by_authorAuthId_and_createdAt', (q) => q.eq('authorAuthId', authId))
		.collect();

	for (const comment of comments) {
		const votes = await ctx.db
			.query('post_comment_votes')
			.withIndex('by_commentId_and_createdAt', (q) => q.eq('commentId', comment._id))
			.collect();
		for (const vote of votes) {
			await ctx.db.delete(vote._id);
		}

		await ctx.db.patch(comment._id, {
			body: 'comment deleted',
			score: 0,
			likes: 0,
			dislikes: 0,
			updatedAt: Date.now()
		});
	}

	return comments.length;
};

const scrubCommunityChatForUser = async (ctx: MutationCtx, authId: string) => {
	const myReactions = await ctx.db
		.query('community_chat_reactions')
		.withIndex('by_userAuthId_and_createdAt', (q) => q.eq('userAuthId', authId))
		.collect();
	for (const reaction of myReactions) {
		await ctx.db.delete(reaction._id);
	}

	const messages = await ctx.db
		.query('community_chat_messages')
		.withIndex('by_userAuthId_and_createdAt', (q) => q.eq('userAuthId', authId))
		.collect();
	for (const message of messages) {
		const reactions = await ctx.db
			.query('community_chat_reactions')
			.withIndex('by_communityId_and_messageId', (q) =>
				q.eq('communityId', message.communityId).eq('messageId', message._id)
			)
			.collect();
		for (const reaction of reactions) {
			await ctx.db.delete(reaction._id);
		}

		await ctx.db.patch(message._id, {
			body: 'message deleted',
			isDeleted: true
		});
	}

	return messages.length;
};

const scrubDmDataForUser = async (ctx: MutationCtx, authId: string) => {
	const myReactions = await ctx.db
		.query('dm_reactions')
		.withIndex('by_userAuthId_and_createdAt', (q) => q.eq('userAuthId', authId))
		.collect();
	for (const reaction of myReactions) {
		await ctx.db.delete(reaction._id);
	}

	const participantRows = await ctx.db
		.query('dm_participants')
		.withIndex('by_userAuthId_and_lastMessageAt', (q) => q.eq('userAuthId', authId))
		.collect();
	for (const participant of participantRows) {
		await ctx.db.delete(participant._id);
	}

	const readCursors = await ctx.db
		.query('dm_read_cursors')
		.withIndex('by_userAuthId', (q) => q.eq('userAuthId', authId))
		.collect();
	for (const cursor of readCursors) {
		await ctx.db.delete(cursor._id);
	}

	const messages = await ctx.db
		.query('dm_messages')
		.withIndex('by_senderAuthId_and_createdAt', (q) => q.eq('senderAuthId', authId))
		.collect();
	for (const message of messages) {
		const reactions = await ctx.db
			.query('dm_reactions')
			.withIndex('by_messageId', (q) => q.eq('messageId', message._id))
			.collect();
		for (const reaction of reactions) {
			await ctx.db.delete(reaction._id);
		}

		await ctx.db.patch(message._id, {
			body: 'message deleted',
			isDeleted: true
		});
	}

	return messages.length;
};

export const ensureProfileForAuth = internalMutation({
	args: {
		authId: v.string(),
		email: v.string(),
		name: v.string(),
		image: v.optional(v.union(v.null(), v.string()))
	},
	returns: v.id('users_profile'),
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query('users_profile')
			.withIndex('by_authId', (q) => q.eq('authId', args.authId))
			.unique();

		if (existing) {
			await ctx.db.patch(existing._id, {
				email: args.email,
				name: args.name,
				nameLower: normalizeSearchText(args.name),
				image: args.image,
				updatedAt: Date.now()
			});
			return existing._id;
		}

		const now = Date.now();
		return await ctx.db.insert('users_profile', {
			authId: args.authId,
			email: args.email,
			name: args.name,
			nameLower: normalizeSearchText(args.name),
			image: args.image,
			createdAt: now,
			updatedAt: now
		});
	}
});

export const setUsername = mutation({
	args: {
		username: v.string()
	},
	returns: v.object({
		username: v.string()
	}),
	handler: async (ctx, args) => {
		const authUser = await requireAuthenticatedUser(ctx);
		await rateLimiter.limit(ctx, 'setUsername', { key: authUser._id, throws: true });

		const username = normalizeUsername(args.username);
		if (!USERNAME_PATTERN.test(username)) {
			throw new Error('Username must match [a-z0-9_]{3,20}.');
		}
		if (RESERVED_USERNAMES.has(username)) {
			throw new Error('This username is reserved.');
		}

		const profileId: Id<'users_profile'> = await ctx.runMutation(
			internal.profiles.ensureProfileForAuth,
			{
				authId: authUser._id,
				email: authUser.email,
				name: authUser.name,
				image: authUser.image
			}
		);
		const profile = await ctx.db.get(profileId);
		if (!profile) {
			throw new Error('Profile not found.');
		}

		if (profile.username) {
			if (profile.username !== username) {
				throw new Error('Username is immutable once set.');
			}
			return { username: profile.username };
		}

		const taken = await ctx.db
			.query('users_profile')
			.withIndex('by_usernameLower', (q) => q.eq('usernameLower', username))
			.unique();

		if (taken && taken._id !== profile._id) {
			throw new Error('Username is already taken.');
		}

		await ctx.db.patch(profile._id, {
			username,
			usernameLower: username,
			usernameSetAt: profile.usernameSetAt ?? Date.now(),
			updatedAt: Date.now()
		});

		return { username };
	}
});

export const getMyProfile = query({
	args: {},
	returns: v.union(v.null(), profileSummaryValidator),
	handler: async (ctx) => {
		const authUser = await getOptionalAuthUser(ctx);
		if (!authUser) {
			return null;
		}
		const profile = await toProfileSummary(ctx, authUser._id);
		return profile;
	}
});

export const deleteMyAccountDataFromDb = internalMutation({
	args: {
		authId: v.string()
	},
	returns: deleteMyAccountDbResultValidator,
	handler: async (ctx, args) => {
		const ownedCommunities = await ctx.db
			.query('communities')
			.withIndex('by_ownerAuthId_and_createdAt', (q) => q.eq('ownerAuthId', args.authId))
			.collect();
		const ownedCollections = await ctx.db
			.query('source_collections')
			.withIndex('by_ownerKind_and_ownerAuthId_and_updatedAt', (q) =>
				q.eq('ownerKind', 'user').eq('ownerAuthId', args.authId)
			)
			.collect();
		const authoredPosts = await ctx.db
			.query('posts')
			.withIndex('by_authorAuthId_and_createdAt', (q) => q.eq('authorAuthId', args.authId))
			.collect();

		const r2Keys: Array<string> = [];

		for (const community of ownedCommunities) {
			const result = await deleteCommunityCascadeByDoc(ctx, community);
			r2Keys.push(...result.r2Keys);
		}

		for (const collection of ownedCollections) {
			await deleteCollectionCascadeByDoc(ctx, collection);
		}

		for (const post of authoredPosts) {
			const result = await deletePostCascadeByDoc(ctx, post);
			if (result.r2Key) {
				r2Keys.push(result.r2Key);
			}
		}

		const scrubbedCommentCount = await scrubPostCommentsForUser(ctx, args.authId);
		const scrubbedCommunityChatMessageCount = await scrubCommunityChatForUser(ctx, args.authId);
		const scrubbedDmMessageCount = await scrubDmDataForUser(ctx, args.authId);

		const [
			postVotes,
			commentVotes,
			followsAsFollower,
			followsAsTarget,
			communityFollows,
			sourceSubscriptions,
			sourceDeliveries,
			sourceJobs,
			collectionFollows,
			collectionSuggestions,
			similarLinkExclusions,
			activeMemberships,
			pendingMemberships,
			rejectedMemberships
		] = await Promise.all([
			ctx.db
				.query('post_votes')
				.withIndex('by_userAuthId_and_createdAt', (q) => q.eq('userAuthId', args.authId))
				.collect(),
			ctx.db
				.query('post_comment_votes')
				.withIndex('by_userAuthId_and_createdAt', (q) => q.eq('userAuthId', args.authId))
				.collect(),
			ctx.db
				.query('follows_users')
				.withIndex('by_followerAuthId_and_createdAt', (q) => q.eq('followerAuthId', args.authId))
				.collect(),
			ctx.db
				.query('follows_users')
				.withIndex('by_targetAuthId_and_createdAt', (q) => q.eq('targetAuthId', args.authId))
				.collect(),
			ctx.db
				.query('follows_communities')
				.withIndex('by_followerAuthId_and_createdAt', (q) => q.eq('followerAuthId', args.authId))
				.collect(),
			ctx.db
				.query('source_subscriptions')
				.withIndex('by_userAuthId_and_updatedAt', (q) => q.eq('userAuthId', args.authId))
				.collect(),
			ctx.db
				.query('user_source_items')
				.withIndex('by_userAuthId_and_publishedAt', (q) => q.eq('userAuthId', args.authId))
				.collect(),
			ctx.db
				.query('source_jobs')
				.withIndex('by_userAuthId_and_createdAt', (q) => q.eq('userAuthId', args.authId))
				.collect(),
			ctx.db
				.query('source_collection_follows')
				.withIndex('by_userAuthId_and_createdAt', (q) => q.eq('userAuthId', args.authId))
				.collect(),
			ctx.db
				.query('source_collection_suggestions')
				.withIndex('by_suggestedByAuthId_and_createdAt', (q) =>
					q.eq('suggestedByAuthId', args.authId)
				)
				.collect(),
			ctx.db
				.query('similar_links_domain_exclusions')
				.withIndex('by_userAuthId_and_updatedAt', (q) => q.eq('userAuthId', args.authId))
				.collect(),
			ctx.db
				.query('community_memberships')
				.withIndex('by_userAuthId_and_status', (q) =>
					q.eq('userAuthId', args.authId).eq('status', 'active')
				)
				.collect(),
			ctx.db
				.query('community_memberships')
				.withIndex('by_userAuthId_and_status', (q) =>
					q.eq('userAuthId', args.authId).eq('status', 'pending')
				)
				.collect(),
			ctx.db
				.query('community_memberships')
				.withIndex('by_userAuthId_and_status', (q) =>
					q.eq('userAuthId', args.authId).eq('status', 'rejected')
				)
				.collect()
		]);

		for (const vote of postVotes) {
			await ctx.db.delete(vote._id);
		}
		for (const vote of commentVotes) {
			await ctx.db.delete(vote._id);
		}

		const followIds = new Set<string>();
		for (const follow of [...followsAsFollower, ...followsAsTarget]) {
			if (followIds.has(follow._id)) {
				continue;
			}
			followIds.add(follow._id);
			await ctx.db.delete(follow._id);
		}

		for (const follow of communityFollows) {
			await ctx.db.delete(follow._id);
		}
		for (const subscription of sourceSubscriptions) {
			await ctx.db.delete(subscription._id);
		}
		for (const delivery of sourceDeliveries) {
			await ctx.db.delete(delivery._id);
		}
		for (const job of sourceJobs) {
			await ctx.db.delete(job._id);
		}
		for (const follow of collectionFollows) {
			await ctx.db.delete(follow._id);
		}
		for (const suggestion of collectionSuggestions) {
			await ctx.db.delete(suggestion._id);
		}
		for (const exclusion of similarLinkExclusions) {
			await ctx.db.delete(exclusion._id);
		}
		for (const membership of [
			...activeMemberships,
			...pendingMemberships,
			...rejectedMemberships
		]) {
			await ctx.db.delete(membership._id);
		}

		const profile = await ctx.db
			.query('users_profile')
			.withIndex('by_authId', (q) => q.eq('authId', args.authId))
			.unique();
		if (profile) {
			await ctx.db.delete(profile._id);
		}

		return {
			deletedCommunityCount: ownedCommunities.length,
			deletedCollectionCount: ownedCollections.length,
			deletedPostCount: authoredPosts.length,
			deletedSubscriptionCount: sourceSubscriptions.length,
			scrubbedCommentCount,
			scrubbedCommunityChatMessageCount,
			scrubbedDmMessageCount,
			r2Keys
		};
	}
});

export const deleteMyAccountData = action({
	args: {},
	returns: deleteMyAccountResultValidator,
	handler: async (
		ctx
	): Promise<{
		deletedCommunityCount: number;
		deletedCollectionCount: number;
		deletedPostCount: number;
		deletedSubscriptionCount: number;
		scrubbedCommentCount: number;
		scrubbedCommunityChatMessageCount: number;
		scrubbedDmMessageCount: number;
		r2DeletedCount: number;
	}> => {
		const authUser = await getAuthUser(ctx);
		const result: {
			deletedCommunityCount: number;
			deletedCollectionCount: number;
			deletedPostCount: number;
			deletedSubscriptionCount: number;
			scrubbedCommentCount: number;
			scrubbedCommunityChatMessageCount: number;
			scrubbedDmMessageCount: number;
			r2Keys: Array<string>;
		} = await ctx.runMutation((internal as any).profiles.deleteMyAccountDataFromDb, {
			authId: authUser._id
		});
		const r2DeletedCount: number =
			result.r2Keys.length > 0
				? await ctx.runAction((internal as any).admin.deleteR2KeysWithRetry, {
						entityType: 'account',
						entityId: authUser._id,
						r2Keys: result.r2Keys
					})
				: 0;

		return {
			deletedCommunityCount: result.deletedCommunityCount,
			deletedCollectionCount: result.deletedCollectionCount,
			deletedPostCount: result.deletedPostCount,
			deletedSubscriptionCount: result.deletedSubscriptionCount,
			scrubbedCommentCount: result.scrubbedCommentCount,
			scrubbedCommunityChatMessageCount: result.scrubbedCommunityChatMessageCount,
			scrubbedDmMessageCount: result.scrubbedDmMessageCount,
			r2DeletedCount
		};
	}
});

export const getUsernameForAuth = internalQuery({
	args: {
		authId: v.string()
	},
	returns: v.union(v.null(), v.string()),
	handler: async (ctx, args) => {
		const profile = await ctx.db
			.query('users_profile')
			.withIndex('by_authId', (q) => q.eq('authId', args.authId))
			.unique();

		return profile?.username ?? null;
	}
});

export const getByUsername = query({
	args: {
		username: v.string()
	},
	returns: v.union(v.null(), profileSummaryValidator),
	handler: async (ctx, args) => {
		const username = normalizeUsername(args.username);
		const profile = await ctx.db
			.query('users_profile')
			.withIndex('by_username', (q) => q.eq('username', username))
			.unique();

		if (!profile) {
			return null;
		}

		const summary = await toProfileSummary(ctx, profile.authId);
		return summary;
	}
});

export const backfillSearchFields = internalMutation({
	args: {
		paginationOpts: paginationOptsValidator
	},
	returns: v.object({
		processedProfiles: v.number(),
		isDone: v.boolean(),
		continueCursor: v.union(v.string(), v.null())
	}),
	handler: async (ctx, args) => {
		const result = await ctx.db.query('users_profile').paginate(args.paginationOpts);
		let processedProfiles = 0;

		for (const profile of result.page) {
			const nextNameLower = normalizeSearchText(profile.name);
			const nextUsernameLower = profile.username ? normalizeUsername(profile.username) : undefined;

			if (profile.nameLower !== nextNameLower || profile.usernameLower !== nextUsernameLower) {
				await ctx.db.patch(profile._id, {
					nameLower: nextNameLower,
					usernameLower: nextUsernameLower,
					updatedAt: Date.now()
				});
			}

			processedProfiles += 1;
		}

		return {
			processedProfiles,
			isDone: result.isDone,
			continueCursor: result.continueCursor
		};
	}
});
