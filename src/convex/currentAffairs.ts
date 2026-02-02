import { v } from 'convex/values';
import { action } from './_generated/server';
import { api, internal } from './_generated/api';

export const extractFromNews = action({
	args: {
		limit: v.optional(v.number())
	},
	handler: async (ctx: any, args: { limit?: number }): Promise<string> => {
		// 1. Fetch news items
		const newsItems = (await ctx.runQuery(internal.news.listInternal as any, {
			limit: args.limit ?? 1
		})) as any[];

		if (newsItems.length === 0) {
			return 'No news found';
		}

		// 2. Fetch valid UPSC subjects
		const subjects = (await ctx.runQuery(api.subjects.list)) as any[];
		const subjectNames = subjects.map((s: any) => s.name);

		let totalProcessed = 0;
		let totalStories = 0;

		for (const newsItem of newsItems) {
			const newsId = newsItem._id;
			const topic = 'Current Affairs';

			// 3. Check if already processed for this topic
			const processed = await ctx.runQuery(internal.content.isNewsProcessed as any, {
				newsId,
				topic
			});
			if (processed) {
				console.log(
					`News item ${newsId} (${newsItem.date}) already processed for ${topic}. Skipping.`
				);
				continue;
			}

			console.log(`Processing ${topic} for: ${newsItem.date}...`);

			// 4. Call OpenRouter
			try {
				const modelConfig = await ctx.runQuery(api.tasks.getConfig, { task: 'current_affairs' });
				const modelToUse = modelConfig?.modelId || 'google/gemini-2.5-flash-lite';

				const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
						'Content-Type': 'application/json',
						'HTTP-Referer': 'https://cognirivus.vercel.app',
						'X-Title': 'Cognirivus Current Affairs Extractor'
					},
					body: JSON.stringify({
						model: modelToUse,
						temperature: modelConfig?.temperature ?? 0.3,
						max_tokens: modelConfig?.maxTokens,
						messages: [
							{
								role: 'system',
								content: `You are a UPSC preparation expert. Your task is to extract individual, significant news stories from the provided news analysis.

For each story, extract a comprehensive summary and categorize it into the most relevant UPSC subject.

VALID SUBJECTS:
${subjectNames.join(', ')}

CRITICAL GUIDELINES:
1. ATOMIC & SELF-CONTAINED: Each extracted story must be self-explanatory and written as a standalone piece of intelligence.
2. COMPREHENSIVE TITLE: The title should be a short, comprehensive headline (e.g., "Electoral Bonds Verdict", "National Green Hydrogen Mission").
3. SUBJECT CATEGORIZATION: Choose the most relevant subject from the VALID SUBJECTS list based on the story's primary context.
4. TONE: Maintain a professional, educational, and factual tone suitable for UPSC aspirants.
5. NO DUPLICATION: Only extract distinct news stories or major policy developments.`
							},
							{
								role: 'user',
								content: newsItem.body
							}
						],
						response_format: {
							type: 'json_schema',
							json_schema: {
								name: 'current_affairs_extraction',
								strict: true,
								schema: {
									type: 'object',
									properties: {
										stories: {
											type: 'array',
											items: {
												type: 'object',
												properties: {
													title: {
														type: 'string',
														description: 'A short, comprehensive headline of the news story.'
													},
													text: {
														type: 'string',
														description: 'An atomic, standalone summary of the news story.'
													},
													subject: {
														type: 'string',
														enum: subjectNames,
														description: 'The most relevant UPSC subject from the list.'
													}
												},
												required: ['title', 'text', 'subject'],
												additionalProperties: false
											}
										}
									},
									required: ['stories'],
									additionalProperties: false
								}
							}
						}
					})
				});

				if (!response.ok) {
					console.error(`OpenRouter failed for ${newsItem.date}:`, await response.text());
					continue;
				}

				const data = (await response.json()) as any;
				const rawContent = data.choices[0]?.message?.content || '{"stories":[]}';

				let extractedStories: { title: string; text: string; subject: string }[] = [];
				try {
					const parsed = JSON.parse(rawContent);
					extractedStories = parsed.stories || [];
				} catch (e) {
					console.error(`Failed to parse AI response for ${newsItem.date}:`, rawContent);
					continue;
				}

				// 5. Save to content table
				let savedForThisItem = 0;
				for (const story of extractedStories) {
					if (story.title && story.text) {
						await ctx.runMutation(internal.content.saveExtractedFact as any, {
							title: story.title,
							body: story.text,
							subjectName: story.subject,
							topic: topic,
							entityType: 'Current Affairs',
							source: 'Unacademy Daily News',
							newsId: newsId,
							date: newsItem.date
						});
						savedForThisItem++;
					}
				}

				totalProcessed++;
				totalStories += savedForThisItem;
				console.log(`Successfully extracted ${savedForThisItem} stories from ${newsItem.date}`);
			} catch (err) {
				console.error(`Error processing news item ${newsId}:`, err);
			}
		}

		return `Processed ${totalProcessed} news articles, extracted ${totalStories} total news stories.`;
	}
});
