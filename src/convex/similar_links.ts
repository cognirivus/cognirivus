import { v } from 'convex/values';
import {
	action,
	internalAction,
	internalMutation,
	internalQuery,
	query
} from './_generated/server';
import { getAuthUser } from './auth';
import { internal } from './_generated/api';
import {
	CACHE_TTL_MS,
	CLEANUP_RETENTION_MS,
	ERROR_RETRY_MS,
	REFRESH_LEASE_MS,
	SIMILAR_LINKS_SCOPES,
	createSourceDomainFingerprint,
	dedupeDomains,
	diffSourceDomains,
	getCacheViewState,
	normalizeUrl,
	shouldDoSynchronousRefresh,
	shouldScheduleBackgroundRefresh,
	similarLinkResultValidator,
	sourceHostFromUrl,
	type SimilarLinksCacheViewState,
	type SimilarLinksRowLike,
	type SimilarLinksScope
} from './lib/similarLinks';
import { rateLimiter } from './lib/rateLimits';
import { isAdminRole } from '../lib/shared/adminRole';

const CACHE_CLEANUP_BATCH_SIZE = 200;
const CACHE_CLEANUP_MAX_BATCHES = 25;
const ANONYMOUS_VIEWER_KEY = 'anonymous';

const cacheStatusValidator = v.union(v.literal('ready'), v.literal('empty'), v.literal('error'));
const refreshStateValidator = v.union(v.literal('idle'), v.literal('refreshing'));
const scopeValidator = v.union(v.literal('sources'), v.literal('web'));
const cacheViewStateValidator = v.union(
	v.literal('missing'),
	v.literal('fresh'),
	v.literal('stale'),
	v.literal('refreshing'),
	v.literal('error_backoff')
);

const cacheRowValidator = v.object({
	_id: v.id('similar_links_cache' as any),
	viewerKey: v.string(),
	normalizedUrl: v.string(),
	scope: scopeValidator,
	sourceHost: v.string(),
	sourceDomainFingerprint: v.optional(v.string()),
	sourceDomainCount: v.optional(v.number()),
	sourceDomainsSnapshot: v.optional(v.array(v.string())),
	status: cacheStatusValidator,
	results: v.array(similarLinkResultValidator),
	lastFetchedAt: v.optional(v.number()),
	expiresAt: v.number(),
	lastAttemptAt: v.optional(v.number()),
	lastError: v.optional(v.string()),
	refreshState: refreshStateValidator,
	refreshLeaseExpiresAt: v.optional(v.number()),
	createdAt: v.number(),
	updatedAt: v.number()
});

const tabViewValidator = v.object({
	state: cacheViewStateValidator,
	status: v.union(v.null(), cacheStatusValidator),
	results: v.array(similarLinkResultValidator),
	lastError: v.union(v.null(), v.string()),
	lastFetchedAt: v.union(v.null(), v.number()),
	expiresAt: v.union(v.null(), v.number()),
	isRefreshing: v.boolean(),
	hasDomainUpdates: v.boolean(),
	cachedDomainCount: v.number(),
	currentDomainCount: v.number(),
	newDomains: v.array(v.string()),
	removedDomainCount: v.number()
});

const cacheViewValidator = v.object({
	sourceUrl: v.string(),
	sourceDomains: v.array(v.string()),
	tabs: v.object({
		sources: tabViewValidator,
		web: tabViewValidator
	})
});

const actionTabValidator = v.object({
	state: cacheViewStateValidator,
	refreshScheduled: v.boolean()
});

const actionResponseValidator = v.object({
	sourceUrl: v.string(),
	tabs: v.object({
		sources: actionTabValidator,
		web: actionTabValidator
	})
});

const domainContributorValidator = v.object({
	label: v.string(),
	url: v.string(),
	kind: v.union(v.literal('source'), v.literal('saved_link'))
});

const userSourceDomainRowValidator = v.object({
	domain: v.string(),
	included: v.boolean(),
	sourceCount: v.number(),
	savedLinkCount: v.number(),
	totalCount: v.number(),
	contributors: v.array(domainContributorValidator)
});

type SimilarLinksTabView = {
	state: SimilarLinksCacheViewState;
	status: 'ready' | 'empty' | 'error' | null;
	results: Array<any>;
	lastError: string | null;
	lastFetchedAt: number | null;
	expiresAt: number | null;
	isRefreshing: boolean;
	hasDomainUpdates: boolean;
	cachedDomainCount: number;
	currentDomainCount: number;
	newDomains: Array<string>;
	removedDomainCount: number;
};

type SimilarLinksCacheView = {
	sourceUrl: string;
	sourceDomains: Array<string>;
	tabs: Record<SimilarLinksScope, SimilarLinksTabView>;
};

type SimilarLinksActionResponse = {
	sourceUrl: string;
	tabs: Record<
		SimilarLinksScope,
		{
			state: SimilarLinksCacheViewState;
			refreshScheduled: boolean;
		}
	>;
};

type UserSourceDomainRow = {
	domain: string;
	included: boolean;
	sourceCount: number;
	savedLinkCount: number;
	totalCount: number;
	contributors: Array<{
		label: string;
		url: string;
		kind: 'source' | 'saved_link';
	}>;
};

const normalizedUrlArgsValidator = v.object({
	viewerKey: v.string(),
	normalizedUrl: v.string()
});

const normalizedUrlScopeArgsValidator = v.object({
	viewerKey: v.string(),
	normalizedUrl: v.string(),
	scope: scopeValidator
});

const emptyTabView = (lastError: string | null = null): SimilarLinksTabView => ({
	state: 'missing',
	status: null,
	results: [],
	lastError,
	lastFetchedAt: null,
	expiresAt: null,
	isRefreshing: false,
	hasDomainUpdates: false,
	cachedDomainCount: 0,
	currentDomainCount: 0,
	newDomains: [],
	removedDomainCount: 0
});

const toTabViewState = (
	row:
		| (SimilarLinksRowLike & {
				sourceDomainFingerprint?: string;
				sourceDomainCount?: number;
				sourceDomainsSnapshot?: Array<string>;
		  })
		| null,
	currentDomains: Array<string>,
	currentDomainFingerprint: string,
	now: number
): SimilarLinksTabView => {
	const state = getCacheViewState(row, now);
	if (!row) {
		return emptyTabView();
	}
	const cachedDomains = row.sourceDomainsSnapshot ?? [];
	const domainDiff =
		row.sourceDomainFingerprint && row.sourceDomainFingerprint !== currentDomainFingerprint
			? diffSourceDomains(cachedDomains, currentDomains)
			: { newDomains: [] as Array<string>, removedDomains: [] as Array<string> };

	return {
		state,
		status: row.status,
		results: row.results,
		lastError: row.lastError ?? null,
		lastFetchedAt: row.lastFetchedAt ?? null,
		expiresAt: row.expiresAt,
		isRefreshing: row.refreshState === 'refreshing' && (row.refreshLeaseExpiresAt ?? 0) > now,
		hasDomainUpdates:
			!!row.sourceDomainFingerprint && row.sourceDomainFingerprint !== currentDomainFingerprint,
		cachedDomainCount: row.sourceDomainCount ?? cachedDomains.length,
		currentDomainCount: currentDomains.length,
		newDomains: domainDiff.newDomains,
		removedDomainCount: domainDiff.removedDomains.length
	};
};

const normalizeUrlSafely = (url: string) => {
	try {
		return normalizeUrl(url);
	} catch {
		return null;
	}
};

const mapRowLike = (row: any): SimilarLinksRowLike => ({
	status: row.status,
	results: row.results,
	expiresAt: row.expiresAt,
	refreshState: row.refreshState,
	refreshLeaseExpiresAt: row.refreshLeaseExpiresAt,
	lastError: row.lastError,
	lastFetchedAt: row.lastFetchedAt
});

const getViewerKey = (userAuthId: string | null | undefined) => userAuthId ?? ANONYMOUS_VIEWER_KEY;

const toCacheRow = (row: any) => ({
	_id: row._id,
	viewerKey: row.viewerKey,
	normalizedUrl: row.normalizedUrl,
	scope: row.scope,
	sourceHost: row.sourceHost,
	sourceDomainFingerprint: row.sourceDomainFingerprint,
	sourceDomainCount: row.sourceDomainCount,
	sourceDomainsSnapshot: row.sourceDomainsSnapshot,
	status: row.status,
	results: row.results,
	lastFetchedAt: row.lastFetchedAt,
	expiresAt: row.expiresAt,
	lastAttemptAt: row.lastAttemptAt,
	lastError: row.lastError,
	refreshState: row.refreshState,
	refreshLeaseExpiresAt: row.refreshLeaseExpiresAt,
	createdAt: row.createdAt,
	updatedAt: row.updatedAt
});

const toCombinedView = (
	rows: Array<any>,
	sourceUrl: string,
	sourceDomains: Array<string>,
	now: number,
	invalidError: string | null = null
): SimilarLinksCacheView => {
	const currentDomainFingerprint = createSourceDomainFingerprint(sourceDomains);
	const sourceRow = rows.find((row) => row.scope === 'sources') as
		| (SimilarLinksRowLike & {
				sourceDomainFingerprint?: string;
				sourceDomainCount?: number;
				sourceDomainsSnapshot?: Array<string>;
		  })
		| null;
	const webRow = rows.find((row) => row.scope === 'web') as
		| (SimilarLinksRowLike & {
				sourceDomainFingerprint?: string;
				sourceDomainCount?: number;
				sourceDomainsSnapshot?: Array<string>;
		  })
		| null;

	return {
		sourceUrl,
		sourceDomains,
		tabs: {
			sources: invalidError
				? emptyTabView(invalidError)
				: toTabViewState(sourceRow, sourceDomains, currentDomainFingerprint, now),
			web: invalidError
				? emptyTabView(invalidError)
				: toTabViewState(webRow, sourceDomains, currentDomainFingerprint, now)
		}
	};
};

const getCurrentView = async (
	ctx: any,
	viewerKey: string,
	normalizedUrl: string
): Promise<SimilarLinksCacheView> => {
	const rows = await ctx.runQuery(
		(internal as any).similar_links.getCacheRowsByViewerAndNormalizedUrl,
		{
			viewerKey,
			normalizedUrl
		}
	);
	const sourceDomains = await getSourceDomains(
		ctx,
		viewerKey === ANONYMOUS_VIEWER_KEY ? null : viewerKey
	);
	return toCombinedView(rows, normalizedUrl, sourceDomains, Date.now());
};

const getSourceDomains = async (ctx: any, userAuthId: string | null) => {
	if (!userAuthId) {
		return [] as Array<string>;
	}
	const domains: Array<string> = await ctx.runQuery(
		(internal as any).similar_links.getUserSourceDomains,
		{ userAuthId }
	);
	return domains;
};

const buildUserSourceDomainRows = async (
	ctx: any,
	userAuthId: string
): Promise<Array<UserSourceDomainRow>> => {
	const subscriptions = await ctx.db
		.query('source_subscriptions')
		.withIndex('by_userAuthId_and_updatedAt', (q: any) => q.eq('userAuthId', userAuthId))
		.collect();
	const activeSubscriptions = subscriptions.filter(
		(subscription: any) => subscription.status === 'active'
	);
	const sources = (
		await Promise.all(
			activeSubscriptions.map((subscription: any) => ctx.db.get(subscription.sourceId))
		)
	).filter((source): source is NonNullable<typeof source> => !!source);
	const bookmarkSources = sources.filter((source) => source.type === 'bookmarks');
	const bookmarkItems = (
		await Promise.all(
			bookmarkSources.map((source) =>
				ctx.db
					.query('source_items')
					.withIndex('by_sourceId_and_publishedAt', (q: any) => q.eq('sourceId', source._id))
					.collect()
			)
		)
	).flat();
	const exclusions = await ctx.db
		.query('similar_links_domain_exclusions')
		.withIndex('by_userAuthId_and_updatedAt', (q: any) => q.eq('userAuthId', userAuthId))
		.collect();
	const excludedDomains = new Set(exclusions.map((row: any) => row.domain));

	const rowsByDomain = new Map<
		string,
		{
			sourceIds: Set<string>;
			savedLinkCount: number;
			contributorKeys: Set<string>;
			contributors: UserSourceDomainRow['contributors'];
		}
	>();
	const ensureRow = (domain: string) => {
		let row = rowsByDomain.get(domain);
		if (!row) {
			row = {
				sourceIds: new Set<string>(),
				savedLinkCount: 0,
				contributorKeys: new Set<string>(),
				contributors: []
			};
			rowsByDomain.set(domain, row);
		}
		return row;
	};
	const pushContributor = (
		domain: string,
		contributor: UserSourceDomainRow['contributors'][number],
		sourceId?: string
	) => {
		const row = ensureRow(domain);
		if (sourceId) {
			row.sourceIds.add(sourceId);
		}
		const contributorKey = `${contributor.kind}:${contributor.url}:${contributor.label}`;
		if (!row.contributorKeys.has(contributorKey) && row.contributors.length < 4) {
			row.contributorKeys.add(contributorKey);
			row.contributors.push(contributor);
		}
	};

	for (const source of sources) {
		if (source.type === 'bookmarks') {
			continue;
		}
		const domain = dedupeDomains([source.canonicalUrl])[0];
		if (!domain) {
			continue;
		}
		pushContributor(
			domain,
			{
				label: source.title,
				url: source.canonicalUrl,
				kind: 'source'
			},
			String(source._id)
		);
	}

	for (const item of bookmarkItems) {
		const domain = dedupeDomains([item.originHost ?? item.url])[0];
		if (!domain) {
			continue;
		}
		const row = ensureRow(domain);
		row.savedLinkCount += 1;
		pushContributor(domain, {
			label: item.title,
			url: item.url,
			kind: 'saved_link'
		});
	}

	return Array.from(rowsByDomain.entries())
		.map(([domain, row]) => ({
			domain,
			included: !excludedDomains.has(domain),
			sourceCount: row.sourceIds.size,
			savedLinkCount: row.savedLinkCount,
			totalCount: row.sourceIds.size + row.savedLinkCount,
			contributors: row.contributors
		}))
		.sort((a, b) => {
			if (a.included !== b.included) {
				return a.included ? -1 : 1;
			}
			if (a.totalCount !== b.totalCount) {
				return b.totalCount - a.totalCount;
			}
			return a.domain.localeCompare(b.domain);
		});
};

const ensureScope = async (
	ctx: any,
	args: {
		viewerKey: string;
		normalizedUrl: string;
		sourceHost: string;
		scope: SimilarLinksScope;
		domains: Array<string>;
		sourceDomainFingerprint: string;
		row: any | null;
	}
) => {
	const now = Date.now();
	const rowLike = args.row ? mapRowLike(args.row) : null;
	const state = getCacheViewState(rowLike, now);

	if (state === 'fresh' || state === 'error_backoff' || state === 'refreshing') {
		return {
			state,
			refreshScheduled: false
		};
	}

	if (shouldDoSynchronousRefresh(rowLike, now)) {
		const claim = await ctx.runMutation((internal as any).similar_links.claimRefreshLease, {
			viewerKey: args.viewerKey,
			normalizedUrl: args.normalizedUrl,
			scope: args.scope,
			sourceHost: args.sourceHost,
			now,
			leaseMs: REFRESH_LEASE_MS
		});
		if (!claim.claimed) {
			return {
				state: 'refreshing' as const,
				refreshScheduled: false
			};
		}

		await ctx.runAction((internal as any).similar_links_node.refreshFromExa, {
			viewerKey: args.viewerKey,
			normalizedUrl: args.normalizedUrl,
			scope: args.scope,
			sourceHost: args.sourceHost,
			domains: args.domains,
			sourceDomainFingerprint: args.sourceDomainFingerprint
		});
		const latest = await getCurrentView(ctx, args.viewerKey, args.normalizedUrl);
		return {
			state: latest.tabs[args.scope].state,
			refreshScheduled: false
		};
	}

	if (shouldScheduleBackgroundRefresh(rowLike, now)) {
		const claim = await ctx.runMutation((internal as any).similar_links.claimRefreshLease, {
			viewerKey: args.viewerKey,
			normalizedUrl: args.normalizedUrl,
			scope: args.scope,
			sourceHost: args.sourceHost,
			now,
			leaseMs: REFRESH_LEASE_MS
		});
		if (!claim.claimed) {
			return {
				state: 'refreshing' as const,
				refreshScheduled: false
			};
		}

		await ctx.scheduler.runAfter(0, (internal as any).similar_links_node.refreshFromExa, {
			viewerKey: args.viewerKey,
			normalizedUrl: args.normalizedUrl,
			scope: args.scope,
			sourceHost: args.sourceHost,
			domains: args.domains,
			sourceDomainFingerprint: args.sourceDomainFingerprint
		});
		return {
			state: 'stale' as const,
			refreshScheduled: true
		};
	}

	return {
		state: 'stale' as const,
		refreshScheduled: false
	};
};

export const getUserSourceDomains = internalQuery({
	args: {
		userAuthId: v.string()
	},
	returns: v.array(v.string()),
	handler: async (ctx, args) => {
		const rows = await buildUserSourceDomainRows(ctx, args.userAuthId);
		return rows.filter((row) => row.included).map((row) => row.domain);
	}
});

export const getUserSourceDomainRows = internalQuery({
	args: {
		userAuthId: v.string()
	},
	returns: v.array(userSourceDomainRowValidator),
	handler: async (ctx, args) => {
		return await buildUserSourceDomainRows(ctx, args.userAuthId);
	}
});

export const getCacheRowsByViewerAndNormalizedUrl = internalQuery({
	args: normalizedUrlArgsValidator,
	returns: v.array(cacheRowValidator),
	handler: async (ctx, args) => {
		const rows = await ctx.db
			.query('similar_links_cache' as any)
			.withIndex('by_viewerKey_and_normalizedUrl_and_scope', (q: any) =>
				q.eq('viewerKey', args.viewerKey).eq('normalizedUrl', args.normalizedUrl)
			)
			.collect();

		return rows.map(toCacheRow);
	}
});

export const getCacheRowByViewerNormalizedUrlAndScope = internalQuery({
	args: normalizedUrlScopeArgsValidator,
	returns: v.union(v.null(), cacheRowValidator),
	handler: async (ctx, args) => {
		const row = await ctx.db
			.query('similar_links_cache' as any)
			.withIndex('by_viewerKey_and_normalizedUrl_and_scope', (q: any) =>
				q
					.eq('viewerKey', args.viewerKey)
					.eq('normalizedUrl', args.normalizedUrl)
					.eq('scope', args.scope)
			)
			.unique();

		return row ? toCacheRow(row) : null;
	}
});

export const claimRefreshLease = internalMutation({
	args: v.object({
		viewerKey: v.string(),
		normalizedUrl: v.string(),
		scope: scopeValidator,
		sourceHost: v.string(),
		now: v.number(),
		leaseMs: v.number()
	}),
	returns: v.object({
		cacheId: v.id('similar_links_cache' as any),
		claimed: v.boolean()
	}),
	handler: async (ctx, args) => {
		const row = await ctx.db
			.query('similar_links_cache' as any)
			.withIndex('by_viewerKey_and_normalizedUrl_and_scope', (q: any) =>
				q
					.eq('viewerKey', args.viewerKey)
					.eq('normalizedUrl', args.normalizedUrl)
					.eq('scope', args.scope)
			)
			.unique();

		if (row && row.refreshState === 'refreshing' && (row.refreshLeaseExpiresAt ?? 0) > args.now) {
			return {
				cacheId: row._id,
				claimed: false
			};
		}

		const refreshLeaseExpiresAt = args.now + Math.max(1, Math.trunc(args.leaseMs));
		if (row) {
			await ctx.db.patch(row._id, {
				sourceHost: args.sourceHost,
				refreshState: 'refreshing',
				refreshLeaseExpiresAt,
				updatedAt: args.now
			});
			return {
				cacheId: row._id,
				claimed: true
			};
		}

		const cacheId = await ctx.db.insert('similar_links_cache' as any, {
			viewerKey: args.viewerKey,
			normalizedUrl: args.normalizedUrl,
			scope: args.scope,
			sourceHost: args.sourceHost,
			status: 'empty',
			results: [],
			expiresAt: 0,
			refreshState: 'refreshing',
			refreshLeaseExpiresAt,
			createdAt: args.now,
			updatedAt: args.now
		});

		return {
			cacheId,
			claimed: true
		};
	}
});

export const releaseRefreshLease = internalMutation({
	args: v.object({
		viewerKey: v.string(),
		normalizedUrl: v.string(),
		scope: scopeValidator,
		now: v.number()
	}),
	returns: v.null(),
	handler: async (ctx, args) => {
		const row = await ctx.db
			.query('similar_links_cache' as any)
			.withIndex('by_viewerKey_and_normalizedUrl_and_scope', (q: any) =>
				q
					.eq('viewerKey', args.viewerKey)
					.eq('normalizedUrl', args.normalizedUrl)
					.eq('scope', args.scope)
			)
			.unique();
		if (!row) {
			return null;
		}
		await ctx.db.patch(row._id, {
			refreshState: 'idle',
			refreshLeaseExpiresAt: undefined,
			updatedAt: args.now
		});
		return null;
	}
});

export const applyRefreshSuccess = internalMutation({
	args: v.object({
		viewerKey: v.string(),
		normalizedUrl: v.string(),
		scope: scopeValidator,
		sourceHost: v.string(),
		sourceDomainFingerprint: v.string(),
		sourceDomainsSnapshot: v.array(v.string()),
		now: v.number(),
		results: v.array(similarLinkResultValidator)
	}),
	returns: v.null(),
	handler: async (ctx, args) => {
		const row = await ctx.db
			.query('similar_links_cache' as any)
			.withIndex('by_viewerKey_and_normalizedUrl_and_scope', (q: any) =>
				q
					.eq('viewerKey', args.viewerKey)
					.eq('normalizedUrl', args.normalizedUrl)
					.eq('scope', args.scope)
			)
			.unique();
		const status = args.results.length > 0 ? 'ready' : 'empty';
		const expiresAt = args.now + CACHE_TTL_MS;

		if (row) {
			await ctx.db.patch(row._id, {
				sourceHost: args.sourceHost,
				sourceDomainFingerprint: args.sourceDomainFingerprint,
				sourceDomainCount: args.sourceDomainsSnapshot.length,
				sourceDomainsSnapshot: args.sourceDomainsSnapshot,
				status,
				results: args.results,
				lastFetchedAt: args.now,
				lastAttemptAt: args.now,
				expiresAt,
				lastError: undefined,
				refreshState: 'idle',
				refreshLeaseExpiresAt: undefined,
				updatedAt: args.now
			});
			return null;
		}

		await ctx.db.insert('similar_links_cache' as any, {
			viewerKey: args.viewerKey,
			normalizedUrl: args.normalizedUrl,
			scope: args.scope,
			sourceHost: args.sourceHost,
			sourceDomainFingerprint: args.sourceDomainFingerprint,
			sourceDomainCount: args.sourceDomainsSnapshot.length,
			sourceDomainsSnapshot: args.sourceDomainsSnapshot,
			status,
			results: args.results,
			lastFetchedAt: args.now,
			lastAttemptAt: args.now,
			expiresAt,
			refreshState: 'idle',
			refreshLeaseExpiresAt: undefined,
			createdAt: args.now,
			updatedAt: args.now
		});
		return null;
	}
});

export const applyRefreshError = internalMutation({
	args: v.object({
		viewerKey: v.string(),
		normalizedUrl: v.string(),
		scope: scopeValidator,
		sourceHost: v.string(),
		sourceDomainFingerprint: v.string(),
		sourceDomainsSnapshot: v.array(v.string()),
		now: v.number(),
		error: v.string()
	}),
	returns: v.null(),
	handler: async (ctx, args) => {
		const row = await ctx.db
			.query('similar_links_cache' as any)
			.withIndex('by_viewerKey_and_normalizedUrl_and_scope', (q: any) =>
				q
					.eq('viewerKey', args.viewerKey)
					.eq('normalizedUrl', args.normalizedUrl)
					.eq('scope', args.scope)
			)
			.unique();
		const expiresAt = args.now + ERROR_RETRY_MS;
		if (row) {
			await ctx.db.patch(row._id, {
				sourceHost: args.sourceHost,
				sourceDomainFingerprint: args.sourceDomainFingerprint,
				sourceDomainCount: args.sourceDomainsSnapshot.length,
				sourceDomainsSnapshot: args.sourceDomainsSnapshot,
				status: 'error',
				lastAttemptAt: args.now,
				lastError: args.error.slice(0, 500),
				expiresAt,
				refreshState: 'idle',
				refreshLeaseExpiresAt: undefined,
				updatedAt: args.now
			});
			return null;
		}

		await ctx.db.insert('similar_links_cache' as any, {
			viewerKey: args.viewerKey,
			normalizedUrl: args.normalizedUrl,
			scope: args.scope,
			sourceHost: args.sourceHost,
			sourceDomainFingerprint: args.sourceDomainFingerprint,
			sourceDomainCount: args.sourceDomainsSnapshot.length,
			sourceDomainsSnapshot: args.sourceDomainsSnapshot,
			status: 'error',
			results: [],
			expiresAt,
			lastAttemptAt: args.now,
			lastError: args.error.slice(0, 500),
			refreshState: 'idle',
			refreshLeaseExpiresAt: undefined,
			createdAt: args.now,
			updatedAt: args.now
		});
		return null;
	}
});

export const getCachedByUrl = query({
	args: {
		url: v.string()
	},
	returns: cacheViewValidator,
	handler: async (ctx, args): Promise<SimilarLinksCacheView> => {
		const normalizedUrl = normalizeUrlSafely(args.url);
		if (!normalizedUrl) {
			return toCombinedView([], args.url, [], Date.now(), 'Invalid URL.');
		}

		const authUser = await getAuthUser(ctx);
		const viewerKey = getViewerKey(authUser?._id);
		const sourceDomains = await getSourceDomains(ctx, authUser?._id ?? null);
		const rows = await ctx.db
			.query('similar_links_cache' as any)
			.withIndex('by_viewerKey_and_normalizedUrl_and_scope', (q: any) =>
				q.eq('viewerKey', viewerKey).eq('normalizedUrl', normalizedUrl)
			)
			.collect();

		return toCombinedView(rows, normalizedUrl, sourceDomains, Date.now());
	}
});

export const ensureForUrl = action({
	args: {
		url: v.string()
	},
	returns: actionResponseValidator,
	handler: async (ctx, args): Promise<SimilarLinksActionResponse> => {
		const normalizedUrl = normalizeUrlSafely(args.url);
		if (!normalizedUrl) {
			return {
				sourceUrl: args.url,
				tabs: {
					sources: {
						state: 'missing',
						refreshScheduled: false
					},
					web: {
						state: 'missing',
						refreshScheduled: false
					}
				}
			};
		}

		const authUser = await getAuthUser(ctx);
		const viewerKey = getViewerKey(authUser?._id);
		const sourceHost = sourceHostFromUrl(normalizedUrl);
		const domains = await getSourceDomains(ctx, authUser?._id ?? null);
		const sourceDomainFingerprint = createSourceDomainFingerprint(domains);
		const existingRows = await ctx.runQuery(
			(internal as any).similar_links.getCacheRowsByViewerAndNormalizedUrl,
			{
				viewerKey,
				normalizedUrl
			}
		);
		const rowByScope = new Map<SimilarLinksScope, any>(
			existingRows.map((row: any) => [row.scope as SimilarLinksScope, row])
		);

		const tabs = {} as SimilarLinksActionResponse['tabs'];
		for (const scope of SIMILAR_LINKS_SCOPES) {
			tabs[scope] = await ensureScope(ctx, {
				viewerKey,
				normalizedUrl,
				sourceHost,
				scope,
				domains,
				sourceDomainFingerprint,
				row: rowByScope.get(scope) ?? null
			});
		}

		return {
			sourceUrl: normalizedUrl,
			tabs
		};
	}
});

export const refreshNow = action({
	args: {
		url: v.string(),
		scope: scopeValidator
	},
	returns: actionResponseValidator,
	handler: async (ctx, args): Promise<SimilarLinksActionResponse> => {
		const authUser = await getAuthUser(ctx);
		if (!authUser) {
			throw new Error('Unauthorized');
		}
		const isAdmin = isAdminRole(authUser.role);

		const normalizedUrl = normalizeUrlSafely(args.url);
		if (!normalizedUrl) {
			return {
				sourceUrl: args.url,
				tabs: {
					sources: {
						state: 'missing',
						refreshScheduled: false
					},
					web: {
						state: 'missing',
						refreshScheduled: false
					}
				}
			};
		}

		const viewerKey = getViewerKey(authUser._id);
		const sourceHost = sourceHostFromUrl(normalizedUrl);
		const domains = await getSourceDomains(ctx, authUser._id);
		const sourceDomainFingerprint = createSourceDomainFingerprint(domains);
		if (!isAdmin) {
			await rateLimiter.limit(ctx, 'manualSimilarLinksRefresh', {
				key: authUser._id,
				throws: true
			});
		}
		const claim = await ctx.runMutation((internal as any).similar_links.claimRefreshLease, {
			viewerKey,
			normalizedUrl,
			scope: args.scope,
			sourceHost,
			now: Date.now(),
			leaseMs: REFRESH_LEASE_MS
		});
		if (!claim.claimed) {
			const latest = await getCurrentView(ctx, viewerKey, normalizedUrl);
			return {
				sourceUrl: normalizedUrl,
				tabs: {
					sources: {
						state: latest.tabs.sources.state,
						refreshScheduled: false
					},
					web: {
						state: latest.tabs.web.state,
						refreshScheduled: false
					}
				}
			};
		}

		await ctx.runAction((internal as any).similar_links_node.refreshFromExa, {
			viewerKey,
			normalizedUrl,
			scope: args.scope,
			sourceHost,
			domains,
			sourceDomainFingerprint
		});

		const latest = await getCurrentView(ctx, viewerKey, normalizedUrl);
		return {
			sourceUrl: normalizedUrl,
			tabs: {
				sources: {
					state: latest.tabs.sources.state,
					refreshScheduled: false
				},
				web: {
					state: latest.tabs.web.state,
					refreshScheduled: false
				}
			}
		};
	}
});

export const deleteExpiredCacheBatch = internalMutation({
	args: {
		cutoff: v.number(),
		limit: v.number()
	},
	returns: v.number(),
	handler: async (ctx, args) => {
		const now = Date.now();
		const rows = await ctx.db
			.query('similar_links_cache' as any)
			.withIndex('by_expiresAt', (q) => q.lt('expiresAt', args.cutoff))
			.take(Math.max(1, Math.min(args.limit, CACHE_CLEANUP_BATCH_SIZE)));

		let deleted = 0;
		for (const row of rows) {
			if (row.refreshState === 'refreshing' && (row.refreshLeaseExpiresAt ?? 0) > now) {
				continue;
			}
			await ctx.db.delete(row._id);
			deleted += 1;
		}
		return deleted;
	}
});

export const runCacheCleanup = internalAction({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		const cutoff = Date.now() - CLEANUP_RETENTION_MS;
		for (let i = 0; i < CACHE_CLEANUP_MAX_BATCHES; i += 1) {
			const deleted: number = await ctx.runMutation(
				(internal as any).similar_links.deleteExpiredCacheBatch,
				{
					cutoff,
					limit: CACHE_CLEANUP_BATCH_SIZE
				}
			);
			if (deleted < CACHE_CLEANUP_BATCH_SIZE) {
				break;
			}
		}
		return null;
	}
});
