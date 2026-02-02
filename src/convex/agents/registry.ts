// Agent registry - creates and manages all agent instances
import { BaseAgent } from './lib/base';
import { allAgents } from './config';
import { getToolRegistry } from '../tools/registry';
import type { AgentConfig } from './types';

// Registry of agent instances
const agentRegistry = new Map<string, BaseAgent>();

/**
 * Initialize all agents with their configurations and tools
 */
export function initializeAgents(): void {
	const tools = getToolRegistry();

	for (const config of allAgents) {
		const agent = createAgent(config, tools);
		agentRegistry.set(config.name, agent);
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
export function getAgent(name: string): BaseAgent | undefined {
	if (agentRegistry.size === 0) {
		initializeAgents();
	}
	return agentRegistry.get(name);
}

/**
 * Get all registered agents
 */
export function getAllAgents(): BaseAgent[] {
	if (agentRegistry.size === 0) {
		initializeAgents();
	}
	return Array.from(agentRegistry.values());
}

/**
 * Check if an agent exists
 */
export function hasAgent(name: string): boolean {
	if (agentRegistry.size === 0) {
		initializeAgents();
	}
	return agentRegistry.has(name);
}

/**
 * Clear registry (useful for testing)
 */
export function clearRegistry(): void {
	agentRegistry.clear();
}
