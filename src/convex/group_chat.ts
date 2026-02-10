import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { authComponent } from './auth';

export const sendMessage = mutation({
	args: {
		groupId: v.id('groups'),
		body: v.string()
	},
	returns: v.id('group_chat_messages'),
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		const membership = await ctx.db
			.query('group_memberships')
			.withIndex('by_user_group', (q) => q.eq('userId', user._id).eq('groupId', args.groupId))
			.unique();

		if (!membership || membership.status !== 'active') {
			throw new Error('Not a member of this group');
		}

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
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		const membership = await ctx.db
			.query('group_memberships')
			.withIndex('by_user_group', (q) => q.eq('userId', user._id).eq('groupId', args.groupId))
			.unique();

		if (!membership || membership.status !== 'active') {
			throw new Error('Not a member of this group');
		}

		const messages = await ctx.db
			.query('group_chat_messages')
			.withIndex('by_group_created_at', (q) => q.eq('groupId', args.groupId))
			.order('desc')
			.take(args.limit ?? 50);

		return messages.reverse();
	}
});
