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
	_id: v.id('dm_messages'),
	_creationTime: v.number(),
	conversationId: v.id('dm_conversations'),
	senderAuthId: v.string(),
	senderName: v.string(),
	senderImage: v.optional(v.string()),
	body: v.string(),
	replyTo: v.optional(
		v.object({
			messageId: v.id('dm_messages'),
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

function sortParticipants(a: string, b: string): [string, string] {
	return a < b ? [a, b] : [b, a];
}

async function requireConversationParticipant(
	ctx: QueryCtx | MutationCtx,
	userAuthId: string,
	conversationId: Id<'dm_conversations'>
) {
	const conversation = await ctx.db.get(conversationId);
	if (!conversation) throw new Error('Conversation not found');
	if (conversation.participant1 !== userAuthId && conversation.participant2 !== userAuthId) {
		throw new Error('Not a participant of this conversation');
	}
	return conversation;
}

export const createOrGetConversation = mutation({
	args: {
		targetAuthId: v.string()
	},
	returns: v.id('dm_conversations'),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		await rateLimiter.limit(ctx, 'dmMessage', { key: user._id, throws: true });

		if (args.targetAuthId === user._id) {
			throw new Error('Cannot start a conversation with yourself');
		}
		const targetUser = await authComponent.getAnyUserById(ctx, args.targetAuthId);
		if (!targetUser) {
			throw new Error('Target user not found');
		}

		const [p1, p2] = sortParticipants(user._id, args.targetAuthId);

		const existing = await ctx.db
			.query('dm_conversations')
			.withIndex('by_pair', (q) => q.eq('participant1', p1).eq('participant2', p2))
			.unique();

		if (existing) {
			return existing._id;
		}

		const now = Date.now();
		return await ctx.db.insert('dm_conversations', {
			participant1: p1,
			participant2: p2,
			lastMessageAt: now,
			createdAt: now
		});
	}
});

export const listConversations = query({
	args: {},
	returns: v.array(
		v.object({
			conversationId: v.id('dm_conversations'),
			otherUser: v.object({
				authId: v.string(),
				username: v.optional(v.string()),
				name: v.string(),
				image: v.optional(v.union(v.null(), v.string()))
			}),
			lastMessage: v.union(
				v.null(),
				v.object({
					body: v.string(),
					createdAt: v.number(),
					senderAuthId: v.string()
				})
			),
			unreadCount: v.number()
		})
	),
	handler: async (ctx) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		const asP1 = await ctx.db
			.query('dm_conversations')
			.withIndex('by_participant1', (q) => q.eq('participant1', user._id))
			.collect();

		const asP2 = await ctx.db
			.query('dm_conversations')
			.withIndex('by_participant2', (q) => q.eq('participant2', user._id))
			.collect();

		const conversations = [...asP1, ...asP2].sort((a, b) => b.lastMessageAt - a.lastMessageAt);

		return await Promise.all(
			conversations.map(async (conv) => {
				const otherAuthId = conv.participant1 === user._id ? conv.participant2 : conv.participant1;

				const profile = await ctx.db
					.query('users_profile')
					.withIndex('by_authId', (q) => q.eq('authId', otherAuthId))
					.unique();

				const lastMessages = await ctx.db
					.query('dm_messages')
					.withIndex('by_conversationId_and_createdAt', (q) => q.eq('conversationId', conv._id))
					.order('desc')
					.take(1);

				const lastMessage =
					lastMessages.length > 0
						? {
								body: lastMessages[0].body,
								createdAt: lastMessages[0].createdAt,
								senderAuthId: lastMessages[0].senderAuthId
							}
						: null;

				const readCursor = await ctx.db
					.query('dm_read_cursors')
					.withIndex('by_conversationId_and_userAuthId', (q) =>
						q.eq('conversationId', conv._id).eq('userAuthId', user._id)
					)
					.unique();

				const lastReadAt = readCursor?.lastReadAt ?? 0;

				const recentMessages = await ctx.db
					.query('dm_messages')
					.withIndex('by_conversationId_and_createdAt', (q) => q.eq('conversationId', conv._id))
					.order('desc')
					.take(100);

				const unreadCount = recentMessages.filter(
					(m) => m.createdAt > lastReadAt && m.senderAuthId !== user._id
				).length;

				return {
					conversationId: conv._id,
					otherUser: {
						authId: otherAuthId,
						username: profile?.username,
						name: profile?.name ?? 'Unknown User',
						image: profile?.image
					},
					lastMessage,
					unreadCount
				};
			})
		);
	}
});

export const getMessages = query({
	args: {
		conversationId: v.id('dm_conversations'),
		limit: v.optional(v.number())
	},
	returns: v.array(messageWithReactionsValidator),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		await requireConversationParticipant(ctx, user._id, args.conversationId);
		const limit = normalizeMessagesLimit(args.limit);

		const messages = await ctx.db
			.query('dm_messages')
			.withIndex('by_conversationId_and_createdAt', (q) =>
				q.eq('conversationId', args.conversationId)
			)
			.order('desc')
			.take(limit);

		const orderedMessages = messages.reverse();
		const messageIds = orderedMessages.map((m) => m._id);

		const reactionsPerMessage = await Promise.all(
			messageIds.map((id) =>
				ctx.db
					.query('dm_reactions')
					.withIndex('by_messageId', (q) => q.eq('messageId', id))
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
			.filter((id): id is Id<'dm_messages'> => id !== undefined);
		const parentMessages = await Promise.all(replyToIds.map((id) => ctx.db.get(id)));
		const parentMessageMap = Object.fromEntries(replyToIds.map((id, i) => [id, parentMessages[i]]));

		return orderedMessages.map((message) => {
			if (message.isDeleted) {
				return {
					_id: message._id,
					_creationTime: message._creationTime,
					conversationId: message.conversationId,
					senderAuthId: message.senderAuthId,
					senderName: message.senderName,
					senderImage: message.senderImage,
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
					userName: parent?.senderName ?? 'Unknown User',
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
				conversationId: message.conversationId,
				senderAuthId: message.senderAuthId,
				senderName: message.senderName,
				senderImage: message.senderImage,
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

export const getConversationByUsername = query({
	args: {
		username: v.string()
	},
	returns: v.union(v.null(), v.id('dm_conversations')),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		const profile = await ctx.db
			.query('users_profile')
			.withIndex('by_username', (q) => q.eq('username', args.username))
			.unique();

		if (!profile) return null;

		const [p1, p2] = sortParticipants(user._id, profile.authId);

		const conversation = await ctx.db
			.query('dm_conversations')
			.withIndex('by_pair', (q) => q.eq('participant1', p1).eq('participant2', p2))
			.unique();

		return conversation?._id ?? null;
	}
});

export const sendMessage = mutation({
	args: {
		conversationId: v.id('dm_conversations'),
		body: v.string(),
		replyTo: v.optional(v.id('dm_messages'))
	},
	returns: v.id('dm_messages'),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		await rateLimiter.limit(ctx, 'dmMessage', { key: user._id, throws: true });
		await requireConversationParticipant(ctx, user._id, args.conversationId);
		if (args.replyTo) {
			const parentMessage = await ctx.db.get(args.replyTo);
			if (!parentMessage) {
				throw new Error('Reply target not found');
			}
			if (parentMessage.conversationId !== args.conversationId) {
				throw new Error('Reply target must be in the same conversation');
			}
		}

		const body = normalizeMessageBody(args.body);
		const now = Date.now();

		const messageId = await ctx.db.insert('dm_messages', {
			conversationId: args.conversationId,
			senderAuthId: user._id,
			senderName: user.name ?? 'Anonymous',
			senderImage: user.image || undefined,
			body,
			replyTo: args.replyTo,
			isDeleted: false,
			createdAt: now
		});

		await ctx.db.patch(args.conversationId, { lastMessageAt: now });

		const readCursor = await ctx.db
			.query('dm_read_cursors')
			.withIndex('by_conversationId_and_userAuthId', (q) =>
				q.eq('conversationId', args.conversationId).eq('userAuthId', user._id)
			)
			.unique();

		if (readCursor) {
			await ctx.db.patch(readCursor._id, { lastReadAt: now });
		} else {
			await ctx.db.insert('dm_read_cursors', {
				conversationId: args.conversationId,
				userAuthId: user._id,
				lastReadAt: now
			});
		}

		return messageId;
	}
});

export const editMessage = mutation({
	args: {
		messageId: v.id('dm_messages'),
		body: v.string()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		const message = await ctx.db.get(args.messageId);
		if (!message) throw new Error('Message not found');
		if (message.senderAuthId !== user._id) throw new Error('Forbidden');
		if (message.isDeleted) throw new Error('Message has been deleted');

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
		messageId: v.id('dm_messages')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		const message = await ctx.db.get(args.messageId);
		if (!message) throw new Error('Message not found');
		if (message.senderAuthId !== user._id) throw new Error('Forbidden');

		if (!message.isDeleted) {
			await ctx.db.patch(args.messageId, {
				body: 'message deleted',
				isDeleted: true
			});
		}

		const reactions = await ctx.db
			.query('dm_reactions')
			.withIndex('by_messageId', (q) => q.eq('messageId', args.messageId))
			.collect();
		for (const reaction of reactions) {
			await ctx.db.delete(reaction._id);
		}

		return null;
	}
});

export const toggleReaction = mutation({
	args: {
		messageId: v.id('dm_messages'),
		emoji: reactionValidator
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		await rateLimiter.limit(ctx, 'dmReaction', { key: user._id, throws: true });

		const message = await ctx.db.get(args.messageId);
		if (!message) throw new Error('Message not found');

		await requireConversationParticipant(ctx, user._id, message.conversationId);

		if (message.isDeleted) {
			throw new Error('Cannot react to a deleted message');
		}

		const myReactions = await ctx.db
			.query('dm_reactions')
			.withIndex('by_messageId_and_userAuthId', (q) =>
				q.eq('messageId', args.messageId).eq('userAuthId', user._id)
			)
			.collect();
		const alreadySelected = myReactions.some((reaction) => reaction.emoji === args.emoji);

		for (const reaction of myReactions) {
			await ctx.db.delete(reaction._id);
		}

		if (!alreadySelected) {
			await ctx.db.insert('dm_reactions', {
				messageId: args.messageId,
				userAuthId: user._id,
				emoji: args.emoji,
				createdAt: Date.now()
			});
		}

		return null;
	}
});

export const markAsRead = mutation({
	args: {
		conversationId: v.id('dm_conversations')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		await requireConversationParticipant(ctx, user._id, args.conversationId);

		const readCursor = await ctx.db
			.query('dm_read_cursors')
			.withIndex('by_conversationId_and_userAuthId', (q) =>
				q.eq('conversationId', args.conversationId).eq('userAuthId', user._id)
			)
			.unique();

		const now = Date.now();

		if (readCursor) {
			await ctx.db.patch(readCursor._id, { lastReadAt: now });
		} else {
			await ctx.db.insert('dm_read_cursors', {
				conversationId: args.conversationId,
				userAuthId: user._id,
				lastReadAt: now
			});
		}

		return null;
	}
});

export const searchUsers = query({
	args: {
		query: v.string()
	},
	returns: v.array(
		v.object({
			authId: v.string(),
			username: v.string(),
			name: v.string(),
			image: v.optional(v.union(v.null(), v.string()))
		})
	),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		const q = args.query.trim().toLowerCase();
		if (q.length < 2) return [];

		const profiles = await ctx.db.query('users_profile').collect();

		return profiles
			.filter(
				(p) =>
					p.username &&
					p.authId !== user._id &&
					(p.username.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
			)
			.slice(0, 10)
			.map((p) => ({
				authId: p.authId,
				username: p.username!,
				name: p.name,
				image: p.image
			}));
	}
});

export const getUnreadCount = query({
	args: {},
	returns: v.number(),
	handler: async (ctx) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		const asP1 = await ctx.db
			.query('dm_conversations')
			.withIndex('by_participant1', (q) => q.eq('participant1', user._id))
			.collect();

		const asP2 = await ctx.db
			.query('dm_conversations')
			.withIndex('by_participant2', (q) => q.eq('participant2', user._id))
			.collect();

		const conversations = [...asP1, ...asP2];
		let totalUnread = 0;

		for (const conv of conversations) {
			const readCursor = await ctx.db
				.query('dm_read_cursors')
				.withIndex('by_conversationId_and_userAuthId', (q) =>
					q.eq('conversationId', conv._id).eq('userAuthId', user._id)
				)
				.unique();

			const lastReadAt = readCursor?.lastReadAt ?? 0;

			const recentMessages = await ctx.db
				.query('dm_messages')
				.withIndex('by_conversationId_and_createdAt', (q) => q.eq('conversationId', conv._id))
				.order('desc')
				.take(100);

			totalUnread += recentMessages.filter(
				(m) => m.createdAt > lastReadAt && m.senderAuthId !== user._id
			).length;
		}

		return totalUnread;
	}
});
