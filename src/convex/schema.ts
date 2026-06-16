import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

const schema = defineSchema({
	users_profile: defineTable({
		authId: v.string(),
		email: v.string(),
		name: v.string(),
		nameLower: v.string(),
		image: v.optional(v.union(v.null(), v.string())),
		username: v.optional(v.string()),
		usernameLower: v.optional(v.string()),
		usernameSetAt: v.optional(v.number()),
		bio: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_authId', ['authId'])
		.index('by_username', ['username'])
		.index('by_usernameLower', ['usernameLower'])
		.index('by_nameLower', ['nameLower']),
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
		scopeType: v.union(v.literal('global'), v.literal('community')),
		visibility: v.optional(v.union(v.literal('public'), v.literal('private'))),
		visibilityScope: v.union(
			v.literal('public_global'),
			v.literal('public_community'),
			v.literal('private')
		),
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
		tags: v.optional(v.array(v.string())),
		sourceType: v.optional(v.string()),
		sourceId: v.optional(v.id('sources')),
		sourceItemId: v.optional(v.id('source_items')),
		sourceTypeSnapshot: v.optional(v.string()),
		sourceTitleSnapshot: v.optional(v.string()),
		sourceUrlSnapshot: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_createdAt', ['createdAt'])
		.index('by_scopeType_and_createdAt', ['scopeType', 'createdAt'])
		.index('by_visibilityScope_and_createdAt', ['visibilityScope', 'createdAt'])
		.index('by_visibilityScope_and_score_and_createdAt', ['visibilityScope', 'score', 'createdAt'])
		.index('by_visibilityScope_and_commentCount_and_createdAt', [
			'visibilityScope',
			'commentCount',
			'createdAt'
		])
		.index('by_communityId_and_createdAt', ['communityId', 'createdAt'])
		.index('by_communityId_and_visibility_and_createdAt', [
			'communityId',
			'visibility',
			'createdAt'
		])
		.index('by_communityId_and_visibility_and_score_and_createdAt', [
			'communityId',
			'visibility',
			'score',
			'createdAt'
		])
		.index('by_communityId_and_visibility_and_commentCount_and_createdAt', [
			'communityId',
			'visibility',
			'commentCount',
			'createdAt'
		])
		.index('by_authorAuthId_and_createdAt', ['authorAuthId', 'createdAt'])
		.index('by_authorAuthId_and_visibility_and_createdAt', [
			'authorAuthId',
			'visibility',
			'createdAt'
		])
		.index('by_authorAuthId_and_visibility_and_score_and_createdAt', [
			'authorAuthId',
			'visibility',
			'score',
			'createdAt'
		])
		.index('by_authorAuthId_and_visibility_and_commentCount_and_createdAt', [
			'authorAuthId',
			'visibility',
			'commentCount',
			'createdAt'
		])
		.index('by_authorAuthId_and_sourceId_and_createdAt', ['authorAuthId', 'sourceId', 'createdAt'])
		.index('by_authorAuthId_and_sourceItemId_and_createdAt', [
			'authorAuthId',
			'sourceItemId',
			'createdAt'
		])
		.index('by_sourceId_and_createdAt', ['sourceId', 'createdAt'])
		.index('by_sourceItemId_and_createdAt', ['sourceItemId', 'createdAt'])
		.index('by_r2Key_and_createdAt', ['r2Key', 'createdAt']),
	sources: defineTable({
		type: v.union(v.literal('website'), v.literal('rss'), v.literal('youtube')),
		normalizedKey: v.string(),
		canonicalUrl: v.string(),
		rssFeedUrl: v.optional(v.string()),
		rssFeedNormalizedKey: v.optional(v.string()),
		title: v.string(),
		description: v.optional(v.string()),
		status: v.union(
			v.literal('active'),
			v.literal('paused'),
			v.literal('error'),
			v.literal('deleting')
		),
		lastFetchedAt: v.optional(v.number()),
		lastSuccessAt: v.optional(v.number()),
		lastError: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_normalizedKey', ['normalizedKey'])
		.index('by_rssFeedNormalizedKey', ['rssFeedNormalizedKey'])
		.index('by_type_and_updatedAt', ['type', 'updatedAt'])
		.index('by_status_and_updatedAt', ['status', 'updatedAt']),
	source_rss_feeds: defineTable({
		sourceId: v.id('sources'),
		feedUrl: v.string(),
		feedNormalizedKey: v.string(),
		title: v.optional(v.string()),
		status: v.union(v.literal('active'), v.literal('paused'), v.literal('error')),
		lastFetchedAt: v.optional(v.number()),
		lastSuccessAt: v.optional(v.number()),
		lastError: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_sourceId_and_updatedAt', ['sourceId', 'updatedAt'])
		.index('by_sourceId_and_feedNormalizedKey', ['sourceId', 'feedNormalizedKey'])
		.index('by_feedNormalizedKey', ['feedNormalizedKey'])
		.index('by_status_and_updatedAt', ['status', 'updatedAt']),
	source_collections: defineTable({
		slug: v.string(),
		title: v.string(),
		description: v.optional(v.string()),
		visibility: v.union(v.literal('public'), v.literal('private')),
		ownerKind: v.union(v.literal('user'), v.literal('community')),
		ownerAuthId: v.optional(v.string()),
		ownerCommunityId: v.optional(v.id('communities')),
		tags: v.optional(v.array(v.string())),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_slug', ['slug'])
		.index('by_visibility_and_updatedAt', ['visibility', 'updatedAt'])
		.index('by_ownerKind_and_ownerAuthId_and_updatedAt', ['ownerKind', 'ownerAuthId', 'updatedAt'])
		.index('by_ownerKind_and_ownerCommunityId_and_updatedAt', [
			'ownerKind',
			'ownerCommunityId',
			'updatedAt'
		]),
	source_collection_items: defineTable({
		collectionId: v.id('source_collections'),
		sourceId: v.id('sources'),
		sourceItemId: v.optional(v.id('source_items')),
		note: v.optional(v.string()),
		position: v.number(),
		addedByAuthId: v.string(),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_collectionId_and_position', ['collectionId', 'position'])
		.index('by_collectionId_and_sourceId', ['collectionId', 'sourceId'])
		.index('by_collectionId_and_sourceItemId', ['collectionId', 'sourceItemId'])
		.index('by_sourceId_and_createdAt', ['sourceId', 'createdAt'])
		.index('by_sourceItemId_and_createdAt', ['sourceItemId', 'createdAt']),
	source_collection_follows: defineTable({
		userAuthId: v.string(),
		collectionId: v.id('source_collections'),
		createdAt: v.number()
	})
		.index('by_userAuthId_and_collectionId', ['userAuthId', 'collectionId'])
		.index('by_userAuthId_and_createdAt', ['userAuthId', 'createdAt'])
		.index('by_collectionId_and_createdAt', ['collectionId', 'createdAt']),
	source_collection_suggestions: defineTable({
		collectionId: v.id('source_collections'),
		sourceId: v.id('sources'),
		sourceItemId: v.optional(v.id('source_items')),
		suggestedByAuthId: v.string(),
		note: v.optional(v.string()),
		status: v.union(v.literal('pending'), v.literal('approved'), v.literal('rejected')),
		createdAt: v.number(),
		updatedAt: v.number(),
		reviewedAt: v.optional(v.number()),
		reviewedByAuthId: v.optional(v.string())
	})
		.index('by_collectionId_and_status', ['collectionId', 'status'])
		.index('by_collectionId_and_sourceId_and_status', ['collectionId', 'sourceId', 'status'])
		.index('by_collectionId_and_sourceItemId_and_status', [
			'collectionId',
			'sourceItemId',
			'status'
		])
		.index('by_sourceId_and_updatedAt', ['sourceId', 'updatedAt'])
		.index('by_sourceItemId_and_updatedAt', ['sourceItemId', 'updatedAt'])
		.index('by_suggestedByAuthId_and_createdAt', ['suggestedByAuthId', 'createdAt']),
	source_subscriptions: defineTable({
		userAuthId: v.string(),
		sourceId: v.id('sources'),
		status: v.union(v.literal('active'), v.literal('paused')),
		addedVia: v.optional(v.literal('manual')),
		includeInSimilarLinks: v.optional(v.boolean()),
		createdAt: v.number(),
		updatedAt: v.number(),
		unsubscribedAt: v.optional(v.number())
	})
		.index('by_userAuthId_and_sourceId', ['userAuthId', 'sourceId'])
		.index('by_userAuthId_and_updatedAt', ['userAuthId', 'updatedAt'])
		.index('by_sourceId_and_updatedAt', ['sourceId', 'updatedAt'])
		.index('by_sourceId_and_status', ['sourceId', 'status']),
	source_items: defineTable({
		sourceId: v.id('sources'),
		rssFeedId: v.optional(v.id('source_rss_feeds')),
		externalId: v.optional(v.string()),
		url: v.string(),
		urlHash: v.string(),
		title: v.string(),
		snippet: v.string(),
		body: v.optional(v.string()),
		r2Key: v.optional(v.string()),
		publishedAt: v.number(),
		createdAt: v.number(),
		updatedAt: v.number(),
		contentHash: v.optional(v.string()),
		contentType: v.optional(v.string()),
		originHost: v.optional(v.string()),
		originSiteUrl: v.optional(v.string()),
		suggestedSourceType: v.optional(v.string()),
		suggestedSourceNormalizedKey: v.optional(v.string()),
		suggestedSourceCanonicalUrl: v.optional(v.string())
	})
		.index('by_sourceId_and_publishedAt', ['sourceId', 'publishedAt'])
		.index('by_sourceId_and_externalId', ['sourceId', 'externalId'])
		.index('by_sourceId_and_urlHash', ['sourceId', 'urlHash'])
		.index('by_sourceId_and_suggestedSourceNormalizedKey', [
			'sourceId',
			'suggestedSourceNormalizedKey'
		])
		.index('by_rssFeedId_and_publishedAt', ['rssFeedId', 'publishedAt'])
		.index('by_r2Key_and_publishedAt', ['r2Key', 'publishedAt'])
		.index('by_publishedAt', ['publishedAt']),
	user_source_items: defineTable({
		userAuthId: v.string(),
		sourceId: v.id('sources'),
		sourceItemId: v.id('source_items'),
		publishedAt: v.number(),
		deliveredAt: v.number()
	})
		.index('by_userAuthId_and_publishedAt', ['userAuthId', 'publishedAt'])
		.index('by_userAuthId_and_sourceId_and_publishedAt', ['userAuthId', 'sourceId', 'publishedAt'])
		.index('by_userAuthId_and_sourceItemId', ['userAuthId', 'sourceItemId'])
		.index('by_sourceItemId', ['sourceItemId'])
		.index('by_sourceId_and_publishedAt', ['sourceId', 'publishedAt']),
	source_jobs: defineTable({
		jobType: v.union(
			v.literal('sync_source'),
			v.literal('bulk_unsubscribe'),
			v.literal('resubscribe_backfill')
		),
		userAuthId: v.optional(v.string()),
		sourceId: v.optional(v.id('sources')),
		status: v.union(
			v.literal('queued'),
			v.literal('running'),
			v.literal('done'),
			v.literal('failed')
		),
		cursor: v.optional(v.string()),
		processed: v.number(),
		error: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
		finishedAt: v.optional(v.number())
	})
		.index('by_status_and_updatedAt', ['status', 'updatedAt'])
		.index('by_userAuthId_and_createdAt', ['userAuthId', 'createdAt'])
		.index('by_sourceId_and_createdAt', ['sourceId', 'createdAt']),
	source_nightly_runs: defineTable({
		runDate: v.string(),
		status: v.union(v.literal('running'), v.literal('done'), v.literal('failed')),
		startedAt: v.number(),
		finishedAt: v.optional(v.number()),
		processedSources: v.number(),
		queuedJobs: v.number(),
		cursor: v.optional(v.string()),
		error: v.optional(v.string()),
		updatedAt: v.number()
	})
		.index('by_runDate', ['runDate'])
		.index('by_startedAt', ['startedAt'])
		.index('by_status_and_updatedAt', ['status', 'updatedAt']),
	security_events: defineTable({
		eventType: v.string(),
		severity: v.union(
			v.literal('info'),
			v.literal('warn'),
			v.literal('error'),
			v.literal('critical')
		),
		surface: v.string(),
		message: v.string(),
		actorAuthId: v.optional(v.string()),
		entityType: v.optional(v.string()),
		entityId: v.optional(v.string()),
		metadata: v.optional(v.string()),
		createdAt: v.number()
	})
		.index('by_createdAt', ['createdAt'])
		.index('by_severity_and_createdAt', ['severity', 'createdAt'])
		.index('by_eventType_and_createdAt', ['eventType', 'createdAt'])
		.index('by_actorAuthId_and_createdAt', ['actorAuthId', 'createdAt']),
	admin_audit_logs: defineTable({
		actorAuthId: v.string(),
		action: v.string(),
		targetType: v.string(),
		targetId: v.string(),
		status: v.union(v.literal('started'), v.literal('succeeded'), v.literal('failed')),
		details: v.optional(v.string()),
		createdAt: v.number()
	})
		.index('by_createdAt', ['createdAt'])
		.index('by_actorAuthId_and_createdAt', ['actorAuthId', 'createdAt'])
		.index('by_action_and_createdAt', ['action', 'createdAt'])
		.index('by_targetType_and_targetId_and_createdAt', ['targetType', 'targetId', 'createdAt']),
	deletion_jobs: defineTable({
		requestKey: v.string(),
		requestedByAuthId: v.string(),
		targetType: v.union(v.literal('source'), v.literal('source_item'), v.literal('post')),
		targetId: v.string(),
		status: v.union(
			v.literal('queued'),
			v.literal('running'),
			v.literal('done'),
			v.literal('failed'),
			v.literal('cancelled')
		),
		processed: v.number(),
		result: v.optional(v.string()),
		error: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
		finishedAt: v.optional(v.number())
	})
		.index('by_requestKey', ['requestKey'])
		.index('by_status_and_updatedAt', ['status', 'updatedAt'])
		.index('by_requestedByAuthId_and_createdAt', ['requestedByAuthId', 'createdAt'])
		.index('by_targetType_and_targetId_and_createdAt', ['targetType', 'targetId', 'createdAt']),
	r2_retry_jobs: defineTable({
		entityType: v.string(),
		entityId: v.string(),
		r2Key: v.string(),
		operation: v.literal('delete'),
		stage: v.optional(v.union(v.literal('object_delete'), v.literal('metadata_delete'))),
		status: v.union(
			v.literal('queued'),
			v.literal('running'),
			v.literal('done'),
			v.literal('failed')
		),
		attemptCount: v.number(),
		nextRunAt: v.number(),
		lastError: v.optional(v.string()),
		objectDeletedAt: v.optional(v.number()),
		metadataDeletedAt: v.optional(v.number()),
		createdAt: v.number(),
		updatedAt: v.number(),
		finishedAt: v.optional(v.number())
	})
		.index('by_status_and_nextRunAt', ['status', 'nextRunAt'])
		.index('by_entityType_and_entityId_and_r2Key', ['entityType', 'entityId', 'r2Key'])
		.index('by_entityType_and_entityId_and_createdAt', ['entityType', 'entityId', 'createdAt'])
		.index('by_r2Key_and_createdAt', ['r2Key', 'createdAt']),
	scheduler_locks: defineTable({
		lockKey: v.string(),
		owner: v.string(),
		leaseExpiresAt: v.number(),
		heartbeatAt: v.number(),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_lockKey', ['lockKey'])
		.index('by_leaseExpiresAt', ['leaseExpiresAt'])
		.index('by_owner_and_updatedAt', ['owner', 'updatedAt']),
	post_tags: defineTable({
		postId: v.id('posts'),
		tagLower: v.string(),
		createdAt: v.number()
	})
		.index('by_postId', ['postId'])
		.index('by_postId_and_tagLower', ['postId', 'tagLower'])
		.index('by_tagLower_and_createdAt', ['tagLower', 'createdAt']),
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
	community_chat_messages: defineTable({
		communityId: v.id('communities'),
		userAuthId: v.string(),
		userName: v.string(),
		userImage: v.optional(v.string()),
		body: v.string(),
		replyTo: v.optional(v.id('community_chat_messages')),
		editedAt: v.optional(v.number()),
		isDeleted: v.boolean(),
		createdAt: v.number()
	})
		.index('by_communityId_and_createdAt', ['communityId', 'createdAt'])
		.index('by_userAuthId_and_createdAt', ['userAuthId', 'createdAt']),
	community_chat_reactions: defineTable({
		communityId: v.id('communities'),
		messageId: v.id('community_chat_messages'),
		userAuthId: v.string(),
		emoji: v.string(),
		createdAt: v.number()
	})
		.index('by_communityId_and_messageId', ['communityId', 'messageId'])
		.index('by_messageId_and_userAuthId', ['messageId', 'userAuthId'])
		.index('by_userAuthId_and_createdAt', ['userAuthId', 'createdAt']),
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
	}).index('by_entityType_and_entityId', ['entityType', 'entityId']),
	similar_links_cache: defineTable({
		viewerKey: v.string(),
		normalizedUrl: v.string(),
		scope: v.union(v.literal('sources'), v.literal('web')),
		sourceHost: v.string(),
		sourceDomainFingerprint: v.optional(v.string()),
		sourceDomainCount: v.optional(v.number()),
		sourceDomainsSnapshot: v.optional(v.array(v.string())),
		status: v.union(v.literal('ready'), v.literal('empty'), v.literal('error')),
		results: v.array(
			v.object({
				id: v.string(),
				url: v.string(),
				title: v.string(),
				publishedDate: v.optional(v.string()),
				author: v.optional(v.string()),
				image: v.optional(v.string()),
				favicon: v.optional(v.string()),
				highlights: v.array(v.string()),
				highlightScores: v.array(v.number())
			})
		),
		lastFetchedAt: v.optional(v.number()),
		expiresAt: v.number(),
		lastAttemptAt: v.optional(v.number()),
		lastError: v.optional(v.string()),
		refreshState: v.union(v.literal('idle'), v.literal('refreshing')),
		refreshLeaseExpiresAt: v.optional(v.number()),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_viewerKey_and_normalizedUrl_and_scope', ['viewerKey', 'normalizedUrl', 'scope'])
		.index('by_expiresAt', ['expiresAt'])
		.index('by_refreshState_and_refreshLeaseExpiresAt', ['refreshState', 'refreshLeaseExpiresAt'])
		.index('by_status_and_updatedAt', ['status', 'updatedAt']),
	similar_links_domain_exclusions: defineTable({
		userAuthId: v.string(),
		domain: v.string(),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_userAuthId_and_domain', ['userAuthId', 'domain'])
		.index('by_userAuthId_and_updatedAt', ['userAuthId', 'updatedAt']),
	dm_conversations: defineTable({
		participant1: v.string(),
		participant2: v.string(),
		lastMessageAt: v.number(),
		createdAt: v.number()
	})
		.index('by_participant1', ['participant1'])
		.index('by_participant2', ['participant2'])
		.index('by_pair', ['participant1', 'participant2']),
	dm_participants: defineTable({
		conversationId: v.id('dm_conversations'),
		userAuthId: v.string(),
		otherUserAuthId: v.string(),
		unreadCount: v.number(),
		lastReadAt: v.number(),
		lastReadMessageAt: v.number(),
		lastMessageAt: v.number(),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_conversationId_and_userAuthId', ['conversationId', 'userAuthId'])
		.index('by_userAuthId_and_lastMessageAt', ['userAuthId', 'lastMessageAt'])
		.index('by_userAuthId_and_otherUserAuthId', ['userAuthId', 'otherUserAuthId']),
	dm_messages: defineTable({
		conversationId: v.id('dm_conversations'),
		senderAuthId: v.string(),
		senderName: v.string(),
		senderImage: v.optional(v.string()),
		body: v.string(),
		replyTo: v.optional(v.id('dm_messages')),
		editedAt: v.optional(v.number()),
		isDeleted: v.boolean(),
		createdAt: v.number()
	})
		.index('by_conversationId_and_createdAt', ['conversationId', 'createdAt'])
		.index('by_senderAuthId_and_createdAt', ['senderAuthId', 'createdAt']),
	dm_reactions: defineTable({
		messageId: v.id('dm_messages'),
		userAuthId: v.string(),
		emoji: v.string(),
		createdAt: v.number()
	})
		.index('by_messageId', ['messageId'])
		.index('by_messageId_and_userAuthId', ['messageId', 'userAuthId'])
		.index('by_userAuthId_and_createdAt', ['userAuthId', 'createdAt']),
	dm_read_cursors: defineTable({
		conversationId: v.id('dm_conversations'),
		userAuthId: v.string(),
		lastReadAt: v.number()
	})
		.index('by_conversationId_and_userAuthId', ['conversationId', 'userAuthId'])
		.index('by_userAuthId', ['userAuthId'])
});

export default schema;
