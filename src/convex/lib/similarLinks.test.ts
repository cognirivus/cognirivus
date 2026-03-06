import { describe, expect, it } from 'vitest';
import {
	buildExaDomainFilters,
	createSourceDomainFingerprint,
	dedupeDomains,
	diffSourceDomains,
	filterResultsByScopeDomains,
	getCacheViewState,
	normalizeExaResults,
	normalizeDomain,
	normalizeUrl,
	shouldDoSynchronousRefresh,
	shouldScheduleBackgroundRefresh
} from './similarLinks';

describe('similarLinks helpers', () => {
	it('normalizes URL, strips hash, and sorts query params', () => {
		const normalized = normalizeUrl('finshots.in/archive/item/?b=2&a=1#section');
		expect(normalized).toBe('https://finshots.in/archive/item?a=1&b=2');
	});

	it('rejects unsupported URL schemes', () => {
		expect(() => normalizeUrl('ftp://example.com')).toThrowError(
			'Only http/https URLs are supported.'
		);
	});

	it('normalizes Exa results and removes duplicates including seed URL', () => {
		const seed = 'https://finshots.in/archive/item';
		const results = normalizeExaResults(seed, [
			{ url: seed, title: 'same as seed' },
			{ url: 'https://example.com/post?a=2&b=1', title: 'Post A', highlights: ['  line one  '] },
			{ id: 'https://example.com/post?b=1&a=2', title: 'Post A duplicate' },
			{ url: 'https://example.com/post-2', title: 'Post B' }
		]);

		expect(results).toHaveLength(2);
		expect(results[0]?.url).toBe('https://example.com/post?a=2&b=1');
		expect(results[0]?.highlights).toEqual(['line one']);
		expect(results[1]?.url).toBe('https://example.com/post-2');
	});

	it('normalizes and deduplicates domains for Exa filters', () => {
		expect(normalizeDomain('https://www.CollabFund.com/blog')).toBe('collabfund.com');
		expect(
			dedupeDomains(['https://www.collabfund.com', 'collabfund.com', 'https://finshots.in/rss'])
		).toEqual(['collabfund.com', 'finshots.in']);
	});

	it('builds include/exclude domain filters per scope', () => {
		expect(buildExaDomainFilters('sources', ['collabfund.com', 'finshots.in'])).toEqual({
			includeDomains: ['collabfund.com', 'finshots.in']
		});
		expect(buildExaDomainFilters('web', ['collabfund.com'])).toEqual({
			excludeDomains: ['collabfund.com']
		});
		expect(buildExaDomainFilters('sources', [])).toEqual({});
	});

	it('creates domain fingerprints and diffs domain snapshots', () => {
		expect(
			createSourceDomainFingerprint(['collabfund.com', 'www.collabfund.com', 'finshots.in'])
		).toBe('collabfund.com|finshots.in');
		expect(
			diffSourceDomains(['collabfund.com'], ['collabfund.com', 'finshots.in', 'strat.co'])
		).toEqual({
			newDomains: ['finshots.in', 'strat.co'],
			removedDomains: []
		});
	});

	it('filters normalized results by source-domain scope', () => {
		const results = [
			{
				id: '1',
				url: 'https://collabfund.com/post',
				title: 'Collab Fund',
				highlights: [],
				highlightScores: []
			},
			{
				id: '2',
				url: 'https://blog.collabfund.com/post',
				title: 'Collab Fund Blog',
				highlights: [],
				highlightScores: []
			},
			{
				id: '3',
				url: 'https://other.com/post',
				title: 'Other',
				highlights: [],
				highlightScores: []
			}
		];

		expect(filterResultsByScopeDomains(results, 'sources', ['collabfund.com'])).toHaveLength(2);
		expect(filterResultsByScopeDomains(results, 'web', ['collabfund.com'])).toEqual([
			results[2]
		]);
		expect(filterResultsByScopeDomains(results, 'sources', [])).toEqual([]);
	});

	it('computes freshness states correctly', () => {
		const now = 1000;
		expect(getCacheViewState(null, now)).toBe('missing');
		expect(
			getCacheViewState(
				{
					status: 'ready',
					results: [],
					expiresAt: 2000,
					refreshState: 'idle'
				},
				now
			)
		).toBe('fresh');
		expect(
			getCacheViewState(
				{
					status: 'error',
					results: [],
					expiresAt: 2000,
					refreshState: 'idle'
				},
				now
			)
		).toBe('error_backoff');
		expect(
			getCacheViewState(
				{
					status: 'ready',
					results: [
						{ id: '1', url: 'https://a.com', title: 'a', highlights: [], highlightScores: [] }
					],
					expiresAt: 500,
					refreshState: 'idle'
				},
				now
			)
		).toBe('stale');
		expect(
			getCacheViewState(
				{
					status: 'ready',
					results: [
						{ id: '1', url: 'https://a.com', title: 'a', highlights: [], highlightScores: [] }
					],
					expiresAt: 500,
					refreshState: 'refreshing',
					refreshLeaseExpiresAt: 2000
				},
				now
			)
		).toBe('refreshing');
	});

	it('chooses synchronous vs background refresh policy', () => {
		const now = 1000;
		expect(shouldDoSynchronousRefresh(null, now)).toBe(true);
		expect(
			shouldDoSynchronousRefresh(
				{
					status: 'ready',
					results: [
						{ id: '1', url: 'https://a.com', title: 'a', highlights: [], highlightScores: [] }
					],
					expiresAt: 900,
					refreshState: 'idle'
				},
				now
			)
		).toBe(false);
		expect(
			shouldScheduleBackgroundRefresh(
				{
					status: 'ready',
					results: [
						{ id: '1', url: 'https://a.com', title: 'a', highlights: [], highlightScores: [] }
					],
					expiresAt: 900,
					refreshState: 'idle'
				},
				now
			)
		).toBe(true);
		expect(
			shouldScheduleBackgroundRefresh(
				{
					status: 'error',
					results: [
						{ id: '1', url: 'https://a.com', title: 'a', highlights: [], highlightScores: [] }
					],
					expiresAt: 900,
					refreshState: 'idle'
				},
				now
			)
		).toBe(false);
	});
});
