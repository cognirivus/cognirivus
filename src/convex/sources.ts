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
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { rateLimiter } from './lib/rateLimits';
import { r2 } from './lib/r2';
import { isAdminRole } from '../lib/shared/adminRole';
import {
	countAuthorSharedPostsForSource,
	countSourceItemsForSource,
	trackPostReplaced,
	trackSourceItemInserted,
	trackSourceItemReplaced
} from './lib/aggregates';
import {
	classifySourceSyncFailureCode,
	JOB_FAILURE_CODE,
	toFailureMessage
} from './lib/jobFailure';
import { assertNightlyRunTransition, assertSourceJobTransition } from './lib/jobTransitions';

const SOURCE_ITEM_INLINE_LIMIT = 1000;
const SOURCE_ITEM_SNIPPET_LIMIT = 500;
const SOURCE_TITLE_LIMIT = 220;
const SOURCE_URL_LIMIT = 2048;
const BULK_UNSUBSCRIBE_BATCH_SIZE = 200;
const RESUBSCRIBE_BACKFILL_BATCH_SIZE = 200;
const NIGHTLY_REFRESH_BATCH_SIZE = 100;
const FANOUT_BATCH_SIZE = 200;
const FANOUT_RETRY_MAX_ATTEMPTS = 3;
const FANOUT_RETRY_BASE_DELAY_MS = 1000;
const MANUAL_REFRESH_DAILY_LIMIT = 3;
const MAX_FETCH_REDIRECTS = 5;
const UTC_DAY_MS = 24 * 60 * 60 * 1000;

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

const nextUtcMidnightMs = (now = Date.now()) =>
	Math.floor(now / UTC_DAY_MS) * UTC_DAY_MS + UTC_DAY_MS;
const utcRunDateKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

const createSnippet = (value: string) =>
	value.trim().replace(/\s+/g, ' ').slice(0, SOURCE_ITEM_SNIPPET_LIMIT);

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

const normalizeHttpUrl = (inputUrl: string) => {
	const trimmed = inputUrl.trim();
	if (!trimmed) {
		throw new Error('Source URL is required.');
	}
	let withProtocol = trimmed;
	if (!/^https?:\/\//i.test(withProtocol)) {
		withProtocol = `https://${withProtocol}`;
	}

	let parsed: URL;
	try {
		parsed = new URL(withProtocol);
	} catch {
		throw new Error('Invalid source URL.');
	}

	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new Error('Only http/https source URLs are supported.');
	}
	if (parsed.username || parsed.password) {
		throw new Error('Source URLs with credentials are not supported.');
	}
	if (parsed.toString().length > SOURCE_URL_LIMIT) {
		throw new Error(`Source URL exceeds ${SOURCE_URL_LIMIT} characters.`);
	}

	parsed.hash = '';
	parsed.searchParams.sort();
	parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';

	return parsed;
};

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

	if (type === 'youtube' && !host.includes('youtube.com') && !host.includes('youtu.be')) {
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

	return {
		canonicalUrl,
		normalizedKey: `website:${host}${pathWithQuery}`
	};
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

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const fetchTextWithTimeout = async (url: string, timeoutMs = 12000) => {
	const attemptHeaders: Array<Record<string, string> | undefined> = [
		{
			'User-Agent':
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
			Accept:
				'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, text/html;q=0.7, */*;q=0.5',
			'Accept-Language': 'en-US,en;q=0.9',
			'Cache-Control': 'no-cache'
		},
		{
			Accept:
				'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5'
		},
		undefined
	];

	let lastStatus: number | null = null;
	let lastError: unknown = null;

	for (const headers of attemptHeaders) {
		try {
			let nextUrl = url;
			for (let redirectCount = 0; redirectCount <= MAX_FETCH_REDIRECTS; redirectCount += 1) {
				const normalized = normalizeHttpUrl(nextUrl);
				if (isBlockedHostname(normalized.hostname)) {
					throw new Error('Source host is blocked for safety.');
				}

				const controller = new AbortController();
				const timeout = setTimeout(() => controller.abort(), timeoutMs);
				const response = await fetch(normalized.toString(), {
					method: 'GET',
					signal: controller.signal,
					redirect: 'manual',
					headers
				});
				clearTimeout(timeout);

				if (REDIRECT_STATUSES.has(response.status)) {
					const location = response.headers.get('location');
					if (!location) {
						throw new Error(`Source redirect (${response.status}) missing location header.`);
					}
					nextUrl = new URL(location, normalized.toString()).toString();
					continue;
				}

				if (!response.ok) {
					lastStatus = response.status;
					if (response.status === 401 || response.status === 403) {
						break;
					}
					if (response.status === 429) {
						throw new Error('Source website rate-limited requests (HTTP 429). Try again later.');
					}
					throw new Error(`Source fetch failed (${response.status}).`);
				}

				const contentType = response.headers.get('content-type') ?? 'text/plain';
				const body = await response.text();
				return { body, contentType };
			}
			throw new Error(`Source fetch exceeded ${MAX_FETCH_REDIRECTS} redirects.`);
		} catch (error: unknown) {
			lastError = error;
		}
	}

	if (lastStatus === 401 || lastStatus === 403) {
		throw new Error(
			`Access denied by source website (HTTP ${lastStatus}). This feed may block server-side fetches.`
		);
	}

	if (lastError instanceof Error) {
		throw lastError;
	}
	throw new Error('Source fetch failed.');
};

const stripHtml = (html: string) =>
	html
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

const extractHtmlTitle = (html: string, fallback: string) => {
	const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
	const title = match?.[1]?.replace(/\s+/g, ' ').trim();
	return (title && title.slice(0, SOURCE_TITLE_LIMIT)) || fallback;
};

const maybeStoreBodyToR2 = async (
	ctx: any,
	sourceId: Id<'sources'>,
	body: string
): Promise<{ inlineBody: string | undefined; r2Key: string | undefined }> => {
	const trimmed = body.trim();
	if (!trimmed) {
		return { inlineBody: undefined, r2Key: undefined };
	}
	if (trimmed.length <= SOURCE_ITEM_INLINE_LIMIT) {
		return { inlineBody: trimmed, r2Key: undefined };
	}
	const key = `sources/${sourceId}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.txt`;
	try {
		await r2.store(ctx, new Blob([trimmed], { type: 'text/plain' }), { key });
		return { inlineBody: undefined, r2Key: key };
	} catch (error) {
		console.error('R2 write failed for source item body, falling back to inline body.', error);
		return {
			inlineBody: trimmed.slice(0, SOURCE_ITEM_INLINE_LIMIT),
			r2Key: undefined
		};
	}
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
	shares: v.array(sourceItemShareValidator)
});

export const ensureSourceAndSubscription = internalMutation({
	args: {
		userAuthId: v.string(),
		type: sourceTypeValidator,
		normalizedKey: v.string(),
		canonicalUrl: v.string(),
		title: v.optional(v.string())
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
				title: 'Imported Bookmarks',
				status: 'active',
				createdAt: now,
				updatedAt: now
			});
			source = await ctx.db.get(sourceId);
		}
		if (!source) {
			throw new Error('Failed to initialize bookmark source.');
		}

		const subscription = await ctx.db
			.query('source_subscriptions')
			.withIndex('by_userAuthId_and_sourceId', (q) =>
				q.eq('userAuthId', args.userAuthId).eq('sourceId', source!._id)
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
		const existing = await ctx.db
			.query('user_source_items')
			.withIndex('by_userAuthId_and_sourceItemId', (q: any) =>
				q.eq('userAuthId', subscription.userAuthId).eq('sourceItemId', args.sourceItemId)
			)
			.unique();
		if (existing) {
			continue;
		}

		await ctx.db.insert('user_source_items', {
			userAuthId: subscription.userAuthId,
			sourceId: sourceItem.sourceId,
			sourceItemId: args.sourceItemId,
			publishedAt: sourceItem.publishedAt,
			deliveredAt: Date.now()
		});
		deliveredCount += 1;
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
		contentType: v.optional(v.string())
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
				contentType: args.contentType
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
		shouldStart: v.boolean()
	}),
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query('source_nightly_runs')
			.withIndex('by_runDate', (q) => q.eq('runDate', args.runDate))
			.unique();
		if (existing) {
			if (existing.status === 'running') {
				return { runId: existing._id, shouldStart: true };
			}
			return { runId: existing._id, shouldStart: false };
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
		return { runId, shouldStart: true };
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
			title: v.string(),
			canonicalUrl: v.string()
		})
	),
	handler: async (ctx, args) => {
		const source = await ctx.db.get(args.sourceId);
		if (!source) {
			return null;
		}
		return {
			_id: source._id,
			type: source.type,
			title: source.title,
			canonicalUrl: source.canonicalUrl
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
		const delivery = await ctx.db
			.query('user_source_items')
			.withIndex('by_userAuthId_and_sourceItemId', (q) =>
				q.eq('userAuthId', args.userAuthId).eq('sourceItemId', args.sourceItemId)
			)
			.unique();
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

		const delivery = await ctx.db
			.query('user_source_items')
			.withIndex('by_userAuthId_and_sourceItemId', (q) =>
				q.eq('userAuthId', authUser._id).eq('sourceItemId', args.sourceItemId)
			)
			.unique();
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

export const addSource = action({
	args: {
		type: sourceTypeValidator,
		inputUrlOrId: v.string(),
		title: v.optional(v.string())
	},
	returns: v.object({
		sourceId: v.id('sources'),
		subscriptionStatus: v.union(v.literal('active'), v.literal('already_subscribed')),
		jobId: v.optional(v.id('source_jobs'))
	}),
	handler: async (ctx, args) => {
		const authUser = await authComponent.getAuthUser(ctx);
		if (!authUser) {
			throw new Error('Unauthorized');
		}
		await rateLimiter.limit(ctx, 'addSource', { key: authUser._id, throws: true });

		const normalizedInput = normalizeSourceInput(args.type, args.inputUrlOrId);
		const ensureResult: {
			sourceId: Id<'sources'>;
			alreadySubscribed: boolean;
			shouldBackfill: boolean;
		} = await ctx.runMutation((internal as any).sources.ensureSourceAndSubscription, {
			userAuthId: authUser._id,
			type: args.type,
			normalizedKey: normalizedInput.normalizedKey,
			canonicalUrl: normalizedInput.canonicalUrl,
			title: args.title
		});

		if (ensureResult.alreadySubscribed) {
			return {
				sourceId: ensureResult.sourceId,
				subscriptionStatus: 'already_subscribed' as const
			};
		}

		const jobType = ensureResult.shouldBackfill ? 'resubscribe_backfill' : 'sync_source';
		const jobId: Id<'source_jobs'> = await ctx.runMutation((internal as any).sources.createJob, {
			jobType,
			userAuthId: authUser._id,
			sourceId: ensureResult.sourceId
		});

		if (ensureResult.shouldBackfill) {
			await ctx.scheduler.runAfter(0, (internal as any).sources.runResubscribeBackfill, {
				jobId,
				userAuthId: authUser._id,
				sourceId: ensureResult.sourceId,
				cursor: null
			});
		} else {
			await ctx.scheduler.runAfter(0, (internal as any).sources.runSourceSync, {
				jobId,
				sourceId: ensureResult.sourceId
			});
		}

		return {
			sourceId: ensureResult.sourceId,
			subscriptionStatus: 'active' as const,
			jobId
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
				title: string;
				canonicalUrl: string;
			} | null = await ctx.runQuery((internal as any).sources.getSourceForSync, {
				sourceId: args.sourceId
			});
			if (!source) {
				throw new Error('Source not found.');
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
				const fetched = await fetchTextWithTimeout(source.canonicalUrl);
				const rawText = stripHtml(fetched.body);
				const pageTitle = extractHtmlTitle(fetched.body, source.title || source.canonicalUrl);
				const snippet = createSnippet(rawText || pageTitle || source.canonicalUrl);
				const { inlineBody, r2Key } = await maybeStoreBodyToR2(ctx, source._id, rawText);
				await ctx.runMutation((internal as any).sources.ingestSourceItemFromInput, {
					sourceId: source._id,
					url: source.canonicalUrl,
					title: pageTitle,
					snippet,
					body: inlineBody,
					r2Key,
					publishedAt: Date.now(),
					contentHash: await sha256Hex(rawText.slice(0, 4000)),
					contentType: fetched.contentType
				});
				processed = 1;
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
		if (!isAdminRole(authUser.role)) {
			await rateLimiter.limit(ctx, 'manualSourceRefresh', {
				key: authUser._id,
				throws: true
			});
		}
		const jobId: Id<'source_jobs'> = await ctx.runMutation(
			(internal as any).sources.enqueueSourceSyncForUser,
			{
				userAuthId: authUser._id,
				sourceId: args.sourceId
			}
		);
		await ctx.scheduler.runAfter(0, (internal as any).sources.runSourceSync, {
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

		const [status, currentValue] = await Promise.all([
			rateLimiter.check(ctx, 'manualSourceRefresh', { key: authUser._id }),
			rateLimiter.getValue(ctx, 'manualSourceRefresh', { key: authUser._id })
		]);

		const remaining = Math.max(0, Math.floor(currentValue.value));
		return {
			isUnlimited: false,
			dailyLimit: MANUAL_REFRESH_DAILY_LIMIT,
			remaining,
			used: Math.max(0, MANUAL_REFRESH_DAILY_LIMIT - remaining),
			retryAfterMs: status.ok ? undefined : status.retryAfter,
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
				leaseMs: 15 * 60 * 1000
			});
			if (!lockResult.acquired) {
				return null;
			}

			if (!runId) {
				const initialized: {
					runId: Id<'source_nightly_runs'>;
					shouldStart: boolean;
				} = await ctx.runMutation((internal as any).sources.initializeNightlyRun, {
					runDate: utcRunDateKey()
				});
				if (!initialized.shouldStart) {
					return null;
				}
				runId = initialized.runId;
			}

			const sourceBatch: {
				page: Array<{ sourceId: Id<'sources'> }>;
				isDone: boolean;
				continueCursor: string | null;
			} = await ctx.runQuery((internal as any).sources.listNightlyRefreshSources, {
				paginationOpts: {
					numItems: NIGHTLY_REFRESH_BATCH_SIZE,
					cursor: args.cursor
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
				await ctx.scheduler.runAfter(index * 25, (internal as any).sources.runSourceSync, {
					jobId,
					sourceId: source.sourceId
				});
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

const enqueueBulkUnsubscribeJob = async (
	ctx: any,
	userAuthId: string,
	sourceIds: Array<Id<'sources'>>
): Promise<Id<'source_jobs'>> => {
	const jobId: Id<'source_jobs'> = await ctx.runMutation((internal as any).sources.createJob, {
		jobType: 'bulk_unsubscribe',
		userAuthId
	});
	await ctx.scheduler.runAfter(0, (internal as any).sources.runBulkUnsubscribeCleanup, {
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
			if (subscription) {
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
				await ctx.scheduler.runAfter(0, (internal as any).sources.runBulkUnsubscribeCleanup, {
					jobId: args.jobId,
					userAuthId: args.userAuthId,
					sourceIds: args.sourceIds,
					sourceIndex: args.sourceIndex
				});
				return null;
			}

			await ctx.scheduler.runAfter(0, (internal as any).sources.runBulkUnsubscribeCleanup, {
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
			const existing = await ctx.db
				.query('user_source_items')
				.withIndex('by_userAuthId_and_sourceItemId', (q) =>
					q.eq('userAuthId', args.userAuthId).eq('sourceItemId', sourceItem._id)
				)
				.unique();
			if (existing) {
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

			await ctx.scheduler.runAfter(0, (internal as any).sources.runResubscribeBackfill, {
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
		const response: {
			_id: Id<'source_jobs'>;
			jobType: 'sync_source' | 'bulk_unsubscribe' | 'resubscribe_backfill';
			status: 'queued' | 'running' | 'done' | 'failed';
			processed: number;
			createdAt: number;
			updatedAt: number;
			userAuthId?: string;
			sourceId?: Id<'sources'>;
			cursor?: string;
			error?: string;
			finishedAt?: number;
		} = {
			_id: job._id,
			jobType: job.jobType,
			status: job.status,
			processed: job.processed,
			createdAt: job.createdAt,
			updatedAt: job.updatedAt
		};
		if (job.userAuthId) response.userAuthId = job.userAuthId;
		if (job.sourceId) response.sourceId = job.sourceId;
		if (job.cursor) response.cursor = job.cursor;
		if (job.error) response.error = job.error;
		if (job.finishedAt !== undefined) response.finishedAt = job.finishedAt;
		return response;
	}
});
