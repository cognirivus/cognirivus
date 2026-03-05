import { describe, expect, it } from 'vitest';
import {
	getCacheViewState,
	normalizeExaResults,
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
