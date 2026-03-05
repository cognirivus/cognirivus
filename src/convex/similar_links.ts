import { v } from 'convex/values';
import {
	action,
	internalAction,
	internalMutation,
	internalQuery,
	query
} from './_generated/server';
import { authComponent } from './auth';
import { internal } from './_generated/api';
import {
	CACHE_TTL_MS,
	ERROR_RETRY_MS,
	CLEANUP_RETENTION_MS,
	REFRESH_LEASE_MS,
	similarLinkResultValidator,
	normalizeUrl,
	sourceHostFromUrl,
	getCacheViewState,
	shouldDoSynchronousRefresh,
	shouldScheduleBackgroundRefresh,
	type SimilarLinksCacheViewState,
	type SimilarLinksRowLike
} from './lib/similarLinks';
import { isAdminRole } from '../lib/shared/adminRole';

const CACHE_CLEANUP_BATCH_SIZE = 200;
const CACHE_CLEANUP_MAX_BATCHES = 25;

const cacheStatusValidator = v.union(v.literal('ready'), v.literal('empty'), v.literal('error'));
const refreshStateValidator = v.union(v.literal('idle'), v.literal('refreshing'));
const cacheViewStateValidator = v.union(
	v.literal('missing'),
	v.literal('fresh'),
	v.literal('stale'),
	v.literal('refreshing'),
	v.literal('error_backoff')
);

const cacheRowValidator = v.object({
	_id: v.id('similar_links_cache' as any),
	normalizedUrl: v.string(),
	sourceHost: v.string(),
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

const cacheViewValidator = v.object({
	sourceUrl: v.string(),
	state: cacheViewStateValidator,
	status: v.union(v.null(), cacheStatusValidator),
	results: v.array(similarLinkResultValidator),
	lastError: v.union(v.null(), v.string()),
	lastFetchedAt: v.union(v.null(), v.number()),
	expiresAt: v.union(v.null(), v.number()),
	isRefreshing: v.boolean()
});

const actionResponseValidator = v.object({
	sourceUrl: v.string(),
	state: cacheViewStateValidator,
	refreshScheduled: v.boolean()
});

const normalizedUrlArgsValidator = v.object({
	normalizedUrl: v.string()
});

type SimilarLinksCacheView = {
	sourceUrl: string;
	state: SimilarLinksCacheViewState;
	status: 'ready' | 'empty' | 'error' | null;
	results: Array<any>;
	lastError: string | null;
	lastFetchedAt: number | null;
	expiresAt: number | null;
	isRefreshing: boolean;
};

type SimilarLinksActionResponse = {
	sourceUrl: string;
	state: SimilarLinksCacheViewState;
	refreshScheduled: boolean;
};

const toViewState = (
	row: SimilarLinksRowLike | null,
	sourceUrl: string,
	now: number
): SimilarLinksCacheView => {
	const state = getCacheViewState(row, now);
	if (!row) {
		return {
			sourceUrl,
			state,
			status: null,
			results: [],
			lastError: null,
			lastFetchedAt: null,
			expiresAt: null,
			isRefreshing: false
		};
	}

	return {
		sourceUrl,
		state,
		status: row.status,
		results: row.results,
		lastError: row.lastError ?? null,
		lastFetchedAt: row.lastFetchedAt ?? null,
		expiresAt: row.expiresAt,
		isRefreshing: row.refreshState === 'refreshing' && (row.refreshLeaseExpiresAt ?? 0) > now
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

const getCurrentView = async (ctx: any, normalizedUrl: string): Promise<SimilarLinksCacheView> => {
	const row = await ctx.runQuery((internal as any).similar_links.getCacheRowByNormalizedUrl, {
		normalizedUrl
	});
	return toViewState(row ? mapRowLike(row) : null, normalizedUrl, Date.now());
};

export const getCacheRowByNormalizedUrl = internalQuery({
	args: normalizedUrlArgsValidator,
	returns: v.union(v.null(), cacheRowValidator),
	handler: async (ctx, args) => {
		const row = await ctx.db
			.query('similar_links_cache' as any)
			.withIndex('by_normalizedUrl', (q) => q.eq('normalizedUrl', args.normalizedUrl))
			.unique();
		if (!row) {
			return null;
		}
		return {
			_id: row._id,
			normalizedUrl: row.normalizedUrl,
			sourceHost: row.sourceHost,
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
		};
	}
});

export const claimRefreshLease = internalMutation({
	args: v.object({
		normalizedUrl: v.string(),
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
			.withIndex('by_normalizedUrl', (q) => q.eq('normalizedUrl', args.normalizedUrl))
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
			normalizedUrl: args.normalizedUrl,
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
		normalizedUrl: v.string(),
		now: v.number()
	}),
	returns: v.null(),
	handler: async (ctx, args) => {
		const row = await ctx.db
			.query('similar_links_cache' as any)
			.withIndex('by_normalizedUrl', (q) => q.eq('normalizedUrl', args.normalizedUrl))
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
		normalizedUrl: v.string(),
		sourceHost: v.string(),
		now: v.number(),
		results: v.array(similarLinkResultValidator)
	}),
	returns: v.null(),
	handler: async (ctx, args) => {
		const row = await ctx.db
			.query('similar_links_cache' as any)
			.withIndex('by_normalizedUrl', (q) => q.eq('normalizedUrl', args.normalizedUrl))
			.unique();
		const status = args.results.length > 0 ? 'ready' : 'empty';
		const expiresAt = args.now + CACHE_TTL_MS;

		if (row) {
			await ctx.db.patch(row._id, {
				sourceHost: args.sourceHost,
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
			normalizedUrl: args.normalizedUrl,
			sourceHost: args.sourceHost,
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
		normalizedUrl: v.string(),
		sourceHost: v.string(),
		now: v.number(),
		error: v.string()
	}),
	returns: v.null(),
	handler: async (ctx, args) => {
		const row = await ctx.db
			.query('similar_links_cache' as any)
			.withIndex('by_normalizedUrl', (q) => q.eq('normalizedUrl', args.normalizedUrl))
			.unique();
		const expiresAt = args.now + ERROR_RETRY_MS;
		if (row) {
			await ctx.db.patch(row._id, {
				sourceHost: args.sourceHost,
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
			normalizedUrl: args.normalizedUrl,
			sourceHost: args.sourceHost,
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
			return {
				sourceUrl: args.url,
				state: 'missing',
				status: null,
				results: [],
				lastError: 'Invalid URL.',
				lastFetchedAt: null,
				expiresAt: null,
				isRefreshing: false
			};
		}

		const row = await ctx.db
			.query('similar_links_cache' as any)
			.withIndex('by_normalizedUrl', (q) => q.eq('normalizedUrl', normalizedUrl))
			.unique();

		return toViewState(row ? mapRowLike(row) : null, normalizedUrl, Date.now());
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
				state: 'missing',
				refreshScheduled: false
			};
		}
		const sourceHost = sourceHostFromUrl(normalizedUrl);
		const now = Date.now();
		const row = await ctx.runQuery((internal as any).similar_links.getCacheRowByNormalizedUrl, {
			normalizedUrl
		});
		const rowLike = row ? mapRowLike(row) : null;
		const state: SimilarLinksCacheViewState = getCacheViewState(rowLike, now);

		if (state === 'fresh' || state === 'error_backoff' || state === 'refreshing') {
			return {
				sourceUrl: normalizedUrl,
				state,
				refreshScheduled: false
			};
		}

		if (shouldDoSynchronousRefresh(rowLike, now)) {
			const claim = await ctx.runMutation((internal as any).similar_links.claimRefreshLease, {
				normalizedUrl,
				sourceHost,
				now,
				leaseMs: REFRESH_LEASE_MS
			});
			if (!claim.claimed) {
				return {
					sourceUrl: normalizedUrl,
					state: 'refreshing',
					refreshScheduled: false
				};
			}

			await ctx.runAction((internal as any).similar_links_node.refreshFromExa, {
				normalizedUrl,
				sourceHost
			});
			const latest = await getCurrentView(ctx, normalizedUrl);
			return {
				sourceUrl: normalizedUrl,
				state: latest.state,
				refreshScheduled: false
			};
		}

		if (shouldScheduleBackgroundRefresh(rowLike, now)) {
			const claim = await ctx.runMutation((internal as any).similar_links.claimRefreshLease, {
				normalizedUrl,
				sourceHost,
				now,
				leaseMs: REFRESH_LEASE_MS
			});
			if (!claim.claimed) {
				return {
					sourceUrl: normalizedUrl,
					state: 'refreshing',
					refreshScheduled: false
				};
			}

			await ctx.scheduler.runAfter(0, (internal as any).similar_links_node.refreshFromExa, {
				normalizedUrl,
				sourceHost
			});
			return {
				sourceUrl: normalizedUrl,
				state: 'stale',
				refreshScheduled: true
			};
		}

		return {
			sourceUrl: normalizedUrl,
			state: 'stale',
			refreshScheduled: false
		};
	}
});

export const refreshNow = action({
	args: {
		url: v.string()
	},
	returns: actionResponseValidator,
	handler: async (ctx, args): Promise<SimilarLinksActionResponse> => {
		const authUser = await authComponent.getAuthUser(ctx);
		if (!authUser || !isAdminRole(authUser.role)) {
			throw new Error('Admin access required.');
		}

		const normalizedUrl = normalizeUrlSafely(args.url);
		if (!normalizedUrl) {
			return {
				sourceUrl: args.url,
				state: 'missing',
				refreshScheduled: false
			};
		}
		const sourceHost = sourceHostFromUrl(normalizedUrl);
		const claim = await ctx.runMutation((internal as any).similar_links.claimRefreshLease, {
			normalizedUrl,
			sourceHost,
			now: Date.now(),
			leaseMs: REFRESH_LEASE_MS
		});
		if (!claim.claimed) {
			return {
				sourceUrl: normalizedUrl,
				state: 'refreshing',
				refreshScheduled: false
			};
		}

		await ctx.runAction((internal as any).similar_links_node.refreshFromExa, {
			normalizedUrl,
			sourceHost
		});

		const latest = await getCurrentView(ctx, normalizedUrl);
		return {
			sourceUrl: normalizedUrl,
			state: latest.state,
			refreshScheduled: false
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
