import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import {
	action,
	internalAction,
	internalMutation,
	internalQuery,
	mutation,
	query
} from './_generated/server';
import { authComponent } from './auth';
import { components, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { rateLimiter } from './lib/rateLimits';
import { r2 } from './lib/r2';
import { isAdminRole } from '../lib/shared/adminRole';
import { Workpool } from '@convex-dev/workpool';
import {
	countAuthorSharedPostsForSource,
	countSourceItemsForSource,
	trackPostReplaced,
	trackSourceItemDeleted,
	trackSourceItemInserted,
	trackSourceItemReplaced
} from './lib/aggregates';
import {
	classifySourceSyncFailureCode,
	JOB_FAILURE_CODE,
	toFailureMessage
} from './lib/jobFailure';
import { assertNightlyRunTransition, assertSourceJobTransition } from './lib/jobTransitions';
import { toSourceJobResponse } from './lib/serializers';
import {
	deriveSavedWebsiteMetadata,
	deriveWebsiteSourceInput,
	normalizeHttpUrl,
	sourceHostForDisplay
} from './lib/sourceUrls';

const SOURCE_ITEM_SNIPPET_LIMIT = 500;
const SOURCE_TITLE_LIMIT = 220;
const BULK_UNSUBSCRIBE_BATCH_SIZE = 200;
const RESUBSCRIBE_BACKFILL_BATCH_SIZE = 200;
const NIGHTLY_REFRESH_BATCH_SIZE = 100;
const FANOUT_BATCH_SIZE = 200;
const FANOUT_RETRY_MAX_ATTEMPTS = 3;
const FANOUT_RETRY_BASE_DELAY_MS = 1000;
const MANUAL_REFRESH_DAILY_LIMIT = 3;
const UTC_DAY_MS = 24 * 60 * 60 * 1000;
const NEW_ACCOUNT_WINDOW_MS = 7 * UTC_DAY_MS;
const NEW_ACCOUNT_MANUAL_REFRESH_DAILY_LIMIT = 1;

const sourceSyncWorkpool = new Workpool((components as any).sourceSyncWorkpool, {
	maxParallelism: 8,
	retryActionsByDefault: true
});

const sourceCleanupWorkpool = new Workpool((components as any).sourceCleanupWorkpool, {
	maxParallelism: 6,
	retryActionsByDefault: true
});

const sourceTypeValidator = v.union(
	v.literal('website'),
	v.literal('rss'),
	v.literal('youtube'),
	v.literal('bookmarks')
);
const sourceStatusValidator = v.union(
	v.literal('active'),
	v.literal('paused'),
	v.literal('error'),
	v.literal('deleting')
);
const sourceJobTypeValidator = v.union(
	v.literal('sync_source'),
	v.literal('bulk_unsubscribe'),
	v.literal('resubscribe_backfill')
);
const sourceJobStatusValidator = v.union(
	v.literal('queued'),
	v.literal('running'),
	v.literal('done'),
	v.literal('failed')
);
const addedViaValidator = v.union(v.literal('manual'), v.literal('saved_link'));
const savedSuggestionValidator = v.object({
	_id: v.id('saved_source_suggestions'),
	sourceType: v.literal('website'),
	normalizedKey: v.string(),
	canonicalUrl: v.string(),
	originHost: v.string(),
	itemCount: v.number(),
	latestSavedUrl: v.string(),
	latestSavedTitle: v.string(),
	lastSavedAt: v.number(),
	createdAt: v.number(),
	updatedAt: v.number(),
	isFollowing: v.boolean()
});

const isFetchableSourceType = (type: 'website' | 'rss' | 'youtube' | 'bookmarks') =>
	type !== 'bookmarks';

const nextUtcMidnightMs = (now = Date.now()) =>
	Math.floor(now / UTC_DAY_MS) * UTC_DAY_MS + UTC_DAY_MS;
const utcRunDateKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
const isNewAccount = (profileCreatedAt: number | null, now = Date.now()) =>
	profileCreatedAt !== null && now - profileCreatedAt < NEW_ACCOUNT_WINDOW_MS;

const enqueueSourceSyncWork = async (
	ctx: any,
	args: { jobId: Id<'source_jobs'>; sourceId: Id<'sources'> },
	runAfter = 0
) => {
	await sourceSyncWorkpool.enqueueAction(ctx, (internal as any).sources.runSourceSync, args, {
		runAfter
	});
};

const enqueueSourceCleanupWork = async (
	ctx: any,
	action: any,
	args: Record<string, unknown>,
	runAfter = 0
) => {
	await sourceCleanupWorkpool.enqueueAction(ctx, action, args, {
		runAfter
	});
};

const createSnippet = (value: string) =>
	value.trim().replace(/\s+/g, ' ').slice(0, SOURCE_ITEM_SNIPPET_LIMIT);

const listDeliveriesForUserSourceItem = async (
	ctx: any,
	userAuthId: string,
	sourceItemId: Id<'source_items'>
) => {
	return await ctx.db
		.query('user_source_items')
		.withIndex('by_userAuthId_and_sourceItemId', (q: any) =>
			q.eq('userAuthId', userAuthId).eq('sourceItemId', sourceItemId)
		)
		.collect();
};

const keepOldestDeliveryAndDeleteDuplicates = async (ctx: any, deliveries: any[]) => {
	if (deliveries.length <= 1) {
		return deliveries[0] ?? null;
	}
	const keep = deliveries.slice().sort((a: any, b: any) => {
		if (a.deliveredAt !== b.deliveredAt) {
			return a.deliveredAt - b.deliveredAt;
		}
		return String(a._id).localeCompare(String(b._id));
	})[0];
	for (const row of deliveries) {
		if (row._id !== keep._id) {
			await ctx.db.delete(row._id);
		}
	}
	return keep;
};

const textEncoder = new TextEncoder();

const toHex = (buffer: ArrayBuffer) =>
	Array.from(new Uint8Array(buffer))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');

const sha256Hex = async (value: string) => {
	if (!globalThis.crypto?.subtle) {
		throw new Error('SHA-256 hashing is unavailable in this runtime.');
	}
	const digest = await globalThis.crypto.subtle.digest('SHA-256', textEncoder.encode(value));
	return toHex(digest);
};

const urlHash = async (url: string) => sha256Hex(url.trim().toLowerCase());

const normalizeSourceInput = (
	type: 'website' | 'rss' | 'youtube' | 'bookmarks',
	inputUrlOrId: string
): {
	canonicalUrl: string;
	normalizedKey: string;
} => {
	if (type === 'bookmarks') {
		const normalizedKey = `bookmarks:${inputUrlOrId.trim().toLowerCase()}`;
		if (!inputUrlOrId.trim()) {
			throw new Error('Bookmark source key is required.');
		}
		return {
			canonicalUrl: `https://bookmarks.local/${encodeURIComponent(inputUrlOrId.trim())}`,
			normalizedKey
		};
	}

	const parsed = normalizeHttpUrl(inputUrlOrId);
	const host = parsed.hostname.toLowerCase();
	const canonicalUrl = parsed.toString();
	const pathWithQuery = `${parsed.pathname.toLowerCase()}${parsed.search.toLowerCase()}`;
	const isYoutubeHost =
		host === 'youtube.com' ||
		host.endsWith('.youtube.com') ||
		host === 'youtu.be' ||
		host.endsWith('.youtu.be');

	if (type === 'youtube' && !isYoutubeHost) {
		throw new Error('YouTube source must use a youtube.com or youtu.be URL.');
	}

	if (type === 'rss') {
		return {
			canonicalUrl,
			normalizedKey: `rss:${canonicalUrl.toLowerCase()}`
		};
	}

	if (type === 'youtube') {
		return {
			canonicalUrl,
			normalizedKey: `youtube:${host}${pathWithQuery}`
		};
	}

	const websiteInput = deriveWebsiteSourceInput(canonicalUrl);
	return {
		canonicalUrl: websiteInput.canonicalUrl,
		normalizedKey: websiteInput.normalizedKey
	};
};

const resolveWebsiteFollowTarget = async (ctx: any, inputUrl: string) => {
	const websiteInput = deriveWebsiteSourceInput(inputUrl);
	try {
		const discovered: {
			sourceType: 'website' | 'rss';
			canonicalUrl: string;
			normalizedKey: string;
		} = await ctx.runAction((internal as any).sources_node.discoverWebsiteFollowTarget, {
			siteUrl: websiteInput.canonicalUrl
		});
		return {
			originalUrl: websiteInput.originalUrl,
			shouldSaveOriginal: websiteInput.shouldSaveOriginal,
			sourceType: discovered.sourceType,
			canonicalUrl: discovered.canonicalUrl,
			normalizedKey: discovered.normalizedKey
		};
	} catch {
		return {
			originalUrl: websiteInput.originalUrl,
			shouldSaveOriginal: websiteInput.shouldSaveOriginal,
			sourceType: 'website' as const,
			canonicalUrl: websiteInput.canonicalUrl,
			normalizedKey: websiteInput.normalizedKey
		};
	}
};

const isIpv4Address = (value: string) => {
	const parts = value.split('.');
	if (parts.length !== 4) {
		return false;
	}
	return parts.every((part) => /^\d+$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
};

const isBlockedIpv4Address = (value: string) => {
	if (!isIpv4Address(value)) {
		return false;
	}
	const parts = value.split('.').map((part) => Number(part));
	const [a, b] = parts;
	if (a === 0 || a === 10 || a === 127) {
		return true;
	}
	if (a === 169 && b === 254) {
		return true;
	}
	if (a === 172 && b >= 16 && b <= 31) {
		return true;
	}
	if (a === 192 && b === 168) {
		return true;
	}
	return false;
};

const normalizeIpv6ForChecks = (value: string) =>
	value
		.trim()
		.replace(/^\[|\]$/g, '')
		.toLowerCase();

const isBlockedIpv6Address = (value: string) => {
	if (!value.includes(':')) {
		return false;
	}
	const normalized = normalizeIpv6ForChecks(value);
	if (!normalized) {
		return false;
	}
	if (normalized === '::' || normalized === '::1') {
		return true;
	}
	if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
		return true;
	}
	if (
		normalized.startsWith('fe8') ||
		normalized.startsWith('fe9') ||
		normalized.startsWith('fea') ||
		normalized.startsWith('feb')
	) {
		return true;
	}
	if (normalized.startsWith('::ffff:')) {
		const mappedIpv4 = normalized.slice('::ffff:'.length);
		if (isBlockedIpv4Address(mappedIpv4)) {
			return true;
		}
	}
	return false;
};

const isBlockedIpAddress = (value: string) =>
	isBlockedIpv4Address(value) || isBlockedIpv6Address(value);

const isBlockedHostname = (hostname: string) => {
	const host = hostname.toLowerCase();
	if (host === 'localhost' || host.endsWith('.local')) {
		return true;
	}
	if (host === '::1') {
		return true;
	}
	if (isBlockedIpAddress(host)) {
		return true;
	}
	if (
		host.startsWith('127.') ||
		host.startsWith('10.') ||
		host.startsWith('0.') ||
		host.startsWith('169.254.') ||
		host.startsWith('192.168.')
	) {
		return true;
	}
	if (host.startsWith('172.')) {
		const segment = Number.parseInt(host.split('.')[1] ?? '', 10);
		if (Number.isFinite(segment) && segment >= 16 && segment <= 31) {
			return true;
		}
	}
	return false;
};

const logSecurityEvent = async (
	ctx: any,
	args: {
		eventType: string;
		severity: 'info' | 'warn' | 'error' | 'critical';
		surface: string;
		message: string;
		actorAuthId?: string;
		entityType?: string;
		entityId?: string;
		metadata?: string;
	}
) => {
	try {
		await ctx.runMutation((internal as any).security.logEvent, args);
	} catch (error) {
		console.error('Failed to write security event.', error);
	}
};

const sourceSummaryValidator = v.object({
	sourceId: v.id('sources'),
	subscriptionId: v.id('source_subscriptions'),
	title: v.string(),
	description: v.optional(v.string()),
	type: sourceTypeValidator,
	status: sourceStatusValidator,
	addedVia: v.optional(addedViaValidator),
	canonicalUrl: v.string(),
	lastFetchedAt: v.optional(v.number()),
	lastSuccessAt: v.optional(v.number()),
	lastError: v.optional(v.string()),
	itemCount: v.number(),
	sharedPostCount: v.number(),
	createdAt: v.number(),
	updatedAt: v.number()
});

const sourceJobValidator = v.object({
	_id: v.id('source_jobs'),
	jobType: sourceJobTypeValidator,
	userAuthId: v.optional(v.string()),
	sourceId: v.optional(v.id('sources')),
	status: sourceJobStatusValidator,
	cursor: v.optional(v.string()),
	processed: v.number(),
	error: v.optional(v.string()),
	createdAt: v.number(),
	updatedAt: v.number(),
	finishedAt: v.optional(v.number())
});

const refreshQuotaValidator = v.object({
	isUnlimited: v.boolean(),
	dailyLimit: v.union(v.number(), v.null()),
	remaining: v.union(v.number(), v.null()),
	used: v.union(v.number(), v.null()),
	retryAfterMs: v.optional(v.number()),
	resetsAt: v.number()
});

const nightlySourceRowValidator = v.object({
	sourceId: v.id('sources')
});

const fanoutBatchResultValidator = v.object({
	deliveredCount: v.number(),
	scannedCount: v.number(),
	isDone: v.boolean(),
	continueCursor: v.union(v.string(), v.null())
});

const sourceItemShareValidator = v.object({
	postId: v.id('posts'),
	title: v.string(),
	visibility: v.union(v.literal('public'), v.literal('private')),
	communityId: v.optional(v.id('communities')),
	communitySlug: v.optional(v.string()),
	communityName: v.optional(v.string()),
	createdAt: v.number()
});

const sourceItemDetailsValidator = v.object({
	_id: v.id('source_items'),
	sourceId: v.id('sources'),
	sourceType: sourceTypeValidator,
	sourceTitle: v.string(),
	sourceCanonicalUrl: v.string(),
	title: v.string(),
	snippet: v.string(),
	body: v.optional(v.string()),
	bodyUrl: v.optional(v.string()),
	url: v.string(),
	publishedAt: v.number(),
	createdAt: v.number(),
	updatedAt: v.number(),
	isSaved: v.boolean(),
	savedBookmarkItemId: v.optional(v.id('source_items')),
	legacySavedPostId: v.optional(v.id('posts')),
	shares: v.array(sourceItemShareValidator)
});

const bookmarkSourceNormalizedKeyForUser = (userAuthId: string) => `bookmarks:${userAuthId}`;

type ActiveBookmarkRow = {
	delivery: {
		publishedAt: number;
	};
	bookmarkItem: {
		_id: Id<'source_items'>;
		url: string;
		title: string;
		updatedAt: number;
		originHost?: string;
		originSiteUrl?: string;
		suggestedSourceNormalizedKey?: string;
		suggestedSourceCanonicalUrl?: string;
	};
};

const getBookmarkSourceByUserAuthId = async (ctx: any, userAuthId: string) => {
	return await ctx.db
		.query('sources')
		.withIndex('by_normalizedKey', (q: any) =>
			q.eq('normalizedKey', bookmarkSourceNormalizedKeyForUser(userAuthId))
		)
		.unique();
};

const getActiveBookmarkMatchForUrl = async (ctx: any, userAuthId: string, url: string) => {
	const bookmarkSource = await getBookmarkSourceByUserAuthId(ctx, userAuthId);
	if (!bookmarkSource) {
		return null;
	}

	const normalizedUrl = normalizeHttpUrl(url).toString();
	const normalizedUrlHash = await urlHash(normalizedUrl);
	const bookmarkItem = await ctx.db
		.query('source_items')
		.withIndex('by_sourceId_and_urlHash', (q: any) =>
			q.eq('sourceId', bookmarkSource._id).eq('urlHash', normalizedUrlHash)
		)
		.unique();
	if (!bookmarkItem) {
		return null;
	}

	const delivery = (
		await ctx.db
			.query('user_source_items')
			.withIndex('by_userAuthId_and_sourceItemId', (q: any) =>
				q.eq('userAuthId', userAuthId).eq('sourceItemId', bookmarkItem._id)
			)
			.take(1)
	)[0];
	if (!delivery) {
		return null;
	}

	return {
		bookmarkSource,
		bookmarkItem
	};
};

const listActiveBookmarkItemsForSource = async (
	ctx: any,
	userAuthId: string,
	bookmarkSourceId: Id<'sources'>
): Promise<Array<ActiveBookmarkRow>> => {
	const deliveries = await ctx.db
		.query('user_source_items')
		.withIndex('by_userAuthId_and_sourceId_and_publishedAt', (q: any) =>
			q.eq('userAuthId', userAuthId).eq('sourceId', bookmarkSourceId)
		)
		.order('desc')
		.collect();

	const bookmarkItems = await Promise.all(
		deliveries.map((delivery: any) => ctx.db.get(delivery.sourceItemId))
	);
	return deliveries
		.map((delivery: any, index: number) => {
			const bookmarkItem = bookmarkItems[index];
			if (!bookmarkItem) {
				return null;
			}
			return {
				delivery,
				bookmarkItem
			};
		})
		.filter((row: ActiveBookmarkRow | null): row is ActiveBookmarkRow => !!row);
};

const refreshSavedSourceSuggestionForKey = async (
	ctx: any,
	userAuthId: string,
	normalizedKey: string
) => {
	const bookmarkSource = await getBookmarkSourceByUserAuthId(ctx, userAuthId);
	const existingSuggestion = await ctx.db
		.query('saved_source_suggestions')
		.withIndex('by_userAuthId_and_normalizedKey', (q: any) =>
			q.eq('userAuthId', userAuthId).eq('normalizedKey', normalizedKey)
		)
		.unique();

	if (!bookmarkSource) {
		if (existingSuggestion) {
			await ctx.db.delete(existingSuggestion._id);
		}
		return null;
	}

	const activeBookmarkItems = await listActiveBookmarkItemsForSource(
		ctx,
		userAuthId,
		bookmarkSource._id
	);
	const matching = activeBookmarkItems.filter(
		({ bookmarkItem }: ActiveBookmarkRow) =>
			bookmarkItem.suggestedSourceNormalizedKey === normalizedKey
	);

	if (matching.length === 0) {
		if (existingSuggestion) {
			await ctx.db.delete(existingSuggestion._id);
		}
		return null;
	}

	const latest = matching.slice().sort((a: ActiveBookmarkRow, b: ActiveBookmarkRow) => {
		if (a.delivery.publishedAt !== b.delivery.publishedAt) {
			return b.delivery.publishedAt - a.delivery.publishedAt;
		}
		return b.bookmarkItem.updatedAt - a.bookmarkItem.updatedAt;
	})[0];
	const now = Date.now();
	const payload = {
		userAuthId,
		sourceType: 'website' as const,
		normalizedKey,
		canonicalUrl:
			latest.bookmarkItem.suggestedSourceCanonicalUrl ??
			latest.bookmarkItem.originSiteUrl ??
			latest.bookmarkItem.url,
		originHost: latest.bookmarkItem.originHost ?? sourceHostForDisplay(latest.bookmarkItem.url),
		itemCount: matching.length,
		latestSavedUrl: latest.bookmarkItem.url,
		latestSavedTitle: latest.bookmarkItem.title,
		lastSavedAt: latest.delivery.publishedAt,
		updatedAt: now
	};

	if (existingSuggestion) {
		await ctx.db.patch(existingSuggestion._id, payload);
		return existingSuggestion._id;
	}

	return await ctx.db.insert('saved_source_suggestions', {
		...payload,
		createdAt: now
	});
};

export const ensureSourceAndSubscription = internalMutation({
	args: {
		userAuthId: v.string(),
		type: sourceTypeValidator,
		normalizedKey: v.string(),
		canonicalUrl: v.string(),
		title: v.optional(v.string()),
		addedVia: v.optional(addedViaValidator)
	},
	returns: v.object({
		sourceId: v.id('sources'),
		alreadySubscribed: v.boolean(),
		shouldBackfill: v.boolean()
	}),
	handler: async (ctx, args) => {
		const now = Date.now();
		let source = await ctx.db
			.query('sources')
			.withIndex('by_normalizedKey', (q) => q.eq('normalizedKey', args.normalizedKey))
			.unique();

		if (!source) {
			const sourceId = await ctx.db.insert('sources', {
				type: args.type,
				normalizedKey: args.normalizedKey,
				canonicalUrl: args.canonicalUrl,
				title: (args.title?.trim() || args.canonicalUrl).slice(0, SOURCE_TITLE_LIMIT),
				status: 'active',
				createdAt: now,
				updatedAt: now
			});
			source = await ctx.db.get(sourceId);
			if (!source) {
				throw new Error('Failed to create source.');
			}
		}

		const existingSubscription = await ctx.db
			.query('source_subscriptions')
			.withIndex('by_userAuthId_and_sourceId', (q) =>
				q.eq('userAuthId', args.userAuthId).eq('sourceId', source!._id)
			)
			.unique();

		if (existingSubscription && existingSubscription.status === 'active') {
			return {
				sourceId: source._id,
				alreadySubscribed: true,
				shouldBackfill: false
			};
		}

		const sourceHasItems =
			(
				await ctx.db
					.query('source_items')
					.withIndex('by_sourceId_and_publishedAt', (q) => q.eq('sourceId', source._id))
					.take(1)
			).length > 0;

		if (existingSubscription) {
			await ctx.db.patch(existingSubscription._id, {
				status: 'active',
				addedVia:
					source.type === 'bookmarks'
						? existingSubscription.addedVia
						: (existingSubscription.addedVia ?? args.addedVia),
				unsubscribedAt: undefined,
				updatedAt: now
			});
		} else {
			await ctx.db.insert('source_subscriptions', {
				userAuthId: args.userAuthId,
				sourceId: source._id,
				status: 'active',
				addedVia: source.type === 'bookmarks' ? undefined : args.addedVia,
				createdAt: now,
				updatedAt: now
			});
		}

		return {
			sourceId: source._id,
			alreadySubscribed: false,
			shouldBackfill: sourceHasItems
		};
	}
});

export const ensureUserBookmarkSource = internalMutation({
	args: {
		userAuthId: v.string()
	},
	returns: v.id('sources'),
	handler: async (ctx, args) => {
		const now = Date.now();
		const normalizedKey = `bookmarks:${args.userAuthId}`;
		let source = await ctx.db
			.query('sources')
			.withIndex('by_normalizedKey', (q) => q.eq('normalizedKey', normalizedKey))
			.unique();

		if (!source) {
			const sourceId = await ctx.db.insert('sources', {
				type: 'bookmarks',
				normalizedKey,
				canonicalUrl: `https://bookmarks.local/${encodeURIComponent(args.userAuthId)}`,
				title: 'Saved Links',
				status: 'active',
				createdAt: now,
				updatedAt: now
			});
			source = await ctx.db.get(sourceId);
		}
		if (!source) {
			throw new Error('Failed to initialize bookmark source.');
		}
		if (source.title !== 'Saved Links') {
			await ctx.db.patch(source._id, {
				title: 'Saved Links',
				updatedAt: now
			});
			source = await ctx.db.get(source._id);
			if (!source) {
				throw new Error('Failed to initialize bookmark source.');
			}
		}

		const subscription = await ctx.db
			.query('source_subscriptions')
			.withIndex('by_userAuthId_and_sourceId', (q) =>
				q.eq('userAuthId', args.userAuthId).eq('sourceId', source._id)
			)
			.unique();
		if (subscription) {
			await ctx.db.patch(subscription._id, {
				status: 'active',
				unsubscribedAt: undefined,
				updatedAt: now
			});
		} else {
			await ctx.db.insert('source_subscriptions', {
				userAuthId: args.userAuthId,
				sourceId: source._id,
				status: 'active',
				createdAt: now,
				updatedAt: now
			});
		}

		return source._id;
	}
});

export const saveLinkToBookmarks = internalMutation({
	args: {
		userAuthId: v.string(),
		url: v.string(),
		title: v.string(),
		snippet: v.string(),
		publishedAt: v.optional(v.number())
	},
	returns: v.object({
		bookmarkSourceId: v.id('sources'),
		sourceItemId: v.id('source_items'),
		created: v.boolean(),
		alreadySaved: v.boolean()
	}),
	handler: async (ctx, args) => {
		const bookmarkSourceId: Id<'sources'> = await ctx.runMutation(
			(internal as any).sources.ensureUserBookmarkSource,
			{
				userAuthId: args.userAuthId
			}
		);

		const existingActiveMatch = await getActiveBookmarkMatchForUrl(ctx, args.userAuthId, args.url);
		const metadata = deriveSavedWebsiteMetadata(args.url);
		const ingestResult: {
			sourceItemId: Id<'source_items'>;
			created: boolean;
			deliveredCount: number;
		} = await ctx.runMutation((internal as any).sources.ingestSourceItemFromInput, {
			sourceId: bookmarkSourceId,
			url: metadata.normalizedUrl,
			title: args.title.trim().slice(0, SOURCE_TITLE_LIMIT),
			snippet: createSnippet(args.snippet || args.title || metadata.normalizedUrl),
			publishedAt: args.publishedAt,
			contentHash: `bookmark:${metadata.normalizedUrl}`,
			originHost: metadata.originHost,
			originSiteUrl: metadata.originSiteUrl,
			suggestedSourceType: metadata.suggestedSourceType,
			suggestedSourceNormalizedKey: metadata.suggestedSourceNormalizedKey,
			suggestedSourceCanonicalUrl: metadata.suggestedSourceCanonicalUrl
		});

		await refreshSavedSourceSuggestionForKey(
			ctx,
			args.userAuthId,
			metadata.suggestedSourceNormalizedKey
		);

		return {
			bookmarkSourceId,
			sourceItemId: ingestResult.sourceItemId,
			created: ingestResult.created,
			alreadySaved: !!existingActiveMatch
		};
	}
});

const deliverSourceItemFanoutBatchTx = async (
	ctx: any,
	args: {
		sourceItemId: Id<'source_items'>;
		paginationOpts: { numItems: number; cursor: string | null };
	}
): Promise<{
	deliveredCount: number;
	scannedCount: number;
	isDone: boolean;
	continueCursor: string | null;
}> => {
	const dedupeAndEnsureDelivery = async (
		userAuthId: string,
		sourceId: Id<'sources'>,
		sourceItemId: Id<'source_items'>,
		publishedAt: number
	) => {
		const deliveries = await listDeliveriesForUserSourceItem(ctx, userAuthId, sourceItemId);

		if (deliveries.length === 0) {
			await ctx.db.insert('user_source_items', {
				userAuthId,
				sourceId,
				sourceItemId,
				publishedAt,
				deliveredAt: Date.now()
			});
			return true;
		}

		await keepOldestDeliveryAndDeleteDuplicates(ctx, deliveries);

		return false;
	};

	const sourceItem = await ctx.db.get(args.sourceItemId);
	if (!sourceItem) {
		return {
			deliveredCount: 0,
			scannedCount: 0,
			isDone: true,
			continueCursor: null
		};
	}

	const page = await ctx.db
		.query('source_subscriptions')
		.withIndex('by_sourceId_and_status', (q: any) =>
			q.eq('sourceId', sourceItem.sourceId).eq('status', 'active')
		)
		.paginate(args.paginationOpts);

	let deliveredCount = 0;
	for (const subscription of page.page) {
		const inserted = await dedupeAndEnsureDelivery(
			subscription.userAuthId,
			sourceItem.sourceId,
			args.sourceItemId,
			sourceItem.publishedAt
		);
		if (inserted) {
			deliveredCount += 1;
		}
	}

	return {
		deliveredCount,
		scannedCount: page.page.length,
		isDone: page.isDone,
		continueCursor: page.continueCursor
	};
};

export const deliverSourceItemFanoutBatch = internalMutation({
	args: {
		sourceItemId: v.id('source_items'),
		paginationOpts: paginationOptsValidator
	},
	returns: fanoutBatchResultValidator,
	handler: async (ctx, args) => {
		const batch = await deliverSourceItemFanoutBatchTx(ctx, {
			sourceItemId: args.sourceItemId,
			paginationOpts: {
				numItems: Math.max(1, Math.min(args.paginationOpts.numItems, FANOUT_BATCH_SIZE)),
				cursor: args.paginationOpts.cursor
			}
		});
		return batch;
	}
});

export const runSourceItemFanoutBatch = internalAction({
	args: {
		sourceItemId: v.id('source_items'),
		cursor: v.union(v.string(), v.null()),
		attempt: v.number()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		try {
			const batch: {
				deliveredCount: number;
				scannedCount: number;
				isDone: boolean;
				continueCursor: string | null;
			} = await ctx.runMutation((internal as any).sources.deliverSourceItemFanoutBatch, {
				sourceItemId: args.sourceItemId,
				paginationOpts: {
					numItems: FANOUT_BATCH_SIZE,
					cursor: args.cursor
				}
			});

			if (!batch.isDone) {
				await ctx.scheduler.runAfter(0, (internal as any).sources.runSourceItemFanoutBatch, {
					sourceItemId: args.sourceItemId,
					cursor: batch.continueCursor,
					attempt: 0
				});
			}
		} catch (error) {
			if (args.attempt < FANOUT_RETRY_MAX_ATTEMPTS) {
				const retryDelayMs = FANOUT_RETRY_BASE_DELAY_MS * 2 ** args.attempt;
				await ctx.scheduler.runAfter(
					retryDelayMs,
					(internal as any).sources.runSourceItemFanoutBatch,
					{
						sourceItemId: args.sourceItemId,
						cursor: args.cursor,
						attempt: args.attempt + 1
					}
				);
				return null;
			}

			const message = toFailureMessage(
				JOB_FAILURE_CODE.SOURCE_FANOUT_FAILED,
				error,
				'Source item fanout failed.'
			);
			await logSecurityEvent(ctx, {
				eventType: 'source_item_fanout_dead_letter',
				severity: 'error',
				surface: 'sources.runSourceItemFanoutBatch',
				message,
				entityType: 'source_item',
				entityId: args.sourceItemId,
				metadata: JSON.stringify({
					cursor: args.cursor,
					attempt: args.attempt
				})
			});
		}

		return null;
	}
});

export const ingestSourceItemFromInput = internalMutation({
	args: {
		sourceId: v.id('sources'),
		externalId: v.optional(v.string()),
		url: v.string(),
		title: v.string(),
		snippet: v.string(),
		body: v.optional(v.string()),
		r2Key: v.optional(v.string()),
		publishedAt: v.optional(v.number()),
		contentHash: v.optional(v.string()),
		contentType: v.optional(v.string()),
		originHost: v.optional(v.string()),
		originSiteUrl: v.optional(v.string()),
		suggestedSourceType: v.optional(v.string()),
		suggestedSourceNormalizedKey: v.optional(v.string()),
		suggestedSourceCanonicalUrl: v.optional(v.string())
	},
	returns: v.object({
		sourceItemId: v.id('source_items'),
		created: v.boolean(),
		deliveredCount: v.number()
	}),
	handler: async (ctx, args) => {
		const now = Date.now();
		const normalizedUrl = normalizeHttpUrl(args.url).toString();
		const normalizedUrlHash = await urlHash(normalizedUrl);
		const normalizedTitle = args.title.trim().slice(0, SOURCE_TITLE_LIMIT);
		if (!normalizedTitle) {
			throw new Error('Source item title cannot be empty.');
		}
		const normalizedSnippet = createSnippet(args.snippet || normalizedTitle || normalizedUrl);
		const publishedAt = args.publishedAt ?? now;

		let existing = null;
		if (args.externalId?.trim()) {
			existing = await ctx.db
				.query('source_items')
				.withIndex('by_sourceId_and_externalId', (q) =>
					q.eq('sourceId', args.sourceId).eq('externalId', args.externalId!.trim())
				)
				.unique();
		}
		if (!existing) {
			existing = await ctx.db
				.query('source_items')
				.withIndex('by_sourceId_and_urlHash', (q) =>
					q.eq('sourceId', args.sourceId).eq('urlHash', normalizedUrlHash)
				)
				.unique();
		}

		let sourceItemId: Id<'source_items'>;
		let created = false;
		if (existing) {
			const previous = existing;
			await ctx.db.patch(existing._id, {
				url: normalizedUrl,
				urlHash: normalizedUrlHash,
				title: normalizedTitle,
				snippet: normalizedSnippet,
				body: args.body,
				r2Key: args.r2Key,
				publishedAt,
				contentHash: args.contentHash,
				contentType: args.contentType,
				originHost: args.originHost,
				originSiteUrl: args.originSiteUrl,
				suggestedSourceType: args.suggestedSourceType,
				suggestedSourceNormalizedKey: args.suggestedSourceNormalizedKey,
				suggestedSourceCanonicalUrl: args.suggestedSourceCanonicalUrl,
				updatedAt: now
			});
			const updated = await ctx.db.get(existing._id);
			if (updated) {
				await trackSourceItemReplaced(ctx, previous, updated);
			}
			sourceItemId = existing._id;
		} else {
			sourceItemId = await ctx.db.insert('source_items', {
				sourceId: args.sourceId,
				externalId: args.externalId?.trim() || undefined,
				url: normalizedUrl,
				urlHash: normalizedUrlHash,
				title: normalizedTitle,
				snippet: normalizedSnippet,
				body: args.body,
				r2Key: args.r2Key,
				publishedAt,
				createdAt: now,
				updatedAt: now,
				contentHash: args.contentHash,
				contentType: args.contentType,
				originHost: args.originHost,
				originSiteUrl: args.originSiteUrl,
				suggestedSourceType: args.suggestedSourceType,
				suggestedSourceNormalizedKey: args.suggestedSourceNormalizedKey,
				suggestedSourceCanonicalUrl: args.suggestedSourceCanonicalUrl
			});
			const inserted = await ctx.db.get(sourceItemId);
			if (inserted) {
				await trackSourceItemInserted(ctx, inserted);
			}
			created = true;
		}

		const fanoutBatch = await deliverSourceItemFanoutBatchTx(ctx, {
			sourceItemId,
			paginationOpts: {
				numItems: FANOUT_BATCH_SIZE,
				cursor: null
			}
		});
		if (!fanoutBatch.isDone) {
			await ctx.scheduler.runAfter(0, (internal as any).sources.runSourceItemFanoutBatch, {
				sourceItemId,
				cursor: fanoutBatch.continueCursor,
				attempt: 0
			});
		}
		await ctx.db.patch(args.sourceId, {
			updatedAt: now
		});

		return {
			sourceItemId,
			created,
			deliveredCount: fanoutBatch.deliveredCount
		};
	}
});

export const createJob = internalMutation({
	args: {
		jobType: sourceJobTypeValidator,
		userAuthId: v.optional(v.string()),
		sourceId: v.optional(v.id('sources')),
		cursor: v.optional(v.string())
	},
	returns: v.id('source_jobs'),
	handler: async (ctx, args) => {
		const now = Date.now();
		return await ctx.db.insert('source_jobs', {
			jobType: args.jobType,
			userAuthId: args.userAuthId,
			sourceId: args.sourceId,
			status: 'queued',
			cursor: args.cursor,
			processed: 0,
			createdAt: now,
			updatedAt: now
		});
	}
});

export const enqueueSourceSyncForUser = internalMutation({
	args: {
		userAuthId: v.string(),
		sourceId: v.id('sources')
	},
	returns: v.id('source_jobs'),
	handler: async (ctx, args) => {
		const subscription = await ctx.db
			.query('source_subscriptions')
			.withIndex('by_userAuthId_and_sourceId', (q) =>
				q.eq('userAuthId', args.userAuthId).eq('sourceId', args.sourceId)
			)
			.unique();
		if (!subscription) {
			throw new Error('Subscription not found.');
		}
		const now = Date.now();
		return await ctx.db.insert('source_jobs', {
			jobType: 'sync_source',
			userAuthId: args.userAuthId,
			sourceId: args.sourceId,
			status: 'queued',
			processed: 0,
			createdAt: now,
			updatedAt: now
		});
	}
});

export const getSourceForUserRefresh = internalQuery({
	args: {
		userAuthId: v.string(),
		sourceId: v.id('sources')
	},
	returns: v.union(
		v.null(),
		v.object({
			sourceId: v.id('sources'),
			type: sourceTypeValidator,
			subscriptionStatus: v.union(v.literal('active'), v.literal('paused'))
		})
	),
	handler: async (ctx, args) => {
		const subscription = await ctx.db
			.query('source_subscriptions')
			.withIndex('by_userAuthId_and_sourceId', (q) =>
				q.eq('userAuthId', args.userAuthId).eq('sourceId', args.sourceId)
			)
			.unique();
		if (!subscription) {
			return null;
		}
		const source = await ctx.db.get(args.sourceId);
		if (!source) {
			return null;
		}
		return {
			sourceId: source._id,
			type: source.type,
			subscriptionStatus: subscription.status
		};
	}
});

export const listNightlyRefreshSources = internalQuery({
	args: {
		paginationOpts: paginationOptsValidator
	},
	returns: v.object({
		page: v.array(nightlySourceRowValidator),
		isDone: v.boolean(),
		continueCursor: v.union(v.string(), v.null())
	}),
	handler: async (ctx, args) => {
		const sourcePage = await ctx.db
			.query('sources')
			.withIndex('by_status_and_updatedAt', (q) => q.eq('status', 'active'))
			.order('asc')
			.paginate(args.paginationOpts);

		return {
			page: sourcePage.page.map((source) => ({
				sourceId: source._id
			})),
			isDone: sourcePage.isDone,
			continueCursor: sourcePage.continueCursor
		};
	}
});

export const enqueueNightlySourceSyncIfNeeded = internalMutation({
	args: {
		sourceId: v.id('sources')
	},
	returns: v.union(v.id('source_jobs'), v.null()),
	handler: async (ctx, args) => {
		const source = await ctx.db.get(args.sourceId);
		if (!source || source.status !== 'active') {
			return null;
		}
		if (!isFetchableSourceType(source.type)) {
			return null;
		}

		const hasActiveSubscribers =
			(
				await ctx.db
					.query('source_subscriptions')
					.withIndex('by_sourceId_and_status', (q) =>
						q.eq('sourceId', args.sourceId).eq('status', 'active')
					)
					.take(1)
			).length > 0;
		if (!hasActiveSubscribers) {
			return null;
		}

		const recentJobs = await ctx.db
			.query('source_jobs')
			.withIndex('by_sourceId_and_createdAt', (q) => q.eq('sourceId', args.sourceId))
			.order('desc')
			.take(20);
		const hasInFlightJob = recentJobs.some(
			(job) =>
				job.jobType === 'sync_source' && (job.status === 'queued' || job.status === 'running')
		);
		if (hasInFlightJob) {
			return null;
		}

		const now = Date.now();
		return await ctx.db.insert('source_jobs', {
			jobType: 'sync_source',
			sourceId: args.sourceId,
			status: 'queued',
			processed: 0,
			createdAt: now,
			updatedAt: now
		});
	}
});

export const initializeNightlyRun = internalMutation({
	args: {
		runDate: v.string()
	},
	returns: v.object({
		runId: v.id('source_nightly_runs'),
		shouldStart: v.boolean(),
		cursor: v.union(v.string(), v.null())
	}),
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query('source_nightly_runs')
			.withIndex('by_runDate', (q) => q.eq('runDate', args.runDate))
			.unique();
		if (existing) {
			if (existing.status === 'running') {
				return {
					runId: existing._id,
					shouldStart: true,
					cursor: existing.cursor ?? null
				};
			}
			return {
				runId: existing._id,
				shouldStart: false,
				cursor: existing.cursor ?? null
			};
		}

		const now = Date.now();
		const runId: Id<'source_nightly_runs'> = await ctx.db.insert('source_nightly_runs', {
			runDate: args.runDate,
			status: 'running',
			startedAt: now,
			processedSources: 0,
			queuedJobs: 0,
			updatedAt: now
		});
		return { runId, shouldStart: true, cursor: null };
	}
});

export const updateNightlyRunProgress = internalMutation({
	args: {
		runId: v.id('source_nightly_runs'),
		processedDelta: v.number(),
		queuedDelta: v.number(),
		cursor: v.optional(v.union(v.string(), v.null()))
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.runId);
		if (!run) {
			return null;
		}
		await ctx.db.patch(args.runId, {
			processedSources: run.processedSources + args.processedDelta,
			queuedJobs: run.queuedJobs + args.queuedDelta,
			cursor: args.cursor ?? undefined,
			updatedAt: Date.now()
		});
		return null;
	}
});

export const completeNightlyRun = internalMutation({
	args: {
		runId: v.id('source_nightly_runs')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.runId);
		if (!run) {
			return null;
		}
		if (run.status === 'done') {
			return null;
		}
		if (run.status === 'failed') {
			return null;
		}
		assertNightlyRunTransition(run.status, 'done');
		await ctx.db.patch(args.runId, {
			status: 'done',
			finishedAt: Date.now(),
			cursor: undefined,
			updatedAt: Date.now()
		});
		return null;
	}
});

export const failNightlyRun = internalMutation({
	args: {
		runId: v.id('source_nightly_runs'),
		error: v.string()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.runId);
		if (!run) {
			return null;
		}
		if (run.status === 'failed') {
			return null;
		}
		if (run.status === 'done') {
			return null;
		}
		assertNightlyRunTransition(run.status, 'failed');
		await ctx.db.patch(args.runId, {
			status: 'failed',
			error: args.error.slice(0, 1000),
			finishedAt: Date.now(),
			updatedAt: Date.now()
		});
		return null;
	}
});

export const acquireNightlyLock = internalMutation({
	args: {
		lockKey: v.string(),
		owner: v.string(),
		leaseMs: v.number()
	},
	returns: v.object({
		acquired: v.boolean(),
		lockId: v.optional(v.id('scheduler_locks')),
		leaseExpiresAt: v.optional(v.number())
	}),
	handler: async (ctx, args) => {
		const now = Date.now();
		const leaseExpiresAt = now + Math.max(60_000, Math.floor(args.leaseMs));
		const existing = (
			await ctx.db
				.query('scheduler_locks')
				.withIndex('by_lockKey', (q) => q.eq('lockKey', args.lockKey))
				.take(1)
		)[0];

		if (!existing) {
			const lockId = await ctx.db.insert('scheduler_locks', {
				lockKey: args.lockKey,
				owner: args.owner,
				leaseExpiresAt,
				heartbeatAt: now,
				createdAt: now,
				updatedAt: now
			});
			return { acquired: true, lockId, leaseExpiresAt };
		}

		if (existing.owner === args.owner || existing.leaseExpiresAt <= now) {
			await ctx.db.patch(existing._id, {
				owner: args.owner,
				leaseExpiresAt,
				heartbeatAt: now,
				updatedAt: now
			});
			return { acquired: true, lockId: existing._id, leaseExpiresAt };
		}

		return { acquired: false };
	}
});

export const releaseNightlyLock = internalMutation({
	args: {
		lockKey: v.string(),
		owner: v.string()
	},
	returns: v.boolean(),
	handler: async (ctx, args) => {
		const existing = (
			await ctx.db
				.query('scheduler_locks')
				.withIndex('by_lockKey', (q) => q.eq('lockKey', args.lockKey))
				.take(1)
		)[0];

		if (!existing || existing.owner !== args.owner) {
			return false;
		}
		await ctx.db.delete(existing._id);
		return true;
	}
});

export const markJobRunning = internalMutation({
	args: {
		jobId: v.id('source_jobs')
	},
	returns: v.boolean(),
	handler: async (ctx, args) => {
		const job = await ctx.db.get(args.jobId);
		if (!job) {
			return false;
		}
		if (job.status === 'running') {
			return true;
		}
		if (job.status === 'done' || job.status === 'failed') {
			return false;
		}
		assertSourceJobTransition(job.status, 'running');
		await ctx.db.patch(args.jobId, {
			status: 'running',
			updatedAt: Date.now()
		});
		return true;
	}
});

export const updateJobProgress = internalMutation({
	args: {
		jobId: v.id('source_jobs'),
		processedDelta: v.number(),
		cursor: v.optional(v.string())
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const job = await ctx.db.get(args.jobId);
		if (!job) {
			return null;
		}
		if (job.status !== 'running') {
			return null;
		}
		await ctx.db.patch(args.jobId, {
			processed: job.processed + args.processedDelta,
			cursor: args.cursor,
			updatedAt: Date.now()
		});
		return null;
	}
});

export const completeJob = internalMutation({
	args: {
		jobId: v.id('source_jobs')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const job = await ctx.db.get(args.jobId);
		if (!job) {
			return null;
		}
		if (job.status === 'done') {
			return null;
		}
		if (job.status === 'failed') {
			return null;
		}
		assertSourceJobTransition(job.status, 'done');
		await ctx.db.patch(args.jobId, {
			status: 'done',
			cursor: undefined,
			finishedAt: Date.now(),
			updatedAt: Date.now()
		});
		return null;
	}
});

export const failJob = internalMutation({
	args: {
		jobId: v.id('source_jobs'),
		error: v.string()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const job = await ctx.db.get(args.jobId);
		if (!job) {
			return null;
		}
		if (job.status === 'failed') {
			return null;
		}
		if (job.status === 'done') {
			return null;
		}
		assertSourceJobTransition(job.status, 'failed');
		await ctx.db.patch(args.jobId, {
			status: 'failed',
			error: args.error.slice(0, 500),
			finishedAt: Date.now(),
			updatedAt: Date.now()
		});
		return null;
	}
});

export const getSourceForSync = internalQuery({
	args: {
		sourceId: v.id('sources')
	},
	returns: v.union(
		v.null(),
		v.object({
			_id: v.id('sources'),
			type: sourceTypeValidator,
			status: sourceStatusValidator,
			title: v.string(),
			canonicalUrl: v.string(),
			hasActiveSubscriptions: v.boolean()
		})
	),
	handler: async (ctx, args) => {
		const source = await ctx.db.get(args.sourceId);
		if (!source) {
			return null;
		}
		const hasActiveSubscriptions =
			(
				await ctx.db
					.query('source_subscriptions')
					.withIndex('by_sourceId_and_status', (q) =>
						q.eq('sourceId', source._id).eq('status', 'active')
					)
					.take(1)
			).length > 0;
		return {
			_id: source._id,
			type: source.type,
			status: source.status,
			title: source.title,
			canonicalUrl: source.canonicalUrl,
			hasActiveSubscriptions
		};
	}
});

export const getSourceItemForSharing = internalQuery({
	args: {
		sourceItemId: v.id('source_items'),
		userAuthId: v.string()
	},
	returns: v.union(
		v.null(),
		v.object({
			sourceItemId: v.id('source_items'),
			sourceId: v.id('sources'),
			sourceType: sourceTypeValidator,
			url: v.string(),
			title: v.string(),
			snippet: v.string()
		})
	),
	handler: async (ctx, args) => {
		const delivery = (
			await ctx.db
				.query('user_source_items')
				.withIndex('by_userAuthId_and_sourceItemId', (q) =>
					q.eq('userAuthId', args.userAuthId).eq('sourceItemId', args.sourceItemId)
				)
				.take(1)
		)[0];
		if (!delivery) {
			return null;
		}
		const sourceItem = await ctx.db.get(args.sourceItemId);
		if (!sourceItem) {
			return null;
		}
		const source = await ctx.db.get(sourceItem.sourceId);
		if (!source) {
			return null;
		}
		return {
			sourceItemId: sourceItem._id,
			sourceId: source._id,
			sourceType: source.type,
			url: sourceItem.url,
			title: sourceItem.title,
			snippet: sourceItem.snippet
		};
	}
});

export const getSourceItemForBookmarking = internalQuery({
	args: {
		sourceItemId: v.id('source_items'),
		userAuthId: v.string()
	},
	returns: v.union(
		v.null(),
		v.object({
			sourceItemId: v.id('source_items'),
			url: v.string(),
			title: v.string(),
			snippet: v.string(),
			publishedAt: v.number()
		})
	),
	handler: async (ctx, args) => {
		const delivery = (
			await ctx.db
				.query('user_source_items')
				.withIndex('by_userAuthId_and_sourceItemId', (q) =>
					q.eq('userAuthId', args.userAuthId).eq('sourceItemId', args.sourceItemId)
				)
				.take(1)
		)[0];
		const ownedShareExists =
			(
				await ctx.db
					.query('posts')
					.withIndex('by_authorAuthId_and_sourceItemId_and_createdAt', (q) =>
						q.eq('authorAuthId', args.userAuthId).eq('sourceItemId', args.sourceItemId)
					)
					.take(1)
			).length > 0;
		if (!delivery && !ownedShareExists) {
			return null;
		}

		const sourceItem = await ctx.db.get(args.sourceItemId);
		if (!sourceItem) {
			return null;
		}

		return {
			sourceItemId: sourceItem._id,
			url: sourceItem.url,
			title: sourceItem.title,
			snippet: sourceItem.snippet,
			publishedAt: sourceItem.publishedAt
		};
	}
});

export const getSourceItem = query({
	args: {
		sourceItemId: v.id('source_items')
	},
	returns: v.union(v.null(), sourceItemDetailsValidator),
	handler: async (ctx, args) => {
		const authUser = await authComponent.getAuthUser(ctx);
		if (!authUser) {
			throw new Error('Unauthorized');
		}

		const delivery = (
			await ctx.db
				.query('user_source_items')
				.withIndex('by_userAuthId_and_sourceItemId', (q) =>
					q.eq('userAuthId', authUser._id).eq('sourceItemId', args.sourceItemId)
				)
				.take(1)
		)[0];
		const ownedShareExists =
			(
				await ctx.db
					.query('posts')
					.withIndex('by_authorAuthId_and_sourceItemId_and_createdAt', (q) =>
						q.eq('authorAuthId', authUser._id).eq('sourceItemId', args.sourceItemId)
					)
					.take(1)
			).length > 0;
		if (!delivery && !ownedShareExists) {
			return null;
		}

		const sourceItem = await ctx.db.get(args.sourceItemId);
		if (!sourceItem) {
			return null;
		}
		const source = await ctx.db.get(sourceItem.sourceId);
		if (!source) {
			return null;
		}

		const shares = await ctx.db
			.query('posts')
			.withIndex('by_authorAuthId_and_sourceItemId_and_createdAt', (q) =>
				q.eq('authorAuthId', authUser._id).eq('sourceItemId', args.sourceItemId)
			)
			.order('desc')
			.collect();
		const bookmarkMatch = await getActiveBookmarkMatchForUrl(ctx, authUser._id, sourceItem.url);
		const legacySavedPostId = shares.find(
			(post) => (post.visibility ?? 'private') === 'private' && !post.communityId
		)?._id;
		const communityIds = [
			...new Set(shares.map((post) => post.communityId).filter(Boolean))
		] as Array<Id<'communities'>>;
		const communityDocs = await Promise.all(
			communityIds.map((communityId) => ctx.db.get(communityId))
		);
		const communityById = new Map(
			communityIds.map((communityId, index) => [communityId, communityDocs[index]])
		);
		const bodyUrl = sourceItem.r2Key ? await r2.getUrl(sourceItem.r2Key) : undefined;

		return {
			_id: sourceItem._id,
			sourceId: source._id,
			sourceType: source.type,
			sourceTitle: source.title,
			sourceCanonicalUrl: source.canonicalUrl,
			title: sourceItem.title,
			snippet: sourceItem.snippet,
			body: sourceItem.body,
			bodyUrl: bodyUrl ?? undefined,
			url: sourceItem.url,
			publishedAt: sourceItem.publishedAt,
			createdAt: sourceItem.createdAt,
			updatedAt: sourceItem.updatedAt,
			isSaved: !!bookmarkMatch || !!legacySavedPostId,
			savedBookmarkItemId: bookmarkMatch?.bookmarkItem._id,
			legacySavedPostId,
			shares: shares.map((post) => {
				const community = post.communityId ? communityById.get(post.communityId) : null;
				return {
					postId: post._id,
					title: post.title,
					visibility: post.visibility ?? 'private',
					communityId: post.communityId,
					communitySlug: community?.slug,
					communityName: community?.name,
					createdAt: post.createdAt
				};
			})
		};
	}
});

export const patchSourceSyncSuccess = internalMutation({
	args: {
		sourceId: v.id('sources')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const now = Date.now();
		await ctx.db.patch(args.sourceId, {
			status: 'active',
			lastFetchedAt: now,
			lastSuccessAt: now,
			lastError: undefined,
			updatedAt: now
		});
		return null;
	}
});

export const patchSourceSyncError = internalMutation({
	args: {
		sourceId: v.id('sources'),
		error: v.string()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const now = Date.now();
		await ctx.db.patch(args.sourceId, {
			status: 'error',
			lastFetchedAt: now,
			lastError: args.error.slice(0, 500),
			updatedAt: now
		});
		return null;
	}
});

export const getUserProfileCreatedAt = internalQuery({
	args: {
		userAuthId: v.string()
	},
	returns: v.union(v.number(), v.null()),
	handler: async (ctx, args) => {
		const profile = await ctx.db
			.query('users_profile')
			.withIndex('by_authId', (q) => q.eq('authId', args.userAuthId))
			.unique();
		return profile?.createdAt ?? null;
	}
});

export const getSavedSourceSuggestionForUser = internalQuery({
	args: {
		userAuthId: v.string(),
		suggestionId: v.id('saved_source_suggestions')
	},
	returns: v.union(
		v.null(),
		v.object({
			_id: v.id('saved_source_suggestions'),
			normalizedKey: v.string(),
			canonicalUrl: v.string(),
			originHost: v.string()
		})
	),
	handler: async (ctx, args) => {
		const suggestion = await ctx.db.get(args.suggestionId);
		if (!suggestion || suggestion.userAuthId !== args.userAuthId) {
			return null;
		}
		return {
			_id: suggestion._id,
			normalizedKey: suggestion.normalizedKey,
			canonicalUrl: suggestion.canonicalUrl,
			originHost: suggestion.originHost
		};
	}
});

export const addSource = action({
	args: {
		type: sourceTypeValidator,
		inputUrlOrId: v.string(),
		title: v.optional(v.string())
	},
	returns: v.object({
		sourceId: v.id('sources'),
		subscriptionStatus: v.union(v.literal('active'), v.literal('already_subscribed')),
		jobId: v.optional(v.id('source_jobs')),
		savedSeedItemId: v.optional(v.id('source_items')),
		resolvedSourceType: sourceTypeValidator,
		resolvedCanonicalUrl: v.string()
	}),
	handler: async (ctx, args) => {
		const authUser = await authComponent.getAuthUser(ctx);
		if (!authUser) {
			throw new Error('Unauthorized');
		}
		const identity = await ctx.auth.getUserIdentity();
		const rawSessionId = (identity as { sessionId?: unknown } | null)?.sessionId;
		const rawIpAddress = (identity as { ipAddress?: unknown; ip?: unknown } | null)?.ipAddress;
		const fallbackIpAddress =
			(typeof rawIpAddress === 'string' && rawIpAddress) ||
			(typeof (identity as { ip?: unknown } | null)?.ip === 'string'
				? ((identity as { ip?: string } | null)?.ip ?? null)
				: null);
		const sessionRateLimitKey =
			typeof rawSessionId === 'string' && rawSessionId
				? rawSessionId
				: `sessionless:${authUser._id}`;
		const ipRateLimitKey = fallbackIpAddress ? await sha256Hex(fallbackIpAddress) : null;

		const normalizedInput = normalizeSourceInput(args.type, args.inputUrlOrId);
		await rateLimiter.limit(ctx, 'addSource', { key: authUser._id, throws: true });
		await rateLimiter.limit(ctx, 'addSourcePerNormalizedKey', {
			key: `${authUser._id}:${normalizedInput.normalizedKey}`,
			throws: true
		});
		await rateLimiter.limit(ctx, 'addSourcePerSession', {
			key: sessionRateLimitKey,
			throws: true
		});
		if (ipRateLimitKey) {
			await rateLimiter.limit(ctx, 'addSourcePerIp', {
				key: ipRateLimitKey,
				throws: true
			});
		}
		const profileCreatedAt: number | null = await ctx.runQuery(
			(internal as any).sources.getUserProfileCreatedAt,
			{
				userAuthId: authUser._id
			}
		);
		if (isNewAccount(profileCreatedAt)) {
			await rateLimiter.limit(ctx, 'addSourceNewAccount', {
				key: authUser._id,
				throws: true
			});
		}

		const resolvedWebsiteTarget =
			args.type === 'website' ? await resolveWebsiteFollowTarget(ctx, args.inputUrlOrId) : null;
		const resolvedType =
			resolvedWebsiteTarget?.sourceType ??
			(args.type as 'website' | 'rss' | 'youtube' | 'bookmarks');
		const resolvedCanonicalUrl =
			resolvedWebsiteTarget?.canonicalUrl ?? normalizedInput.canonicalUrl;
		const resolvedNormalizedKey =
			resolvedWebsiteTarget?.normalizedKey ?? normalizedInput.normalizedKey;

		const ensureResult: {
			sourceId: Id<'sources'>;
			alreadySubscribed: boolean;
			shouldBackfill: boolean;
		} = await ctx.runMutation((internal as any).sources.ensureSourceAndSubscription, {
			userAuthId: authUser._id,
			type: resolvedType,
			normalizedKey: resolvedNormalizedKey,
			canonicalUrl: resolvedCanonicalUrl,
			title: args.title,
			addedVia: 'manual'
		});

		let savedSeedItemId: Id<'source_items'> | undefined;
		if (
			args.type === 'website' &&
			resolvedWebsiteTarget?.shouldSaveOriginal &&
			resolvedWebsiteTarget.originalUrl !== resolvedCanonicalUrl
		) {
			const savedSeedResult: {
				sourceItemId: Id<'source_items'>;
			} = await ctx.runMutation((internal as any).sources.saveLinkToBookmarks, {
				userAuthId: authUser._id,
				url: resolvedWebsiteTarget.originalUrl,
				title: args.title?.trim() || resolvedWebsiteTarget.originalUrl,
				snippet: `Saved while following ${resolvedWebsiteTarget.canonicalUrl}`,
				publishedAt: Date.now()
			});
			savedSeedItemId = savedSeedResult.sourceItemId;
		}

		if (ensureResult.alreadySubscribed) {
			return {
				sourceId: ensureResult.sourceId,
				subscriptionStatus: 'already_subscribed' as const,
				savedSeedItemId,
				resolvedSourceType: resolvedType,
				resolvedCanonicalUrl
			};
		}

		if (!isFetchableSourceType(resolvedType) && !ensureResult.shouldBackfill) {
			return {
				sourceId: ensureResult.sourceId,
				subscriptionStatus: 'active' as const,
				savedSeedItemId,
				resolvedSourceType: resolvedType,
				resolvedCanonicalUrl
			};
		}

		const jobType = ensureResult.shouldBackfill ? 'resubscribe_backfill' : 'sync_source';
		const jobId: Id<'source_jobs'> = await ctx.runMutation((internal as any).sources.createJob, {
			jobType,
			userAuthId: authUser._id,
			sourceId: ensureResult.sourceId
		});

		if (ensureResult.shouldBackfill) {
			await enqueueSourceCleanupWork(ctx, (internal as any).sources.runResubscribeBackfill, {
				jobId,
				userAuthId: authUser._id,
				sourceId: ensureResult.sourceId,
				cursor: null
			});
		} else {
			await enqueueSourceSyncWork(ctx, {
				jobId,
				sourceId: ensureResult.sourceId
			});
		}

		return {
			sourceId: ensureResult.sourceId,
			subscriptionStatus: 'active' as const,
			jobId,
			savedSeedItemId,
			resolvedSourceType: resolvedType,
			resolvedCanonicalUrl
		};
	}
});

export const saveWebsiteLink = mutation({
	args: {
		url: v.string(),
		title: v.optional(v.string())
	},
	returns: v.object({
		sourceItemId: v.id('source_items'),
		created: v.boolean(),
		alreadySaved: v.boolean()
	}),
	handler: async (ctx, args) => {
		const authUser = await authComponent.getAuthUser(ctx);
		if (!authUser) {
			throw new Error('Unauthorized');
		}

		const normalizedUrl = normalizeHttpUrl(args.url).toString();
		const title = (args.title?.trim() || normalizedUrl).slice(0, SOURCE_TITLE_LIMIT);
		const result: {
			sourceItemId: Id<'source_items'>;
			created: boolean;
			alreadySaved: boolean;
		} = await ctx.runMutation((internal as any).sources.saveLinkToBookmarks, {
			userAuthId: authUser._id,
			url: normalizedUrl,
			title,
			snippet: `${normalizedUrl} - saved link`,
			publishedAt: Date.now()
		});

		return {
			sourceItemId: result.sourceItemId,
			created: result.created,
			alreadySaved: result.alreadySaved
		};
	}
});

export const saveSourceItemToBookmarks = mutation({
	args: {
		sourceItemId: v.id('source_items')
	},
	returns: v.object({
		sourceItemId: v.id('source_items'),
		created: v.boolean(),
		alreadySaved: v.boolean()
	}),
	handler: async (ctx, args) => {
		const authUser = await authComponent.getAuthUser(ctx);
		if (!authUser) {
			throw new Error('Unauthorized');
		}

		const sourceItem: {
			sourceItemId: Id<'source_items'>;
			url: string;
			title: string;
			snippet: string;
			publishedAt: number;
		} | null = await ctx.runQuery((internal as any).sources.getSourceItemForBookmarking, {
			userAuthId: authUser._id,
			sourceItemId: args.sourceItemId
		});
		if (!sourceItem) {
			throw new Error('Source item not found.');
		}

		const result: {
			sourceItemId: Id<'source_items'>;
			created: boolean;
			alreadySaved: boolean;
		} = await ctx.runMutation((internal as any).sources.saveLinkToBookmarks, {
			userAuthId: authUser._id,
			url: sourceItem.url,
			title: sourceItem.title,
			snippet: sourceItem.snippet,
			publishedAt: sourceItem.publishedAt
		});

		return {
			sourceItemId: result.sourceItemId,
			created: result.created,
			alreadySaved: result.alreadySaved
		};
	}
});

export const unsaveBookmarkItem = mutation({
	args: {
		bookmarkItemId: v.id('source_items')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const authUser = await authComponent.getAuthUser(ctx);
		if (!authUser) {
			throw new Error('Unauthorized');
		}

		const bookmarkSource = await getBookmarkSourceByUserAuthId(ctx, authUser._id);
		if (!bookmarkSource) {
			return null;
		}
		const bookmarkItem = await ctx.db.get(args.bookmarkItemId);
		if (!bookmarkItem || bookmarkItem.sourceId !== bookmarkSource._id) {
			return null;
		}

		const deliveries = await ctx.db
			.query('user_source_items')
			.withIndex('by_userAuthId_and_sourceItemId', (q) =>
				q.eq('userAuthId', authUser._id).eq('sourceItemId', args.bookmarkItemId)
			)
			.collect();
		for (const delivery of deliveries) {
			await ctx.db.delete(delivery._id);
		}

		const linkedPosts = await ctx.db
			.query('posts')
			.withIndex('by_sourceItemId_and_createdAt', (q) => q.eq('sourceItemId', args.bookmarkItemId))
			.take(1);
		if (linkedPosts.length === 0) {
			await trackSourceItemDeleted(ctx, bookmarkItem);
			await ctx.db.delete(bookmarkItem._id);
		}

		if (bookmarkItem.suggestedSourceNormalizedKey) {
			await refreshSavedSourceSuggestionForKey(
				ctx,
				authUser._id,
				bookmarkItem.suggestedSourceNormalizedKey
			);
		}

		return null;
	}
});

export const followSavedSourceSuggestion = action({
	args: {
		suggestionId: v.id('saved_source_suggestions')
	},
	returns: v.object({
		sourceId: v.id('sources'),
		subscriptionStatus: v.union(v.literal('active'), v.literal('already_subscribed')),
		jobId: v.optional(v.id('source_jobs')),
		resolvedSourceType: sourceTypeValidator,
		resolvedCanonicalUrl: v.string()
	}),
	handler: async (ctx, args) => {
		const authUser = await authComponent.getAuthUser(ctx);
		if (!authUser) {
			throw new Error('Unauthorized');
		}

		const suggestion = await ctx.runQuery(
			(internal as any).sources.getSavedSourceSuggestionForUser,
			{
				userAuthId: authUser._id,
				suggestionId: args.suggestionId
			}
		);
		if (!suggestion) {
			throw new Error('Suggestion not found.');
		}

		await rateLimiter.limit(ctx, 'addSource', { key: authUser._id, throws: true });
		await rateLimiter.limit(ctx, 'addSourcePerNormalizedKey', {
			key: `${authUser._id}:${suggestion.normalizedKey}`,
			throws: true
		});
		const resolvedWebsiteTarget = await resolveWebsiteFollowTarget(ctx, suggestion.canonicalUrl);
		const ensureResult: {
			sourceId: Id<'sources'>;
			alreadySubscribed: boolean;
			shouldBackfill: boolean;
		} = await ctx.runMutation((internal as any).sources.ensureSourceAndSubscription, {
			userAuthId: authUser._id,
			type: resolvedWebsiteTarget.sourceType,
			normalizedKey: resolvedWebsiteTarget.normalizedKey,
			canonicalUrl: resolvedWebsiteTarget.canonicalUrl,
			title: suggestion.originHost,
			addedVia: 'saved_link'
		});

		if (ensureResult.alreadySubscribed) {
			return {
				sourceId: ensureResult.sourceId,
				subscriptionStatus: 'already_subscribed' as const,
				resolvedSourceType: resolvedWebsiteTarget.sourceType,
				resolvedCanonicalUrl: resolvedWebsiteTarget.canonicalUrl
			};
		}

		if (!isFetchableSourceType(resolvedWebsiteTarget.sourceType) && !ensureResult.shouldBackfill) {
			return {
				sourceId: ensureResult.sourceId,
				subscriptionStatus: 'active' as const,
				resolvedSourceType: resolvedWebsiteTarget.sourceType,
				resolvedCanonicalUrl: resolvedWebsiteTarget.canonicalUrl
			};
		}

		const jobType = ensureResult.shouldBackfill ? 'resubscribe_backfill' : 'sync_source';
		const jobId: Id<'source_jobs'> = await ctx.runMutation((internal as any).sources.createJob, {
			jobType,
			userAuthId: authUser._id,
			sourceId: ensureResult.sourceId
		});

		if (ensureResult.shouldBackfill) {
			await enqueueSourceCleanupWork(ctx, (internal as any).sources.runResubscribeBackfill, {
				jobId,
				userAuthId: authUser._id,
				sourceId: ensureResult.sourceId,
				cursor: null
			});
		} else {
			await enqueueSourceSyncWork(ctx, {
				jobId,
				sourceId: ensureResult.sourceId
			});
		}

		return {
			sourceId: ensureResult.sourceId,
			subscriptionStatus: 'active' as const,
			jobId,
			resolvedSourceType: resolvedWebsiteTarget.sourceType,
			resolvedCanonicalUrl: resolvedWebsiteTarget.canonicalUrl
		};
	}
});

export const runSourceSync = internalAction({
	args: {
		jobId: v.id('source_jobs'),
		sourceId: v.id('sources')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const shouldRun: boolean = await ctx.runMutation((internal as any).sources.markJobRunning, {
			jobId: args.jobId
		});
		if (!shouldRun) {
			return null;
		}

		try {
			const source: {
				_id: Id<'sources'>;
				type: 'website' | 'rss' | 'youtube' | 'bookmarks';
				status: 'active' | 'paused' | 'error' | 'deleting';
				title: string;
				canonicalUrl: string;
				hasActiveSubscriptions: boolean;
			} | null = await ctx.runQuery((internal as any).sources.getSourceForSync, {
				sourceId: args.sourceId
			});
			if (!source) {
				throw new Error('Source not found.');
			}
			if (
				source.status === 'deleting' ||
				source.status === 'paused' ||
				!source.hasActiveSubscriptions
			) {
				await ctx.runMutation((internal as any).sources.completeJob, {
					jobId: args.jobId
				});
				return null;
			}
			if (!isFetchableSourceType(source.type)) {
				await ctx.runMutation((internal as any).sources.completeJob, {
					jobId: args.jobId
				});
				return null;
			}

			const parsedSourceUrl = normalizeHttpUrl(source.canonicalUrl);
			if (isBlockedHostname(parsedSourceUrl.hostname)) {
				throw new Error('Source host is blocked for safety.');
			}

			let processed = 0;

			if (source.type === 'rss') {
				const rssResult: { processed: number } = await ctx.runAction(
					(internal as any).sources_node.syncRssSource,
					{
						sourceId: source._id,
						canonicalUrl: source.canonicalUrl
					}
				);
				processed = rssResult.processed;
			} else {
				const websiteResult: { processed: number } = await ctx.runAction(
					(internal as any).sources_node.syncWebsiteSource,
					{
						sourceId: source._id,
						canonicalUrl: source.canonicalUrl,
						sourceTitle: source.title
					}
				);
				processed = websiteResult.processed;
			}

			await ctx.runMutation((internal as any).sources.patchSourceSyncSuccess, {
				sourceId: source._id
			});
			await ctx.runMutation((internal as any).sources.updateJobProgress, {
				jobId: args.jobId,
				processedDelta: processed
			});
			await ctx.runMutation((internal as any).sources.completeJob, {
				jobId: args.jobId
			});
		} catch (error) {
			const message = toFailureMessage(
				classifySourceSyncFailureCode(error),
				error,
				'Source sync failed.'
			);
			await logSecurityEvent(ctx, {
				eventType: 'source_sync_failed',
				severity: 'error',
				surface: 'sources.runSourceSync',
				message,
				entityType: 'source',
				entityId: args.sourceId
			});
			await ctx.runMutation((internal as any).sources.patchSourceSyncError, {
				sourceId: args.sourceId,
				error: message
			});
			await ctx.runMutation((internal as any).sources.failJob, {
				jobId: args.jobId,
				error: message
			});
		}

		return null;
	}
});

export const refreshSource = action({
	args: {
		sourceId: v.id('sources')
	},
	returns: v.id('source_jobs'),
	handler: async (ctx, args) => {
		const authUser = await authComponent.getAuthUser(ctx);
		if (!authUser) {
			throw new Error('Unauthorized');
		}

		const sourceForRefresh: {
			sourceId: Id<'sources'>;
			type: 'website' | 'rss' | 'youtube' | 'bookmarks';
			subscriptionStatus: 'active' | 'paused';
		} | null = await ctx.runQuery((internal as any).sources.getSourceForUserRefresh, {
			userAuthId: authUser._id,
			sourceId: args.sourceId
		});
		if (!sourceForRefresh || sourceForRefresh.subscriptionStatus !== 'active') {
			throw new Error('Subscription not found.');
		}
		if (!isFetchableSourceType(sourceForRefresh.type)) {
			throw new Error('Bookmark sources are upload-only and cannot be refreshed.');
		}

		if (!isAdminRole(authUser.role)) {
			const identity = await ctx.auth.getUserIdentity();
			const rawSessionId = (identity as { sessionId?: unknown } | null)?.sessionId;
			const rawIpAddress = (identity as { ipAddress?: unknown; ip?: unknown } | null)?.ipAddress;
			const fallbackIpAddress =
				(typeof rawIpAddress === 'string' && rawIpAddress) ||
				(typeof (identity as { ip?: unknown } | null)?.ip === 'string'
					? ((identity as { ip?: string } | null)?.ip ?? null)
					: null);
			const sessionRateLimitKey =
				typeof rawSessionId === 'string' && rawSessionId
					? rawSessionId
					: `sessionless:${authUser._id}`;
			const ipRateLimitKey = fallbackIpAddress ? await sha256Hex(fallbackIpAddress) : null;

			await rateLimiter.limit(ctx, 'manualSourceRefresh', {
				key: authUser._id,
				throws: true
			});
			await rateLimiter.limit(ctx, 'manualSourceRefreshPerSource', {
				key: `${authUser._id}:${args.sourceId}`,
				throws: true
			});
			await rateLimiter.limit(ctx, 'manualSourceRefreshPerSession', {
				key: sessionRateLimitKey,
				throws: true
			});
			if (ipRateLimitKey) {
				await rateLimiter.limit(ctx, 'manualSourceRefreshPerIp', {
					key: ipRateLimitKey,
					throws: true
				});
			}
			const profileCreatedAt: number | null = await ctx.runQuery(
				(internal as any).sources.getUserProfileCreatedAt,
				{
					userAuthId: authUser._id
				}
			);
			if (isNewAccount(profileCreatedAt)) {
				await rateLimiter.limit(ctx, 'manualSourceRefreshNewAccount', {
					key: authUser._id,
					throws: true
				});
			}
		}
		const jobId: Id<'source_jobs'> = await ctx.runMutation(
			(internal as any).sources.enqueueSourceSyncForUser,
			{
				userAuthId: authUser._id,
				sourceId: args.sourceId
			}
		);
		await enqueueSourceSyncWork(ctx, {
			jobId,
			sourceId: args.sourceId
		});
		return jobId;
	}
});

export const getMyRefreshQuota = query({
	args: {},
	returns: refreshQuotaValidator,
	handler: async (ctx) => {
		const authUser = await authComponent.getAuthUser(ctx);
		if (!authUser) {
			throw new Error('Unauthorized');
		}

		if (isAdminRole(authUser.role)) {
			return {
				isUnlimited: true,
				dailyLimit: null,
				remaining: null,
				used: null,
				resetsAt: nextUtcMidnightMs()
			};
		}

		const profile = await ctx.db
			.query('users_profile')
			.withIndex('by_authId', (q) => q.eq('authId', authUser._id))
			.unique();
		const [status, currentValue] = await Promise.all([
			rateLimiter.check(ctx, 'manualSourceRefresh', { key: authUser._id }),
			rateLimiter.getValue(ctx, 'manualSourceRefresh', { key: authUser._id })
		]);
		const globalRemaining = Math.max(0, Math.floor(currentValue.value));
		const newAccount = isNewAccount(profile?.createdAt ?? null);
		if (!newAccount) {
			return {
				isUnlimited: false,
				dailyLimit: MANUAL_REFRESH_DAILY_LIMIT,
				remaining: globalRemaining,
				used: Math.max(0, MANUAL_REFRESH_DAILY_LIMIT - globalRemaining),
				retryAfterMs: status.ok ? undefined : status.retryAfter,
				resetsAt: nextUtcMidnightMs()
			};
		}

		const [newAccountStatus, newAccountValue] = await Promise.all([
			rateLimiter.check(ctx, 'manualSourceRefreshNewAccount', { key: authUser._id }),
			rateLimiter.getValue(ctx, 'manualSourceRefreshNewAccount', { key: authUser._id })
		]);
		const newAccountRemaining = Math.max(0, Math.floor(newAccountValue.value));
		const remaining = Math.min(globalRemaining, newAccountRemaining);
		const retryAfterCandidates = [
			status.ok ? undefined : status.retryAfter,
			newAccountStatus.ok ? undefined : newAccountStatus.retryAfter
		].filter((value): value is number => value !== undefined);
		const retryAfterMs =
			retryAfterCandidates.length > 0 ? Math.min(...retryAfterCandidates) : undefined;
		return {
			isUnlimited: false,
			dailyLimit: NEW_ACCOUNT_MANUAL_REFRESH_DAILY_LIMIT,
			remaining,
			used: Math.max(0, NEW_ACCOUNT_MANUAL_REFRESH_DAILY_LIMIT - remaining),
			retryAfterMs,
			resetsAt: nextUtcMidnightMs()
		};
	}
});

export const runNightlySourceRefreshBatch = internalAction({
	args: {
		cursor: v.union(v.string(), v.null()),
		runId: v.optional(v.id('source_nightly_runs')),
		lockOwner: v.optional(v.string())
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		let runId: Id<'source_nightly_runs'> | null = args.runId ?? null;
		let batchCursor = args.cursor;
		const lockOwner =
			args.lockOwner ?? `nightly:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
		const lockKey = `nightly_source_refresh:${utcRunDateKey()}`;
		try {
			const lockResult: {
				acquired: boolean;
				lockId?: Id<'scheduler_locks'>;
				leaseExpiresAt?: number;
			} = await ctx.runMutation((internal as any).sources.acquireNightlyLock, {
				lockKey,
				owner: lockOwner,
				leaseMs: 60 * 60 * 1000
			});
			if (!lockResult.acquired) {
				return null;
			}

			if (!runId) {
				const initialized: {
					runId: Id<'source_nightly_runs'>;
					shouldStart: boolean;
					cursor: string | null;
				} = await ctx.runMutation((internal as any).sources.initializeNightlyRun, {
					runDate: utcRunDateKey()
				});
				if (!initialized.shouldStart) {
					return null;
				}
				runId = initialized.runId;
				if (!batchCursor) {
					batchCursor = initialized.cursor;
				}
			}

			const sourceBatch: {
				page: Array<{ sourceId: Id<'sources'> }>;
				isDone: boolean;
				continueCursor: string | null;
			} = await ctx.runQuery((internal as any).sources.listNightlyRefreshSources, {
				paginationOpts: {
					numItems: NIGHTLY_REFRESH_BATCH_SIZE,
					cursor: batchCursor
				}
			});

			let queuedJobs = 0;
			for (const [index, source] of sourceBatch.page.entries()) {
				const jobId: Id<'source_jobs'> | null = await ctx.runMutation(
					(internal as any).sources.enqueueNightlySourceSyncIfNeeded,
					{
						sourceId: source.sourceId
					}
				);
				if (!jobId) {
					continue;
				}
				queuedJobs += 1;
				await enqueueSourceSyncWork(
					ctx,
					{
						jobId,
						sourceId: source.sourceId
					},
					index * 25
				);
			}

			await ctx.runMutation((internal as any).sources.updateNightlyRunProgress, {
				runId,
				processedDelta: sourceBatch.page.length,
				queuedDelta: queuedJobs,
				cursor: sourceBatch.continueCursor
			});

			if (!sourceBatch.isDone) {
				await ctx.scheduler.runAfter(0, (internal as any).sources.runNightlySourceRefreshBatch, {
					cursor: sourceBatch.continueCursor,
					runId,
					lockOwner
				});
				return null;
			}

			await ctx.runMutation((internal as any).sources.completeNightlyRun, {
				runId
			});
			await ctx.runMutation((internal as any).sources.releaseNightlyLock, {
				lockKey,
				owner: lockOwner
			});
		} catch (error) {
			const failureMessage = toFailureMessage(
				JOB_FAILURE_CODE.SOURCE_NIGHTLY_REFRESH_FAILED,
				error,
				'Nightly refresh failed.'
			);
			if (runId) {
				await ctx.runMutation((internal as any).sources.failNightlyRun, {
					runId,
					error: failureMessage
				});
			}
			await ctx.runMutation((internal as any).sources.releaseNightlyLock, {
				lockKey,
				owner: lockOwner
			});
		}

		return null;
	}
});

export const listMySources = query({
	args: {
		paginationOpts: paginationOptsValidator
	},
	returns: v.object({
		page: v.array(sourceSummaryValidator),
		isDone: v.boolean(),
		continueCursor: v.union(v.string(), v.null())
	}),
	handler: async (ctx, args) => {
		const authUser = await authComponent.getAuthUser(ctx);
		if (!authUser) {
			throw new Error('Unauthorized');
		}

		const subscriptions = await ctx.db
			.query('source_subscriptions')
			.withIndex('by_userAuthId_and_updatedAt', (q) => q.eq('userAuthId', authUser._id))
			.order('desc')
			.paginate(args.paginationOpts);

		const page: Array<{
			sourceId: Id<'sources'>;
			subscriptionId: Id<'source_subscriptions'>;
			title: string;
			description?: string;
			type: 'website' | 'rss' | 'youtube' | 'bookmarks';
			status: 'active' | 'paused' | 'error' | 'deleting';
			addedVia?: 'manual' | 'saved_link';
			canonicalUrl: string;
			lastFetchedAt?: number;
			lastSuccessAt?: number;
			lastError?: string;
			itemCount: number;
			sharedPostCount: number;
			createdAt: number;
			updatedAt: number;
		}> = [];

		for (const subscription of subscriptions.page) {
			const source = await ctx.db.get(subscription.sourceId);
			if (!source) {
				continue;
			}
			if (source.type === 'bookmarks') {
				continue;
			}
			const [itemCount, sharedPostCount] = await Promise.all([
				countSourceItemsForSource(ctx, source._id),
				countAuthorSharedPostsForSource(ctx, authUser._id, source._id)
			]);

			page.push({
				sourceId: source._id,
				subscriptionId: subscription._id,
				title: source.title,
				description: source.description,
				type: source.type,
				status: subscription.status === 'paused' ? 'paused' : source.status,
				addedVia: subscription.addedVia,
				canonicalUrl: source.canonicalUrl,
				lastFetchedAt: source.lastFetchedAt,
				lastSuccessAt: source.lastSuccessAt,
				lastError: source.lastError,
				itemCount,
				sharedPostCount,
				createdAt: subscription.createdAt,
				updatedAt: subscription.updatedAt
			});
		}

		return {
			page,
			isDone: subscriptions.isDone,
			continueCursor: subscriptions.continueCursor
		};
	}
});

export const listSavedSourceSuggestions = query({
	args: {
		paginationOpts: paginationOptsValidator
	},
	returns: v.object({
		page: v.array(savedSuggestionValidator),
		isDone: v.boolean(),
		continueCursor: v.union(v.string(), v.null())
	}),
	handler: async (ctx, args) => {
		const authUser = await authComponent.getAuthUser(ctx);
		if (!authUser) {
			throw new Error('Unauthorized');
		}

		const suggestions = await ctx.db
			.query('saved_source_suggestions')
			.withIndex('by_userAuthId_and_updatedAt', (q) => q.eq('userAuthId', authUser._id))
			.order('desc')
			.paginate(args.paginationOpts);

	const subscriptions = await ctx.db
		.query('source_subscriptions')
		.withIndex('by_userAuthId_and_updatedAt', (q) => q.eq('userAuthId', authUser._id))
		.collect();
	const activeSubscriptions = subscriptions.filter((subscription) => subscription.status === 'active');
	const activeSourceIds = activeSubscriptions.map((subscription) => subscription.sourceId);
	const sourceDocs = await Promise.all(activeSourceIds.map((sourceId) => ctx.db.get(sourceId)));
	const activeSources = sourceDocs.filter(
		(source): source is NonNullable<typeof source> => !!source && source.type !== 'bookmarks'
	);
	const activeHosts = new Set(activeSources.map((source) => sourceHostForDisplay(source.canonicalUrl)));
	const activeSavedLinkTitles = new Set(
		activeSources
			.map((source) => source.title.trim().toLowerCase())
			.filter(Boolean)
	);

	return {
		page: suggestions.page
			.map((suggestion) => {
				const isFollowing =
					activeHosts.has(suggestion.originHost) ||
					activeSavedLinkTitles.has(suggestion.originHost.toLowerCase());
				return {
					_id: suggestion._id,
					sourceType: suggestion.sourceType,
					normalizedKey: suggestion.normalizedKey,
					canonicalUrl: suggestion.canonicalUrl,
					originHost: suggestion.originHost,
					itemCount: suggestion.itemCount,
					latestSavedUrl: suggestion.latestSavedUrl,
					latestSavedTitle: suggestion.latestSavedTitle,
					lastSavedAt: suggestion.lastSavedAt,
					createdAt: suggestion.createdAt,
					updatedAt: suggestion.updatedAt,
					isFollowing
				};
			})
			.filter((suggestion) => !suggestion.isFollowing),
		isDone: suggestions.isDone,
		continueCursor: suggestions.continueCursor
	};
	}
});

export const pauseSource = mutation({
	args: {
		sourceId: v.id('sources')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const authUser = await authComponent.getAuthUser(ctx);
		if (!authUser) {
			throw new Error('Unauthorized');
		}
		const subscription = await ctx.db
			.query('source_subscriptions')
			.withIndex('by_userAuthId_and_sourceId', (q) =>
				q.eq('userAuthId', authUser._id).eq('sourceId', args.sourceId)
			)
			.unique();
		if (!subscription) {
			throw new Error('Subscription not found.');
		}
		await ctx.db.patch(subscription._id, {
			status: 'paused',
			updatedAt: Date.now()
		});
		return null;
	}
});

export const resumeSource = mutation({
	args: {
		sourceId: v.id('sources')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const authUser = await authComponent.getAuthUser(ctx);
		if (!authUser) {
			throw new Error('Unauthorized');
		}
		const subscription = await ctx.db
			.query('source_subscriptions')
			.withIndex('by_userAuthId_and_sourceId', (q) =>
				q.eq('userAuthId', authUser._id).eq('sourceId', args.sourceId)
			)
			.unique();
		if (!subscription) {
			throw new Error('Subscription not found.');
		}
		await ctx.db.patch(subscription._id, {
			status: 'active',
			updatedAt: Date.now()
		});
		return null;
	}
});

export const markSubscriptionsForUnsubscribe = internalMutation({
	args: {
		userAuthId: v.string(),
		sourceIds: v.array(v.id('sources'))
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const now = Date.now();
		for (const sourceId of args.sourceIds) {
			const subscription = await ctx.db
				.query('source_subscriptions')
				.withIndex('by_userAuthId_and_sourceId', (q) =>
					q.eq('userAuthId', args.userAuthId).eq('sourceId', sourceId)
				)
				.unique();
			if (!subscription) {
				continue;
			}
			await ctx.db.patch(subscription._id, {
				status: 'paused',
				unsubscribedAt: now,
				updatedAt: now
			});
		}
		return null;
	}
});

const enqueueBulkUnsubscribeJob = async (
	ctx: any,
	userAuthId: string,
	sourceIds: Array<Id<'sources'>>
): Promise<Id<'source_jobs'>> => {
	await ctx.runMutation((internal as any).sources.markSubscriptionsForUnsubscribe, {
		userAuthId,
		sourceIds
	});
	const jobId: Id<'source_jobs'> = await ctx.runMutation((internal as any).sources.createJob, {
		jobType: 'bulk_unsubscribe',
		userAuthId
	});
	await enqueueSourceCleanupWork(ctx, (internal as any).sources.runBulkUnsubscribeCleanup, {
		jobId,
		userAuthId,
		sourceIds,
		sourceIndex: 0
	});
	return jobId;
};

export const unsubscribeSource = action({
	args: {
		sourceId: v.id('sources')
	},
	returns: v.id('source_jobs'),
	handler: async (ctx, args) => {
		const authUser = await authComponent.getAuthUser(ctx);
		if (!authUser) {
			throw new Error('Unauthorized');
		}
		await rateLimiter.limit(ctx, 'unsubscribeSource', { key: authUser._id, throws: true });
		return await enqueueBulkUnsubscribeJob(ctx, authUser._id, [args.sourceId]);
	}
});

export const bulkUnsubscribeSources = action({
	args: {
		sourceIds: v.array(v.id('sources'))
	},
	returns: v.id('source_jobs'),
	handler: async (ctx, args) => {
		const authUser = await authComponent.getAuthUser(ctx);
		if (!authUser) {
			throw new Error('Unauthorized');
		}
		await rateLimiter.limit(ctx, 'unsubscribeSource', { key: authUser._id, throws: true });
		const uniqueSourceIds = [...new Set(args.sourceIds)];
		if (uniqueSourceIds.length === 0) {
			throw new Error('No sources selected.');
		}
		return await enqueueBulkUnsubscribeJob(
			ctx,
			authUser._id,
			uniqueSourceIds as Array<Id<'sources'>>
		);
	}
});

export const cleanupUnsubscribeBatch = internalMutation({
	args: {
		userAuthId: v.string(),
		sourceId: v.id('sources'),
		limit: v.number()
	},
	returns: v.object({
		removedDeliveryCount: v.number(),
		unlinkedPostCount: v.number(),
		subscriptionRemoved: v.boolean(),
		done: v.boolean()
	}),
	handler: async (ctx, args) => {
		const deliveries = await ctx.db
			.query('user_source_items')
			.withIndex('by_userAuthId_and_sourceId_and_publishedAt', (q) =>
				q.eq('userAuthId', args.userAuthId).eq('sourceId', args.sourceId)
			)
			.take(args.limit);
		for (const delivery of deliveries) {
			await ctx.db.delete(delivery._id);
		}

		const posts = await ctx.db
			.query('posts')
			.withIndex('by_authorAuthId_and_sourceId_and_createdAt', (q) =>
				q.eq('authorAuthId', args.userAuthId).eq('sourceId', args.sourceId)
			)
			.take(args.limit);
		for (const post of posts) {
			const oldPost = post;
			await ctx.db.patch(post._id, {
				sourceId: undefined,
				sourceItemId: undefined,
				updatedAt: Date.now()
			});
			const updatedPost = await ctx.db.get(post._id);
			if (updatedPost) {
				await trackPostReplaced(ctx, oldPost, updatedPost);
			}
		}

		let subscriptionRemoved = false;
		const done = deliveries.length < args.limit && posts.length < args.limit;
		if (done) {
			const subscription = await ctx.db
				.query('source_subscriptions')
				.withIndex('by_userAuthId_and_sourceId', (q) =>
					q.eq('userAuthId', args.userAuthId).eq('sourceId', args.sourceId)
				)
				.unique();
			if (subscription && subscription.status !== 'active') {
				await ctx.db.delete(subscription._id);
				subscriptionRemoved = true;
			}
		}

		return {
			removedDeliveryCount: deliveries.length,
			unlinkedPostCount: posts.length,
			subscriptionRemoved,
			done
		};
	}
});

export const runBulkUnsubscribeCleanup = internalAction({
	args: {
		jobId: v.id('source_jobs'),
		userAuthId: v.string(),
		sourceIds: v.array(v.id('sources')),
		sourceIndex: v.number()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const shouldRun: boolean = await ctx.runMutation((internal as any).sources.markJobRunning, {
			jobId: args.jobId
		});
		if (!shouldRun) {
			return null;
		}

		if (args.sourceIndex >= args.sourceIds.length) {
			await ctx.runMutation((internal as any).sources.completeJob, {
				jobId: args.jobId
			});
			return null;
		}

		try {
			const sourceId = args.sourceIds[args.sourceIndex];
			const batchResult: {
				removedDeliveryCount: number;
				unlinkedPostCount: number;
				subscriptionRemoved: boolean;
				done: boolean;
			} = await ctx.runMutation((internal as any).sources.cleanupUnsubscribeBatch, {
				userAuthId: args.userAuthId,
				sourceId,
				limit: BULK_UNSUBSCRIBE_BATCH_SIZE
			});

			const processedDelta =
				batchResult.removedDeliveryCount +
				batchResult.unlinkedPostCount +
				(batchResult.subscriptionRemoved ? 1 : 0);
			await ctx.runMutation((internal as any).sources.updateJobProgress, {
				jobId: args.jobId,
				processedDelta,
				cursor: `${args.sourceIndex}`
			});

			if (!batchResult.done) {
				await enqueueSourceCleanupWork(ctx, (internal as any).sources.runBulkUnsubscribeCleanup, {
					jobId: args.jobId,
					userAuthId: args.userAuthId,
					sourceIds: args.sourceIds,
					sourceIndex: args.sourceIndex
				});
				return null;
			}

			await enqueueSourceCleanupWork(ctx, (internal as any).sources.runBulkUnsubscribeCleanup, {
				jobId: args.jobId,
				userAuthId: args.userAuthId,
				sourceIds: args.sourceIds,
				sourceIndex: args.sourceIndex + 1
			});
		} catch (error) {
			await ctx.runMutation((internal as any).sources.failJob, {
				jobId: args.jobId,
				error: toFailureMessage(
					JOB_FAILURE_CODE.SOURCE_BULK_UNSUBSCRIBE_FAILED,
					error,
					'Bulk unsubscribe failed.'
				)
			});
		}

		return null;
	}
});

export const deliverBackfillBatch = internalMutation({
	args: {
		userAuthId: v.string(),
		sourceId: v.id('sources'),
		paginationOpts: paginationOptsValidator
	},
	returns: v.object({
		processed: v.number(),
		isDone: v.boolean(),
		continueCursor: v.union(v.string(), v.null())
	}),
	handler: async (ctx, args) => {
		const subscription = await ctx.db
			.query('source_subscriptions')
			.withIndex('by_userAuthId_and_sourceId', (q) =>
				q.eq('userAuthId', args.userAuthId).eq('sourceId', args.sourceId)
			)
			.unique();
		if (!subscription || subscription.status !== 'active') {
			return {
				processed: 0,
				isDone: true,
				continueCursor: null
			};
		}

		const page = await ctx.db
			.query('source_items')
			.withIndex('by_sourceId_and_publishedAt', (q) => q.eq('sourceId', args.sourceId))
			.order('desc')
			.paginate(args.paginationOpts);

		let processed = 0;
		for (const sourceItem of page.page) {
			const deliveries = await listDeliveriesForUserSourceItem(
				ctx,
				args.userAuthId,
				sourceItem._id
			);
			if (deliveries.length > 0) {
				await keepOldestDeliveryAndDeleteDuplicates(ctx, deliveries);
				continue;
			}
			await ctx.db.insert('user_source_items', {
				userAuthId: args.userAuthId,
				sourceId: args.sourceId,
				sourceItemId: sourceItem._id,
				publishedAt: sourceItem.publishedAt,
				deliveredAt: Date.now()
			});
			processed += 1;
		}

		return {
			processed,
			isDone: page.isDone,
			continueCursor: page.continueCursor
		};
	}
});

export const runResubscribeBackfill = internalAction({
	args: {
		jobId: v.id('source_jobs'),
		userAuthId: v.string(),
		sourceId: v.id('sources'),
		cursor: v.optional(v.union(v.string(), v.null()))
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const shouldRun: boolean = await ctx.runMutation((internal as any).sources.markJobRunning, {
			jobId: args.jobId
		});
		if (!shouldRun) {
			return null;
		}

		try {
			const batch: {
				processed: number;
				isDone: boolean;
				continueCursor: string | null;
			} = await ctx.runMutation((internal as any).sources.deliverBackfillBatch, {
				userAuthId: args.userAuthId,
				sourceId: args.sourceId,
				paginationOpts: {
					numItems: RESUBSCRIBE_BACKFILL_BATCH_SIZE,
					cursor: args.cursor ?? null
				}
			});

			await ctx.runMutation((internal as any).sources.updateJobProgress, {
				jobId: args.jobId,
				processedDelta: batch.processed,
				cursor: batch.continueCursor ?? undefined
			});

			if (batch.isDone) {
				await ctx.runMutation((internal as any).sources.completeJob, {
					jobId: args.jobId
				});
				return null;
			}

			await enqueueSourceCleanupWork(ctx, (internal as any).sources.runResubscribeBackfill, {
				jobId: args.jobId,
				userAuthId: args.userAuthId,
				sourceId: args.sourceId,
				cursor: batch.continueCursor
			});
		} catch (error) {
			await ctx.runMutation((internal as any).sources.failJob, {
				jobId: args.jobId,
				error: toFailureMessage(
					JOB_FAILURE_CODE.SOURCE_RESUBSCRIBE_BACKFILL_FAILED,
					error,
					'Resubscribe backfill failed.'
				)
			});
		}

		return null;
	}
});

export const getJobStatus = query({
	args: {
		jobId: v.id('source_jobs')
	},
	returns: v.union(v.null(), sourceJobValidator),
	handler: async (ctx, args) => {
		const authUser = await authComponent.getAuthUser(ctx);
		if (!authUser) {
			throw new Error('Unauthorized');
		}
		const job = await ctx.db.get(args.jobId);
		if (!job || job.userAuthId !== authUser._id) {
			return null;
		}
		return toSourceJobResponse(job);
	}
});
