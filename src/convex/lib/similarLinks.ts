import { v } from 'convex/values';

export const EXA_FIND_SIMILAR_ENDPOINT = 'https://api.exa.ai/findSimilar';
export const EXA_TIMEOUT_MS = 12000;
export const EXA_MAX_RESULTS = 6;
export const EXA_MAX_HIGHLIGHT_CHARACTERS = 280;

export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const ERROR_RETRY_MS = 6 * 60 * 60 * 1000;
export const REFRESH_LEASE_MS = 2 * 60 * 1000;
export const CLEANUP_RETENTION_MS = 45 * 24 * 60 * 60 * 1000;

export const similarLinkResultValidator = v.object({
	id: v.string(),
	url: v.string(),
	title: v.string(),
	publishedDate: v.optional(v.string()),
	author: v.optional(v.string()),
	image: v.optional(v.string()),
	favicon: v.optional(v.string()),
	highlights: v.array(v.string()),
	highlightScores: v.array(v.number())
});

export type SimilarLinkCacheRowStatus = 'ready' | 'empty' | 'error';
export type SimilarLinksRefreshState = 'idle' | 'refreshing';

export type NormalizedSimilarLink = {
	id: string;
	url: string;
	title: string;
	publishedDate?: string;
	author?: string;
	image?: string;
	favicon?: string;
	highlights: Array<string>;
	highlightScores: Array<number>;
};

export type SimilarLinksCacheViewState =
	| 'missing'
	| 'fresh'
	| 'stale'
	| 'refreshing'
	| 'error_backoff';

export type SimilarLinksRowLike = {
	status: SimilarLinkCacheRowStatus;
	results: Array<NormalizedSimilarLink>;
	expiresAt: number;
	refreshState: SimilarLinksRefreshState;
	refreshLeaseExpiresAt?: number;
	lastError?: string;
	lastFetchedAt?: number;
};

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

export const normalizeUrl = (value: string) => {
	let normalized = value.trim();
	if (!normalized) {
		throw new Error('URL is empty.');
	}
	const hasScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(normalized);
	if (hasScheme && !/^https?:\/\//i.test(normalized)) {
		throw new Error('Only http/https URLs are supported.');
	}
	if (!hasScheme) {
		if (normalized.startsWith('//')) {
			normalized = `https:${normalized}`;
		} else {
			normalized = `https://${normalized}`;
		}
	}
	const parsed = new URL(normalized);
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new Error('Only http/https URLs are supported.');
	}
	if (parsed.username || parsed.password) {
		throw new Error('URLs with credentials are not supported.');
	}
	parsed.hash = '';
	parsed.searchParams.sort();
	parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
	return parsed.toString();
};

export const sourceHostFromUrl = (normalizedUrl: string) => {
	const host = new URL(normalizedUrl).hostname.toLowerCase();
	return host.replace(/^www\./, '');
};

const normalizeHighlights = (value: unknown) => {
	if (!Array.isArray(value)) {
		return [];
	}
	const normalized: Array<string> = [];
	for (const item of value) {
		if (typeof item !== 'string') {
			continue;
		}
		const clean = normalizeWhitespace(item);
		if (!clean) {
			continue;
		}
		normalized.push(clean.slice(0, EXA_MAX_HIGHLIGHT_CHARACTERS));
	}
	return normalized;
};

const normalizeHighlightScores = (value: unknown, maxLength: number) => {
	if (!Array.isArray(value)) {
		return [];
	}
	const normalized: Array<number> = [];
	for (const item of value) {
		if (typeof item !== 'number' || !Number.isFinite(item)) {
			continue;
		}
		normalized.push(item);
		if (normalized.length >= maxLength) {
			break;
		}
	}
	return normalized;
};

const optionalTrimmed = (value: unknown) => {
	if (typeof value !== 'string') {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed ? trimmed : undefined;
};

export const normalizeExaResults = (
	seedUrl: string,
	rawResults: unknown
): Array<NormalizedSimilarLink> => {
	if (!Array.isArray(rawResults)) {
		return [];
	}
	const seen = new Set<string>([seedUrl]);
	const normalized: Array<NormalizedSimilarLink> = [];

	for (const rawResult of rawResults) {
		const item = rawResult as Record<string, unknown>;
		const rawUrl =
			typeof item.url === 'string' ? item.url : typeof item.id === 'string' ? item.id : '';
		if (!rawUrl) {
			continue;
		}

		let normalizedUrl: string;
		try {
			normalizedUrl = normalizeUrl(rawUrl);
		} catch {
			continue;
		}
		if (seen.has(normalizedUrl)) {
			continue;
		}
		seen.add(normalizedUrl);

		const title = optionalTrimmed(item.title) ?? normalizedUrl;
		const highlights = normalizeHighlights(item.highlights);
		const highlightScores = normalizeHighlightScores(item.highlightScores, highlights.length);

		normalized.push({
			id: normalizedUrl,
			url: normalizedUrl,
			title,
			publishedDate: optionalTrimmed(item.publishedDate),
			author: optionalTrimmed(item.author),
			image: optionalTrimmed(item.image),
			favicon: optionalTrimmed(item.favicon),
			highlights,
			highlightScores
		});

		if (normalized.length >= EXA_MAX_RESULTS) {
			break;
		}
	}

	return normalized;
};

const hasActiveRefreshLease = (row: SimilarLinksRowLike, now: number) => {
	return row.refreshState === 'refreshing' && (row.refreshLeaseExpiresAt ?? 0) > now;
};

export const getCacheViewState = (
	row: SimilarLinksRowLike | null,
	now: number
): SimilarLinksCacheViewState => {
	if (!row) {
		return 'missing';
	}
	if (hasActiveRefreshLease(row, now)) {
		return 'refreshing';
	}
	if (row.status === 'error' && row.expiresAt > now) {
		return 'error_backoff';
	}
	if (row.expiresAt > now) {
		return 'fresh';
	}
	return 'stale';
};

export const shouldDoSynchronousRefresh = (row: SimilarLinksRowLike | null, now: number) => {
	if (!row) {
		return true;
	}
	if (row.status === 'error') {
		return row.expiresAt <= now;
	}
	if (row.status === 'empty' && row.expiresAt <= now) {
		return true;
	}
	return row.results.length === 0 && row.expiresAt <= now;
};

export const shouldScheduleBackgroundRefresh = (row: SimilarLinksRowLike | null, now: number) => {
	if (!row) {
		return false;
	}
	if (row.status === 'error') {
		return false;
	}
	if (row.expiresAt > now) {
		return false;
	}
	return row.results.length > 0 || row.status === 'empty';
};
