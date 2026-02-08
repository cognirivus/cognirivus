import { query, mutation, internalQuery } from '../_generated/server';
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
 * List all intent rules.
 *
 * @returns Array of intent rules
 */
export const listIntentRules = query({
	args: {},
	returns: v.array(
		v.object({
			_id: v.id('intent_rules'),
			_creationTime: v.number(),
			pattern: v.string(),
			agentName: v.string(),
			priority: v.number(),
			isEnabled: v.boolean(),
			confidence: v.number()
		})
	),
	handler: async (ctx) => {
		await requireAdmin(ctx);

		const rules = await ctx.db.query('intent_rules').collect();

		return rules.sort((a, b) => b.priority - a.priority);
	}
});

/**
 * Create a new intent rule.
 *
 * @param pattern - The pattern/keyword to match
 * @param agentName - The agent to route to
 * @param priority - Priority level (higher = more important)
 * @param confidence - Confidence score (0-1)
 * @param isEnabled - Whether the rule is active
 * @returns The ID of the created rule
 */
export const createIntentRule = mutation({
	args: {
		pattern: v.string(),
		agentName: v.string(),
		priority: v.number(),
		confidence: v.number(),
		isEnabled: v.optional(v.boolean())
	},
	returns: v.id('intent_rules'),
	handler: async (ctx, args) => {
		await requireAdmin(ctx);

		const existing = await ctx.db
			.query('intent_rules')
			.withIndex('by_pattern', (q) => q.eq('pattern', args.pattern))
			.unique();

		if (existing) {
			throw new ConvexError(`Rule with pattern '${args.pattern}' already exists`);
		}

		const ruleId = await ctx.db.insert('intent_rules', {
			pattern: args.pattern,
			agentName: args.agentName,
			priority: args.priority,
			confidence: args.confidence,
			isEnabled: args.isEnabled ?? true
		});

		return ruleId;
	}
});

/**
 * Update an intent rule.
 *
 * @param id - The ID of the rule to update
 * @param updates - Fields to update
 * @returns null
 */
export const updateIntentRule = mutation({
	args: {
		id: v.id('intent_rules'),
		updates: v.object({
			pattern: v.optional(v.string()),
			agentName: v.optional(v.string()),
			priority: v.optional(v.number()),
			confidence: v.optional(v.number()),
			isEnabled: v.optional(v.boolean())
		})
	},
	returns: v.null(),
	handler: async (ctx, { id, updates }) => {
		await requireAdmin(ctx);

		const rule = await ctx.db.get(id);
		if (!rule) {
			throw new ConvexError('Rule not found');
		}

		await ctx.db.patch(id, updates);
		return null;
	}
});

/**
 * Delete an intent rule.
 *
 * @param id - The ID of the rule to delete
 * @returns null
 */
export const deleteIntentRule = mutation({
	args: { id: v.id('intent_rules') },
	returns: v.null(),
	handler: async (ctx, { id }) => {
		await requireAdmin(ctx);

		await ctx.db.delete(id);
		return null;
	}
});

/**
 * Get all active intent rules (internal query for router).
 * Does not require auth - only used internally.
 *
 * @returns Array of enabled intent rules sorted by priority
 */
export const getActiveRules = internalQuery({
	args: {},
	returns: v.array(
		v.object({
			_id: v.id('intent_rules'),
			_creationTime: v.number(),
			pattern: v.string(),
			agentName: v.string(),
			priority: v.number(),
			isEnabled: v.boolean(),
			confidence: v.number()
		})
	),
	handler: async (ctx) => {
		const rules = await ctx.db.query('intent_rules').collect();

		return rules.filter((rule) => rule.isEnabled).sort((a, b) => b.priority - a.priority);
	}
});

/**
 * Test intent detection with a sample query.
 * Returns matching rules sorted by priority.
 *
 * @param query - The sample query to test
 * @returns Array of matching rules with confidence scores
 */
export const testIntentDetection = query({
	args: { query: v.string() },
	returns: v.array(
		v.object({
			_id: v.id('intent_rules'),
			_creationTime: v.number(),
			pattern: v.string(),
			agentName: v.string(),
			priority: v.number(),
			isEnabled: v.boolean(),
			confidence: v.number(),
			matchScore: v.number()
		})
	),
	handler: async (ctx, { query }) => {
		await requireAdmin(ctx);

		const lowerQuery = query.toLowerCase();
		const allRules = await ctx.db.query('intent_rules').collect();

		const matches = allRules
			.filter((rule) => rule.isEnabled)
			.map((rule) => {
				const lowerPattern = rule.pattern.toLowerCase();
				let matchScore = 0;

				if (lowerQuery.includes(lowerPattern)) {
					matchScore = 1;
				} else if (lowerQuery.split(' ').some((word) => lowerPattern.includes(word))) {
					matchScore = 0.5;
				}

				return {
					...rule,
					matchScore: matchScore * rule.confidence
				};
			})
			.filter((rule) => rule.matchScore > 0)
			.sort((a, b) => b.priority - a.priority || b.matchScore - a.matchScore);

		return matches;
	}
});
