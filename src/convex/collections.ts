import { v } from 'convex/values';
import {
	internalMutation,
	mutation,
	query,
	type MutationCtx,
	type QueryCtx
} from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { getAuthUser, getOptionalAuthUser } from './auth';
import { requireUserWithUsername } from './lib/usernameGate';

const visibilityValidator = v.union(v.literal('public'), v.literal('private'));
const ownerKindValidator = v.union(v.literal('user'), v.literal('community'));
const suggestionStatusValidator = v.union(
	v.literal('pending'),
	v.literal('approved'),
	v.literal('rejected')
);

const COLLECTION_TITLE_LIMIT = 120;
const COLLECTION_DESCRIPTION_LIMIT = 400;
const COLLECTION_NOTE_LIMIT = 280;

const normalizeSlug = (value: string) => value.trim().toLowerCase();

const slugify = (value: string) => {
	const slug = value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48);
	return slug || 'collection';
};

const normalizeTags = (tags?: Array<string>) => {
	if (!tags || tags.length === 0) {
		return undefined;
	}
	const unique = [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
	return unique.length > 0 ? unique.slice(0, 12) : undefined;
};

const normalizeNote = (note?: string) => {
	const trimmed = note?.trim();
	if (!trimmed) {
		return undefined;
	}
	return trimmed.slice(0, COLLECTION_NOTE_LIMIT);
};

const getCollectionEntryType = (entry: { sourceItemId?: Id<'source_items'> | undefined }) =>
	entry.sourceItemId ? ('source_item' as const) : ('source' as const);

const getMembership = async (
	ctx: QueryCtx | MutationCtx,
	communityId: Id<'communities'>,
	userAuthId: string
) =>
	await ctx.db
		.query('community_memberships')
		.withIndex('by_communityId_and_userAuthId', (q) =>
			q.eq('communityId', communityId).eq('userAuthId', userAuthId)
		)
		.unique();

const isActiveMember = async (
	ctx: QueryCtx | MutationCtx,
	communityId: Id<'communities'>,
	userAuthId: string
) => {
	const membership = await getMembership(ctx, communityId, userAuthId);
	return membership?.status === 'active';
};

const requireCommunityManager = async (
	ctx: QueryCtx | MutationCtx,
	communityId: Id<'communities'>,
	userAuthId: string
) => {
	const membership = await getMembership(ctx, communityId, userAuthId);
	if (!membership || membership.status !== 'active') {
		throw new Error('Active community membership required.');
	}
	if (membership.role !== 'owner' && membership.role !== 'admin') {
		throw new Error('Community manager permission required.');
	}
	return membership;
};

const getProfileByAuthId = async (ctx: QueryCtx | MutationCtx, authId: string) =>
	await ctx.db
		.query('users_profile')
		.withIndex('by_authId', (q) => q.eq('authId', authId))
		.unique();

const ensureUniqueSlug = async (ctx: QueryCtx | MutationCtx, title: string) => {
	const base = slugify(title);
	for (let attempt = 0; attempt < 100; attempt += 1) {
		const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
		const existing = await ctx.db
			.query('source_collections')
			.withIndex('by_slug', (q) => q.eq('slug', candidate))
			.unique();
		if (!existing) {
			return candidate;
		}
	}
	throw new Error('Could not generate a unique collection slug.');
};

const isCollectionReadableBy = async (
	ctx: QueryCtx | MutationCtx,
	collection: Doc<'source_collections'>,
	viewerAuthId: string | null
) => {
	if (collection.ownerKind === 'user') {
		if (collection.visibility === 'public') {
			return true;
		}
		return viewerAuthId !== null && collection.ownerAuthId === viewerAuthId;
	}

	if (!collection.ownerCommunityId) {
		return false;
	}

	const community = await ctx.db.get(collection.ownerCommunityId);
	if (!community) {
		return false;
	}

	if (community.visibility === 'public') {
		if (collection.visibility === 'public') {
			return true;
		}
		return viewerAuthId ? await isActiveMember(ctx, community._id, viewerAuthId) : false;
	}

	if (!viewerAuthId) {
		return false;
	}

	return await isActiveMember(ctx, community._id, viewerAuthId);
};

const canSuggestToCollection = async (
	ctx: QueryCtx | MutationCtx,
	collection: Doc<'source_collections'>,
	viewerAuthId: string | null
) => {
	if (!viewerAuthId) {
		return false;
	}
	if (collection.ownerKind !== 'community' || !collection.ownerCommunityId) {
		return false;
	}
	return await isCollectionReadableBy(ctx, collection, viewerAuthId);
};

const canEditCollection = async (
	ctx: QueryCtx | MutationCtx,
	collection: Doc<'source_collections'>,
	viewerAuthId: string | null
) => {
	if (!viewerAuthId) {
		return false;
	}
	if (collection.ownerKind === 'user') {
		return collection.ownerAuthId === viewerAuthId;
	}
	if (!collection.ownerCommunityId) {
		return false;
	}
	try {
		await requireCommunityManager(ctx, collection.ownerCommunityId, viewerAuthId);
		return true;
	} catch {
		return false;
	}
};

const countCollectionItems = async (
	ctx: QueryCtx | MutationCtx,
	collectionId: Id<'source_collections'>
) =>
	(
		await ctx.db
			.query('source_collection_items')
			.withIndex('by_collectionId_and_position', (q) => q.eq('collectionId', collectionId))
			.collect()
	).length;

const countCollectionFollowers = async (
	ctx: QueryCtx | MutationCtx,
	collectionId: Id<'source_collections'>
) =>
	(
		await ctx.db
			.query('source_collection_follows')
			.withIndex('by_collectionId_and_createdAt', (q) => q.eq('collectionId', collectionId))
			.collect()
	).length;

const hasCollectionFollow = async (
	ctx: QueryCtx | MutationCtx,
	collectionId: Id<'source_collections'>,
	viewerAuthId: string | null
) => {
	if (!viewerAuthId) {
		return false;
	}
	const follow = await ctx.db
		.query('source_collection_follows')
		.withIndex('by_userAuthId_and_collectionId', (q) =>
			q.eq('userAuthId', viewerAuthId).eq('collectionId', collectionId)
		)
		.unique();
	return !!follow;
};

const collectionSummaryValidator = v.object({
	_id: v.id('source_collections'),
	slug: v.string(),
	title: v.string(),
	description: v.optional(v.string()),
	visibility: visibilityValidator,
	ownerKind: ownerKindValidator,
	ownerAuthId: v.optional(v.string()),
	ownerCommunityId: v.optional(v.id('communities')),
	ownerName: v.string(),
	ownerUsername: v.union(v.null(), v.string()),
	ownerCommunitySlug: v.union(v.null(), v.string()),
	ownerCommunityName: v.union(v.null(), v.string()),
	tags: v.optional(v.array(v.string())),
	itemCount: v.number(),
	followerCount: v.number(),
	isFollowing: v.boolean(),
	canEdit: v.boolean(),
	canSuggest: v.boolean(),
	createdAt: v.number(),
	updatedAt: v.number()
});

const collectionEntryValidator = v.object({
	_id: v.id('source_collection_items'),
	sourceId: v.id('sources'),
	sourceItemId: v.optional(v.id('source_items')),
	entryType: v.union(v.literal('source'), v.literal('source_item')),
	position: v.number(),
	note: v.optional(v.string()),
	addedByAuthId: v.string(),
	sourceTitle: v.string(),
	sourceDescription: v.optional(v.string()),
	sourceType: v.union(v.literal('website'), v.literal('rss'), v.literal('youtube')),
	sourceCanonicalUrl: v.string(),
	sourceStatus: v.union(
		v.literal('active'),
		v.literal('paused'),
		v.literal('error'),
		v.literal('deleting')
	),
	itemTitle: v.optional(v.string()),
	itemSnippet: v.optional(v.string()),
	itemUrl: v.optional(v.string()),
	itemPublishedAt: v.union(v.null(), v.number()),
	latestPublishedAt: v.union(v.null(), v.number()),
	createdAt: v.number(),
	updatedAt: v.number()
});

const collectionRecentItemValidator = v.object({
	_id: v.id('source_items'),
	sourceId: v.id('sources'),
	title: v.string(),
	snippet: v.string(),
	url: v.string(),
	publishedAt: v.number(),
	sourceTitle: v.string(),
	sourceType: v.union(v.literal('website'), v.literal('rss'), v.literal('youtube'))
});

const collectionDetailValidator = v.union(
	v.null(),
	v.object({
		collection: collectionSummaryValidator,
		items: v.array(collectionEntryValidator),
		recentItems: v.array(collectionRecentItemValidator)
	})
);

const suggestionValidator = v.object({
	_id: v.id('source_collection_suggestions'),
	collectionId: v.id('source_collections'),
	sourceId: v.id('sources'),
	sourceItemId: v.optional(v.id('source_items')),
	entryType: v.union(v.literal('source'), v.literal('source_item')),
	suggestedByAuthId: v.string(),
	suggestedByName: v.string(),
	suggestedByUsername: v.union(v.null(), v.string()),
	sourceTitle: v.string(),
	sourceType: v.union(v.literal('website'), v.literal('rss'), v.literal('youtube')),
	sourceCanonicalUrl: v.string(),
	itemTitle: v.optional(v.string()),
	itemUrl: v.optional(v.string()),
	itemPublishedAt: v.union(v.null(), v.number()),
	note: v.optional(v.string()),
	status: suggestionStatusValidator,
	createdAt: v.number(),
	updatedAt: v.number()
});

const buildCollectionSummary = async (
	ctx: QueryCtx | MutationCtx,
	collection: Doc<'source_collections'>,
	viewerAuthId: string | null
) => {
	const [itemCount, followerCount, isFollowing, canEdit, canSuggest] = await Promise.all([
		countCollectionItems(ctx, collection._id),
		countCollectionFollowers(ctx, collection._id),
		hasCollectionFollow(ctx, collection._id, viewerAuthId),
		canEditCollection(ctx, collection, viewerAuthId),
		canSuggestToCollection(ctx, collection, viewerAuthId)
	]);

	let ownerName = 'Unknown';
	let ownerUsername: string | null = null;
	let ownerCommunitySlug: string | null = null;
	let ownerCommunityName: string | null = null;

	if (collection.ownerKind === 'user' && collection.ownerAuthId) {
		const profile = await getProfileByAuthId(ctx, collection.ownerAuthId);
		ownerName = profile?.name ?? 'Unknown';
		ownerUsername = profile?.username ?? null;
	} else if (collection.ownerKind === 'community' && collection.ownerCommunityId) {
		const community = await ctx.db.get(collection.ownerCommunityId);
		ownerName = community?.name ?? 'Unknown community';
		ownerCommunityName = community?.name ?? null;
		ownerCommunitySlug = community?.slug ?? null;
	}

	return {
		_id: collection._id,
		slug: collection.slug,
		title: collection.title,
		description: collection.description,
		visibility: collection.visibility,
		ownerKind: collection.ownerKind,
		ownerAuthId: collection.ownerAuthId,
		ownerCommunityId: collection.ownerCommunityId,
		ownerName,
		ownerUsername,
		ownerCommunitySlug,
		ownerCommunityName,
		tags: collection.tags,
		itemCount,
		followerCount,
		isFollowing,
		canEdit,
		canSuggest,
		createdAt: collection.createdAt,
		updatedAt: collection.updatedAt
	};
};

const loadCollectionItems = async (
	ctx: QueryCtx | MutationCtx,
	collectionId: Id<'source_collections'>
) => {
	const items = await ctx.db
		.query('source_collection_items')
		.withIndex('by_collectionId_and_position', (q) => q.eq('collectionId', collectionId))
		.collect();

	return await Promise.all(
		items.map(async (item) => {
			const [source, sourceItem] = await Promise.all([
				ctx.db.get(item.sourceId),
				item.sourceItemId ? ctx.db.get(item.sourceItemId) : Promise.resolve(null)
			]);
			if (!source) {
				return null;
			}
			const latestItem = (
				await ctx.db
					.query('source_items')
					.withIndex('by_sourceId_and_publishedAt', (q) => q.eq('sourceId', item.sourceId))
					.order('desc')
					.take(1)
			)[0];
			return {
				_id: item._id,
				sourceId: item.sourceId,
				sourceItemId: item.sourceItemId,
				entryType: getCollectionEntryType(item),
				position: item.position,
				note: item.note,
				addedByAuthId: item.addedByAuthId,
				sourceTitle: source.title,
				sourceDescription: source.description,
				sourceType: source.type,
				sourceCanonicalUrl: source.canonicalUrl,
				sourceStatus: source.status,
				itemTitle: sourceItem?.title,
				itemSnippet: sourceItem?.snippet,
				itemUrl: sourceItem?.url,
				itemPublishedAt: sourceItem?.publishedAt ?? null,
				latestPublishedAt: sourceItem?.publishedAt ?? latestItem?.publishedAt ?? null,
				createdAt: item.createdAt,
				updatedAt: item.updatedAt
			};
		})
	).then((items) => items.filter((item): item is NonNullable<typeof item> => !!item));
};

const loadCollectionRecentItems = async (
	ctx: QueryCtx | MutationCtx,
	collectionId: Id<'source_collections'>
) => {
	const collectionItems = await ctx.db
		.query('source_collection_items')
		.withIndex('by_collectionId_and_position', (q) => q.eq('collectionId', collectionId))
		.collect();
	if (collectionItems.length === 0) {
		return [];
	}

	const perEntryItems = await Promise.all(
		collectionItems.map(async (item) => {
			if (item.sourceItemId) {
				const sourceItem = await ctx.db.get(item.sourceItemId);
				return sourceItem ? [sourceItem] : [];
			}
			return await ctx.db
				.query('source_items')
				.withIndex('by_sourceId_and_publishedAt', (q) => q.eq('sourceId', item.sourceId))
				.order('desc')
				.take(4);
		})
	);
	const uniqueSourceIds = [...new Set(collectionItems.map((item) => item.sourceId))];
	const sources = await Promise.all(uniqueSourceIds.map((sourceId) => ctx.db.get(sourceId)));
	const sourceById = new Map(uniqueSourceIds.map((sourceId, index) => [sourceId, sources[index]]));

	const deduped = new Map<Id<'source_items'>, Doc<'source_items'>>();
	for (const item of perEntryItems.flat()) {
		deduped.set(item._id, item);
	}

	return Array.from(deduped.values())
		.map((item) => {
			const source = sourceById.get(item.sourceId);
			if (!source) {
				return null;
			}
			return {
				_id: item._id,
				sourceId: item.sourceId,
				title: item.title,
				snippet: item.snippet,
				url: item.url,
				publishedAt: item.publishedAt,
				sourceTitle: source.title,
				sourceType: source.type
			};
		})
		.filter((item): item is NonNullable<typeof item> => !!item)
		.sort((a, b) => b.publishedAt - a.publishedAt)
		.slice(0, 20);
};

const getCollectionOrThrow = async (
	ctx: QueryCtx | MutationCtx,
	collectionId: Id<'source_collections'>
) => {
	const collection = await ctx.db.get(collectionId);
	if (!collection) {
		throw new Error('Collection not found.');
	}
	return collection;
};

const addSourceToCollectionInternal = async (
	ctx: MutationCtx,
	args: {
		collectionId: Id<'source_collections'>;
		sourceId: Id<'sources'>;
		sourceItemId?: Id<'source_items'>;
		note?: string;
		addedByAuthId: string;
	}
) => {
	const normalizedNote = normalizeNote(args.note);
	const now = Date.now();

	if (args.sourceItemId) {
		const sourceItem = await ctx.db.get(args.sourceItemId);
		if (!sourceItem) {
			throw new Error('Source item not found.');
		}
		if (sourceItem.sourceId !== args.sourceId) {
			throw new Error('Collection entry source mismatch.');
		}
		const existing = await ctx.db
			.query('source_collection_items')
			.withIndex('by_collectionId_and_sourceItemId', (q) =>
				q.eq('collectionId', args.collectionId).eq('sourceItemId', args.sourceItemId)
			)
			.unique();
		if (existing) {
			await ctx.db.patch(existing._id, {
				note: normalizedNote ?? existing.note,
				updatedAt: now
			});
			return existing._id;
		}
	} else {
		const existingSourceEntries = await ctx.db
			.query('source_collection_items')
			.withIndex('by_collectionId_and_sourceId', (q) =>
				q.eq('collectionId', args.collectionId).eq('sourceId', args.sourceId)
			)
			.collect();
		const existing = existingSourceEntries.find((item) => !item.sourceItemId);
		if (existing) {
			await ctx.db.patch(existing._id, {
				note: normalizedNote ?? existing.note,
				updatedAt: now
			});
			return existing._id;
		}
	}
	const existingItems = await ctx.db
		.query('source_collection_items')
		.withIndex('by_collectionId_and_position', (q) => q.eq('collectionId', args.collectionId))
		.collect();
	return await ctx.db.insert('source_collection_items', {
		collectionId: args.collectionId,
		sourceId: args.sourceId,
		sourceItemId: args.sourceItemId,
		note: normalizedNote,
		position: existingItems.length,
		addedByAuthId: args.addedByAuthId,
		createdAt: now,
		updatedAt: now
	});
};

export const create = mutation({
	args: {
		title: v.string(),
		description: v.optional(v.string()),
		visibility: visibilityValidator,
		tags: v.optional(v.array(v.string())),
		ownerCommunityId: v.optional(v.id('communities'))
	},
	returns: v.object({
		collectionId: v.id('source_collections'),
		slug: v.string()
	}),
	handler: async (ctx, args) => {
		const authUser = await requireUserWithUsername(ctx);
		const now = Date.now();
		const title = args.title.trim().slice(0, COLLECTION_TITLE_LIMIT);
		if (!title) {
			throw new Error('Collection title is required.');
		}

		if (args.ownerCommunityId) {
			await requireCommunityManager(ctx, args.ownerCommunityId, authUser._id);
		}

		const slug = await ensureUniqueSlug(ctx, title);
		const collectionId = await ctx.db.insert('source_collections', {
			slug,
			title,
			description: args.description?.trim().slice(0, COLLECTION_DESCRIPTION_LIMIT),
			visibility: args.visibility,
			ownerKind: args.ownerCommunityId ? 'community' : 'user',
			ownerAuthId: args.ownerCommunityId ? undefined : authUser._id,
			ownerCommunityId: args.ownerCommunityId,
			tags: normalizeTags(args.tags),
			createdAt: now,
			updatedAt: now
		});
		return {
			collectionId,
			slug
		};
	}
});

export const update = mutation({
	args: {
		collectionId: v.id('source_collections'),
		title: v.string(),
		description: v.optional(v.string()),
		visibility: visibilityValidator,
		tags: v.optional(v.array(v.string()))
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const authUser = await requireUserWithUsername(ctx);
		const collection = await getCollectionOrThrow(ctx, args.collectionId);
		const canEdit = await canEditCollection(ctx, collection, authUser._id);
		if (!canEdit) {
			throw new Error('Collection edit permission required.');
		}
		await ctx.db.patch(collection._id, {
			title: args.title.trim().slice(0, COLLECTION_TITLE_LIMIT),
			description: args.description?.trim().slice(0, COLLECTION_DESCRIPTION_LIMIT),
			visibility: args.visibility,
			tags: normalizeTags(args.tags),
			updatedAt: Date.now()
		});
		return null;
	}
});

export const remove = mutation({
	args: {
		collectionId: v.id('source_collections')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const authUser = await requireUserWithUsername(ctx);
		const collection = await getCollectionOrThrow(ctx, args.collectionId);
		const canEdit = await canEditCollection(ctx, collection, authUser._id);
		if (!canEdit) {
			throw new Error('Collection edit permission required.');
		}

		const [items, follows, pendingSuggestions, approvedSuggestions, rejectedSuggestions] =
			await Promise.all([
				ctx.db
					.query('source_collection_items')
					.withIndex('by_collectionId_and_position', (q) => q.eq('collectionId', collection._id))
					.collect(),
				ctx.db
					.query('source_collection_follows')
					.withIndex('by_collectionId_and_createdAt', (q) => q.eq('collectionId', collection._id))
					.collect(),
				ctx.db
					.query('source_collection_suggestions')
					.withIndex('by_collectionId_and_status', (q) =>
						q.eq('collectionId', collection._id).eq('status', 'pending')
					)
					.collect(),
				ctx.db
					.query('source_collection_suggestions')
					.withIndex('by_collectionId_and_status', (q) =>
						q.eq('collectionId', collection._id).eq('status', 'approved')
					)
					.collect(),
				ctx.db
					.query('source_collection_suggestions')
					.withIndex('by_collectionId_and_status', (q) =>
						q.eq('collectionId', collection._id).eq('status', 'rejected')
					)
					.collect()
			]);

		for (const item of items) {
			await ctx.db.delete(item._id);
		}
		for (const follow of follows) {
			await ctx.db.delete(follow._id);
		}
		for (const suggestion of [
			...pendingSuggestions,
			...approvedSuggestions,
			...rejectedSuggestions
		]) {
			await ctx.db.delete(suggestion._id);
		}
		await ctx.db.delete(collection._id);
		return null;
	}
});

export const listPublic = query({
	args: {
		limit: v.optional(v.number())
	},
	returns: v.array(collectionSummaryValidator),
	handler: async (ctx, args) => {
		const viewer = await getOptionalAuthUser(ctx);
		const collections = await ctx.db
			.query('source_collections')
			.withIndex('by_visibility_and_updatedAt', (q) => q.eq('visibility', 'public'))
			.order('desc')
			.take(Math.min(Math.max(args.limit ?? 40, 1), 100));

		const readable = await Promise.all(
			collections.map(async (collection) =>
				(await isCollectionReadableBy(ctx, collection, viewer?._id ?? null)) ? collection : null
			)
		);
		return await Promise.all(
			readable
				.filter((collection): collection is NonNullable<typeof collection> => !!collection)
				.map((collection) => buildCollectionSummary(ctx, collection, viewer?._id ?? null))
		);
	}
});

export const listMine = query({
	args: {},
	returns: v.array(collectionSummaryValidator),
	handler: async (ctx) => {
		const authUser = await getOptionalAuthUser(ctx);
		if (!authUser) {
			return [];
		}
		const collections = await ctx.db
			.query('source_collections')
			.withIndex('by_ownerKind_and_ownerAuthId_and_updatedAt', (q) =>
				q.eq('ownerKind', 'user').eq('ownerAuthId', authUser._id)
			)
			.order('desc')
			.collect();
		return await Promise.all(
			collections.map((collection) => buildCollectionSummary(ctx, collection, authUser._id))
		);
	}
});

export const listCommunity = query({
	args: {
		communityId: v.id('communities')
	},
	returns: v.array(collectionSummaryValidator),
	handler: async (ctx, args) => {
		const viewer = await getOptionalAuthUser(ctx);
		const collections = await ctx.db
			.query('source_collections')
			.withIndex('by_ownerKind_and_ownerCommunityId_and_updatedAt', (q) =>
				q.eq('ownerKind', 'community').eq('ownerCommunityId', args.communityId)
			)
			.order('desc')
			.collect();

		const readable = await Promise.all(
			collections.map(async (collection) =>
				(await isCollectionReadableBy(ctx, collection, viewer?._id ?? null)) ? collection : null
			)
		);
		return await Promise.all(
			readable
				.filter((collection): collection is NonNullable<typeof collection> => !!collection)
				.map((collection) => buildCollectionSummary(ctx, collection, viewer?._id ?? null))
		);
	}
});

export const listSuggestableCommunityCollections = query({
	args: {},
	returns: v.array(collectionSummaryValidator),
	handler: async (ctx) => {
		const authUser = await getAuthUser(ctx);
		const collections = await ctx.db
			.query('source_collections')
			.withIndex('by_ownerKind_and_ownerCommunityId_and_updatedAt', (q) =>
				q.eq('ownerKind', 'community')
			)
			.order('desc')
			.take(100);
		const suggestable = await Promise.all(
			collections.map(async (collection) =>
				(await canSuggestToCollection(ctx, collection, authUser._id)) ? collection : null
			)
		);
		return await Promise.all(
			suggestable
				.filter((collection): collection is NonNullable<typeof collection> => !!collection)
				.map((collection) => buildCollectionSummary(ctx, collection, authUser._id))
		);
	}
});

export const getBySlug = query({
	args: {
		slug: v.string()
	},
	returns: collectionDetailValidator,
	handler: async (ctx, args) => {
		const viewer = await getOptionalAuthUser(ctx);
		const collection = await ctx.db
			.query('source_collections')
			.withIndex('by_slug', (q) => q.eq('slug', normalizeSlug(args.slug)))
			.unique();
		if (!collection) {
			return null;
		}
		if (!(await isCollectionReadableBy(ctx, collection, viewer?._id ?? null))) {
			return null;
		}
		const [summary, items, recentItems] = await Promise.all([
			buildCollectionSummary(ctx, collection, viewer?._id ?? null),
			loadCollectionItems(ctx, collection._id),
			loadCollectionRecentItems(ctx, collection._id)
		]);
		return {
			collection: summary,
			items,
			recentItems
		};
	}
});

export const follow = mutation({
	args: {
		collectionId: v.id('source_collections')
	},
	returns: v.object({
		following: v.boolean()
	}),
	handler: async (ctx, args) => {
		const authUser = await requireUserWithUsername(ctx);
		const collection = await getCollectionOrThrow(ctx, args.collectionId);
		if (!(await isCollectionReadableBy(ctx, collection, authUser._id))) {
			throw new Error('Collection not available.');
		}
		const existing = await ctx.db
			.query('source_collection_follows')
			.withIndex('by_userAuthId_and_collectionId', (q) =>
				q.eq('userAuthId', authUser._id).eq('collectionId', args.collectionId)
			)
			.unique();
		if (existing) {
			await ctx.db.delete(existing._id);
			return { following: false };
		}
		await ctx.db.insert('source_collection_follows', {
			userAuthId: authUser._id,
			collectionId: args.collectionId,
			createdAt: Date.now()
		});
		return { following: true };
	}
});

export const addSource = mutation({
	args: {
		collectionId: v.id('source_collections'),
		sourceId: v.id('sources'),
		sourceItemId: v.optional(v.id('source_items')),
		note: v.optional(v.string())
	},
	returns: v.id('source_collection_items'),
	handler: async (ctx, args) => {
		const authUser = await requireUserWithUsername(ctx);
		const collection = await getCollectionOrThrow(ctx, args.collectionId);
		const canEdit = await canEditCollection(ctx, collection, authUser._id);
		if (!canEdit) {
			throw new Error('Collection edit permission required.');
		}
		const itemId = await addSourceToCollectionInternal(ctx, {
			collectionId: args.collectionId,
			sourceId: args.sourceId,
			sourceItemId: args.sourceItemId,
			note: args.note,
			addedByAuthId: authUser._id
		});
		await ctx.db.patch(collection._id, { updatedAt: Date.now() });
		return itemId;
	}
});

export const removeSource = mutation({
	args: {
		collectionItemId: v.id('source_collection_items')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const authUser = await requireUserWithUsername(ctx);
		const item = await ctx.db.get(args.collectionItemId);
		if (!item) {
			throw new Error('Collection item not found.');
		}
		const collection = await getCollectionOrThrow(ctx, item.collectionId);
		const canEdit = await canEditCollection(ctx, collection, authUser._id);
		if (!canEdit) {
			throw new Error('Collection edit permission required.');
		}
		await ctx.db.delete(item._id);
		const remaining = await ctx.db
			.query('source_collection_items')
			.withIndex('by_collectionId_and_position', (q) => q.eq('collectionId', item.collectionId))
			.collect();
		for (const [index, row] of remaining.entries()) {
			if (row.position !== index) {
				await ctx.db.patch(row._id, { position: index, updatedAt: Date.now() });
			}
		}
		await ctx.db.patch(collection._id, { updatedAt: Date.now() });
		return null;
	}
});

export const reorderSources = mutation({
	args: {
		collectionId: v.id('source_collections'),
		collectionItemIds: v.array(v.id('source_collection_items'))
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const authUser = await requireUserWithUsername(ctx);
		const collection = await getCollectionOrThrow(ctx, args.collectionId);
		const canEdit = await canEditCollection(ctx, collection, authUser._id);
		if (!canEdit) {
			throw new Error('Collection edit permission required.');
		}
		const items = await ctx.db
			.query('source_collection_items')
			.withIndex('by_collectionId_and_position', (q) => q.eq('collectionId', args.collectionId))
			.collect();
		if (items.length !== args.collectionItemIds.length) {
			throw new Error('Collection reorder payload is invalid.');
		}
		const existingIds = new Set(items.map((item) => item._id));
		for (const itemId of args.collectionItemIds) {
			if (!existingIds.has(itemId)) {
				throw new Error('Collection reorder payload contains an invalid item.');
			}
		}
		for (const [index, itemId] of args.collectionItemIds.entries()) {
			await ctx.db.patch(itemId, { position: index, updatedAt: Date.now() });
		}
		await ctx.db.patch(collection._id, { updatedAt: Date.now() });
		return null;
	}
});

export const submitSuggestion = mutation({
	args: {
		collectionId: v.id('source_collections'),
		sourceId: v.id('sources'),
		sourceItemId: v.optional(v.id('source_items')),
		note: v.optional(v.string())
	},
	returns: v.id('source_collection_suggestions'),
	handler: async (ctx, args) => {
		const authUser = await requireUserWithUsername(ctx);
		const collection = await getCollectionOrThrow(ctx, args.collectionId);
		if (!(await canSuggestToCollection(ctx, collection, authUser._id))) {
			throw new Error('You cannot suggest sources to this collection.');
		}
		if (args.sourceItemId) {
			const sourceItem = await ctx.db.get(args.sourceItemId);
			if (!sourceItem) {
				throw new Error('Source item not found.');
			}
			if (sourceItem.sourceId !== args.sourceId) {
				throw new Error('Collection suggestion source mismatch.');
			}
			const existingItem = await ctx.db
				.query('source_collection_items')
				.withIndex('by_collectionId_and_sourceItemId', (q) =>
					q.eq('collectionId', args.collectionId).eq('sourceItemId', args.sourceItemId)
				)
				.unique();
			if (existingItem) {
				throw new Error('This item is already in the collection.');
			}
			const existingPending = await ctx.db
				.query('source_collection_suggestions')
				.withIndex('by_collectionId_and_sourceItemId_and_status', (q) =>
					q
						.eq('collectionId', args.collectionId)
						.eq('sourceItemId', args.sourceItemId)
						.eq('status', 'pending')
				)
				.unique();
			if (existingPending) {
				return existingPending._id;
			}
		} else {
			const existingItems = await ctx.db
				.query('source_collection_items')
				.withIndex('by_collectionId_and_sourceId', (q) =>
					q.eq('collectionId', args.collectionId).eq('sourceId', args.sourceId)
				)
				.collect();
			if (existingItems.some((item) => !item.sourceItemId)) {
				throw new Error('This source is already in the collection.');
			}
			const existingPending = await ctx.db
				.query('source_collection_suggestions')
				.withIndex('by_collectionId_and_sourceId_and_status', (q) =>
					q
						.eq('collectionId', args.collectionId)
						.eq('sourceId', args.sourceId)
						.eq('status', 'pending')
				)
				.collect();
			const existingSourcePending = existingPending.find((suggestion) => !suggestion.sourceItemId);
			if (existingSourcePending) {
				return existingSourcePending._id;
			}
		}
		const now = Date.now();
		return await ctx.db.insert('source_collection_suggestions', {
			collectionId: args.collectionId,
			sourceId: args.sourceId,
			sourceItemId: args.sourceItemId,
			suggestedByAuthId: authUser._id,
			note: normalizeNote(args.note),
			status: 'pending',
			createdAt: now,
			updatedAt: now
		});
	}
});

export const listPendingSuggestions = query({
	args: {
		collectionId: v.id('source_collections')
	},
	returns: v.array(suggestionValidator),
	handler: async (ctx, args) => {
		const authUser = await getAuthUser(ctx);
		const collection = await getCollectionOrThrow(ctx, args.collectionId);
		if (collection.ownerKind !== 'community' || !collection.ownerCommunityId) {
			return [];
		}
		await requireCommunityManager(ctx, collection.ownerCommunityId, authUser._id);
		const suggestions = await ctx.db
			.query('source_collection_suggestions')
			.withIndex('by_collectionId_and_status', (q) =>
				q.eq('collectionId', args.collectionId).eq('status', 'pending')
			)
			.collect();
		return await Promise.all(
			suggestions.map(async (suggestion) => {
				const [profile, source, sourceItem] = await Promise.all([
					getProfileByAuthId(ctx, suggestion.suggestedByAuthId),
					ctx.db.get(suggestion.sourceId),
					suggestion.sourceItemId ? ctx.db.get(suggestion.sourceItemId) : Promise.resolve(null)
				]);
				if (!source) {
					throw new Error('Suggested source not found.');
				}
				return {
					_id: suggestion._id,
					collectionId: suggestion.collectionId,
					sourceId: suggestion.sourceId,
					sourceItemId: suggestion.sourceItemId,
					entryType: getCollectionEntryType(suggestion),
					suggestedByAuthId: suggestion.suggestedByAuthId,
					suggestedByName: profile?.name ?? 'Unknown',
					suggestedByUsername: profile?.username ?? null,
					sourceTitle: source.title,
					sourceType: source.type,
					sourceCanonicalUrl: source.canonicalUrl,
					itemTitle: sourceItem?.title,
					itemUrl: sourceItem?.url,
					itemPublishedAt: sourceItem?.publishedAt ?? null,
					note: suggestion.note,
					status: suggestion.status,
					createdAt: suggestion.createdAt,
					updatedAt: suggestion.updatedAt
				};
			})
		);
	}
});

export const approveSuggestion = mutation({
	args: {
		suggestionId: v.id('source_collection_suggestions')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const authUser = await requireUserWithUsername(ctx);
		const suggestion = await ctx.db.get(args.suggestionId);
		if (!suggestion) {
			throw new Error('Suggestion not found.');
		}
		const collection = await getCollectionOrThrow(ctx, suggestion.collectionId);
		if (collection.ownerKind !== 'community' || !collection.ownerCommunityId) {
			throw new Error('Only community collection suggestions can be approved.');
		}
		await requireCommunityManager(ctx, collection.ownerCommunityId, authUser._id);
		await addSourceToCollectionInternal(ctx, {
			collectionId: suggestion.collectionId,
			sourceId: suggestion.sourceId,
			sourceItemId: suggestion.sourceItemId,
			note: suggestion.note,
			addedByAuthId: authUser._id
		});
		const now = Date.now();
		await ctx.db.patch(suggestion._id, {
			status: 'approved',
			reviewedAt: now,
			reviewedByAuthId: authUser._id,
			updatedAt: now
		});
		await ctx.db.patch(collection._id, { updatedAt: now });
		return null;
	}
});

export const rejectSuggestion = mutation({
	args: {
		suggestionId: v.id('source_collection_suggestions')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const authUser = await requireUserWithUsername(ctx);
		const suggestion = await ctx.db.get(args.suggestionId);
		if (!suggestion) {
			throw new Error('Suggestion not found.');
		}
		const collection = await getCollectionOrThrow(ctx, suggestion.collectionId);
		if (collection.ownerKind !== 'community' || !collection.ownerCommunityId) {
			throw new Error('Only community collection suggestions can be rejected.');
		}
		await requireCommunityManager(ctx, collection.ownerCommunityId, authUser._id);
		const now = Date.now();
		await ctx.db.patch(suggestion._id, {
			status: 'rejected',
			reviewedAt: now,
			reviewedByAuthId: authUser._id,
			updatedAt: now
		});
		return null;
	}
});

export const attachSourceToOwnedCollection = internalMutation({
	args: {
		actorAuthId: v.string(),
		collectionId: v.id('source_collections'),
		sourceId: v.id('sources'),
		sourceItemId: v.optional(v.id('source_items')),
		note: v.optional(v.string())
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const collection = await getCollectionOrThrow(ctx, args.collectionId);
		if (collection.ownerKind !== 'user' || collection.ownerAuthId !== args.actorAuthId) {
			throw new Error('Collection ownership required.');
		}
		await addSourceToCollectionInternal(ctx, {
			collectionId: args.collectionId,
			sourceId: args.sourceId,
			sourceItemId: args.sourceItemId,
			note: args.note,
			addedByAuthId: args.actorAuthId
		});
		await ctx.db.patch(collection._id, { updatedAt: Date.now() });
		return null;
	}
});

export const suggestSourceToCommunityCollection = internalMutation({
	args: {
		actorAuthId: v.string(),
		collectionId: v.id('source_collections'),
		sourceId: v.id('sources'),
		sourceItemId: v.optional(v.id('source_items')),
		note: v.optional(v.string())
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const collection = await getCollectionOrThrow(ctx, args.collectionId);
		if (collection.ownerKind !== 'community' || !collection.ownerCommunityId) {
			throw new Error('Community collection required.');
		}
		if (!(await canSuggestToCollection(ctx, collection, args.actorAuthId))) {
			throw new Error('You cannot suggest sources to this collection.');
		}
		if (args.sourceItemId) {
			const sourceItem = await ctx.db.get(args.sourceItemId);
			if (!sourceItem) {
				throw new Error('Source item not found.');
			}
			if (sourceItem.sourceId !== args.sourceId) {
				throw new Error('Collection suggestion source mismatch.');
			}
			const existingItem = await ctx.db
				.query('source_collection_items')
				.withIndex('by_collectionId_and_sourceItemId', (q) =>
					q.eq('collectionId', args.collectionId).eq('sourceItemId', args.sourceItemId)
				)
				.unique();
			if (existingItem) {
				return null;
			}
			const existingPending = await ctx.db
				.query('source_collection_suggestions')
				.withIndex('by_collectionId_and_sourceItemId_and_status', (q) =>
					q
						.eq('collectionId', args.collectionId)
						.eq('sourceItemId', args.sourceItemId)
						.eq('status', 'pending')
				)
				.unique();
			if (existingPending) {
				return null;
			}
		} else {
			const existingItems = await ctx.db
				.query('source_collection_items')
				.withIndex('by_collectionId_and_sourceId', (q) =>
					q.eq('collectionId', args.collectionId).eq('sourceId', args.sourceId)
				)
				.collect();
			if (existingItems.some((item) => !item.sourceItemId)) {
				return null;
			}
			const existingPending = await ctx.db
				.query('source_collection_suggestions')
				.withIndex('by_collectionId_and_sourceId_and_status', (q) =>
					q
						.eq('collectionId', args.collectionId)
						.eq('sourceId', args.sourceId)
						.eq('status', 'pending')
				)
				.collect();
			if (existingPending.some((suggestion) => !suggestion.sourceItemId)) {
				return null;
			}
		}
		const now = Date.now();
		await ctx.db.insert('source_collection_suggestions', {
			collectionId: args.collectionId,
			sourceId: args.sourceId,
			sourceItemId: args.sourceItemId,
			suggestedByAuthId: args.actorAuthId,
			note: normalizeNote(args.note),
			status: 'pending',
			createdAt: now,
			updatedAt: now
		});
		return null;
	}
});

export const listTrustedSourceIds = query({
	args: {
		userAuthId: v.string()
	},
	returns: v.array(
		v.object({
			sourceId: v.id('sources'),
			sourceItemId: v.optional(v.id('source_items')),
			reason: v.union(
				v.literal('direct_follow'),
				v.literal('followed_collection'),
				v.literal('community_collection'),
				v.literal('followed_user_collection')
			),
			collectionId: v.optional(v.id('source_collections')),
			collectionSlug: v.optional(v.string()),
			collectionTitle: v.optional(v.string()),
			communityId: v.optional(v.id('communities')),
			communitySlug: v.optional(v.string()),
			communityName: v.optional(v.string()),
			userAuthId: v.optional(v.string()),
			username: v.optional(v.string()),
			userName: v.optional(v.string()),
			priority: v.number()
		})
	),
	handler: async (ctx, args) => {
		const directSubscriptions = await ctx.db
			.query('source_subscriptions')
			.withIndex('by_userAuthId_and_updatedAt', (q) => q.eq('userAuthId', args.userAuthId))
			.order('desc')
			.collect();

		const results = new Map<
			string,
			{
				sourceId: Id<'sources'>;
				sourceItemId?: Id<'source_items'>;
				reason:
					| 'direct_follow'
					| 'followed_collection'
					| 'community_collection'
					| 'followed_user_collection';
				collectionId?: Id<'source_collections'>;
				collectionSlug?: string;
				collectionTitle?: string;
				communityId?: Id<'communities'>;
				communitySlug?: string;
				communityName?: string;
				userAuthId?: string;
				username?: string;
				userName?: string;
				priority: number;
			}
		>();
		const entryKey = (entry: { sourceId: Id<'sources'>; sourceItemId?: Id<'source_items'> }) =>
			entry.sourceItemId ? `item:${entry.sourceItemId}` : `source:${entry.sourceId}`;

		for (const subscription of directSubscriptions) {
			if (subscription.status !== 'active') {
				continue;
			}
			results.set(entryKey({ sourceId: subscription.sourceId }), {
				sourceId: subscription.sourceId,
				reason: 'direct_follow',
				priority: 1
			});
		}

		const followedCollections = await ctx.db
			.query('source_collection_follows')
			.withIndex('by_userAuthId_and_createdAt', (q) => q.eq('userAuthId', args.userAuthId))
			.order('desc')
			.collect();
		for (const follow of followedCollections) {
			const collection = await ctx.db.get(follow.collectionId);
			if (!collection || !(await isCollectionReadableBy(ctx, collection, args.userAuthId))) {
				continue;
			}
			const items = await ctx.db
				.query('source_collection_items')
				.withIndex('by_collectionId_and_position', (q) => q.eq('collectionId', collection._id))
				.collect();
			for (const item of items) {
				const key = entryKey(item);
				const existing = results.get(key);
				if (existing && existing.priority <= 2) {
					continue;
				}
				results.set(key, {
					sourceId: item.sourceId,
					sourceItemId: item.sourceItemId,
					reason: 'followed_collection',
					collectionId: collection._id,
					collectionSlug: collection.slug,
					collectionTitle: collection.title,
					priority: 2
				});
			}
		}

		const followedCommunityRows = await ctx.db
			.query('follows_communities')
			.withIndex('by_followerAuthId_and_createdAt', (q) => q.eq('followerAuthId', args.userAuthId))
			.order('desc')
			.collect();
		const activeMembershipRows = await ctx.db
			.query('community_memberships')
			.withIndex('by_userAuthId_and_status', (q) =>
				q.eq('userAuthId', args.userAuthId).eq('status', 'active')
			)
			.collect();
		const communityIds = [
			...new Set([
				...followedCommunityRows.map((row) => row.communityId),
				...activeMembershipRows.map((row) => row.communityId)
			])
		];
		for (const communityId of communityIds) {
			const community = await ctx.db.get(communityId);
			if (!community) {
				continue;
			}
			const collections = await ctx.db
				.query('source_collections')
				.withIndex('by_ownerKind_and_ownerCommunityId_and_updatedAt', (q) =>
					q.eq('ownerKind', 'community').eq('ownerCommunityId', communityId)
				)
				.collect();
			for (const collection of collections) {
				if (!(await isCollectionReadableBy(ctx, collection, args.userAuthId))) {
					continue;
				}
				const items = await ctx.db
					.query('source_collection_items')
					.withIndex('by_collectionId_and_position', (q) => q.eq('collectionId', collection._id))
					.collect();
				for (const item of items) {
					const key = entryKey(item);
					const existing = results.get(key);
					if (existing && existing.priority <= 3) {
						continue;
					}
					results.set(key, {
						sourceId: item.sourceId,
						sourceItemId: item.sourceItemId,
						reason: 'community_collection',
						collectionId: collection._id,
						collectionSlug: collection.slug,
						collectionTitle: collection.title,
						communityId,
						communitySlug: community.slug,
						communityName: community.name,
						priority: 3
					});
				}
			}
		}

		const followedUsers = await ctx.db
			.query('follows_users')
			.withIndex('by_followerAuthId_and_createdAt', (q) => q.eq('followerAuthId', args.userAuthId))
			.order('desc')
			.collect();
		for (const follow of followedUsers) {
			const profile = await getProfileByAuthId(ctx, follow.targetAuthId);
			const collections = await ctx.db
				.query('source_collections')
				.withIndex('by_ownerKind_and_ownerAuthId_and_updatedAt', (q) =>
					q.eq('ownerKind', 'user').eq('ownerAuthId', follow.targetAuthId)
				)
				.collect();
			for (const collection of collections) {
				if (!(await isCollectionReadableBy(ctx, collection, args.userAuthId))) {
					continue;
				}
				const items = await ctx.db
					.query('source_collection_items')
					.withIndex('by_collectionId_and_position', (q) => q.eq('collectionId', collection._id))
					.collect();
				for (const item of items) {
					const key = entryKey(item);
					const existing = results.get(key);
					if (existing && existing.priority <= 4) {
						continue;
					}
					results.set(key, {
						sourceId: item.sourceId,
						sourceItemId: item.sourceItemId,
						reason: 'followed_user_collection',
						collectionId: collection._id,
						collectionSlug: collection.slug,
						collectionTitle: collection.title,
						userAuthId: follow.targetAuthId,
						username: profile?.username,
						userName: profile?.name,
						priority: 4
					});
				}
			}
		}

		return Array.from(results.values()).sort((a, b) => a.priority - b.priority);
	}
});
