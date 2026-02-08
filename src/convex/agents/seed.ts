// Seed function to populate initial agents and intent rules
import { mutation } from '../_generated/server';
import { allAgents } from './config';
import { v } from 'convex/values';

export const seedAgents = mutation({
	args: {},
	handler: async (ctx) => {
		// Check if already seeded
		const existing = await ctx.db.query('agents').collect();
		if (existing.length > 0) {
			console.log('Agents already seeded');
			return { seeded: false, reason: 'Already seeded' };
		}

		// Insert all agents
		for (const agent of allAgents) {
			await ctx.db.insert('agents', {
				...agent,
				createdAt: Date.now(),
				updatedAt: Date.now()
			});
		}

		// Insert default intent rules
		const intentRules = [
			{
				pattern: 'research|investigate|learn about|study|deep dive',
				agentName: 'researcher',
				priority: 100,
				isEnabled: true,
				confidence: 0.7
			},
			{
				pattern: 'write blog|create article|draft post|content for',
				agentName: 'content-creator',
				priority: 100,
				isEnabled: true,
				confidence: 0.7
			},
			{
				pattern: 'flashcard|study card|quiz me|memorize|spaced repetition',
				agentName: 'flashcard-tutor',
				priority: 100,
				isEnabled: true,
				confidence: 0.7
			},
			{
				pattern: 'study plan|syllabus|curriculum|learning path|exam preparation',
				agentName: 'syllabus-planner',
				priority: 100,
				isEnabled: true,
				confidence: 0.7
			},
			{
				pattern: 'remember|save this|note this|extract memory',
				agentName: 'memory-curator',
				priority: 100,
				isEnabled: true,
				confidence: 0.7
			}
		];

		for (const rule of intentRules) {
			await ctx.db.insert('intent_rules', rule);
		}

		console.log(`Seeded ${allAgents.length} agents and ${intentRules.length} intent rules`);
		return { seeded: true, agentsCount: allAgents.length, rulesCount: intentRules.length };
	}
});
