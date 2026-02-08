import { query, internalQuery } from '../_generated/server';
import { v } from 'convex/values';
import { authComponent } from '../auth';
import { filterAgentsByRole, getUserRole } from './lib/permissions';

const agentConfigValidator = v.object({
	name: v.string(),
	displayName: v.string(),
	description: v.string(),
	mode: v.union(v.literal('primary'), v.literal('subagent')),
	model: v.string(),
	temperature: v.number(),
	instructions: v.string(),
	maxSteps: v.number(),
	isEnabled: v.boolean(),
	isAdminOnly: v.boolean(),
	availableTools: v.array(v.string())
});

/**
 * List all agents, filtered by user role.
 * Admins see all agents, regular users see only non-admin agents.
 *
 * @returns Array of agents the user has access to
 */
export const list = query({
	args: {},
	returns: v.array(
		v.object({
			_id: v.id('agents'),
			name: v.string(),
			displayName: v.string(),
			description: v.string(),
			mode: v.union(v.literal('primary'), v.literal('subagent')),
			model: v.string(),
			temperature: v.number(),
			instructions: v.string(),
			maxSteps: v.number(),
			isEnabled: v.boolean(),
			isAdminOnly: v.boolean(),
			availableTools: v.array(v.string()),
			createdAt: v.number(),
			updatedAt: v.number()
		})
	),
	handler: async (ctx) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return [];

		const userRole = getUserRole(user);
		const allAgents = await ctx.db.query('agents').collect();

		return filterAgentsByRole(allAgents, userRole);
	}
});

/**
 * Get a single agent by name.
 *
 * @param name - The unique name of the agent
 * @returns The agent document or null if not found or not accessible
 */
export const get = query({
	args: { name: v.string() },
	returns: v.union(
		v.object({
			_id: v.id('agents'),
			name: v.string(),
			displayName: v.string(),
			description: v.string(),
			mode: v.union(v.literal('primary'), v.literal('subagent')),
			model: v.string(),
			temperature: v.number(),
			instructions: v.string(),
			maxSteps: v.number(),
			isEnabled: v.boolean(),
			isAdminOnly: v.boolean(),
			availableTools: v.array(v.string()),
			createdAt: v.number(),
			updatedAt: v.number()
		}),
		v.null()
	),
	handler: async (ctx, { name }) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return null;

		const userRole = getUserRole(user);
		const agent = await ctx.db
			.query('agents')
			.withIndex('by_name', (q) => q.eq('name', name))
			.unique();

		if (!agent) return null;
		if (!agent.isEnabled) return null;
		if (agent.isAdminOnly && userRole !== 'admin') return null;

		return agent;
	}
});

/**
 * List only enabled agents for the current user.
 * More efficient than list() when you only need active agents.
 *
 * @returns Array of enabled agents the user has access to
 */
export const listEnabled = query({
	args: {},
	returns: v.array(
		v.object({
			_id: v.id('agents'),
			name: v.string(),
			displayName: v.string(),
			description: v.string(),
			mode: v.union(v.literal('primary'), v.literal('subagent')),
			model: v.string(),
			temperature: v.number(),
			instructions: v.string(),
			maxSteps: v.number(),
			isEnabled: v.boolean(),
			isAdminOnly: v.boolean(),
			availableTools: v.array(v.string()),
			createdAt: v.number(),
			updatedAt: v.number()
		})
	),
	handler: async (ctx) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return [];

		const userRole = getUserRole(user);
		let agents;

		if (userRole === 'admin') {
			agents = await ctx.db
				.query('agents')
				.withIndex('by_enabled', (q) => q.eq('isEnabled', true))
				.collect();
		} else {
			agents = await ctx.db
				.query('agents')
				.withIndex('by_enabled_and_admin_only', (q) =>
					q.eq('isEnabled', true).eq('isAdminOnly', false)
				)
				.collect();
		}

		return agents;
	}
});

/**
 * Internal: Get an agent config by name (no auth checks).
 *
 * @param name - The unique name of the agent
 * @returns The agent config or null if not found
 */
export const internalGetConfigByName = internalQuery({
	args: { name: v.string() },
	returns: v.union(agentConfigValidator, v.null()),
	handler: async (ctx, { name }) => {
		const agent = await ctx.db
			.query('agents')
			.withIndex('by_name', (q) => q.eq('name', name))
			.unique();

		if (!agent) return null;

		return {
			name: agent.name,
			displayName: agent.displayName,
			description: agent.description,
			mode: agent.mode,
			model: agent.model,
			temperature: agent.temperature,
			instructions: agent.instructions,
			maxSteps: agent.maxSteps,
			isEnabled: agent.isEnabled,
			isAdminOnly: agent.isAdminOnly,
			availableTools: agent.availableTools
		};
	}
});

/**
 * Internal: List all agent configs (no auth checks).
 *
 * @returns Array of agent configs
 */
export const internalListAllConfigs = internalQuery({
	args: {},
	returns: v.array(agentConfigValidator),
	handler: async (ctx) => {
		const agents = await ctx.db.query('agents').collect();

		return agents.map((agent) => ({
			name: agent.name,
			displayName: agent.displayName,
			description: agent.description,
			mode: agent.mode,
			model: agent.model,
			temperature: agent.temperature,
			instructions: agent.instructions,
			maxSteps: agent.maxSteps,
			isEnabled: agent.isEnabled,
			isAdminOnly: agent.isAdminOnly,
			availableTools: agent.availableTools
		}));
	}
});

/**
 * Internal: List enabled agent configs for a role (no auth checks).
 *
 * @param userRole - The role to filter by
 * @returns Array of enabled agent configs visible to this role
 */
export const internalListEnabledForRole = internalQuery({
	args: { userRole: v.string() },
	returns: v.array(agentConfigValidator),
	handler: async (ctx, { userRole }) => {
		let agents;

		if (userRole === 'admin') {
			agents = await ctx.db
				.query('agents')
				.withIndex('by_enabled', (q) => q.eq('isEnabled', true))
				.collect();
		} else {
			agents = await ctx.db
				.query('agents')
				.withIndex('by_enabled_and_admin_only', (q) =>
					q.eq('isEnabled', true).eq('isAdminOnly', false)
				)
				.collect();
		}

		return agents.map((agent) => ({
			name: agent.name,
			displayName: agent.displayName,
			description: agent.description,
			mode: agent.mode,
			model: agent.model,
			temperature: agent.temperature,
			instructions: agent.instructions,
			maxSteps: agent.maxSteps,
			isEnabled: agent.isEnabled,
			isAdminOnly: agent.isAdminOnly,
			availableTools: agent.availableTools
		}));
	}
});
