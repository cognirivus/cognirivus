import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { authComponent } from './auth';
import type { Id } from './_generated/dataModel';
import { rateLimiter } from './lib/rateLimits';

export const create = mutation({
	args: {
		name: v.string(),
		groupname: v.string(),
		description: v.optional(v.string()),
		icon: v.optional(v.string()),
		isPublic: v.boolean()
	},
	handler: async (ctx, { name, groupname, description, icon, isPublic }) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');
		await rateLimiter.limit(ctx, 'createGroup', { key: user._id, throws: true });

		// Check if groupname is unique
		const existing = await ctx.db
			.query('groups')
			.withIndex('by_groupname', (q) => q.eq('groupname', groupname))
			.unique();
		if (existing) throw new Error('Group name (slug) already taken');

		const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

		const groupId = await ctx.db.insert('groups', {
			name,
			groupname: groupname.toLowerCase().replace(/[^a-z0-9_-]/g, ''),
			description,
			ownerId: user._id,
			inviteCode,
			icon,
			isPublic,
			createdAt: Date.now()
		});

		await ctx.db.insert('group_memberships', {
			userId: user._id,
			groupId,
			role: 'admin',
			status: 'active',
			joinedAt: Date.now()
		});

		return groupId;
	}
});

export const join = mutation({
	args: { inviteCode: v.optional(v.string()), groupId: v.optional(v.id('groups')) },
	handler: async (ctx, { inviteCode, groupId }) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');
		await rateLimiter.limit(ctx, 'joinGroup', { key: user._id, throws: true });

		let group;
		if (inviteCode) {
			group = await ctx.db
				.query('groups')
				.withIndex('by_invite_code', (q) => q.eq('inviteCode', inviteCode))
				.unique();
		} else if (groupId) {
			group = await ctx.db.get(groupId);
		}

		if (!group) throw new Error('Group not found');

		const existingMembership = await ctx.db
			.query('group_memberships')
			.withIndex('by_user_group', (q) => q.eq('userId', user._id).eq('groupId', group._id))
			.unique();

		if (existingMembership) {
			if (existingMembership.status === 'active') return group._id;
			throw new Error('Membership request already pending');
		}

		const status = group.isPublic ? 'active' : 'pending';

		await ctx.db.insert('group_memberships', {
			userId: user._id,
			groupId: group._id,
			role: 'member',
			status,
			joinedAt: Date.now()
		});

		return group._id;
	}
});

export const list = query({
	args: {},
	handler: async (ctx) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return [];

		const memberships = await ctx.db
			.query('group_memberships')
			.withIndex('by_user', (q) => q.eq('userId', user._id))
			.collect();

		const groupsWithStatus = await Promise.all(
			memberships.map(async (m) => {
				const group = await ctx.db.get(m.groupId);
				if (!group) return null;
				return {
					...group,
					membershipStatus: m.status,
					membershipRole: m.role
				};
			})
		);

		return groupsWithStatus.filter((g): g is NonNullable<typeof g> => g !== null);
	}
});

export const get = query({
	args: { groupId: v.id('groups') },
	handler: async (ctx, { groupId }) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return null;

		const group = await ctx.db.get(groupId);
		if (!group) return null;

		const membership = await ctx.db
			.query('group_memberships')
			.withIndex('by_user_group', (q) => q.eq('userId', user._id).eq('groupId', groupId))
			.unique();

		return {
			...group,
			membershipStatus: membership?.status || null,
			membershipRole: membership?.role || null
		};
	}
});

export const searchPublicGroups = query({
	args: { query: v.string() },
	handler: async (ctx, args) => {
		const searchTerm = args.query.toLowerCase();
		if (!searchTerm) return [];

		const publicGroups = await ctx.db
			.query('groups')
			.withIndex('by_public', (q) => q.eq('isPublic', true))
			.collect();

		return publicGroups.filter(
			(g) =>
				g.name.toLowerCase().includes(searchTerm) || g.groupname.toLowerCase().includes(searchTerm)
		);
	}
});

export const getPendingMembers = query({
	args: { groupId: v.id('groups') },
	handler: async (ctx, { groupId }) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		const membership = await ctx.db
			.query('group_memberships')
			.withIndex('by_user_group', (q) => q.eq('userId', user._id).eq('groupId', groupId))
			.unique();

		if (membership?.role !== 'admin') {
			const group = await ctx.db.get(groupId);
			if (group?.ownerId !== user._id) throw new Error('Unauthorized');
		}

		const pending = await ctx.db
			.query('group_memberships')
			.withIndex('by_group_status', (q) => q.eq('groupId', groupId).eq('status', 'pending'))
			.collect();

		return Promise.all(
			pending.map(async (m) => {
				const userDoc = await authComponent.getAnyUserById(ctx, m.userId);
				return {
					...m,
					userName: userDoc?.name || 'Unknown',
					userEmail: userDoc?.email || 'Unknown'
				};
			})
		);
	}
});

export const respondToRequest = mutation({
	args: {
		membershipId: v.id('group_memberships'),
		action: v.union(v.literal('accept'), v.literal('decline'))
	},
	handler: async (ctx, { membershipId, action }) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		const targetMembership = await ctx.db.get(membershipId);
		if (!targetMembership) throw new Error('Membership record not found');

		const adminMembership = await ctx.db
			.query('group_memberships')
			.withIndex('by_user_group', (q) =>
				q.eq('userId', user._id).eq('groupId', targetMembership.groupId)
			)
			.unique();

		if (adminMembership?.role !== 'admin') {
			const group = await ctx.db.get(targetMembership.groupId);
			if (group?.ownerId !== user._id) throw new Error('Unauthorized');
		}

		if (action === 'accept') {
			await ctx.db.patch(membershipId, { status: 'active' });
		} else {
			await ctx.db.delete(membershipId);
		}
	}
});

export const removeMember = mutation({
	args: {
		membershipId: v.id('group_memberships')
	},
	handler: async (ctx, { membershipId }) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		const targetMembership = await ctx.db.get(membershipId);
		if (!targetMembership) throw new Error('Membership record not found');

		const group = await ctx.db.get(targetMembership.groupId);
		if (!group) throw new Error('Group not found');

		// Only admin or owner can remove members
		const adminMembership = await ctx.db
			.query('group_memberships')
			.withIndex('by_user_group', (q) =>
				q.eq('userId', user._id).eq('groupId', targetMembership.groupId)
			)
			.unique();

		if (adminMembership?.role !== 'admin' && group.ownerId !== user._id) {
			throw new Error('Unauthorized');
		}

		// Cannot remove the owner
		if (targetMembership.userId === group.ownerId) {
			throw new Error('Cannot remove the group owner');
		}

		await ctx.db.delete(membershipId);
	}
});

export const getMembers = query({
	args: { groupId: v.id('groups') },
	handler: async (ctx, { groupId }) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return [];

		const membership = await ctx.db
			.query('group_memberships')
			.withIndex('by_user_group', (q) => q.eq('userId', user._id).eq('groupId', groupId))
			.unique();

		if (!membership || membership.status !== 'active') return [];

		const members = await ctx.db
			.query('group_memberships')
			.withIndex('by_group', (q) => q.eq('groupId', groupId))
			.collect();

		return Promise.all(
			members.map(async (m) => {
				const userDoc = await authComponent.getAnyUserById(ctx, m.userId);
				return {
					...m,
					name: userDoc?.name || 'Unknown',
					email: userDoc?.email || 'Unknown'
				};
			})
		);
	}
});

export const updatePrivacy = mutation({
	args: {
		groupId: v.id('groups'),
		isPublic: v.boolean()
	},
	handler: async (ctx, { groupId, isPublic }) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		const group = await ctx.db.get(groupId);
		if (!group) throw new Error('Group not found');

		if (group.ownerId !== user._id) {
			const adminMembership = await ctx.db
				.query('group_memberships')
				.withIndex('by_user_group', (q) => q.eq('userId', user._id).eq('groupId', groupId))
				.unique();
			if (adminMembership?.role !== 'admin') throw new Error('Unauthorized');
		}

		await ctx.db.patch(groupId, { isPublic });
	}
});

export const shareContent = mutation({
	args: {
		groupId: v.id('groups'),
		contentId: v.optional(v.id('content')),
		blogId: v.optional(v.id('blogs')),
		newsId: v.optional(v.id('news')),
		entityId: v.optional(v.id('entities'))
	},
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');
		await rateLimiter.limit(ctx, 'shareContent', { key: user._id, throws: true });

		const membership = await ctx.db
			.query('group_memberships')
			.withIndex('by_user_group', (q) => q.eq('userId', user._id).eq('groupId', args.groupId))
			.unique();

		if (!membership) throw new Error('Not a member of this group');

		// Check if already shared
		let existing = null;
		if (args.contentId) {
			existing = await ctx.db
				.query('group_shared_content')
				.withIndex('by_group', (q) => q.eq('groupId', args.groupId))
				.filter((q) => q.eq(q.field('contentId'), args.contentId))
				.unique();
		} else if (args.blogId) {
			existing = await ctx.db
				.query('group_shared_content')
				.withIndex('by_group', (q) => q.eq('groupId', args.groupId))
				.filter((q) => q.eq(q.field('blogId'), args.blogId))
				.unique();
		} else if (args.newsId) {
			existing = await ctx.db
				.query('group_shared_content')
				.withIndex('by_group', (q) => q.eq('groupId', args.groupId))
				.filter((q) => q.eq(q.field('newsId'), args.newsId))
				.unique();
		} else if (args.entityId) {
			existing = await ctx.db
				.query('group_shared_content')
				.withIndex('by_group', (q) => q.eq('groupId', args.groupId))
				.filter((q) => q.eq(q.field('entityId'), args.entityId))
				.unique();
		}

		if (existing) return existing._id;

		return await ctx.db.insert('group_shared_content', {
			...args,
			sharedById: user._id,
			sharedAt: Date.now()
		});
	}
});

export const unshareContent = mutation({
	args: {
		sharedId: v.id('group_shared_content')
	},
	handler: async (ctx, { sharedId }) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		const shared = await ctx.db.get(sharedId);
		if (!shared) throw new Error('Shared content not found');

		const membership = await ctx.db
			.query('group_memberships')
			.withIndex('by_user_group', (q) => q.eq('userId', user._id).eq('groupId', shared.groupId))
			.unique();

		if (!membership) throw new Error('Not a member of this group');

		// Only sharer or admin/owner can unshare
		if (shared.sharedById !== user._id && membership.role !== 'admin') {
			const group = await ctx.db.get(shared.groupId);
			if (group?.ownerId !== user._id) {
				throw new Error('Not authorized to unshare this content');
			}
		}

		await ctx.db.delete(sharedId);
	}
});

export const getSharedContent = query({
	args: {
		groupId: v.id('groups'),
		type: v.optional(v.union(v.literal('content'), v.literal('blog'), v.literal('news'))),
		sharedBy: v.optional(v.string()),
		search: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return [];

		const membership = await ctx.db
			.query('group_memberships')
			.withIndex('by_user_group', (q) => q.eq('userId', user._id).eq('groupId', args.groupId))
			.unique();

		if (!membership || membership.status !== 'active') return [];

		let query = ctx.db
			.query('group_shared_content')
			.withIndex('by_group', (q) => q.eq('groupId', args.groupId));

		const shared = await query.order('desc').collect();

		let filtered = await Promise.all(
			shared.map(async (item) => {
				if (args.type) {
					if (args.type === 'content' && !item.contentId) return null;
					if (args.type === 'blog' && !item.blogId) return null;
					if (args.type === 'news' && !item.newsId) return null;
				}
				if (args.sharedBy && item.sharedById !== args.sharedBy) return null;

				let details = null;
				if (item.contentId) details = await ctx.db.get(item.contentId);
				else if (item.blogId) details = await ctx.db.get(item.blogId);
				else if (item.newsId) details = await ctx.db.get(item.newsId);
				else if (item.entityId) details = await ctx.db.get(item.entityId);

				if (args.search && details) {
					const searchLower = args.search.toLowerCase();
					const d = details as any;
					const title = d.title || d.snippet || '';
					const body = d.body || d.snippet || '';
					const titleMatch = title.toLowerCase().includes(searchLower);
					const bodyMatch = body.toLowerCase().includes(searchLower);
					if (!titleMatch && !bodyMatch) return null;
				}

				const sharedByUser = await authComponent.getAnyUserById(ctx, item.sharedById);

				return {
					...item,
					details,
					sharedByName: sharedByUser?.name || 'Unknown'
				};
			})
		);

		return filtered.filter((i): i is NonNullable<typeof i> => i !== null);
	}
});

export const getMemberAnalytics = query({
	args: { groupId: v.id('groups') },
	handler: async (ctx, { groupId }) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return null;

		const membership = await ctx.db
			.query('group_memberships')
			.withIndex('by_user_group', (q) => q.eq('userId', user._id).eq('groupId', groupId))
			.unique();

		if (!membership || membership.status !== 'active') return null;

		const memberships = await ctx.db
			.query('group_memberships')
			.withIndex('by_group_status', (q) => q.eq('groupId', groupId).eq('status', 'active'))
			.collect();

		const shared = await ctx.db
			.query('group_shared_content')
			.withIndex('by_group', (q) => q.eq('groupId', groupId))
			.collect();

		const sharedContentIds = new Set(
			shared.map((s) => s.contentId).filter((id): id is Id<'content'> => id !== undefined)
		);

		const totalContent = sharedContentIds.size;
		const knowledgeCount = shared.filter((s) => !!s.contentId).length;
		const newsCount = shared.filter((s) => !!s.newsId).length;
		const blogCount = shared.filter((s) => !!s.blogId).length;

		const memberStats = await Promise.all(
			memberships.map(async (m) => {
				const [progress, userDoc] = await Promise.all([
					ctx.db
						.query('user_content_progress')
						.withIndex('by_user', (q) => q.eq('userId', m.userId))
						.collect(),
					authComponent.getAnyUserById(ctx, m.userId)
				]);

				const completed = progress.filter((p) => sharedContentIds.has(p.contentId)).length;

				return {
					userId: m.userId,
					role: m.role,
					name: userDoc?.name || userDoc?.email || 'Unknown',
					email: userDoc?.email || 'Unknown',
					completed,
					total: totalContent,
					percentage: totalContent > 0 ? (completed / totalContent) * 100 : 0
				};
			})
		);

		return {
			memberStats,
			totalContent,
			knowledgeCount,
			newsCount,
			blogCount
		};
	}
});

export const update = mutation({
	args: {
		groupId: v.id('groups'),
		name: v.string(),
		description: v.optional(v.string())
	},
	handler: async (ctx, { groupId, name, description }) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		const group = await ctx.db.get(groupId);
		if (!group) throw new Error('Group not found');

		if (group.ownerId !== user._id) {
			const adminMembership = await ctx.db
				.query('group_memberships')
				.withIndex('by_user_group', (q) => q.eq('userId', user._id).eq('groupId', groupId))
				.unique();
			if (adminMembership?.role !== 'admin') throw new Error('Unauthorized');
		}

		await ctx.db.patch(groupId, { name, description });
	}
});

export const remove = mutation({
	args: { groupId: v.id('groups') },
	handler: async (ctx, { groupId }) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Not authenticated');

		const group = await ctx.db.get(groupId);
		if (!group) throw new Error('Group not found');

		if (group.ownerId !== user._id) {
			throw new Error('Only the group owner can delete the group');
		}

		// 1. Delete shared content portals
		const shared = await ctx.db
			.query('group_shared_content')
			.withIndex('by_group', (q) => q.eq('groupId', groupId))
			.collect();
		for (const s of shared) await ctx.db.delete(s._id);

		// 2. Delete scoped content interactions
		const contentComments = await ctx.db
			.query('content_comments')
			.withIndex('by_group', (q) => q.eq('groupId', groupId))
			.collect();
		for (const c of contentComments) await ctx.db.delete(c._id);

		const contentReactions = await ctx.db
			.query('content_reactions')
			.withIndex('by_group', (q) => q.eq('groupId', groupId))
			.collect();
		for (const r of contentReactions) await ctx.db.delete(r._id);

		const contentCommentReactions = await ctx.db
			.query('content_comment_reactions')
			.withIndex('by_group', (q) => q.eq('groupId', groupId))
			.collect();
		for (const cr of contentCommentReactions) await ctx.db.delete(cr._id);

		// 3. Delete scoped blog interactions
		const blogComments = await ctx.db
			.query('blog_comments')
			.withIndex('by_group', (q) => q.eq('groupId', groupId))
			.collect();
		for (const bc of blogComments) await ctx.db.delete(bc._id);

		const blogReactions = await ctx.db
			.query('blog_reactions')
			.withIndex('by_group', (q) => q.eq('groupId', groupId))
			.collect();
		for (const br of blogReactions) await ctx.db.delete(br._id);

		const blogCommentReactions = await ctx.db
			.query('comment_reactions')
			.withIndex('by_group', (q) => q.eq('groupId', groupId))
			.collect();
		for (const bcr of blogCommentReactions) await ctx.db.delete(bcr._id);

		// 4. Delete group chat messages and reactions
		const chatReactions = await ctx.db
			.query('group_chat_reactions')
			.withIndex('by_group', (q) => q.eq('groupId', groupId))
			.collect();
		for (const reaction of chatReactions) await ctx.db.delete(reaction._id);

		const chatMessages = await ctx.db
			.query('group_chat_messages')
			.withIndex('by_group_created_at', (q) => q.eq('groupId', groupId))
			.collect();
		for (const message of chatMessages) await ctx.db.delete(message._id);

		// 5. Delete memberships
		const memberships = await ctx.db
			.query('group_memberships')
			.withIndex('by_group', (q) => q.eq('groupId', groupId))
			.collect();
		for (const m of memberships) await ctx.db.delete(m._id);

		// 6. Finally, delete the group itself
		await ctx.db.delete(groupId);
	}
});
