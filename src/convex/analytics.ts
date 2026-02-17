import { query } from './_generated/server';
import { authComponent } from './auth';

/**
 * Retrieves usage statistics for the authenticated user's dashboard.
 *
 * Aggregates information from `usage_logs`, including:
 * - Summary stats (total tokens, cost, cancellation rate).
 * - Breakdown by AI model.
 * - Breakdown by purpose (chat, memory, etc.).
 * - Daily usage trends.
 *
 * @returns A structured object containing aggregated stats or null if not authenticated.
 */
export const getDashboardStats = query({
	handler: async (ctx) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return null;

		let totalTokens = 0;
		let totalPromptTokens = 0;
		let totalCompletionTokens = 0;
		let totalCost = 0;
		let cancelledCount = 0;
		let totalGenerations = 0;

		const modelStats: Record<string, { tokens: number; cost: number; count: number }> = {};
		const purposeStats: Record<string, { tokens: number; cost: number; count: number }> = {};
		const dailyStats: Record<string, { tokens: number; cost: number }> = {};

		for await (const log of ctx.db
			.query('usage_logs')
			.withIndex('by_user', (q) => q.eq('userId', user._id))) {
			totalGenerations++;
			totalTokens += log.totalTokens;
			totalPromptTokens += log.promptTokens;
			totalCompletionTokens += log.completionTokens;
			if (log.cost) totalCost += log.cost;
			if (log.raw_response?.cancelled || log.raw_response?.finish_reason === 'cancelled') {
				cancelledCount++;
			}

			// Model Stats
			const model = log.model || 'unknown';
			if (!modelStats[model]) modelStats[model] = { tokens: 0, cost: 0, count: 0 };
			modelStats[model].tokens += log.totalTokens;
			modelStats[model].cost += log.cost || 0;
			modelStats[model].count++;

			// Purpose Stats
			const purpose = log.purpose || 'chat'; // Default to chat if missing (legacy)
			if (!purposeStats[purpose]) purposeStats[purpose] = { tokens: 0, cost: 0, count: 0 };
			purposeStats[purpose].tokens += log.totalTokens;
			purposeStats[purpose].cost += log.cost || 0;
			purposeStats[purpose].count++;

			// Daily Stats
			const date = new Date(log.createdAt).toISOString().split('T')[0];
			if (!dailyStats[date]) dailyStats[date] = { tokens: 0, cost: 0 };
			dailyStats[date].tokens += log.totalTokens;
			if (log.cost) dailyStats[date].cost += log.cost;
		}

		return {
			summary: {
				totalTokens,
				totalPromptTokens,
				totalCompletionTokens,
				totalCost,
				totalMessages: totalGenerations, // Technically total assistant responses logged
				assistantMessageCount: totalGenerations,
				cancelledCount,
				cancellationRate: totalGenerations > 0 ? cancelledCount / totalGenerations : 0
			},
			modelBreakdown: Object.entries(modelStats).map(([name, stats]) => ({
				name,
				...stats
			})),
			purposeBreakdown: Object.entries(purposeStats).map(([name, stats]) => ({
				name,
				...stats
			})),
			dailyUsage: Object.entries(dailyStats)
				.map(([date, stats]) => ({
					date,
					...stats
				}))
				.sort((a, b) => a.date.localeCompare(b.date))
		};
	}
});
