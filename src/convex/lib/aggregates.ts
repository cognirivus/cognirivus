import { DirectAggregate, TableAggregate } from '@convex-dev/aggregate';
import { components } from '../_generated/api';
import type { DataModel, Doc, Id } from '../_generated/dataModel';

const sourceItemsBySource = new TableAggregate<{
	Key: [Id<'sources'>];
	DataModel: DataModel;
	TableName: 'source_items';
}>((components as any).aggregateSourceItemsBySource, {
	sortKey: (doc) => [doc.sourceId]
});

const postSharesByAuthorSource = new DirectAggregate<{
	Key: [string, Id<'sources'>];
	Id: Id<'posts'>;
}>((components as any).aggregatePostSharesByAuthorSource);

const postShareKey = (authorAuthId: string, sourceId: Id<'sources'>): [string, Id<'sources'>] => [
	authorAuthId,
	sourceId
];

export const countSourceItemsForSource = async (ctx: any, sourceId: Id<'sources'>) =>
	await sourceItemsBySource.count(ctx, {
		bounds: {
			prefix: [sourceId]
		}
	});

export const countAuthorSharedPostsForSource = async (
	ctx: any,
	authorAuthId: string,
	sourceId: Id<'sources'>
) =>
	await postSharesByAuthorSource.count(ctx, {
		bounds: {
			prefix: postShareKey(authorAuthId, sourceId)
		}
	});

export const trackSourceItemInserted = async (ctx: any, doc: Doc<'source_items'>) => {
	await sourceItemsBySource.insertIfDoesNotExist(ctx, doc);
};

export const trackSourceItemReplaced = async (
	ctx: any,
	oldDoc: Doc<'source_items'>,
	newDoc: Doc<'source_items'>
) => {
	await sourceItemsBySource.replaceOrInsert(ctx, oldDoc, newDoc);
};

export const trackSourceItemDeleted = async (ctx: any, doc: Doc<'source_items'>) => {
	await sourceItemsBySource.deleteIfExists(ctx, doc);
};

export const trackPostInserted = async (ctx: any, doc: Doc<'posts'>) => {
	if (!doc.sourceId) {
		return;
	}
	await postSharesByAuthorSource.insertIfDoesNotExist(ctx, {
		key: postShareKey(doc.authorAuthId, doc.sourceId),
		id: doc._id
	});
};

export const trackPostReplaced = async (ctx: any, oldDoc: Doc<'posts'>, newDoc: Doc<'posts'>) => {
	const oldSourceId = oldDoc.sourceId;
	const newSourceId = newDoc.sourceId;

	if (!oldSourceId && !newSourceId) {
		return;
	}
	if (oldSourceId && newSourceId) {
		await postSharesByAuthorSource.replaceOrInsert(
			ctx,
			{
				key: postShareKey(oldDoc.authorAuthId, oldSourceId),
				id: oldDoc._id
			},
			{
				key: postShareKey(newDoc.authorAuthId, newSourceId)
			}
		);
		return;
	}
	if (oldSourceId) {
		await postSharesByAuthorSource.deleteIfExists(ctx, {
			key: postShareKey(oldDoc.authorAuthId, oldSourceId),
			id: oldDoc._id
		});
		return;
	}
	if (newSourceId) {
		await postSharesByAuthorSource.insertIfDoesNotExist(ctx, {
			key: postShareKey(newDoc.authorAuthId, newSourceId),
			id: newDoc._id
		});
	}
};

export const trackPostDeleted = async (ctx: any, doc: Doc<'posts'>) => {
	if (!doc.sourceId) {
		return;
	}
	await postSharesByAuthorSource.deleteIfExists(ctx, {
		key: postShareKey(doc.authorAuthId, doc.sourceId),
		id: doc._id
	});
};
