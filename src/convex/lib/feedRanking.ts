export type FeedTab = 'new' | 'top' | 'discussed';
export type FeedWindow = '24h' | '7d' | '30d';

export type RankedPost = {
	_creationTime?: number;
	createdAt: number;
	score: number;
	commentCount: number;
};

export const windowStartFromBucket = (bucket: FeedWindow, now = Date.now()) => {
	switch (bucket) {
		case '24h':
			return now - 24 * 60 * 60 * 1000;
		case '7d':
			return now - 7 * 24 * 60 * 60 * 1000;
		case '30d':
		default:
			return now - 30 * 24 * 60 * 60 * 1000;
	}
};

const recency = (post: RankedPost) => post.createdAt ?? post._creationTime ?? 0;

export const applyFeedRanking = <T extends RankedPost>(posts: Array<T>, tab: FeedTab): Array<T> => {
	const ranked = [...posts];

	ranked.sort((a, b) => {
		if (tab === 'new') {
			return recency(b) - recency(a);
		}
		if (tab === 'top') {
			if (b.score !== a.score) return b.score - a.score;
			return recency(b) - recency(a);
		}
		if (b.commentCount !== a.commentCount) return b.commentCount - a.commentCount;
		return recency(b) - recency(a);
	});

	return ranked;
};

export const paginateByCursor = <T>(
	items: Array<T>,
	cursor: string | null,
	numItems: number
): {
	page: Array<T>;
	isDone: boolean;
	continueCursor: string | null;
} => {
	const offset = Number.parseInt(cursor ?? '0', 10);
	const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0;
	const safeNumItems = Math.min(Math.max(numItems, 1), 50);

	const page = items.slice(safeOffset, safeOffset + safeNumItems);
	const nextOffset = safeOffset + page.length;
	const isDone = nextOffset >= items.length;

	return {
		page,
		isDone,
		continueCursor: isDone ? null : String(nextOffset)
	};
};
