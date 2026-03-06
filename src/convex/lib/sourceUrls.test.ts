import { describe, expect, it } from 'vitest';
import {
	deriveSavedWebsiteMetadata,
	deriveWebsiteSourceInput,
	normalizeHttpUrl,
	sourceHostForDisplay
} from './sourceUrls';

describe('sourceUrls', () => {
	it('normalizes article URLs and derives a site-level follow target', () => {
		const result = deriveWebsiteSourceInput(
			'https://www.collabfund.com/blog/the-power-of-constraints/?b=2&a=1#section'
		);

		expect(result.originalUrl).toBe(
			'https://www.collabfund.com/blog/the-power-of-constraints?a=1&b=2'
		);
		expect(result.canonicalUrl).toBe('https://www.collabfund.com/');
		expect(result.normalizedKey).toBe('website:www.collabfund.com/');
		expect(result.originHost).toBe('collabfund.com');
		expect(result.shouldSaveOriginal).toBe(true);
	});

	it('does not mark site root URLs as needing a separate saved seed', () => {
		const result = deriveWebsiteSourceInput('https://collabfund.com/');

		expect(result.originalUrl).toBe('https://collabfund.com/');
		expect(result.canonicalUrl).toBe('https://collabfund.com/');
		expect(result.shouldSaveOriginal).toBe(false);
	});

	it('derives saved-link metadata from the full original URL', () => {
		const result = deriveSavedWebsiteMetadata(
			'https://www.collabfund.com/blog/the-power-of-constraints/'
		);

		expect(result.normalizedUrl).toBe('https://www.collabfund.com/blog/the-power-of-constraints');
		expect(result.originHost).toBe('collabfund.com');
		expect(result.originSiteUrl).toBe('https://www.collabfund.com/');
		expect(result.suggestedSourceType).toBe('website');
		expect(result.suggestedSourceNormalizedKey).toBe('website:www.collabfund.com/');
		expect(result.suggestedSourceCanonicalUrl).toBe('https://www.collabfund.com/');
	});

	it('normalizes generic http urls consistently', () => {
		expect(normalizeHttpUrl('example.com/path/?b=2&a=1#hash').toString()).toBe(
			'https://example.com/path?a=1&b=2'
		);
		expect(sourceHostForDisplay('https://www.example.com/path')).toBe('example.com');
	});
});
