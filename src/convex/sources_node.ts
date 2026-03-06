'use node';

import Parser from 'rss-parser';
import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { r2 } from './lib/r2';
import { deriveWebsiteSourceInput } from './lib/sourceUrls';

const SOURCE_ITEM_INLINE_LIMIT = 1000;
const SOURCE_ITEM_SNIPPET_LIMIT = 500;
const SOURCE_TITLE_LIMIT = 220;
const SOURCE_SYNC_ITEM_LIMIT = 25;
const SOURCE_URL_LIMIT = 2048;
const MAX_FETCH_REDIRECTS = 15;

const REQUEST_HEADERS = {
	'User-Agent':
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
	Accept:
		'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, text/html;q=0.7, */*;q=0.5',
	'Accept-Language': 'en-US,en;q=0.9',
	'Cache-Control': 'no-cache'
} as const;

const parser = new Parser({
	timeout: 15000,
	headers: REQUEST_HEADERS
});
const ENABLE_THIRD_PARTY_INGESTION_FALLBACK =
	(process.env.ENABLE_THIRD_PARTY_INGESTION_FALLBACK ?? '').toLowerCase() === 'true';

const createSnippet = (value: string) =>
	value.trim().replace(/\s+/g, ' ').slice(0, SOURCE_ITEM_SNIPPET_LIMIT);

const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex');

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
	const [a, b] = value.split('.').map((part) => Number(part));
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
	return false;
};

const normalizeHttpUrl = (
	inputUrl: string,
	options?: {
		preserveTrailingSlash?: boolean;
	}
) => {
	let withProtocol = inputUrl.trim();
	if (!/^https?:\/\//i.test(withProtocol)) {
		withProtocol = `https://${withProtocol}`;
	}
	const parsed = new URL(withProtocol);
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
	if (!options?.preserveTrailingSlash) {
		parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
	}
	return parsed.toString();
};

const rssCandidatesFrom = (canonicalUrl: string) => {
	const candidates = new Set<string>([canonicalUrl]);
	try {
		const parsed = new URL(canonicalUrl);
		const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
		parsed.pathname = pathname.endsWith('/') ? pathname : `${pathname}/`;
		candidates.add(parsed.toString());

		if (pathname.endsWith('/rss')) {
			parsed.pathname = pathname.replace(/\/rss$/, '/feed');
			candidates.add(parsed.toString());
			parsed.pathname = pathname.replace(/\/rss$/, '/rss.xml');
			candidates.add(parsed.toString());
		}
	} catch {
		// no-op
	}
	return [...candidates];
};

const coerceItemUrl = (rawUrl: string, baseUrl: string) => {
	try {
		return new URL(rawUrl, baseUrl).toString();
	} catch {
		return null;
	}
};

const extractAlternateFeedUrl = (html: string, baseUrl: string) => {
	const linkPattern = /<link\b[^>]*>/gi;
	const relPattern = /\brel\s*=\s*["']([^"']+)["']/i;
	const typePattern = /\btype\s*=\s*["']([^"']+)["']/i;
	const hrefPattern = /\bhref\s*=\s*["']([^"']+)["']/i;
	const tags = html.match(linkPattern) ?? [];

	for (const tag of tags) {
		const relValue = relPattern.exec(tag)?.[1]?.toLowerCase() ?? '';
		const typeValue = typePattern.exec(tag)?.[1]?.toLowerCase() ?? '';
		const hrefValue = hrefPattern.exec(tag)?.[1];
		if (!hrefValue || !relValue.includes('alternate')) {
			continue;
		}
		if (!typeValue.includes('rss') && !typeValue.includes('atom') && !typeValue.includes('xml')) {
			continue;
		}
		return coerceItemUrl(hrefValue, baseUrl);
	}

	return null;
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

const parseDateToMs = (isoDate?: string | null, pubDate?: string | null) => {
	const first = isoDate ? Date.parse(isoDate) : Number.NaN;
	if (Number.isFinite(first)) {
		return first;
	}
	const second = pubDate ? Date.parse(pubDate) : Number.NaN;
	if (Number.isFinite(second)) {
		return second;
	}
	return Date.now();
};

const resolveAndValidateHostname = async (hostname: string) => {
	const results = await lookup(hostname, { all: true, verbatim: true });
	if (results.length === 0) {
		throw new Error('Source host DNS resolution failed.');
	}
	for (const result of results) {
		if (isBlockedIpAddress(result.address)) {
			throw new Error('Source host resolved to a blocked address.');
		}
	}
};

const assertSafeFetchUrl = async (url: string) => {
	const normalized = normalizeHttpUrl(url, { preserveTrailingSlash: true });
	const parsed = new URL(normalized);
	if (isBlockedHostname(parsed.hostname)) {
		throw new Error('Source host is blocked for safety.');
	}
	if (
		!isBlockedIpAddress(parsed.hostname) &&
		!isIpv4Address(parsed.hostname) &&
		!parsed.hostname.includes(':')
	) {
		await resolveAndValidateHostname(parsed.hostname);
	}
	return parsed.toString();
};

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const fetchTextWithGuards = async (url: string, timeoutMs = 15000) => {
	let nextUrl = url;
	const visited = new Set<string>();
	for (let redirectCount = 0; redirectCount <= MAX_FETCH_REDIRECTS; redirectCount += 1) {
		const safeUrl = await assertSafeFetchUrl(nextUrl);
		if (visited.has(safeUrl)) {
			throw new Error('Source redirect loop detected.');
		}
		visited.add(safeUrl);
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await fetch(safeUrl, {
				method: 'GET',
				headers: REQUEST_HEADERS,
				redirect: 'manual',
				signal: controller.signal
			});

			if (REDIRECT_STATUSES.has(response.status)) {
				const location = response.headers.get('location');
				if (!location) {
					throw new Error(`Source redirect (${response.status}) missing location header.`);
				}
				nextUrl = new URL(location, safeUrl).toString();
				continue;
			}

			if (!response.ok) {
				throw new Error(`Source fetch failed (${response.status}).`);
			}

			return {
				finalUrl: safeUrl,
				contentType: response.headers.get('content-type') ?? 'text/plain',
				body: await response.text()
			};
		} finally {
			clearTimeout(timeout);
		}
	}
	throw new Error(`Source fetch exceeded ${MAX_FETCH_REDIRECTS} redirects.`);
};

const normalizeFeedError = (error: unknown) => {
	const message = error instanceof Error ? error.message : 'RSS fetch failed.';
	if (/redirect loop/i.test(message)) {
		return 'RSS fetch redirect loop detected.';
	}
	if (/exceeded .*redirect/i.test(message)) {
		return `RSS fetch exceeded ${MAX_FETCH_REDIRECTS} redirects.`;
	}
	if (/dns resolution failed/i.test(message)) {
		return 'Source host DNS resolution failed.';
	}
	if (/missing location header/i.test(message)) {
		return 'RSS host returned an invalid redirect response.';
	}
	if (/blocked for safety|blocked address|host is blocked/i.test(message)) {
		return 'Source host is blocked for safety.';
	}
	if (/rss parse failed/i.test(message)) {
		return 'RSS parse failed for this source.';
	}
	if (/\b403\b|\b401\b|access denied|forbidden/i.test(message)) {
		return 'Access denied by RSS host. This feed blocks server-side fetches.';
	}
	return message;
};

const tryThirdPartyIngestionFallback = async (): Promise<{
	parsedFeed: any;
	parsedFeedUrl: string | null;
} | null> => {
	// Policy default: keep third-party ingestion disabled unless explicitly enabled and implemented.
	return null;
};

export const syncRssSource = internalAction({
	args: {
		sourceId: v.id('sources'),
		canonicalUrl: v.string()
	},
	returns: v.object({
		processed: v.number()
	}),
	handler: async (ctx, args) => {
		const normalizedCanonicalUrl = normalizeHttpUrl(args.canonicalUrl);
		const candidates = rssCandidatesFrom(normalizedCanonicalUrl);

		let parsedFeed: any = null;
		let parsedFeedUrl: string | null = null;
		let lastError: unknown = null;
		for (const candidate of candidates) {
			try {
				const fetched = await fetchTextWithGuards(candidate);
				try {
					parsedFeed = await parser.parseString(fetched.body);
				} catch (parseError) {
					const parseMessage =
						parseError instanceof Error ? parseError.message : 'Unknown parser error';
					throw new Error(`RSS parse failed: ${parseMessage}`);
				}
				parsedFeedUrl = fetched.finalUrl;
				break;
			} catch (error) {
				lastError = error;
			}
		}

		if (!parsedFeed) {
			if (ENABLE_THIRD_PARTY_INGESTION_FALLBACK) {
				const fallback = await tryThirdPartyIngestionFallback();
				if (fallback) {
					parsedFeed = fallback.parsedFeed;
					parsedFeedUrl = fallback.parsedFeedUrl;
				}
			}
		}

		if (!parsedFeed) {
			throw new Error(normalizeFeedError(lastError));
		}

		const items: Array<any> = Array.isArray(parsedFeed.items)
			? parsedFeed.items.slice(0, SOURCE_SYNC_ITEM_LIMIT)
			: [];
		const feedBaseUrl =
			typeof parsedFeed?.link === 'string' && parsedFeed.link.trim()
				? parsedFeed.link
				: (parsedFeedUrl ?? normalizedCanonicalUrl);
		let processed = 0;

		for (const item of items) {
			const rawUrl = item.link ?? item.guid ?? item.id;
			if (!rawUrl || typeof rawUrl !== 'string') {
				continue;
			}
			const itemUrl = coerceItemUrl(rawUrl, feedBaseUrl);
			if (!itemUrl) {
				continue;
			}

			const titleValue =
				typeof item.title === 'string'
					? item.title
					: typeof item.link === 'string'
						? item.link
						: 'Untitled item';
			const title = titleValue.trim().slice(0, SOURCE_TITLE_LIMIT);
			if (!title) {
				continue;
			}

			const contentEncoded =
				typeof item['content:encoded'] === 'string' ? item['content:encoded'] : undefined;
			const rawBody =
				contentEncoded ||
				(typeof item.content === 'string' ? item.content : undefined) ||
				(typeof item.summary === 'string' ? item.summary : undefined) ||
				(typeof item.description === 'string' ? item.description : undefined) ||
				(typeof item.contentSnippet === 'string' ? item.contentSnippet : undefined) ||
				title;
			const bodyText = stripHtml(rawBody);
			const snippet = createSnippet(bodyText || title);
			const { inlineBody, r2Key } = await maybeStoreBodyToR2(ctx, args.sourceId, bodyText);
			const publishedAt = parseDateToMs(item.isoDate, item.pubDate);
			const externalIdRaw = item.guid ?? item.id;

			await ctx.runMutation((internal as any).sources.ingestSourceItemFromInput, {
				sourceId: args.sourceId,
				externalId: typeof externalIdRaw === 'string' ? externalIdRaw : undefined,
				url: itemUrl,
				title,
				snippet,
				body: inlineBody,
				r2Key,
				publishedAt,
				contentHash: sha256Hex(bodyText.slice(0, 4000)),
				contentType: 'application/rss+xml'
			});
			processed += 1;
		}

		return { processed };
	}
});

const normalizeWebsiteError = (error: unknown) => {
	const message = error instanceof Error ? error.message : 'Source fetch failed.';
	if (/redirect loop/i.test(message)) {
		return 'Source fetch redirect loop detected.';
	}
	if (/exceeded .*redirect/i.test(message)) {
		return `Source fetch exceeded ${MAX_FETCH_REDIRECTS} redirects.`;
	}
	if (/dns resolution failed/i.test(message)) {
		return 'Source host DNS resolution failed.';
	}
	if (/missing location header/i.test(message)) {
		return 'Source host returned an invalid redirect response.';
	}
	if (/blocked for safety|blocked address|host is blocked/i.test(message)) {
		return 'Source host is blocked for safety.';
	}
	if (/\b429\b|rate-limited/i.test(message)) {
		return 'Source website rate-limited requests (HTTP 429). Try again later.';
	}
	if (/\b403\b|\b401\b|access denied|forbidden/i.test(message)) {
		return 'Access denied by source website. This site may block server-side fetches.';
	}
	return message;
};

export const discoverWebsiteFollowTarget = internalAction({
	args: {
		siteUrl: v.string()
	},
	returns: v.object({
		sourceType: v.union(v.literal('website'), v.literal('rss')),
		canonicalUrl: v.string(),
		normalizedKey: v.string()
	}),
	handler: async (_ctx, args) => {
		const websiteInput = deriveWebsiteSourceInput(args.siteUrl);
		try {
			const fetched = await fetchTextWithGuards(websiteInput.canonicalUrl);
			const lowerContentType = fetched.contentType.toLowerCase();
			const looksLikeFeed =
				lowerContentType.includes('rss') ||
				lowerContentType.includes('atom') ||
				(lowerContentType.includes('xml') && !lowerContentType.includes('html'));
			if (looksLikeFeed) {
				const canonicalUrl = normalizeHttpUrl(fetched.finalUrl);
				return {
					sourceType: 'rss' as const,
					canonicalUrl,
					normalizedKey: `rss:${canonicalUrl.toLowerCase()}`
				};
			}

			const alternateFeedUrl = extractAlternateFeedUrl(fetched.body, fetched.finalUrl);
			if (alternateFeedUrl) {
				const canonicalUrl = normalizeHttpUrl(alternateFeedUrl);
				return {
					sourceType: 'rss' as const,
					canonicalUrl,
					normalizedKey: `rss:${canonicalUrl.toLowerCase()}`
				};
			}
		} catch {
			// Fall back to site-level website tracking when discovery fails.
		}

		return {
			sourceType: 'website' as const,
			canonicalUrl: websiteInput.canonicalUrl,
			normalizedKey: websiteInput.normalizedKey
		};
	}
});

export const syncWebsiteSource = internalAction({
	args: {
		sourceId: v.id('sources'),
		canonicalUrl: v.string(),
		sourceTitle: v.string()
	},
	returns: v.object({
		processed: v.number()
	}),
	handler: async (ctx, args) => {
		try {
			const normalizedCanonicalUrl = normalizeHttpUrl(args.canonicalUrl);
			const fetched = await fetchTextWithGuards(normalizedCanonicalUrl);
			const rawText = stripHtml(fetched.body);
			const pageTitle = extractHtmlTitle(
				fetched.body,
				args.sourceTitle.trim() || normalizedCanonicalUrl
			).slice(0, SOURCE_TITLE_LIMIT);
			const snippet = createSnippet(rawText || pageTitle || normalizedCanonicalUrl);
			const { inlineBody, r2Key } = await maybeStoreBodyToR2(ctx, args.sourceId, rawText);
			await ctx.runMutation((internal as any).sources.ingestSourceItemFromInput, {
				sourceId: args.sourceId,
				url: normalizedCanonicalUrl,
				title: pageTitle,
				snippet,
				body: inlineBody,
				r2Key,
				publishedAt: Date.now(),
				contentHash: sha256Hex(rawText.slice(0, 4000)),
				contentType: fetched.contentType
			});
			return { processed: 1 };
		} catch (error) {
			throw new Error(normalizeWebsiteError(error));
		}
	}
});
