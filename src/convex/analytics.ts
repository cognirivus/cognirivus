import { query } from './_generated/server';
import { getAuthUserId } from '@convex-dev/auth/server';

export const getDashboardStats = query({
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) return null;

		const messages = await ctx.db
			.query('messages')
			.filter((q) => q.eq(q.field('userId'), userId))
			.collect();

		let totalTokens = 0;
		let totalPromptTokens = 0;
		let totalCompletionTokens = 0;
		let totalCost = 0;
		let cancelledCount = 0;
		let assistantMessageCount = 0;

		const modelStats: Record<string, { tokens: number; cost: number; count: number }> = {};
		const dailyStats: Record<string, { tokens: number; cost: number }> = {};

		for (const m of messages) {
			if (m.role === 'assistant') {
				assistantMessageCount++;
				if (m.usage) {
					totalTokens += m.usage.totalTokens;
					totalPromptTokens += m.usage.promptTokens;
					totalCompletionTokens += m.usage.completionTokens;
				}
				if (m.cost) totalCost += m.cost;
				if (m.isCancelled || m.metadata?.cancelled) cancelledCount++;

				// Model Stats
				const model = m.model || 'unknown';
				if (!modelStats[model]) modelStats[model] = { tokens: 0, cost: 0, count: 0 };
				modelStats[model].tokens += m.usage?.totalTokens || 0;
				modelStats[model].cost += m.cost || 0;
				modelStats[model].count++;
			}

			// Daily Stats (all messages contribute to "activity")
			const date = new Date(m.createdAt).toISOString().split('T')[0];
			if (!dailyStats[date]) dailyStats[date] = { tokens: 0, cost: 0 };
			if (m.usage) dailyStats[date].tokens += m.usage.totalTokens;
			if (m.cost) dailyStats[date].cost += m.cost;
		}

		return {
			summary: {
				totalTokens,
				totalPromptTokens,
				totalCompletionTokens,
				totalCost,
				totalMessages: messages.length,
				assistantMessageCount,
				cancelledCount,
				cancellationRate: assistantMessageCount > 0 ? cancelledCount / assistantMessageCount : 0
			},
			modelBreakdown: Object.entries(modelStats).map(([name, stats]) => ({
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
