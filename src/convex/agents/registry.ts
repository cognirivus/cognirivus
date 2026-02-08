// Agent registry - creates and manages all agent instances
import { BaseAgent } from './lib/base';
import { getToolRegistry } from '../tools/registry';
import type { AgentConfig } from './types';
import type { ActionCtx } from '../_generated/server';
import { internal } from '../_generated/api';
import { initializeDefaultMiddleware } from '../tools/middleware';

// Registry of agent instances
const agentRegistry = new Map<string, BaseAgent>();
const CACHE_TTL_MS = 60000;
let registryLoadedAt = 0;

/**
 * Initialize all agents with their configurations and tools
 */
export async function initializeAgents(ctx: ActionCtx): Promise<void> {
	initializeDefaultMiddleware();

	const configs = await ctx.runQuery(internal.agents.queries.internalListAllConfigs, {});

	const tools = getToolRegistry();

	agentRegistry.clear();
	for (const config of configs) {
		const agent = createAgent(config, tools);
		agentRegistry.set(config.name, agent);
	}

	if (configs.length === 0) {
		console.warn('[Agents] No agent configs found in DB. Agent registry is empty.');
	}

	registryLoadedAt = Date.now();
}

async function ensureAgentsLoaded(ctx: ActionCtx): Promise<void> {
	if (agentRegistry.size === 0 || Date.now() - registryLoadedAt > CACHE_TTL_MS) {
		await initializeAgents(ctx);
	}
}

/**
 * Create a single agent instance
 */
function createAgent(config: AgentConfig, allTools: Map<string, any>): BaseAgent {
	// Filter tools to only those available to this agent
	const agentTools = new Map<string, any>();
	for (const toolName of config.availableTools) {
		const tool = allTools.get(toolName);
		if (tool) {
			agentTools.set(toolName, tool);
		}
	}

	// Create and return the agent
	return new BaseAgent(config, agentTools);
}

/**
 * Get an agent by name
 */
export async function getAgent(ctx: ActionCtx, name: string): Promise<BaseAgent | undefined> {
	await ensureAgentsLoaded(ctx);
	return agentRegistry.get(name);
}

/**
 * Get all registered agents
 */
export async function getAllAgents(ctx: ActionCtx): Promise<BaseAgent[]> {
	await ensureAgentsLoaded(ctx);
	return Array.from(agentRegistry.values());
}

/**
 * Check if an agent exists
 */
export async function hasAgent(ctx: ActionCtx, name: string): Promise<boolean> {
	await ensureAgentsLoaded(ctx);
	return agentRegistry.has(name);
}

/**
 * Clear registry (useful for testing)
 */
export function clearRegistry(): void {
	agentRegistry.clear();
}
