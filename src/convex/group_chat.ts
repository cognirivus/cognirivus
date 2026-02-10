import { v } from 'convex/values';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { authComponent } from './auth';
import type { Id } from './_generated/dataModel';

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
	reactedByMe: v.boolean()
});

const messageWithReactionsValidator = v.object({
	_id: v.id('group_chat_messages'),
	_creationTime: v.number(),
	groupId: v.id('groups'),
	userId: v.string(),
	userName: v.string(),
	userImage: v.optional(v.string()),
	body: v.string(),
	createdAt: v.number(),
	reactions: v.array(reactionSummaryValidator)
});

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

export const sendMessage = mutation({
	args: {
		groupId: v.id('groups'),
		body: v.string()
	},
	returns: v.id('group_chat_messages'),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		await requireActiveMembership(ctx, user._id, args.groupId);

		return await ctx.db.insert('group_chat_messages', {
			groupId: args.groupId,
			userId: user._id,
			userName: user.name ?? 'Anonymous',
			userImage: user.image || undefined,
			body: args.body,
			createdAt: Date.now()
		});
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

		const messages = await ctx.db
			.query('group_chat_messages')
			.withIndex('by_group_created_at', (q) => q.eq('groupId', args.groupId))
			.order('desc')
			.take(args.limit ?? 50);

		const orderedMessages = messages.reverse();
		const withReactions = await Promise.all(
			orderedMessages.map(async (message) => {
				const reactions = await ctx.db
					.query('group_chat_reactions')
					.withIndex('by_group_message', (q) =>
						q.eq('groupId', args.groupId).eq('messageId', message._id)
					)
					.collect();
				const latestReactionByUser: Record<string, (typeof reactions)[number]> = {};
				for (const reaction of reactions) {
					const existing = latestReactionByUser[reaction.userId];
					if (!existing || reaction.createdAt > existing.createdAt) {
						latestReactionByUser[reaction.userId] = reaction;
					}
				}

				const reactionMap: Record<AllowedReaction, { count: number; reactedByMe: boolean }> = {
					'👍': { count: 0, reactedByMe: false },
					'❤️': { count: 0, reactedByMe: false },
					'😂': { count: 0, reactedByMe: false },
					'🎉': { count: 0, reactedByMe: false },
					'😮': { count: 0, reactedByMe: false },
					'😢': { count: 0, reactedByMe: false },
					'👀': { count: 0, reactedByMe: false }
				};

				for (const reaction of Object.values(latestReactionByUser)) {
					const emoji = reaction.emoji as AllowedReaction;
					if (!ALLOWED_REACTIONS.includes(emoji)) continue;
					reactionMap[emoji].count += 1;
					if (reaction.userId === user._id) {
						reactionMap[emoji].reactedByMe = true;
					}
				}

				return {
					...message,
					reactions: ALLOWED_REACTIONS
						.map((emoji) => ({
							emoji,
							count: reactionMap[emoji].count,
							reactedByMe: reactionMap[emoji].reactedByMe
						}))
						.filter((reaction) => reaction.count > 0)
				};
			})
		);

		return withReactions;
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

		await requireActiveMembership(ctx, user._id, args.groupId);

		const message = await ctx.db.get(args.messageId);
		if (!message || message.groupId !== args.groupId) {
			throw new Error('Message not found in this group');
		}

		const allMessageReactions = await ctx.db
			.query('group_chat_reactions')
			.withIndex('by_message', (q) => q.eq('messageId', args.messageId))
			.collect();
		const myReactions = allMessageReactions.filter((reaction) => reaction.userId === user._id);
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
