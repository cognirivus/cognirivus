// Tool registry - manages all available tools for agents
import type { ToolDefinition } from './types';

// Import all tools
import { searchMemoriesTool } from './searchMemories';
import { searchBlogsTool } from './searchBlogs';
import { webSearchTool } from './webSearch';
import { generateImageTool } from './generateImage';
import { analyzeContentTool } from './analyzeContent';
import { createSyllabusTool } from './createSyllabus';
import { generateCardsTool } from './generateCards';
import { writeContentTool } from './writeContent';
import { extractMemoriesTool } from './extractMemories';
import { systemConfigTool } from './systemConfig';
import { userManagementTool } from './userManagement';
import { bulkOperationsTool } from './bulkOperations';

// Registry map
const toolRegistry = new Map<string, ToolDefinition>();

/**
 * Initialize the tool registry with all available tools
 */
export function initializeTools(): void {
	const tools: ToolDefinition[] = [
		searchMemoriesTool,
		searchBlogsTool,
		webSearchTool,
		generateImageTool,
		analyzeContentTool,
		createSyllabusTool,
		generateCardsTool,
		writeContentTool,
		extractMemoriesTool,
		systemConfigTool,
		userManagementTool,
		bulkOperationsTool
	];

	for (const tool of tools) {
		toolRegistry.set(tool.name, tool);
	}
}

/**
 * Get a tool by name
 */
export function getTool(name: string): ToolDefinition | undefined {
	if (toolRegistry.size === 0) {
		initializeTools();
	}
	return toolRegistry.get(name);
}

/**
 * Get the tool registry as a Map for agent initialization
 * Returns full ToolDefinition objects (not just handlers)
 */
export function getToolRegistry(): Map<string, ToolDefinition> {
	if (toolRegistry.size === 0) {
		initializeTools();
	}
	return new Map(toolRegistry);
}

/**
 * Get all tool definitions
 */
export function getAllTools(): ToolDefinition[] {
	if (toolRegistry.size === 0) {
		initializeTools();
	}
	return Array.from(toolRegistry.values());
}

/**
 * Check if a tool exists
 */
export function hasTool(name: string): boolean {
	if (toolRegistry.size === 0) {
		initializeTools();
	}
	return toolRegistry.has(name);
}
