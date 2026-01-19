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
		let totalLocations = 0;

		for (const newsItem of newsItems) {
			const newsId = newsItem._id;
			const topic = 'Mapping';

			// 3. Check if already processed
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
				const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
						'Content-Type': 'application/json',
						'HTTP-Referer': 'https://cognirivus.vercel.app',
						'X-Title': 'Cognirivus Chat'
					},
					body: JSON.stringify({
						model: 'google/gemini-2.5-flash-lite',
						messages: [
							{
								role: 'system',
								content: `You are a UPSC preparation expert. Your task is to extract physical geographical locations (cities, towns, rivers, mountains, borders, regions, etc.) mentioned in the provided news analysis.

For each location mentioned, extract specific facts or information and categorize it into the most relevant UPSC subject.

VALID SUBJECTS:
${subjectNames.join(', ')}

CRITICAL GUIDELINES:
1. ATOMIC & SELF-CONTAINED: Each extracted fact must be self-explanatory and written in a way that doesn't require reading the original news article. Instead of saying "It was reported that the city is facing...", say "[Location] is facing...". Ensure the text is a standalone piece of intelligence.
2. PHYSICAL LOCATIONS ONLY: Do not extract organizations, names of people, or general concepts. Focus strictly on places that can be mapped.
3. SUBJECT CATEGORIZATION: Choose the most relevant subject from the VALID SUBJECTS list based on the context of the news (e.g., a port mentioned for trade is "Economy"; mentioned for defense is "International Relations"). Use "Other" if no match is found.
4. MULTIPLE ENTRIES: If a single location has multiple distinct pieces of information, provide a separate object for each fact.
5. TONE: Maintain a professional, educational, and factual tone.`
							},
							{
								role: 'user',
								content: newsItem.content
							}
						],
						response_format: {
							type: 'json_schema',
							json_schema: {
								name: 'location_extraction',
								strict: true,
								schema: {
									type: 'object',
									properties: {
										locations: {
											type: 'array',
											items: {
												type: 'object',
												properties: {
													title: {
														type: 'string',
														description: 'The name of the physical location.'
													},
													text: {
														type: 'string',
														description: 'An atomic, standalone fact about the location.'
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
									required: ['locations'],
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
				const rawContent = data.choices[0]?.message?.content || '{"locations":[]}';

				let extractedLocations: { title: string; text: string; subject: string }[] = [];
				try {
					const parsed = JSON.parse(rawContent);
					extractedLocations = parsed.locations || [];
				} catch (e) {
					console.error(`Failed to parse AI response for ${newsItem.date}:`, rawContent);
					continue;
				}

				// 5. Save to content table
				let savedForThisItem = 0;
				for (const loc of extractedLocations) {
					if (loc.title && loc.text) {
						await ctx.runMutation(internal.content.saveExtractedFact as any, {
							title: loc.title,
							text: loc.text,
							subjectName: loc.subject,
							topic: topic,
							entityType: 'location',
							source: 'Unacademy Daily News',
							newsId: newsId,
							date: newsItem.date
						});
						savedForThisItem++;
					}
				}

				totalProcessed++;
				totalLocations += savedForThisItem;
				console.log(`Successfully extracted ${savedForThisItem} locations from ${newsItem.date}`);
			} catch (err) {
				console.error(`Error processing news item ${newsId}:`, err);
			}
		}

		return `Processed ${totalProcessed} news articles, extracted ${totalLocations} total location facts.`;
	}
});
