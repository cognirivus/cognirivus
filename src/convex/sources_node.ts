'use node';

import Parser from 'rss-parser';
import { createHash } from 'node:crypto';
import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { r2 } from './lib/r2';

const SOURCE_ITEM_INLINE_LIMIT = 1000;
const SOURCE_ITEM_SNIPPET_LIMIT = 500;
const SOURCE_TITLE_LIMIT = 220;
const SOURCE_SYNC_ITEM_LIMIT = 25;

const parser = new Parser({
	timeout: 15000,
	headers: {
		'User-Agent':
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
		Accept:
			'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, text/html;q=0.7, */*;q=0.5',
		'Accept-Language': 'en-US,en;q=0.9'
	}
});

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

const normalizeHttpUrl = (inputUrl: string) => {
	let withProtocol = inputUrl.trim();
	if (!/^https?:\/\//i.test(withProtocol)) {
		withProtocol = `https://${withProtocol}`;
	}
	const parsed = new URL(withProtocol);
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new Error('Only http/https source URLs are supported.');
	}
	parsed.hash = '';
	parsed.searchParams.sort();
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

const normalizeFeedError = (error: unknown) => {
	const message = error instanceof Error ? error.message : 'RSS fetch failed.';
	if (/\b403\b|\b401\b|access denied|forbidden/i.test(message)) {
		return 'Access denied by RSS host. This feed blocks server-side fetches.';
	}
	return message;
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
		let lastError: unknown = null;
		for (const candidate of candidates) {
			try {
				parsedFeed = await parser.parseURL(candidate);
				break;
			} catch (error) {
				lastError = error;
			}
		}

		if (!parsedFeed) {
			throw new Error(normalizeFeedError(lastError));
		}

		const items: Array<any> = Array.isArray(parsedFeed.items)
			? parsedFeed.items.slice(0, SOURCE_SYNC_ITEM_LIMIT)
			: [];
		let processed = 0;

		for (const item of items) {
			const rawUrl = item.link ?? item.guid ?? item.id;
			if (!rawUrl || typeof rawUrl !== 'string') {
				continue;
			}
			const itemUrl = coerceItemUrl(rawUrl, normalizedCanonicalUrl);
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
