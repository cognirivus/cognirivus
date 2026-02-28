import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { tables as authTables } from './betterAuth/schema';

const schema = defineSchema({
	...authTables,
	users_profile: defineTable({
		authId: v.string(),
		email: v.string(),
		name: v.string(),
		image: v.optional(v.union(v.null(), v.string())),
		username: v.optional(v.string()),
		usernameSetAt: v.optional(v.number()),
		bio: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_authId', ['authId'])
		.index('by_username', ['username']),
	communities: defineTable({
		slug: v.string(),
		name: v.string(),
		description: v.optional(v.string()),
		visibility: v.union(v.literal('public'), v.literal('private')),
		ownerAuthId: v.string(),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_slug', ['slug'])
		.index('by_ownerAuthId_and_createdAt', ['ownerAuthId', 'createdAt'])
		.index('by_visibility_and_createdAt', ['visibility', 'createdAt']),
	community_memberships: defineTable({
		communityId: v.id('communities'),
		userAuthId: v.string(),
		role: v.union(v.literal('owner'), v.literal('admin'), v.literal('member')),
		status: v.union(v.literal('active'), v.literal('pending'), v.literal('rejected')),
		requestedAt: v.number(),
		respondedAt: v.optional(v.number()),
		createdAt: v.number()
	})
		.index('by_communityId_and_userAuthId', ['communityId', 'userAuthId'])
		.index('by_communityId_and_status', ['communityId', 'status'])
		.index('by_userAuthId_and_status', ['userAuthId', 'status']),
	posts: defineTable({
		authorAuthId: v.string(),
		communityId: v.optional(v.id('communities')),
		type: v.union(v.literal('text'), v.literal('link'), v.literal('media')),
		title: v.string(),
		body: v.optional(v.string()),
		snippet: v.string(),
		r2Key: v.optional(v.string()),
		url: v.optional(v.string()),
		score: v.number(),
		likes: v.number(),
		dislikes: v.number(),
		commentCount: v.number(),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_createdAt', ['createdAt'])
		.index('by_communityId_and_createdAt', ['communityId', 'createdAt'])
		.index('by_authorAuthId_and_createdAt', ['authorAuthId', 'createdAt']),
	post_votes: defineTable({
		postId: v.id('posts'),
		userAuthId: v.string(),
		value: v.union(v.literal(1), v.literal(-1)),
		createdAt: v.number()
	})
		.index('by_postId_and_userAuthId', ['postId', 'userAuthId'])
		.index('by_postId_and_createdAt', ['postId', 'createdAt'])
		.index('by_userAuthId_and_createdAt', ['userAuthId', 'createdAt']),
	post_comments: defineTable({
		postId: v.id('posts'),
		authorAuthId: v.string(),
		parentId: v.optional(v.id('post_comments')),
		body: v.string(),
		score: v.number(),
		likes: v.number(),
		dislikes: v.number(),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_postId_and_createdAt', ['postId', 'createdAt'])
		.index('by_parentId_and_createdAt', ['parentId', 'createdAt'])
		.index('by_authorAuthId_and_createdAt', ['authorAuthId', 'createdAt']),
	post_comment_votes: defineTable({
		commentId: v.id('post_comments'),
		userAuthId: v.string(),
		value: v.union(v.literal(1), v.literal(-1)),
		createdAt: v.number()
	})
		.index('by_commentId_and_userAuthId', ['commentId', 'userAuthId'])
		.index('by_commentId_and_createdAt', ['commentId', 'createdAt'])
		.index('by_userAuthId_and_createdAt', ['userAuthId', 'createdAt']),
	follows_users: defineTable({
		followerAuthId: v.string(),
		targetAuthId: v.string(),
		createdAt: v.number()
	})
		.index('by_followerAuthId_and_targetAuthId', ['followerAuthId', 'targetAuthId'])
		.index('by_followerAuthId_and_createdAt', ['followerAuthId', 'createdAt'])
		.index('by_targetAuthId_and_createdAt', ['targetAuthId', 'createdAt']),
	follows_communities: defineTable({
		followerAuthId: v.string(),
		communityId: v.id('communities'),
		createdAt: v.number()
	})
		.index('by_followerAuthId_and_communityId', ['followerAuthId', 'communityId'])
		.index('by_followerAuthId_and_createdAt', ['followerAuthId', 'createdAt'])
		.index('by_communityId_and_createdAt', ['communityId', 'createdAt']),
	post_embeddings: defineTable({
		postId: v.id('posts'),
		model: v.optional(v.string()),
		embedding: v.optional(v.array(v.number())),
		createdAt: v.number()
	}).index('by_postId', ['postId']),
	ai_summary_cache: defineTable({
		entityType: v.union(v.literal('post'), v.literal('thread')),
		entityId: v.string(),
		summary: v.string(),
		model: v.string(),
		createdAt: v.number()
	}).index('by_entityType_and_entityId', ['entityType', 'entityId'])
});

export default schema;
