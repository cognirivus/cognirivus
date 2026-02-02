/**
 * Agent Utilities
 *
 * Shared functions for working with agents across the frontend.
 */

// ============================================================================
// Agent Display Names
// ============================================================================

export const AGENT_DISPLAY_NAMES: Record<string, string> = {
	chat: 'Chat',
	researcher: 'Researcher',
	'content-creator': 'Content Creator',
	'flashcard-tutor': 'Flashcard Tutor',
	'syllabus-planner': 'Syllabus Planner',
	'memory-curator': 'Memory Curator',
	'system-admin': 'System Admin',
	'data-curator': 'Data Curator',
	'model-tuner': 'Model Tuner'
};

/**
 * Get a human-readable display name for an agent.
 */
export function getAgentDisplayName(agentName: string): string {
	return AGENT_DISPLAY_NAMES[agentName] || formatAgentName(agentName);
}

/**
 * Format an agent name by capitalizing and replacing hyphens.
 */
function formatAgentName(name: string): string {
	return name
		.split('-')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

// ============================================================================
// Model Formatting
// ============================================================================

/**
 * Format a model ID for display.
 * E.g., "openai/gpt-4o" -> "GPT-4o"
 */
export function formatModelName(modelId: string): string {
	if (!modelId) return 'Unknown';

	// Extract the model name after the provider prefix
	const parts = modelId.split('/');
	const modelName = parts[parts.length - 1];

	// Special cases for known models
	const specialCases: Record<string, string> = {
		'gpt-4o': 'GPT-4o',
		'gpt-4o-mini': 'GPT-4o Mini',
		'gpt-4': 'GPT-4',
		'gpt-3.5-turbo': 'GPT-3.5 Turbo',
		'claude-3-opus': 'Claude 3 Opus',
		'claude-3-sonnet': 'Claude 3 Sonnet',
		'claude-3-haiku': 'Claude 3 Haiku',
		'gemini-2.5-flash': 'Gemini 2.5 Flash',
		'gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite',
		'gemini-pro': 'Gemini Pro'
	};

	// Check for partial matches
	for (const [key, value] of Object.entries(specialCases)) {
		if (modelName.includes(key)) {
			return value;
		}
	}

	// Default: capitalize first letter
	return modelName.charAt(0).toUpperCase() + modelName.slice(1);
}

// ============================================================================
// Cost Formatting
// ============================================================================

/**
 * Format a cost value for display.
 */
export function formatCost(cost: number): string {
	if (cost === 0) return 'Free';
	if (cost < 0.0001) return '<$0.0001';
	if (cost < 0.01) return `$${cost.toFixed(4)}`;
	if (cost < 1) return `$${cost.toFixed(3)}`;
	return `$${cost.toFixed(2)}`;
}

/**
 * Format token counts for display.
 */
export function formatTokens(tokens: number): string {
	if (tokens < 1000) return tokens.toString();
	if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K`;
	return `${(tokens / 1000000).toFixed(2)}M`;
}

// ============================================================================
// Agent Status
// ============================================================================

export type AgentStatus = 'idle' | 'running' | 'completed' | 'error';

export const STATUS_COLORS: Record<AgentStatus, string> = {
	idle: 'bg-muted text-muted-foreground',
	running: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
	completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300',
	error: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
};

export const STATUS_LABELS: Record<AgentStatus, string> = {
	idle: 'Idle',
	running: 'Running',
	completed: 'Completed',
	error: 'Error'
};

/**
 * Get the color class for a status.
 */
export function getStatusColor(status: AgentStatus): string {
	return STATUS_COLORS[status] || STATUS_COLORS.idle;
}

/**
 * Get the label for a status.
 */
export function getStatusLabel(status: AgentStatus): string {
	return STATUS_LABELS[status] || 'Unknown';
}

// ============================================================================
// Tool Categories
// ============================================================================

export const TOOL_CATEGORIES = [
	'Memory',
	'Content',
	'Learning',
	'Search',
	'Media',
	'Admin'
] as const;

export type ToolCategory = (typeof TOOL_CATEGORIES)[number];

export const TOOL_CATEGORY_ICONS: Record<ToolCategory, string> = {
	Memory: 'brain',
	Content: 'file-text',
	Learning: 'graduation-cap',
	Search: 'search',
	Media: 'image',
	Admin: 'shield'
};
