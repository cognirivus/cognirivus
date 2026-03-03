import { v } from 'convex/values';
import { mutation } from './_generated/server';
import { authComponent } from './auth';

const bookmarkValidator = v.object({
	title: v.string(),
	url: v.string(),
	tags: v.array(v.string()),
	createdAt: v.number()
});

export const importSelectedBookmarks = mutation({
	args: {
		bookmarks: v.array(bookmarkValidator)
	},
	returns: v.number(),
	handler: async (ctx, args) => {
		const authUser = await authComponent.getAuthUser(ctx);
		if (!authUser) throw new Error('Unauthorized');

		let count = 0;
		const now = Date.now();

		for (const bookmark of args.bookmarks) {
			try {
				await ctx.db.insert('posts', {
					authorAuthId: authUser._id,
					type: 'link',
					title: bookmark.title,
					url: bookmark.url,
					tags: bookmark.tags,
					sourceType: 'chrome_import',
					visibility: 'private',
					snippet: bookmark.url,
					score: 0,
					likes: 0,
					dislikes: 0,
					commentCount: 0,
					createdAt: bookmark.createdAt,
					updatedAt: now
				});
				count++;
			} catch (err) {
				console.error(`Failed to import bookmark: ${bookmark.url}`, err);
			}
		}

		return count;
	}
});
