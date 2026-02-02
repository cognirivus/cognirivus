import { mutation } from '../_generated/server';
import { v, ConvexError } from 'convex/values';
import { authComponent } from '../auth';
import { getUserRole } from './lib/permissions';

const ADMIN_ROLE = 'admin';

/**
 * Check if the current user is an admin.
 */
async function requireAdmin(ctx: any) {
	const user = await authComponent.getAuthUser(ctx);
	if (!user) {
		throw new ConvexError('Not authenticated');
	}
	const userRole = getUserRole(user);
	if (userRole !== ADMIN_ROLE) {
		throw new ConvexError('Admin privileges required');
	}
	return user;
}

/**
 * Create a new agent (admin only).
 *
 * @param name - Unique identifier for the agent
 * @param displayName - Human-readable name
 * @param description - Description of the agent's purpose
 * @param mode - 'primary' or 'subagent'
 * @param model - The LLM model to use
 * @param temperature - Temperature setting (0-1)
 * @param instructions - System instructions/prompt
 * @param maxSteps - Maximum reasoning steps
 * @param availableTools - Array of tool names the agent can use
 * @param isAdminOnly - Whether this agent is restricted to admins
 * @returns The ID of the created agent
 */
export const createAgent = mutation({
	args: {
		name: v.string(),
		displayName: v.string(),
		description: v.string(),
		mode: v.union(v.literal('primary'), v.literal('subagent')),
		model: v.string(),
		temperature: v.number(),
		instructions: v.string(),
		maxSteps: v.number(),
		availableTools: v.array(v.string()),
		isAdminOnly: v.optional(v.boolean())
	},
	returns: v.id('agents'),
	handler: async (ctx, args) => {
		await requireAdmin(ctx);

		const existing = await ctx.db
			.query('agents')
			.withIndex('by_name', (q) => q.eq('name', args.name))
			.unique();

		if (existing) {
			throw new ConvexError(`Agent with name '${args.name}' already exists`);
		}

		const now = Date.now();
		const agentId = await ctx.db.insert('agents', {
			...args,
			isAdminOnly: args.isAdminOnly || false,
			isEnabled: true,
			createdAt: now,
			updatedAt: now
		});

		return agentId;
	}
});

/**
 * Update an agent's configuration (admin only).
 *
 * @param name - The unique name of the agent to update
 * @param updates - Object containing fields to update
 * @returns null
 */
export const updateAgent = mutation({
	args: {
		name: v.string(),
		updates: v.object({
			displayName: v.optional(v.string()),
			description: v.optional(v.string()),
			mode: v.optional(v.union(v.literal('primary'), v.literal('subagent'))),
			model: v.optional(v.string()),
			temperature: v.optional(v.number()),
			instructions: v.optional(v.string()),
			maxSteps: v.optional(v.number()),
			availableTools: v.optional(v.array(v.string())),
			isAdminOnly: v.optional(v.boolean())
		})
	},
	returns: v.null(),
	handler: async (ctx, { name, updates }) => {
		await requireAdmin(ctx);

		const agent = await ctx.db
			.query('agents')
			.withIndex('by_name', (q) => q.eq('name', name))
			.unique();

		if (!agent) {
			throw new ConvexError(`Agent '${name}' not found`);
		}

		await ctx.db.patch(agent._id, {
			...updates,
			updatedAt: Date.now()
		});

		return null;
	}
});

/**
 * Toggle an agent's enabled status (admin only).
 *
 * @param name - The unique name of the agent
 * @returns The new enabled status
 */
export const toggleAgent = mutation({
	args: { name: v.string() },
	returns: v.boolean(),
	handler: async (ctx, { name }) => {
		await requireAdmin(ctx);

		const agent = await ctx.db
			.query('agents')
			.withIndex('by_name', (q) => q.eq('name', name))
			.unique();

		if (!agent) {
			throw new ConvexError(`Agent '${name}' not found`);
		}

		const newStatus = !agent.isEnabled;
		await ctx.db.patch(agent._id, {
			isEnabled: newStatus,
			updatedAt: Date.now()
		});

		return newStatus;
	}
});

/**
 * Delete an agent (admin only).
 *
 * @param name - The unique name of the agent to delete
 * @returns null
 */
export const deleteAgent = mutation({
	args: { name: v.string() },
	returns: v.null(),
	handler: async (ctx, { name }) => {
		await requireAdmin(ctx);

		const agent = await ctx.db
			.query('agents')
			.withIndex('by_name', (q) => q.eq('name', name))
			.unique();

		if (!agent) {
			throw new ConvexError(`Agent '${name}' not found`);
		}

		await ctx.db.delete(agent._id);
		return null;
	}
});
