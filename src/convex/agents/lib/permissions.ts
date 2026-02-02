// RBAC Permissions library for the multi-agent system
import { ConvexError } from 'convex/values';
import type { ActionCtx } from '../../_generated/server';
import { getAgentConfig } from '../config';

export interface PermissionCheck {
	allowed: boolean;
	reason?: string;
	allowedTools?: string[];
	maxSteps?: number;
}

/**
 * Check if a user can use a specific agent
 */
export async function checkAgentPermission(
	ctx: ActionCtx,
	agentName: string,
	userRole: string
): Promise<PermissionCheck> {
	const agent = getAgentConfig(agentName);

	if (!agent) {
		return { allowed: false, reason: 'Agent not found' };
	}

	if (!agent.isEnabled) {
		return { allowed: false, reason: 'Agent is disabled' };
	}

	// Check admin-only restriction
	if (agent.isAdminOnly && userRole !== 'admin') {
		return { allowed: false, reason: 'This agent requires admin privileges' };
	}

	return {
		allowed: true,
		allowedTools: agent.availableTools,
		maxSteps: agent.maxSteps
	};
}

/**
 * Check if a user can use a specific tool with an agent
 */
export function checkToolPermission(
	toolName: string,
	agentName: string,
	userRole: string
): { allowed: boolean; reason?: string } {
	const agent = getAgentConfig(agentName);

	if (!agent) {
		return { allowed: false, reason: 'Agent not found' };
	}

	// Check if tool is in agent's available tools
	if (!agent.availableTools.includes(toolName)) {
		return { allowed: false, reason: `Tool ${toolName} not available for agent ${agentName}` };
	}

	// Check admin-only tools
	const adminOnlyTools = ['systemConfig', 'userManagement', 'bulkOperations'];
	if (adminOnlyTools.includes(toolName) && userRole !== 'admin') {
		return { allowed: false, reason: `Tool ${toolName} requires admin privileges` };
	}

	return { allowed: true };
}

/**
 * Get user role from user object
 */
export function getUserRole(user: any): string {
	if (!user?.role) return 'regular';
	if (Array.isArray(user.role)) {
		return user.role.includes('admin') ? 'admin' : 'regular';
	}
	return user.role === 'admin' ? 'admin' : 'regular';
}

/**
 * Assert permission or throw ConvexError
 */
export function assertPermission(check: PermissionCheck): void {
	if (!check.allowed) {
		throw new ConvexError(check.reason || 'Permission denied');
	}
}

/**
 * Filter agents by user role
 */
export function filterAgentsByRole(agents: any[], userRole: string): any[] {
	return agents.filter((agent) => {
		if (!agent.isEnabled) return false;
		if (agent.isAdminOnly && userRole !== 'admin') return false;
		return true;
	});
}
