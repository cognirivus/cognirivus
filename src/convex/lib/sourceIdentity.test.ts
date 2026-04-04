import { describe, expect, it } from 'vitest';
import { resolveSourceIdentityFromRss } from './sourceIdentity';

describe('sourceIdentity', () => {
	it('maps RSS feeds to website-root sources when the feed homepage is available', () => {
		const result = resolveSourceIdentityFromRss({
			feedUrl: 'https://example.com/feed.xml',
			feedSiteUrl: 'https://example.com/blog'
		});

		expect(result.sourceType).toBe('website');
		expect(result.canonicalUrl).toBe('https://example.com/');
		expect(result.normalizedKey).toBe('website:example.com/');
		expect(result.rssFeedUrl).toBe('https://example.com/feed.xml');
		expect(result.rssFeedNormalizedKey).toBe('rss:https://example.com/feed.xml');
	});

	it('falls back to the first feed item url when the feed homepage is missing', () => {
		const result = resolveSourceIdentityFromRss({
			feedUrl: 'https://example.com/feed.xml',
			itemUrls: ['https://example.com/posts/1', 'https://example.com/posts/2']
		});

		expect(result.sourceType).toBe('website');
		expect(result.canonicalUrl).toBe('https://example.com/');
		expect(result.normalizedKey).toBe('website:example.com/');
	});

	it('keeps a standalone rss source when no website root can be inferred', () => {
		const result = resolveSourceIdentityFromRss({
			feedUrl: 'https://feeds.feedburner.com/publication'
		});

		expect(result.sourceType).toBe('rss');
		expect(result.canonicalUrl).toBe('https://feeds.feedburner.com/publication');
		expect(result.normalizedKey).toBe('rss:https://feeds.feedburner.com/publication');
		expect(result.rssFeedUrl).toBe('https://feeds.feedburner.com/publication');
	});
});
