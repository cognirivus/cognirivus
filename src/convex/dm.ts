import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import {
	internalMutation,
	mutation,
	query,
	type MutationCtx,
	type QueryCtx
} from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { getAnyUserById, getAuthUser } from './auth';
import { rateLimiter } from './lib/rateLimits';

const ALLOWED_REACTIONS = [
	'\u{1F44D}',
	'\u{2764}\u{FE0F}',
	'\u{1F602}',
	'\u{1F389}',
	'\u{1F62E}',
	'\u{1F622}',
	'\u{1F440}'
] as const;
type AllowedReaction = (typeof ALLOWED_REACTIONS)[number];

const reactionValidator = v.union(
	v.literal('\u{1F44D}'),
	v.literal('\u{2764}\u{FE0F}'),
	v.literal('\u{1F602}'),
	v.literal('\u{1F389}'),
	v.literal('\u{1F62E}'),
	v.literal('\u{1F622}'),
	v.literal('\u{1F440}')
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
const SEARCH_LIMIT = 10;
const SEARCH_SCAN_LIMIT = 25;

type Ctx = QueryCtx | MutationCtx;
type Conversation = Doc<'dm_conversations'>;
type Participant = Doc<'dm_participants'>;

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

function normalizeSearchText(value: string) {
	return value.trim().toLowerCase();
}

function prefixUpperBound(prefix: string) {
	return `${prefix}\uffff`;
}

async function requireConversationParticipant(
	ctx: Ctx,
	userAuthId: string,
	conversationId: Id<'dm_conversations'>
) {
	const conversation = await ctx.db.get(conversationId);
	if (!conversation) {
		throw new Error('Conversation not found');
	}

	if (conversation.participant1 !== userAuthId && conversation.participant2 !== userAuthId) {
		throw new Error('Not a participant of this conversation');
	}

	return conversation;
}

async function getParticipant(
	ctx: Ctx,
	conversationId: Id<'dm_conversations'>,
	userAuthId: string
): Promise<Participant | null> {
	return await ctx.db
		.query('dm_participants')
		.withIndex('by_conversationId_and_userAuthId', (q) =>
			q.eq('conversationId', conversationId).eq('userAuthId', userAuthId)
		)
		.unique();
}

async function upsertParticipant(
	ctx: MutationCtx,
	conversation: Conversation,
	userAuthId: string,
	otherUserAuthId: string,
	patch: Partial<
		Pick<
			Participant,
			| 'otherUserAuthId'
			| 'unreadCount'
			| 'lastReadAt'
			| 'lastReadMessageAt'
			| 'lastMessageAt'
			| 'updatedAt'
		>
	>
) {
	const existing = await getParticipant(ctx, conversation._id, userAuthId);
	const now = Date.now();

	if (existing) {
		await ctx.db.patch(existing._id, {
			otherUserAuthId,
			...patch,
			updatedAt: patch.updatedAt ?? now
		});
		return existing._id;
	}

	return await ctx.db.insert('dm_participants', {
		conversationId: conversation._id,
		userAuthId,
		otherUserAuthId,
		unreadCount: patch.unreadCount ?? 0,
		lastReadAt: patch.lastReadAt ?? 0,
		lastReadMessageAt: patch.lastReadMessageAt ?? 0,
		lastMessageAt: patch.lastMessageAt ?? conversation.lastMessageAt,
		createdAt: now,
		updatedAt: patch.updatedAt ?? now
	});
}

async function ensureConversationParticipantRows(ctx: MutationCtx, conversation: Conversation) {
	const now = Date.now();
	await upsertParticipant(ctx, conversation, conversation.participant1, conversation.participant2, {
		lastMessageAt: conversation.lastMessageAt,
		updatedAt: now
	});
	await upsertParticipant(ctx, conversation, conversation.participant2, conversation.participant1, {
		lastMessageAt: conversation.lastMessageAt,
		updatedAt: now
	});
}

export const createOrGetConversation = mutation({
	args: {
		targetAuthId: v.string()
	},
	returns: v.id('dm_conversations'),
	handler: async (ctx, args) => {
		const user = await getAuthUser(ctx);
		if (!user) {
			throw new Error('Not authenticated');
		}

		await rateLimiter.limit(ctx, 'dmMessage', { key: user._id, throws: true });

		if (args.targetAuthId === user._id) {
			throw new Error('Cannot start a conversation with yourself');
		}

		const targetUser = await getAnyUserById(ctx, args.targetAuthId);
		if (!targetUser) {
			throw new Error('Target user not found');
		}

		const [p1, p2] = sortParticipants(user._id, args.targetAuthId);
		const existing = await ctx.db
			.query('dm_conversations')
			.withIndex('by_pair', (q) => q.eq('participant1', p1).eq('participant2', p2))
			.unique();

		if (existing) {
			await ensureConversationParticipantRows(ctx, existing);
			return existing._id;
		}

		const now = Date.now();
		const conversationId = await ctx.db.insert('dm_conversations', {
			participant1: p1,
			participant2: p2,
			lastMessageAt: now,
			createdAt: now
		});

		const conversation = await ctx.db.get(conversationId);
		if (!conversation) {
			throw new Error('Failed to create conversation');
		}
		await ensureConversationParticipantRows(ctx, conversation);

		return conversationId;
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
		const user = await getAuthUser(ctx);
		if (!user) {
			throw new Error('Not authenticated');
		}

		const participantRows = await ctx.db
			.query('dm_participants')
			.withIndex('by_userAuthId_and_lastMessageAt', (q) => q.eq('userAuthId', user._id))
			.order('desc')
			.collect();

		type ConversationRow = {
			conversationId: Id<'dm_conversations'>;
			otherUserAuthId: string;
			unreadCount: number;
			lastMessageAt: number;
		};

		let conversationRows: Array<ConversationRow> = participantRows.map((participant) => ({
			conversationId: participant.conversationId,
			otherUserAuthId: participant.otherUserAuthId,
			unreadCount: participant.unreadCount,
			lastMessageAt: participant.lastMessageAt
		}));

		if (conversationRows.length === 0) {
			const [asP1, asP2] = await Promise.all([
				ctx.db
					.query('dm_conversations')
					.withIndex('by_participant1', (q) => q.eq('participant1', user._id))
					.collect(),
				ctx.db
					.query('dm_conversations')
					.withIndex('by_participant2', (q) => q.eq('participant2', user._id))
					.collect()
			]);
			conversationRows = [...asP1, ...asP2].map((conversation) => ({
				conversationId: conversation._id,
				otherUserAuthId:
					conversation.participant1 === user._id
						? conversation.participant2
						: conversation.participant1,
				unreadCount: 0,
				lastMessageAt: conversation.lastMessageAt
			}));
		}

		conversationRows.sort((a, b) => b.lastMessageAt - a.lastMessageAt);

		const conversations = await Promise.all(
			conversationRows.map(async (row) => {
				const conversation = await ctx.db.get(row.conversationId);
				if (!conversation) {
					return null;
				}

				const profile = await ctx.db
					.query('users_profile')
					.withIndex('by_authId', (q) => q.eq('authId', row.otherUserAuthId))
					.unique();

				const lastMessageDoc = await ctx.db
					.query('dm_messages')
					.withIndex('by_conversationId_and_createdAt', (q) =>
						q.eq('conversationId', row.conversationId)
					)
					.order('desc')
					.take(1);

				return {
					conversationId: conversation._id,
					otherUser: {
						authId: row.otherUserAuthId,
						username: profile?.username,
						name: profile?.name ?? 'Unknown User',
						image: profile?.image
					},
					lastMessage:
						lastMessageDoc.length > 0
							? {
									body: lastMessageDoc[0].body,
									createdAt: lastMessageDoc[0].createdAt,
									senderAuthId: lastMessageDoc[0].senderAuthId
								}
							: null,
					unreadCount: row.unreadCount
				};
			})
		);

		return conversations.filter(
			(conversation): conversation is NonNullable<typeof conversation> => !!conversation
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
		const user = await getAuthUser(ctx);
		if (!user) {
			throw new Error('Not authenticated');
		}

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

		const reactionsPerMessage = await Promise.all(
			orderedMessages.map((message) =>
				ctx.db
					.query('dm_reactions')
					.withIndex('by_messageId', (q) => q.eq('messageId', message._id))
					.collect()
			)
		);
		const allReactions = reactionsPerMessage.flat();

		const uniqueUserIds = [...new Set(allReactions.map((reaction) => reaction.userAuthId))];
		const profiles = await Promise.all(
			uniqueUserIds.map((userAuthId) => getAnyUserById(ctx, userAuthId))
		);
		const profileByUserId = new Map(
			uniqueUserIds.map((userAuthId, index) => [userAuthId, profiles[index]])
		);

		const reactionsByMessageId = new Map<Id<'dm_messages'>, Array<Doc<'dm_reactions'>>>();
		for (const reaction of allReactions) {
			const existing = reactionsByMessageId.get(reaction.messageId) ?? [];
			existing.push(reaction);
			reactionsByMessageId.set(reaction.messageId, existing);
		}

		const replyToIds = orderedMessages
			.map((message) => message.replyTo)
			.filter((messageId): messageId is Id<'dm_messages'> => !!messageId);
		const uniqueReplyToIds = [...new Set(replyToIds)];
		const parentMessages = await Promise.all(
			uniqueReplyToIds.map((messageId) => ctx.db.get(messageId))
		);
		const parentMessageById = new Map(
			uniqueReplyToIds.map((messageId, index) => [messageId, parentMessages[index]])
		);

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

			const reactionMap: Record<
				AllowedReaction,
				{
					count: number;
					reactedByMe: boolean;
					reactors: Array<{ userId: string; userName: string; userImage?: string }>;
				}
			> = {
				'\u{1F44D}': { count: 0, reactedByMe: false, reactors: [] },
				'\u{2764}\u{FE0F}': { count: 0, reactedByMe: false, reactors: [] },
				'\u{1F602}': { count: 0, reactedByMe: false, reactors: [] },
				'\u{1F389}': { count: 0, reactedByMe: false, reactors: [] },
				'\u{1F62E}': { count: 0, reactedByMe: false, reactors: [] },
				'\u{1F622}': { count: 0, reactedByMe: false, reactors: [] },
				'\u{1F440}': { count: 0, reactedByMe: false, reactors: [] }
			};

			for (const reaction of reactionsByMessageId.get(message._id) ?? []) {
				const emoji = reaction.emoji as AllowedReaction;
				if (!ALLOWED_REACTIONS.includes(emoji)) {
					continue;
				}

				const profile = profileByUserId.get(reaction.userAuthId);
				reactionMap[emoji].count += 1;
				reactionMap[emoji].reactors.push({
					userId: reaction.userAuthId,
					userName: profile?.name ?? 'Unknown User',
					userImage: profile?.image ?? undefined
				});
				if (reaction.userAuthId === user._id) {
					reactionMap[emoji].reactedByMe = true;
				}
			}

			const parentMessage = message.replyTo ? parentMessageById.get(message.replyTo) : null;

			return {
				_id: message._id,
				_creationTime: message._creationTime,
				conversationId: message.conversationId,
				senderAuthId: message.senderAuthId,
				senderName: message.senderName,
				senderImage: message.senderImage,
				body: message.body,
				replyTo: message.replyTo
					? {
							messageId: message.replyTo,
							userName: parentMessage?.senderName ?? 'Unknown User',
							body: parentMessage?.isDeleted
								? 'message deleted'
								: (parentMessage?.body ?? 'Original message not found'),
							isDeleted: !!parentMessage?.isDeleted
						}
					: undefined,
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
		const user = await getAuthUser(ctx);
		if (!user) {
			throw new Error('Not authenticated');
		}

		const profile = await ctx.db
			.query('users_profile')
			.withIndex('by_usernameLower', (q) =>
				q.eq('usernameLower', normalizeSearchText(args.username))
			)
			.unique();

		if (!profile) {
			return null;
		}

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
		const user = await getAuthUser(ctx);
		if (!user) {
			throw new Error('Not authenticated');
		}

		await rateLimiter.limit(ctx, 'dmMessage', { key: user._id, throws: true });
		const conversation = await requireConversationParticipant(ctx, user._id, args.conversationId);

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
			senderImage: user.image ?? undefined,
			body,
			replyTo: args.replyTo,
			isDeleted: false,
			createdAt: now
		});

		await ctx.db.patch(args.conversationId, { lastMessageAt: now });

		const recipientAuthId =
			conversation.participant1 === user._id
				? conversation.participant2
				: conversation.participant1;

		await upsertParticipant(ctx, conversation, user._id, recipientAuthId, {
			unreadCount: 0,
			lastReadAt: now,
			lastReadMessageAt: now,
			lastMessageAt: now
		});

		const recipientParticipant = await getParticipant(ctx, args.conversationId, recipientAuthId);
		await upsertParticipant(ctx, conversation, recipientAuthId, user._id, {
			unreadCount: (recipientParticipant?.unreadCount ?? 0) + 1,
			lastReadAt: recipientParticipant?.lastReadAt ?? 0,
			lastReadMessageAt: recipientParticipant?.lastReadMessageAt ?? 0,
			lastMessageAt: now
		});

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
		const user = await getAuthUser(ctx);
		if (!user) {
			throw new Error('Not authenticated');
		}

		const message = await ctx.db.get(args.messageId);
		if (!message) {
			throw new Error('Message not found');
		}
		if (message.senderAuthId !== user._id) {
			throw new Error('Forbidden');
		}
		if (message.isDeleted) {
			throw new Error('Message has been deleted');
		}

		const editWindowMs = 60_000;
		if (Date.now() - message.createdAt > editWindowMs) {
			throw new Error('Edit window has expired (1 minute limit)');
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
		messageId: v.id('dm_messages')
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const user = await getAuthUser(ctx);
		if (!user) {
			throw new Error('Not authenticated');
		}

		const message = await ctx.db.get(args.messageId);
		if (!message) {
			throw new Error('Message not found');
		}
		if (message.senderAuthId !== user._id) {
			throw new Error('Forbidden');
		}

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
		const user = await getAuthUser(ctx);
		if (!user) {
			throw new Error('Not authenticated');
		}

		await rateLimiter.limit(ctx, 'dmReaction', { key: user._id, throws: true });

		const message = await ctx.db.get(args.messageId);
		if (!message) {
			throw new Error('Message not found');
		}

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
		const user = await getAuthUser(ctx);
		if (!user) {
			throw new Error('Not authenticated');
		}

		const conversation = await requireConversationParticipant(ctx, user._id, args.conversationId);
		const otherUserAuthId =
			conversation.participant1 === user._id
				? conversation.participant2
				: conversation.participant1;
		const now = Date.now();

		await upsertParticipant(ctx, conversation, user._id, otherUserAuthId, {
			unreadCount: 0,
			lastReadAt: now,
			lastReadMessageAt: conversation.lastMessageAt,
			lastMessageAt: conversation.lastMessageAt
		});

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
		const user = await getAuthUser(ctx);
		if (!user) {
			throw new Error('Not authenticated');
		}

		const search = normalizeSearchText(args.query);
		if (search.length < 2) {
			return [];
		}

		const upperBound = prefixUpperBound(search);
		const [usernameMatches, nameMatches] = await Promise.all([
			ctx.db
				.query('users_profile')
				.withIndex('by_usernameLower', (q) =>
					q.gte('usernameLower', search).lt('usernameLower', upperBound)
				)
				.take(SEARCH_SCAN_LIMIT),
			ctx.db
				.query('users_profile')
				.withIndex('by_nameLower', (q) => q.gte('nameLower', search).lt('nameLower', upperBound))
				.take(SEARCH_SCAN_LIMIT)
		]);

		const profileByAuthId = new Map<string, Doc<'users_profile'>>();
		for (const profile of [...usernameMatches, ...nameMatches]) {
			if (!profile.username || profile.authId === user._id) {
				continue;
			}
			profileByAuthId.set(profile.authId, profile);
		}

		const ranked = [...profileByAuthId.values()]
			.map((profile) => {
				const usernameLower = profile.usernameLower ?? normalizeSearchText(profile.username ?? '');
				const nameLower = profile.nameLower ?? normalizeSearchText(profile.name);

				let score = 0;
				if (usernameLower.startsWith(search)) {
					score += 4;
				} else if (usernameLower.includes(search)) {
					score += 2;
				}
				if (nameLower.startsWith(search)) {
					score += 3;
				} else if (nameLower.includes(search)) {
					score += 1;
				}

				return { profile, score };
			})
			.filter((item) => item.score > 0)
			.sort((a, b) => {
				if (b.score !== a.score) {
					return b.score - a.score;
				}
				const aUsername = a.profile.usernameLower ?? normalizeSearchText(a.profile.username ?? '');
				const bUsername = b.profile.usernameLower ?? normalizeSearchText(b.profile.username ?? '');
				if (aUsername !== bUsername) {
					return aUsername.localeCompare(bUsername);
				}
				return a.profile.authId.localeCompare(b.profile.authId);
			})
			.slice(0, SEARCH_LIMIT)
			.map(({ profile }) => ({
				authId: profile.authId,
				username: profile.username ?? '',
				name: profile.name,
				image: profile.image
			}));

		return ranked;
	}
});

export const getUnreadCount = query({
	args: {},
	returns: v.number(),
	handler: async (ctx) => {
		const user = await getAuthUser(ctx);
		if (!user) {
			throw new Error('Not authenticated');
		}

		const participants = await ctx.db
			.query('dm_participants')
			.withIndex('by_userAuthId_and_lastMessageAt', (q) => q.eq('userAuthId', user._id))
			.collect();

		return participants.reduce((sum, participant) => sum + participant.unreadCount, 0);
	}
});

export const backfillParticipants = internalMutation({
	args: {
		paginationOpts: paginationOptsValidator
	},
	returns: v.object({
		processedConversations: v.number(),
		isDone: v.boolean(),
		continueCursor: v.union(v.string(), v.null())
	}),
	handler: async (ctx, args) => {
		const result = await ctx.db.query('dm_conversations').paginate(args.paginationOpts);
		let processedConversations = 0;

		for (const conversation of result.page) {
			const [legacyP1ReadCursor, legacyP2ReadCursor, messages] = await Promise.all([
				ctx.db
					.query('dm_read_cursors')
					.withIndex('by_conversationId_and_userAuthId', (q) =>
						q.eq('conversationId', conversation._id).eq('userAuthId', conversation.participant1)
					)
					.unique(),
				ctx.db
					.query('dm_read_cursors')
					.withIndex('by_conversationId_and_userAuthId', (q) =>
						q.eq('conversationId', conversation._id).eq('userAuthId', conversation.participant2)
					)
					.unique(),
				ctx.db
					.query('dm_messages')
					.withIndex('by_conversationId_and_createdAt', (q) =>
						q.eq('conversationId', conversation._id)
					)
					.collect()
			]);

			const lastReadAtP1 = legacyP1ReadCursor?.lastReadAt ?? 0;
			const lastReadAtP2 = legacyP2ReadCursor?.lastReadAt ?? 0;

			let unreadCountP1 = 0;
			let unreadCountP2 = 0;
			for (const message of messages) {
				if (
					message.senderAuthId !== conversation.participant1 &&
					message.createdAt > lastReadAtP1
				) {
					unreadCountP1 += 1;
				}
				if (
					message.senderAuthId !== conversation.participant2 &&
					message.createdAt > lastReadAtP2
				) {
					unreadCountP2 += 1;
				}
			}

			await upsertParticipant(
				ctx,
				conversation,
				conversation.participant1,
				conversation.participant2,
				{
					unreadCount: unreadCountP1,
					lastReadAt: lastReadAtP1,
					lastReadMessageAt: lastReadAtP1,
					lastMessageAt: conversation.lastMessageAt
				}
			);

			await upsertParticipant(
				ctx,
				conversation,
				conversation.participant2,
				conversation.participant1,
				{
					unreadCount: unreadCountP2,
					lastReadAt: lastReadAtP2,
					lastReadMessageAt: lastReadAtP2,
					lastMessageAt: conversation.lastMessageAt
				}
			);

			processedConversations += 1;
		}

		return {
			processedConversations,
			isDone: result.isDone,
			continueCursor: result.continueCursor
		};
	}
});
