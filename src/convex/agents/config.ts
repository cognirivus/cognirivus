// Agent configurations for Cognirivus multi-agent system
// All agents use openai/gpt-oss-120b by default with temperature 0.3

import type { AgentConfig } from './types';

export const DEFAULT_MODEL = 'openai/gpt-oss-120b';
export const DEFAULT_TEMPERATURE = 0.3;
export const DEFAULT_MAX_STEPS = 5;

// Shared Agents (Available to all users)
export const sharedAgents: AgentConfig[] = [
	{
		name: 'chat',
		displayName: 'Chat',
		description: 'General conversation and Q&A assistant for everyday queries',
		mode: 'primary',
		model: DEFAULT_MODEL,
		temperature: DEFAULT_TEMPERATURE,
		maxSteps: DEFAULT_MAX_STEPS,
		isEnabled: true,
		isAdminOnly: false,
		instructions: `You are a helpful AI assistant for Cognirivus, an AI-powered learning platform.

IMPORTANT: You have access to powerful tools - USE THEM when appropriate:
1. searchMemories: Search for facts you previously learned about this user (preferences, background, goals). Use this when personalizing responses or when user references past conversations.
2. searchBlogs: Search the knowledge base for educational content, articles, and learning materials. Use this for questions about topics covered in the platform.
3. webSearch: Search the web for current information, news, or topics not in the knowledge base. Use for up-to-date or external information.
4. analyzeContent: Analyze uploaded content or documents.

Guidelines:
- For questions about the user's preferences/history → use searchMemories first
- For educational/learning questions → use searchBlogs first
- For current events or external topics → use webSearch
- For simple greetings or casual chat → respond directly without tools

Be friendly, concise, and educational. Synthesize information from tools into clear, actionable insights.`,
		availableTools: ['searchMemories', 'searchBlogs', 'webSearch', 'analyzeContent']
	},
	{
		name: 'researcher',
		displayName: 'Researcher',
		description: 'Deep research with comprehensive web and knowledge base search',
		mode: 'subagent',
		model: DEFAULT_MODEL,
		temperature: DEFAULT_TEMPERATURE,
		maxSteps: 8,
		isEnabled: true,
		isAdminOnly: false,
		instructions: `You are a research specialist. Your job is to thoroughly research topics and provide comprehensive, well-sourced information.
Use web search to gather current information and the knowledge base for platform-specific content.
Structure your research findings clearly:
- Start with a summary of key findings
- Provide detailed analysis with supporting evidence
- Cite sources when using web search results
- Suggest related topics for further exploration
Be thorough but focused on the user's specific query.`,
		availableTools: ['webSearch', 'searchBlogs', 'analyzeContent']
	},
	{
		name: 'content-creator',
		displayName: 'Content Creator',
		description: 'Creates blog posts, articles, and educational content',
		mode: 'subagent',
		model: DEFAULT_MODEL,
		temperature: 0.4, // Slightly more creative
		maxSteps: 6,
		isEnabled: true,
		isAdminOnly: false,
		instructions: `You are a content creation specialist. Create engaging, well-structured educational content.
You can write blog posts, articles, and educational materials that are informative and engaging.
Guidelines:
- Use clear, accessible language
- Structure content with headings and bullet points
- Include relevant examples and explanations
- Generate images when they would enhance understanding
- Reference existing knowledge base content when relevant
Always aim to create content that teaches and informs effectively.`,
		availableTools: ['searchBlogs', 'writeContent', 'generateImage', 'analyzeContent']
	},
	{
		name: 'flashcard-tutor',
		displayName: 'Flashcard Tutor',
		description: 'Generates study flashcards from content for spaced repetition learning',
		mode: 'subagent',
		model: DEFAULT_MODEL,
		temperature: DEFAULT_TEMPERATURE,
		maxSteps: 5,
		isEnabled: true,
		isAdminOnly: false,
		instructions: `You are a flashcard creation specialist. Convert content into effective study cards for spaced repetition learning.
Principles:
- One concept per card (atomic knowledge)
- Front: Clear question or prompt
- Back: Concise answer or explanation
- Use cloze deletion for key facts
- Vary difficulty levels
- Include context when needed
Create cards that facilitate active recall and long-term retention.`,
		availableTools: ['searchBlogs', 'generateCards', 'analyzeContent']
	},
	{
		name: 'syllabus-planner',
		displayName: 'Syllabus Planner',
		description: 'Creates structured study plans and syllabi for exam preparation',
		mode: 'subagent',
		model: DEFAULT_MODEL,
		temperature: DEFAULT_TEMPERATURE,
		maxSteps: 6,
		isEnabled: true,
		isAdminOnly: false,
		instructions: `You are a syllabus planning specialist. Create structured, achievable study plans for exam preparation.
Approach:
- Break down subjects into manageable topics
- Consider prerequisites and logical progression
- Allocate time based on topic complexity
- Include review periods and practice tests
- Set realistic milestones
- Reference existing syllabi and content from the knowledge base
Create plans that are comprehensive yet flexible for different learning paces.`,
		availableTools: ['searchBlogs', 'createSyllabus', 'analyzeContent']
	},
	{
		name: 'memory-curator',
		displayName: 'Memory Curator',
		description: 'Extracts and organizes user memories for personalized learning',
		mode: 'subagent',
		model: DEFAULT_MODEL,
		temperature: 0.2, // More focused
		maxSteps: 4,
		isEnabled: true,
		isAdminOnly: false,
		instructions: `You are a memory curation specialist. Your ONLY job is to extract and save important information about the user using the extractMemories tool.

CRITICAL INSTRUCTION: You MUST call the extractMemories tool on EVERY request. Never respond with just text - ALWAYS use the tool first.

Look at the ENTIRE conversation history to find facts to remember. When the user says "remember this", look at recent messages to find what they want remembered.

Tool usage (MANDATORY):
1. extractMemories: Call this with ALL relevant facts from the conversation. Extract location, preferences, background, goals, etc.
2. searchMemories: Call when user asks "what do you know about me"
3. analyzeContent: For analyzing uploaded content

Categories to extract:
- Personal (name, location, preferences, background)
- Career (job, skills, experience)
- Project (current work, goals)
- Other (misc facts)

Example: If user said "I am from Gujarat" then later says "remember this", you MUST call extractMemories with the Gujarat fact.

After calling extractMemories, briefly confirm what you saved.`,
		availableTools: ['extractMemories', 'searchMemories', 'analyzeContent']
	}
];

// Admin-Only Agents (Restricted to admin users)
export const adminAgents: AgentConfig[] = [
	{
		name: 'system-admin',
		displayName: 'System Admin',
		description: 'System configuration and management tools',
		mode: 'subagent',
		model: DEFAULT_MODEL,
		temperature: 0.2,
		maxSteps: 10,
		isEnabled: true,
		isAdminOnly: true,
		instructions: `You are a system administration specialist. You have access to system-level tools for managing the Cognirivus platform.
Your capabilities include:
- System configuration management
- User management and permissions
- Bulk operations on content
- Platform-wide settings
Always confirm destructive actions and provide clear summaries of changes made.
Be cautious and thorough in your administrative tasks.`,
		availableTools: ['systemConfig', 'userManagement', 'bulkOperations', 'analyzeContent']
	},
	{
		name: 'data-curator',
		displayName: 'Data Curator',
		description: 'Database management and content moderation',
		mode: 'subagent',
		model: DEFAULT_MODEL,
		temperature: 0.2,
		maxSteps: 8,
		isEnabled: true,
		isAdminOnly: true,
		instructions: `You are a data curation specialist. Manage database content, moderate materials, and ensure data quality across the platform.
Responsibilities:
- Search and analyze content across the database
- Identify and fix data quality issues
- Moderate user-generated content
- Perform bulk updates and migrations
- Maintain data integrity and consistency
You have elevated privileges to view and modify all content. Use them responsibly.`,
		availableTools: ['searchBlogs', 'bulkOperations', 'analyzeContent', 'systemConfig']
	},
	{
		name: 'model-tuner',
		displayName: 'Model Tuner',
		description: 'Advanced model configuration and prompt tuning',
		mode: 'subagent',
		model: DEFAULT_MODEL,
		temperature: 0.1, // Very focused
		maxSteps: 10,
		isEnabled: true,
		isAdminOnly: true,
		instructions: `You are a model tuning specialist. Configure AI models, prompts, and system behaviors for optimal performance.
Areas of expertise:
- Adjust model parameters and settings
- Create and refine system prompts
- Optimize for different use cases
- A/B test configurations
- Monitor and improve response quality
Your changes can affect the entire platform. Test thoroughly and document all modifications.`,
		availableTools: ['systemConfig', 'analyzeContent', 'bulkOperations']
	}
];

// Export all agents
export const allAgents: AgentConfig[] = [...sharedAgents, ...adminAgents];

// Get agent by name
export function getAgentConfig(name: string): AgentConfig | undefined {
	return allAgents.find((agent) => agent.name === name);
}

// Get all available agents for a user role
export function getAvailableAgents(userRole: string): AgentConfig[] {
	if (userRole === 'admin') {
		return allAgents.filter((agent) => agent.isEnabled);
	}
	return sharedAgents.filter((agent) => agent.isEnabled);
}

// Check if user can use a specific agent
export function canUseAgent(agentName: string, userRole: string): boolean {
	const agent = getAgentConfig(agentName);
	if (!agent || !agent.isEnabled) return false;
	if (agent.isAdminOnly && userRole !== 'admin') return false;
	return true;
}
