import { v } from 'convex/values';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { authComponent } from './auth';
import { rateLimiter } from './lib/rateLimits';

const ALLOWED_REACTIONS = ['👍', '❤️', '😂', '🎉', '😮', '😢', '👀'] as const;
type AllowedReaction = (typeof ALLOWED_REACTIONS)[number];

const reactionValidator = v.union(
	v.literal('👍'),
	v.literal('❤️'),
	v.literal('😂'),
	v.literal('🎉'),
	v.literal('😮'),
	v.literal('😢'),
	v.literal('👀')
);

const reactionSummaryValidator = v.object({
	emoji: reactionValidator,
	count: v.number(),
	reactedByMe: v.boolean(),
	reactors: v.array(
		v.object({
			userId: v.string(),
			userName: v.string(),
			userImage: v.optional(v.string())
		})
	)
});

const messageWithReactionsValidator = v.object({
	_id: v.id('community_chat_messages'),
	_creationTime: v.number(),
	communityId: v.id('communities'),
	userId: v.string(),
	userName: v.string(),
	userImage: v.optional(v.string()),
	body: v.string(),
	replyTo: v.optional(
		v.object({
			messageId: v.id('community_chat_messages'),
			userName: v.string(),
			body: v.string(),
			isDeleted: v.boolean()
		})
	),
	editedAt: v.optional(v.number()),
	isDeleted: v.optional(v.boolean()),
	createdAt: v.number(),
	reactions: v.array(reactionSummaryValidator)
});

const MAX_MESSAGE_BYTES = 4096;
const DEFAULT_MESSAGES_LIMIT = 50;
const MAX_MESSAGES_LIMIT = 100;

function normalizeMessageBody(body: string) {
	const normalizedBody = body.trim();
	if (!normalizedBody) {
		throw new Error('Message body cannot be empty');
	}

	const encodedByteLength = new TextEncoder().encode(normalizedBody).length;
	if (encodedByteLength > MAX_MESSAGE_BYTES) {
		throw new Error(`Message body cannot exceed ${MAX_MESSAGE_BYTES} UTF-8 bytes`);
	}

	return normalizedBody;
}

function normalizeMessagesLimit(limit?: number) {
	if (limit === undefined || !Number.isFinite(limit)) {
		return DEFAULT_MESSAGES_LIMIT;
	}

	const normalizedLimit = Math.trunc(limit);
	if (normalizedLimit <= 0) {
		return 1;
	}

	return Math.min(normalizedLimit, MAX_MESSAGES_LIMIT);
}

async function requireActiveMembership(
	ctx: QueryCtx | MutationCtx,
	userAuthId: string,
	communityId: Id<'communities'>
) {
	const membership = await ctx.db
		.query('community_memberships')
		.withIndex('by_communityId_and_userAuthId', (q) =>
			q.eq('communityId', communityId).eq('userAuthId', userAuthId)
		)
		.unique();

	if (!membership || membership.status !== 'active') {
		throw new Error('Active community membership required');
	}
}

async function requireMessageAuthor(
	ctx: MutationCtx,
	userAuthId: string,
	communityId: Id<'communities'>,
	messageId: Id<'community_chat_messages'>
) {
	const message = await ctx.db.get(messageId);
	if (!message || message.communityId !== communityId) {
		throw new Error('Message not found in this community');
	}

	if (message.userAuthId !== userAuthId) {
		throw new Error('Forbidden');
	}

	return message;
}

export const sendMessage = mutation({
	args: {
		communityId: v.id('communities'),
		body: v.string(),
		replyTo: v.optional(v.id('community_chat_messages'))
	},
	returns: v.id('community_chat_messages'),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		await rateLimiter.limit(ctx, 'communityChatMessage', { key: user._id, throws: true });
		await requireActiveMembership(ctx, user._id, args.communityId);
		const body = normalizeMessageBody(args.body);

		return await ctx.db.insert('community_chat_messages', {
			communityId: args.communityId,
			userAuthId: user._id,
			userName: user.name ?? 'Anonymous',
			userImage: user.image || undefined,
			body,
			replyTo: args.replyTo,
			isDeleted: false,
			createdAt: Date.now()
		});
	}
});

export const editMessage = mutation({
	args: {
		communityId: v.id('communities'),
		messageId: v.id('community_chat_messages'),
		body: v.string()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		await requireActiveMembership(ctx, user._id, args.communityId);
		const message = await requireMessageAuthor(ctx, user._id, args.communityId, args.messageId);

		if (message.isDeleted) {
			throw new Error('Message has been deleted');
		}

		const nextBody = normalizeMessageBody(args.body);

		if (nextBody === message.body) {
			return null;
		}

		await ctx.db.patch(args.messageId, {
			body: nextBody,
			editedAt: Date.now()
		});
		return null;
	}
});

export const deleteMessage = mutation({
	args: {
		communityId: v.id('communities'),
		messageId: v.id('community_chat_messages')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		await requireActiveMembership(ctx, user._id, args.communityId);
		const message = await requireMessageAuthor(ctx, user._id, args.communityId, args.messageId);

		if (!message.isDeleted) {
			await ctx.db.patch(args.messageId, {
				body: 'message deleted',
				isDeleted: true
			});
		}

		const reactions = await ctx.db
			.query('community_chat_reactions')
			.withIndex('by_communityId_and_messageId', (q) =>
				q.eq('communityId', args.communityId).eq('messageId', args.messageId)
			)
			.collect();
		for (const reaction of reactions) {
			await ctx.db.delete(reaction._id);
		}

		return null;
	}
});

export const getMessages = query({
	args: {
		communityId: v.id('communities'),
		limit: v.optional(v.number())
	},
	returns: v.array(messageWithReactionsValidator),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		await requireActiveMembership(ctx, user._id, args.communityId);
		const limit = normalizeMessagesLimit(args.limit);

		const messages = await ctx.db
			.query('community_chat_messages')
			.withIndex('by_communityId_and_createdAt', (q) =>
				q.eq('communityId', args.communityId)
			)
			.order('desc')
			.take(limit);

		const orderedMessages = messages.reverse();
		const messageIds = orderedMessages.map((m) => m._id);

		const reactionsPerMessage = await Promise.all(
			messageIds.map((id) =>
				ctx.db
					.query('community_chat_reactions')
					.withIndex('by_communityId_and_messageId', (q) =>
						q.eq('communityId', args.communityId).eq('messageId', id)
					)
					.collect()
			)
		);
		const allReactions = reactionsPerMessage.flat();

		const uniqueUserIds = [...new Set(allReactions.map((r) => r.userAuthId))];
		const userProfiles = await Promise.all(
			uniqueUserIds.map((id) => authComponent.getAnyUserById(ctx, id))
		);
		const userMap: Record<
			string,
			{
				name: string;
				image?: string | null;
			} | null
		> = Object.fromEntries(uniqueUserIds.map((id, i) => [id, userProfiles[i]]));

		const reactionsByMessageId: Record<string, typeof allReactions> = {};
		for (const reaction of allReactions) {
			const mid = reaction.messageId;
			if (!reactionsByMessageId[mid]) reactionsByMessageId[mid] = [];
			reactionsByMessageId[mid].push(reaction);
		}

		const replyToIds = orderedMessages
			.map((m) => m.replyTo)
			.filter((id): id is Id<'community_chat_messages'> => id !== undefined);
		const parentMessages = await Promise.all(replyToIds.map((id) => ctx.db.get(id)));
		const parentMessageMap = Object.fromEntries(replyToIds.map((id, i) => [id, parentMessages[i]]));

		return orderedMessages.map((message) => {
			if (message.isDeleted) {
				return {
					_id: message._id,
					_creationTime: message._creationTime,
					communityId: message.communityId,
					userId: message.userAuthId,
					userName: message.userName,
					userImage: message.userImage,
					body: 'message deleted',
					replyTo: undefined,
					editedAt: message.editedAt,
					isDeleted: true,
					createdAt: message.createdAt,
					reactions: []
				};
			}

			const reactions = reactionsByMessageId[message._id] ?? [];

			let replyToContext = undefined;
			if (message.replyTo) {
				const parent = parentMessageMap[message.replyTo];
				replyToContext = {
					messageId: message.replyTo,
					userName: parent?.userName ?? 'Unknown User',
					body: parent?.isDeleted ? 'message deleted' : parent?.body ?? 'Original message not found',
					isDeleted: !!parent?.isDeleted
				};
			}

			const reactionMap: Record<
				AllowedReaction,
				{
					count: number;
					reactedByMe: boolean;
					reactors: Array<{ userId: string; userName: string; userImage?: string }>;
				}
			> = {
				'👍': { count: 0, reactedByMe: false, reactors: [] },
				'❤️': { count: 0, reactedByMe: false, reactors: [] },
				'😂': { count: 0, reactedByMe: false, reactors: [] },
				'🎉': { count: 0, reactedByMe: false, reactors: [] },
				'😮': { count: 0, reactedByMe: false, reactors: [] },
				'😢': { count: 0, reactedByMe: false, reactors: [] },
				'👀': { count: 0, reactedByMe: false, reactors: [] }
			};

			for (const reaction of reactions) {
				const emoji = reaction.emoji as AllowedReaction;
				if (!ALLOWED_REACTIONS.includes(emoji)) continue;

				const reactor = userMap[reaction.userAuthId];
				reactionMap[emoji].count += 1;
				reactionMap[emoji].reactors.push({
					userId: reaction.userAuthId,
					userName: reactor?.name ?? 'Unknown User',
					userImage: (reactor?.image as string | undefined) ?? undefined
				});

				if (reaction.userAuthId === user._id) {
					reactionMap[emoji].reactedByMe = true;
				}
			}

			return {
				_id: message._id,
				_creationTime: message._creationTime,
				communityId: message.communityId,
				userId: message.userAuthId,
				userName: message.userName,
				userImage: message.userImage,
				body: message.body,
				replyTo: replyToContext,
				editedAt: message.editedAt,
				isDeleted: message.isDeleted,
				createdAt: message.createdAt,
				reactions: ALLOWED_REACTIONS.map((emoji) => ({
					emoji,
					count: reactionMap[emoji].count,
					reactedByMe: reactionMap[emoji].reactedByMe,
					reactors: reactionMap[emoji].reactors
				})).filter((reaction) => reaction.count > 0)
			};
		});
	}
});

export const toggleReaction = mutation({
	args: {
		communityId: v.id('communities'),
		messageId: v.id('community_chat_messages'),
		emoji: reactionValidator
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		await rateLimiter.limit(ctx, 'communityChatReaction', { key: user._id, throws: true });
		await requireActiveMembership(ctx, user._id, args.communityId);

		const message = await ctx.db.get(args.messageId);
		if (!message || message.communityId !== args.communityId) {
			throw new Error('Message not found in this community');
		}
		if (message.isDeleted) {
			throw new Error('Cannot react to a deleted message');
		}

		const myReactions = await ctx.db
			.query('community_chat_reactions')
			.withIndex('by_messageId_and_userAuthId', (q) =>
				q.eq('messageId', args.messageId).eq('userAuthId', user._id)
			)
			.collect();
		const alreadySelected = myReactions.some((reaction) => reaction.emoji === args.emoji);

		for (const reaction of myReactions) {
			await ctx.db.delete(reaction._id);
		}

		if (!alreadySelected) {
			await ctx.db.insert('community_chat_reactions', {
				communityId: args.communityId,
				messageId: args.messageId,
				userAuthId: user._id,
				emoji: args.emoji,
				createdAt: Date.now()
			});
		}

		return null;
	}
});

