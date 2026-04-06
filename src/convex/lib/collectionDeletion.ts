import type { Doc, Id } from '../_generated/dataModel';

export type DeleteCollectionCascadeResult = {
	deleted: boolean;
	collectionId: Id<'source_collections'>;
	itemCount: number;
	followCount: number;
	suggestionCount: number;
};

export const deleteCollectionCascadeByDoc = async (
	ctx: any,
	collection: Doc<'source_collections'>
): Promise<DeleteCollectionCascadeResult> => {
	const [items, follows, pendingSuggestions, approvedSuggestions, rejectedSuggestions] =
		await Promise.all([
			ctx.db
				.query('source_collection_items')
				.withIndex('by_collectionId_and_position', (q: any) => q.eq('collectionId', collection._id))
				.collect(),
			ctx.db
				.query('source_collection_follows')
				.withIndex('by_collectionId_and_createdAt', (q: any) =>
					q.eq('collectionId', collection._id)
				)
				.collect(),
			ctx.db
				.query('source_collection_suggestions')
				.withIndex('by_collectionId_and_status', (q: any) =>
					q.eq('collectionId', collection._id).eq('status', 'pending')
				)
				.collect(),
			ctx.db
				.query('source_collection_suggestions')
				.withIndex('by_collectionId_and_status', (q: any) =>
					q.eq('collectionId', collection._id).eq('status', 'approved')
				)
				.collect(),
			ctx.db
				.query('source_collection_suggestions')
				.withIndex('by_collectionId_and_status', (q: any) =>
					q.eq('collectionId', collection._id).eq('status', 'rejected')
				)
				.collect()
		]);

	for (const item of items) {
		await ctx.db.delete(item._id);
	}
	for (const follow of follows) {
		await ctx.db.delete(follow._id);
	}

	const suggestions = [...pendingSuggestions, ...approvedSuggestions, ...rejectedSuggestions];
	for (const suggestion of suggestions) {
		await ctx.db.delete(suggestion._id);
	}

	await ctx.db.delete(collection._id);

	return {
		deleted: true,
		collectionId: collection._id,
		itemCount: items.length,
		followCount: follows.length,
		suggestionCount: suggestions.length
	};
};
