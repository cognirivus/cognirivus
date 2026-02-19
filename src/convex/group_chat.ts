import { v } from 'convex/values';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { authComponent } from './auth';
import type { Id } from './_generated/dataModel';
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
	_id: v.id('group_chat_messages'),
	_creationTime: v.number(),
	groupId: v.id('groups'),
	userId: v.string(),
	userName: v.string(),
	userImage: v.optional(v.string()),
	body: v.string(),
	replyTo: v.optional(
		v.object({
			messageId: v.id('group_chat_messages'),
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
	userId: string,
	groupId: Id<'groups'>
) {
	const membership = await ctx.db
		.query('group_memberships')
		.withIndex('by_user_group', (q) => q.eq('userId', userId).eq('groupId', groupId))
		.unique();

	if (!membership || membership.status !== 'active') {
		throw new Error('Not a member of this group');
	}
}

async function requireMessageAuthor(
	ctx: MutationCtx,
	userId: string,
	groupId: Id<'groups'>,
	messageId: Id<'group_chat_messages'>
) {
	const message = await ctx.db.get(messageId);
	if (!message || message.groupId !== groupId) {
		throw new Error('Message not found in this group');
	}

	if (message.userId !== userId) {
		throw new Error('Forbidden');
	}

	return message;
}

export const sendMessage = mutation({
	args: {
		groupId: v.id('groups'),
		body: v.string(),
		replyTo: v.optional(v.id('group_chat_messages'))
	},
	returns: v.id('group_chat_messages'),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		await rateLimiter.limit(ctx, 'groupChatMessage', { key: user._id, throws: true });
		await requireActiveMembership(ctx, user._id, args.groupId);
		const body = normalizeMessageBody(args.body);

		return await ctx.db.insert('group_chat_messages', {
			groupId: args.groupId,
			userId: user._id,
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
		groupId: v.id('groups'),
		messageId: v.id('group_chat_messages'),
		body: v.string()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		await requireActiveMembership(ctx, user._id, args.groupId);
		const message = await requireMessageAuthor(ctx, user._id, args.groupId, args.messageId);

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
		groupId: v.id('groups'),
		messageId: v.id('group_chat_messages')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		await requireActiveMembership(ctx, user._id, args.groupId);
		const message = await requireMessageAuthor(ctx, user._id, args.groupId, args.messageId);

		if (!message.isDeleted) {
			await ctx.db.patch(args.messageId, {
				body: 'message deleted',
				isDeleted: true
			});
		}

		const reactions = await ctx.db
			.query('group_chat_reactions')
			.withIndex('by_group_message', (q) =>
				q.eq('groupId', args.groupId).eq('messageId', args.messageId)
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
		groupId: v.id('groups'),
		limit: v.optional(v.number())
	},
	returns: v.array(messageWithReactionsValidator),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		await requireActiveMembership(ctx, user._id, args.groupId);
		const limit = normalizeMessagesLimit(args.limit);

		const messages = await ctx.db
			.query('group_chat_messages')
			.withIndex('by_group_created_at', (q) => q.eq('groupId', args.groupId))
			.order('desc')
			.take(limit);

		const orderedMessages = messages.reverse();
		const messageIds = orderedMessages.map((m) => m._id);

		// Fetch reactions per message using compound index (avoids large OR filter)
		const reactionsPerMessage = await Promise.all(
			messageIds.map((id) =>
				ctx.db
					.query('group_chat_reactions')
					.withIndex('by_group_message', (q) => q.eq('groupId', args.groupId).eq('messageId', id))
					.collect()
			)
		);
		const allReactions = reactionsPerMessage.flat();

		// Fetch user details for all unique reactors in one go
		const uniqueUserIds = [...new Set(allReactions.map((r) => r.userId))];
		const userProfiles = await Promise.all(
			uniqueUserIds.map((id) => authComponent.getAnyUserById(ctx, id))
		);
		const userMap = Object.fromEntries(uniqueUserIds.map((id, i) => [id, userProfiles[i]]));

		// Group reactions by messageId
		const reactionsByMessageId: Record<string, typeof allReactions> = {};
		for (const reaction of allReactions) {
			const mid = reaction.messageId;
			if (!reactionsByMessageId[mid]) reactionsByMessageId[mid] = [];
			reactionsByMessageId[mid].push(reaction);
		}

		// For messages that are replies, fetch the parent message content
		const replyToIds = orderedMessages
			.map((m) => m.replyTo)
			.filter((id): id is Id<'group_chat_messages'> => id !== undefined);
		const parentMessages = await Promise.all(replyToIds.map((id) => ctx.db.get(id)));
		const parentMessageMap = Object.fromEntries(replyToIds.map((id, i) => [id, parentMessages[i]]));

		return orderedMessages.map((message) => {
			if (message.isDeleted) {
				return { ...message, replyTo: undefined, reactions: [] };
			}

			const reactions = reactionsByMessageId[message._id] ?? [];

			let replyToContext = undefined;
			if (message.replyTo) {
				const parent = parentMessageMap[message.replyTo];
				replyToContext = {
					messageId: message.replyTo,
					userName: parent?.userName ?? 'Unknown User',
					body: parent?.isDeleted
						? 'message deleted'
						: (parent?.body ?? 'Original message not found'),
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

				const reactor = userMap[reaction.userId];
				reactionMap[emoji].count += 1;
				reactionMap[emoji].reactors.push({
					userId: reaction.userId,
					userName: reactor?.name ?? 'Unknown User',
					userImage: (reactor?.image as string | undefined) ?? undefined
				});

				if (reaction.userId === user._id) {
					reactionMap[emoji].reactedByMe = true;
				}
			}

			return {
				...message,
				replyTo: replyToContext,
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
		groupId: v.id('groups'),
		messageId: v.id('group_chat_messages'),
		emoji: reactionValidator
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		await rateLimiter.limit(ctx, 'groupChatReaction', { key: user._id, throws: true });
		await requireActiveMembership(ctx, user._id, args.groupId);

		const message = await ctx.db.get(args.messageId);
		if (!message || message.groupId !== args.groupId) {
			throw new Error('Message not found in this group');
		}
		if (message.isDeleted) {
			throw new Error('Cannot react to a deleted message');
		}

		const myReactions = await ctx.db
			.query('group_chat_reactions')
			.withIndex('by_message_user_emoji', (q) =>
				q.eq('messageId', args.messageId).eq('userId', user._id)
			)
			.collect();
		const alreadySelected = myReactions.some((reaction) => reaction.emoji === args.emoji);

		for (const reaction of myReactions) {
			await ctx.db.delete(reaction._id);
		}

		if (!alreadySelected) {
			await ctx.db.insert('group_chat_reactions', {
				groupId: args.groupId,
				messageId: args.messageId,
				userId: user._id,
				emoji: args.emoji,
				createdAt: Date.now()
			});
		}

		return null;
	}
});
