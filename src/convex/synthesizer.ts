import { v } from 'convex/values';
import { action } from './_generated/server';
import { api, internal } from './_generated/api';
import { authComponent } from './auth';

export const generateArticle = action({
	args: {
		entityId: v.id('entities')
	},
	handler: async (ctx, args) => {
		// 1. Check Authorization (Admin Only)
		const user = await authComponent.getAuthUser(ctx);
		const isAdmin =
			user?.role &&
			(Array.isArray(user.role) ? user.role.includes('admin') : user.role === 'admin');

		if (!isAdmin) {
			throw new Error('Unauthorized: Admin access required.');
		}

		// 2. Fetch Entity Details
		const entity = await ctx.runQuery(api.content.getEntity, { id: args.entityId });
		if (!entity) throw new Error('Entity not found');

		// 3. Fetch all linked content
		const items = (await ctx.runQuery(api.content.listByEntity, {
			entityId: args.entityId
		})) as any[];

		if (items.length === 0) {
			return 'No data available to synthesize.';
		}

		// 4. Group content for the prompt
		const groupedData: Record<number, Record<string, string[]>> = {};
		items.forEach((item, index) => {
			const refTag = `Ref${index + 1}`;
			const gs = item.subject?.gsPaper ?? 0;
			const sub = item.subject?.name ?? 'Other';
			if (!groupedData[gs]) groupedData[gs] = {};
			if (!groupedData[gs][sub]) groupedData[gs][sub] = [];
			groupedData[gs][sub].push(
				`- [${refTag}] [${item.newsDate || 'General'}] ${item.title}: ${item.body}`
			);
		});

		let formattedContent = '';
		[1, 2, 3, 4, 0].forEach((gs) => {
			if (groupedData[gs]) {
				formattedContent += `\nGS Paper ${gs}:\n`;
				Object.entries(groupedData[gs]).forEach(([sub, facts]) => {
					formattedContent += `### ${sub}\n${facts.join('\n')}\n`;
				});
			}
		});

		// 5. Call AI
		const modelConfig = await ctx.runQuery(api.tasks.getConfig, { task: 'synthesis' });
		const modelToUse = modelConfig?.modelId || 'google/gemini-2.0-flash-lite-001';

		const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
				'Content-Type': 'application/json',
				'HTTP-Referer': 'https://cognirivus.vercel.app',
				'X-Title': 'Cognirivus UPSC Synthesizer'
			},
			body: JSON.stringify({
				model: modelToUse,
				temperature: modelConfig?.temperature ?? 0.3,
				max_tokens: modelConfig?.maxTokens,
				messages: [
					{
						role: 'system',
						content: `You are a UPSC (Union Public Service Commission) expert faculty. Your task is to synthesize fragmented news analysis segments into a single, cohesive, and professional Article for a specific entity: ${entity.name}.

STRICT GROUNDING: Use ONLY the information provided in the input. Do not include external facts, dates, general knowledge, or speculative details not explicitly found in the source text.

CITATIONS: Every factual claim or summary point MUST be followed by its respective reference tag(s) from the input (e.g., [Ref1] or [Ref1][Ref2]). This is mandatory for accountability.

GUIDELINES:
1. STRUCTURE: Organize the Article by General Studies (GS) Paper numbers (GS 1, GS 2, GS 3, GS 4). 
2. SYNTHESIS: Connect the dots between different subjects ONLY where such relationships are evident in the provided text.
3. STYLE: Use professional, academic language suitable for UPSC Mains answer writing. Use bullet points, bold headings, and clear paragraphs.
4. ATOMICITY: Ensure the final Article is standalone and comprehensive relative to the provided data.
5. FOOTER: Keep "GS Paper 0 / Other" items at the very end under a "Miscellaneous Updates" or "General Facts" heading.
6. MARKDOWN: Use standard Markdown for formatting. Do not use H1 (reserved for page title). Use H2 for GS Papers and H3 for Subjects.`
					},
					{
						role: 'user',
						content: `STRICTLY BASED ONLY ON THE PROVIDED DATA, synthesize the following Article about ${entity.name}:\n\n${formattedContent}`
					}
				]
			})
		});

		if (!response.ok) {
			throw new Error(`AI Synthesis failed: ${response.statusText}`);
		}

		const data = await response.json();
		const article = data.choices[0]?.message?.content;

		if (!article) throw new Error('AI returned empty response');

		// 6. Save Article
		await ctx.runMutation(internal.content.saveArticle, {
			entityId: args.entityId,
			article
		});

		return 'Article generated successfully';
	}
});
