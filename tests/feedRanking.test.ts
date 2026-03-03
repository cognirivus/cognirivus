import { describe, expect, it } from 'vitest';
import {
	applyFeedRanking,
	paginateByCursor,
	windowStartFromBucket
} from '../src/convex/lib/feedRanking';

describe('applyFeedRanking', () => {
	const base = [
		{ createdAt: 10, score: 1, commentCount: 3 },
		{ createdAt: 20, score: 3, commentCount: 1 },
		{ createdAt: 30, score: 2, commentCount: 8 }
	];

	it('sorts new by recency descending', () => {
		const ranked = applyFeedRanking(base, 'new');
		expect(ranked.map((p) => p.createdAt)).toEqual([30, 20, 10]);
	});

	it('sorts top by score descending with recency tiebreak', () => {
		const ranked = applyFeedRanking(base, 'top');
		expect(ranked.map((p) => p.score)).toEqual([3, 2, 1]);
	});

	it('sorts discussed by commentCount descending with recency tiebreak', () => {
		const ranked = applyFeedRanking(base, 'discussed');
		expect(ranked.map((p) => p.commentCount)).toEqual([8, 3, 1]);
	});
});

describe('paginateByCursor', () => {
	it('creates stable cursor pages', () => {
		const items = [1, 2, 3, 4, 5];
		const p1 = paginateByCursor(items, null, 2);
		expect(p1.page).toEqual([1, 2]);
		expect(p1.isDone).toBe(false);
		expect(p1.continueCursor).toBe('2');

		const p2 = paginateByCursor(items, p1.continueCursor, 2);
		expect(p2.page).toEqual([3, 4]);
		expect(p2.isDone).toBe(false);
		expect(p2.continueCursor).toBe('4');

		const p3 = paginateByCursor(items, p2.continueCursor, 2);
		expect(p3.page).toEqual([5]);
		expect(p3.isDone).toBe(true);
		expect(p3.continueCursor).toBeNull();
	});
});

describe('windowStartFromBucket', () => {
	it('returns expected millisecond offsets', () => {
		const now = 1_000_000;
		expect(windowStartFromBucket('24h', now)).toBe(now - 24 * 60 * 60 * 1000);
		expect(windowStartFromBucket('7d', now)).toBe(now - 7 * 24 * 60 * 60 * 1000);
		expect(windowStartFromBucket('30d', now)).toBe(now - 30 * 24 * 60 * 60 * 1000);
	});
});
