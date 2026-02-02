import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { authComponent } from './auth';

const checkAdmin = async (ctx: any) => {
	const user = await authComponent.getAuthUser(ctx);
	const isAdmin =
		user?.role && (Array.isArray(user.role) ? user.role.includes('admin') : user.role === 'admin');
	if (!isAdmin) throw new Error('Unauthorized: Admin access required');
	return user;
};

/**
 * Lists all task configurations.
 */
export const listConfigs = query({
	args: {},
	handler: async (ctx) => {
		await checkAdmin(ctx);
		return await ctx.db.query('task_configs').collect();
	}
});

/**
 * Gets a specific task configuration.
 * Publicly accessible (or user-accessible) as it's needed by various actions.
 */
export const getConfig = query({
	args: { task: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query('task_configs')
			.withIndex('by_task', (q) => q.eq('task', args.task))
			.unique();
	}
});

/**
 * Updates or creates a task configuration.
 */
export const updateConfig = mutation({
	args: {
		task: v.string(),
		modelId: v.string(),
		temperature: v.optional(v.number()),
		maxTokens: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		await checkAdmin(ctx);
		const { task, ...config } = args;

		const existing = await ctx.db
			.query('task_configs')
			.withIndex('by_task', (q) => q.eq('task', task))
			.unique();

		if (existing) {
			await ctx.db.patch(existing._id, {
				...config,
				updatedAt: Date.now()
			});
		} else {
			await ctx.db.insert('task_configs', {
				task,
				...config,
				updatedAt: Date.now()
			});
		}
	}
});
