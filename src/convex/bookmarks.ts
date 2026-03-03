import { v } from 'convex/values';
import { internal } from './_generated/api';
import { mutation } from './_generated/server';
import { authComponent } from './auth';
import { rateLimiter } from './lib/rateLimits';

const MAX_IMPORT_BATCH = 200;
const MAX_TITLE_LENGTH = 220;
const MAX_URL_LENGTH = 2048;
const MAX_TAGS_PER_BOOKMARK = 10;
const MAX_TAG_LENGTH = 32;
const MAX_ERROR_REPORTS = 20;

const bookmarkValidator = v.object({
	title: v.string(),
	url: v.string(),
	tags: v.array(v.string()),
	createdAt: v.number()
});

const importResultValidator = v.object({
	importedCount: v.number(),
	rejectedCount: v.number(),
	errors: v.array(
		v.object({
			index: v.number(),
			reason: v.string()
		})
	)
});

const normalizeTag = (tag: string) => tag.trim().toLowerCase();

const normalizeTags = (tags: Array<string>) => {
	const uniqueTags = new Set<string>();
	for (const rawTag of tags) {
		const normalizedTag = normalizeTag(rawTag);
		if (!normalizedTag) {
			continue;
		}
		if (normalizedTag.length > MAX_TAG_LENGTH) {
			throw new Error(`Tag "${normalizedTag.slice(0, 20)}" exceeds ${MAX_TAG_LENGTH} characters.`);
		}
		uniqueTags.add(normalizedTag);
		if (uniqueTags.size > MAX_TAGS_PER_BOOKMARK) {
			throw new Error(`A bookmark can have at most ${MAX_TAGS_PER_BOOKMARK} tags.`);
		}
	}
	return [...uniqueTags];
};

const normalizeTitle = (title: string) => {
	const normalizedTitle = title.trim();
	if (!normalizedTitle) {
		throw new Error('Bookmark title cannot be empty.');
	}
	if (normalizedTitle.length > MAX_TITLE_LENGTH) {
		throw new Error(`Bookmark title exceeds ${MAX_TITLE_LENGTH} characters.`);
	}
	return normalizedTitle;
};

const normalizeUrl = (url: string) => {
	const normalizedUrl = url.trim();
	if (!normalizedUrl) {
		throw new Error('Bookmark URL cannot be empty.');
	}
	if (normalizedUrl.length > MAX_URL_LENGTH) {
		throw new Error(`Bookmark URL exceeds ${MAX_URL_LENGTH} characters.`);
	}

	let parsed: URL;
	try {
		parsed = new URL(normalizedUrl);
	} catch {
		throw new Error('Bookmark URL is invalid.');
	}

	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new Error('Only http/https URLs are supported.');
	}

	return parsed.toString();
};

const normalizeCreatedAt = (createdAt: number) => {
	if (!Number.isFinite(createdAt) || createdAt <= 0) {
		return Date.now();
	}
	return Math.trunc(createdAt);
};

export const importSelectedBookmarks = mutation({
	args: {
		bookmarks: v.array(bookmarkValidator)
	},
	returns: importResultValidator,
	handler: async (ctx, args) => {
		const authUser = await authComponent.getAuthUser(ctx);
		if (!authUser) {
			throw new Error('Unauthorized');
		}

		await rateLimiter.limit(ctx, 'bookmarkImport', { key: authUser._id, throws: true });

		if (args.bookmarks.length === 0) {
			throw new Error('No bookmarks provided.');
		}
		if (args.bookmarks.length > MAX_IMPORT_BATCH) {
			throw new Error(`You can import at most ${MAX_IMPORT_BATCH} bookmarks at once.`);
		}

		let importedCount = 0;
		let rejectedCount = 0;
		const errors: Array<{ index: number; reason: string }> = [];
		const sourceId = await ctx.runMutation((internal as any).sources.ensureUserBookmarkSource, {
			userAuthId: authUser._id
		});

		for (const [index, bookmark] of args.bookmarks.entries()) {
			try {
				const title = normalizeTitle(bookmark.title);
				const url = normalizeUrl(bookmark.url);
				const tags = normalizeTags(bookmark.tags);
				const createdAt = normalizeCreatedAt(bookmark.createdAt);
				const snippetSource =
					tags.length > 0 ? `${url} • tags: ${tags.join(', ')}` : `${url} • imported bookmark`;

				await ctx.runMutation((internal as any).sources.ingestSourceItemFromInput, {
					sourceId,
					title,
					url,
					snippet: snippetSource,
					publishedAt: createdAt,
					contentHash: `bookmark:${url}`
				});
				importedCount += 1;
			} catch (error) {
				rejectedCount += 1;
				if (errors.length < MAX_ERROR_REPORTS) {
					const reason = error instanceof Error ? error.message : 'Bookmark import failed.';
					errors.push({ index, reason });
				}
			}
		}

		return {
			importedCount,
			rejectedCount,
			errors
		};
	}
});
