import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { action, internalMutation, mutation, query } from './_generated/server';
import { api, internal } from './_generated/api';
import { authComponent } from './auth';

const checkAdmin = async (ctx: any) => {
	const user = await authComponent.getAuthUser(ctx);
	const isAdmin =
		user?.role && (Array.isArray(user.role) ? user.role.includes('admin') : user.role === 'admin');
	if (!isAdmin) throw new Error('Unauthorized: Admin access required');
	return user;
};

export const generateFromContent = action({
	args: {
		contentId: v.id('content')
	},
	handler: async (ctx, args): Promise<{ success: boolean; count: number; error?: string }> => {
		await checkAdmin(ctx);
		const content = await ctx.runQuery(api.content.getById, { id: args.contentId });

		if (!content) {
			return { success: false, count: 0, error: 'Content not found' };
		}

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
							content: `You are an expert educational content creator specializing in UPSC exam preparation. Your task is to generate high-quality Anki-style flashcards from the provided content.

GUIDELINES:
1. Create flashcards that test key facts, concepts, dates, and relationships
2. Front side should be a clear question or prompt
3. Back side should be a concise, accurate answer
4. Each flashcard should be atomic - testing ONE concept
5. Use different question types:
   - 'basic': Direct questions
   - 'cloze': Fill-in-the-blank (use {{c1::text}} syntax)
   - 'mcq': Multiple choice questions. For MCQ, the 'front' should include the question and options (A, B, C, D), and 'back' should be the correct option and explanation.
6. Assign difficulty 1-5 (1=basic recall, 5=complex analysis)
7. Generate 3-7 flashcards depending on content density
8. Ensure answers are self-contained and don't require context`
						},
						{
							role: 'user',
							content: `Title: ${content.title}\n\nContent:\n${content.body}`
						}
					],
					response_format: {
						type: 'json_schema',
						json_schema: {
							name: 'flashcard_generation',
							strict: true,
							schema: {
								type: 'object',
								properties: {
									flashcards: {
										type: 'array',
										items: {
											type: 'object',
											properties: {
												front: {
													type: 'string',
													description: 'The question or prompt shown on the front of the card'
												},
												back: {
													type: 'string',
													description: 'The answer shown on the back of the card'
												},
												type: {
													type: 'string',
													enum: ['basic', 'cloze', 'mcq'],
													description: 'Type of flashcard'
												},
												difficulty: {
													type: 'number',
													description: 'Difficulty level from 1 (easy) to 5 (hard)'
												}
											},
											required: ['front', 'back', 'type', 'difficulty'],
											additionalProperties: false
										}
									}
								},
								required: ['flashcards'],
								additionalProperties: false
							}
						}
					}
				})
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error('OpenRouter failed:', errorText);
				return { success: false, count: 0, error: 'AI generation failed' };
			}

			const data = (await response.json()) as any;
			const rawContent = data.choices[0]?.message?.content || '{"flashcards":[]}';

			let generatedCards: { front: string; back: string; type: string; difficulty: number }[] = [];
			try {
				const parsed = JSON.parse(rawContent);
				generatedCards = parsed.flashcards || [];
			} catch (e) {
				console.error('Failed to parse AI response:', rawContent);
				return { success: false, count: 0, error: 'Failed to parse AI response' };
			}

			let savedCount = 0;
			for (const card of generatedCards) {
				if (card.front && card.back) {
					const internalAny = internal as any;
					await ctx.runMutation(internalAny.flashcards.insertInternal, {
						contentId: args.contentId,
						front: card.front,
						back: card.back,
						type: card.type || 'basic',
						difficulty: Math.min(5, Math.max(1, card.difficulty || 3))
					});
					savedCount++;
				}
			}

			return { success: true, count: savedCount };
		} catch (err) {
			console.error('Error generating flashcards:', err);
			return { success: false, count: 0, error: 'Generation failed' };
		}
	}
});

export const insertInternal = internalMutation({
	args: {
		contentId: v.id('content'),
		front: v.string(),
		back: v.string(),
		type: v.string(),
		difficulty: v.number()
	},
	handler: async (ctx, args) => {
		const id = await ctx.db.insert('flashcards', {
			...args,
			createdAt: Date.now()
		});

		const content = await ctx.db.get(args.contentId);
		if (content) {
			await ctx.db.patch(args.contentId, {
				flashcardCount: (content.flashcardCount || 0) + 1
			});
		}
		return id;
	}
});

export const insert = mutation({
	args: {
		contentId: v.id('content'),
		front: v.string(),
		back: v.string(),
		type: v.string(),
		difficulty: v.number()
	},
	handler: async (ctx, args) => {
		await checkAdmin(ctx);
		const id = await ctx.db.insert('flashcards', {
			...args,
			createdAt: Date.now()
		});

		const content = await ctx.db.get(args.contentId);
		if (content) {
			await ctx.db.patch(args.contentId, {
				flashcardCount: (content.flashcardCount || 0) + 1
			});
		}
		return id;
	}
});

export const update = mutation({
	args: {
		id: v.id('flashcards'),
		front: v.string(),
		back: v.string(),
		type: v.string(),
		difficulty: v.number()
	},
	handler: async (ctx, args) => {
		await checkAdmin(ctx);
		const { id, ...updates } = args;
		await ctx.db.patch(id, updates);
		return id;
	}
});

export const remove = mutation({
	args: { id: v.id('flashcards') },
	handler: async (ctx, args) => {
		await checkAdmin(ctx);
		const card = await ctx.db.get(args.id);
		if (!card) return args.id;

		await ctx.db.delete(args.id);

		const content = await ctx.db.get(card.contentId);
		if (content) {
			await ctx.db.patch(card.contentId, {
				flashcardCount: Math.max(0, (content.flashcardCount || 0) - 1)
			});
		}

		// Also clean up progress
		const progress = await ctx.db
			.query('user_flashcard_progress')
			.withIndex('by_flashcard', (q) => q.eq('flashcardId', args.id))
			.collect();
		for (const p of progress) {
			await ctx.db.delete(p._id);
		}

		return args.id;
	}
});

export const removeByContent = mutation({
	args: { contentId: v.id('content') },
	handler: async (ctx, args) => {
		await checkAdmin(ctx);
		const cards = await ctx.db
			.query('flashcards')
			.withIndex('by_content', (q) => q.eq('contentId', args.contentId))
			.collect();

		for (const card of cards) {
			await ctx.db.delete(card._id);

			// Clean up progress
			const progress = await ctx.db
				.query('user_flashcard_progress')
				.withIndex('by_flashcard', (q) => q.eq('flashcardId', card._id))
				.collect();
			for (const p of progress) {
				await ctx.db.delete(p._id);
			}
		}

		await ctx.db.patch(args.contentId, { flashcardCount: 0 });

		return cards.length;
	}
});

export const listByContent = query({
	args: { contentId: v.id('content') },
	handler: async (ctx, args) => {
		return await ctx.db
			.query('flashcards')
			.withIndex('by_content', (q) => q.eq('contentId', args.contentId))
			.collect();
	}
});

export const listPaginated = query({
	args: {
		contentId: v.optional(v.id('content')),
		subjectId: v.optional(v.id('subjects')),
		paginationOpts: paginationOptsValidator
	},
	handler: async (ctx, args) => {
		const { contentId, subjectId, paginationOpts } = args;

		let queryBuilder;
		if (contentId) {
			queryBuilder = ctx.db
				.query('flashcards')
				.withIndex('by_content', (q) => q.eq('contentId', contentId));
		} else {
			queryBuilder = ctx.db.query('flashcards').withIndex('by_created_at').order('desc');
		}

		const result = await queryBuilder.paginate(paginationOpts);

		const enrichedPage = await Promise.all(
			result.page.map(async (card) => {
				const content = await ctx.db.get(card.contentId);

				// Filter by subject if provided (this is a client-side filter in the pagination loop, which is fine for small sets but we should try to avoid it if possible. However, there's no cross-table index.)
				if (subjectId && content?.subjectId !== subjectId) {
					return null;
				}

				return {
					...card,
					content: content
						? {
								_id: content._id,
								title: content.title,
								topic: content.topic,
								subjectId: content.subjectId
							}
						: null
				};
			})
		);

		return {
			...result,
			page: enrichedPage.filter((p): p is NonNullable<typeof p> => p !== null)
		};
	}
});

export const getById = query({
	args: { id: v.id('flashcards') },
	handler: async (ctx, args) => {
		const card = await ctx.db.get(args.id);
		if (!card) return null;

		const content = await ctx.db.get(card.contentId);
		return {
			...card,
			content
		};
	}
});

export const getStats = query({
	args: {},
	handler: async (ctx) => {
		const allCards = await ctx.db.query('flashcards').collect();

		const byDifficulty: Record<number, number> = {};
		const byType: Record<string, number> = {};

		for (const card of allCards) {
			byDifficulty[card.difficulty] = (byDifficulty[card.difficulty] || 0) + 1;
			byType[card.type] = (byType[card.type] || 0) + 1;
		}

		let userStats = null;
		const user = await authComponent.getAuthUser(ctx);
		if (user) {
			const progress = await ctx.db
				.query('user_flashcard_progress')
				.withIndex('by_user', (q) => q.eq('userId', user._id))
				.collect();

			const learning = progress.filter((p) => p.interval < 21).length;
			const mastered = progress.filter((p) => p.interval >= 21).length;

			userStats = {
				learning,
				mastered,
				new: Math.max(0, allCards.length - progress.length),
				debugId: user._id
			};
		}

		return {
			total: allCards.length,
			byDifficulty,
			byType,
			userStats
		};
	}
});

export const listDue = query({
	args: { limit: v.optional(v.number()), contentId: v.optional(v.id('content')) },
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) return [];

		const now = Date.now();
		const maxCards = args.limit || 30;

		// If contentId is provided, we want to study specifically THAT set
		if (args.contentId) {
			const cards = await ctx.db
				.query('flashcards')
				.withIndex('by_content', (q) => q.eq('contentId', args.contentId!))
				.collect();

			const results = await Promise.all(
				cards.map(async (card) => {
					const progress = await ctx.db
						.query('user_flashcard_progress')
						.withIndex('by_user_flashcard', (q) =>
							q.eq('userId', user._id).eq('flashcardId', card._id)
						)
						.unique();
					return { ...card, progress };
				})
			);
			return results;
		}

		// 1. Get user progress
		const allUserProgress = await ctx.db
			.query('user_flashcard_progress')
			.withIndex('by_user', (q) => q.eq('userId', user._id))
			.collect();

		const progressMap = new Map(allUserProgress.map((p) => [p.flashcardId, p]));

		// 2. Filter for Due cards
		const dueCards: any[] = [];
		for (const p of allUserProgress) {
			if (p.nextReviewAt < now) {
				const card = await ctx.db.get(p.flashcardId);
				if (card) dueCards.push({ ...card, progress: p });
			}
			if (dueCards.length >= maxCards) break;
		}

		// 3. Get all flashcards to find New ones
		// We use collect here because the table is small (as reported by user)
		const allFlashcards = await ctx.db.query('flashcards').collect();
		const sessionCards = [...dueCards];

		for (const card of allFlashcards) {
			if (sessionCards.length >= maxCards) break;
			if (progressMap.has(card._id)) continue;
			sessionCards.push({ ...card, progress: null });
		}

		return sessionCards;
	}
});

export const getContentWithFlashcardCounts = query({
	args: {
		subjectId: v.optional(v.id('subjects')),
		paginationOpts: paginationOptsValidator
	},
	handler: async (ctx, args) => {
		let queryBuilder;
		if (args.subjectId) {
			queryBuilder = ctx.db
				.query('content')
				.withIndex('by_subjectId', (q) => q.eq('subjectId', args.subjectId!));
		} else {
			queryBuilder = ctx.db.query('content').order('desc');
		}

		const result = await queryBuilder.paginate(args.paginationOpts);

		const user = await authComponent.getAuthUser(ctx);
		const userProgress = user
			? await ctx.db
					.query('user_flashcard_progress')
					.withIndex('by_user', (q) => q.eq('userId', user._id))
					.collect()
			: [];

		const progressMap = new Map(userProgress.map((p) => [p.flashcardId, p]));

		const enrichedPage = await Promise.all(
			result.page.map(async (content) => {
				const subject = await ctx.db.get(content.subjectId);
				const cards = await ctx.db
					.query('flashcards')
					.withIndex('by_content', (q) => q.eq('contentId', content._id))
					.collect();

				const attemptedCount = cards.filter((c) => progressMap.has(c._id)).length;

				return {
					...content,
					subject,
					flashcardCount: content.flashcardCount || 0,
					attemptedCount
				};
			})
		);

		return {
			...result,
			page: enrichedPage
		};
	}
});

// Spaced Repetition Logic

export const review = mutation({
	args: {
		flashcardId: v.id('flashcards'),
		quality: v.number() // 0-5 (SM-2 quality)
	},
	handler: async (ctx, args) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Authentication required');

		const { flashcardId, quality } = args;

		// Data integrity: Verify card exists
		const card = await ctx.db.get(flashcardId);
		if (!card) throw new Error('Flashcard not found');

		const existing = await ctx.db
			.query('user_flashcard_progress')
			.withIndex('by_user_flashcard', (q) =>
				q.eq('userId', user._id).eq('flashcardId', flashcardId)
			)
			.unique();

		let progressData: any;

		if (!existing) {
			progressData = {
				userId: user._id,
				flashcardId,
				interval: 0,
				easeFactor: 2.5,
				repetitions: 0,
				nextReviewAt: 0,
				lastReviewedAt: 0
			};
		} else {
			progressData = { ...existing };
		}

		// SM-2 Algorithm
		let { interval, easeFactor, repetitions } = progressData;

		if (quality >= 3) {
			if (repetitions === 0) {
				interval = 1;
			} else if (repetitions === 1) {
				interval = 6;
			} else {
				interval = Math.round(interval * easeFactor);
			}
			repetitions++;
		} else {
			repetitions = 0;
			interval = 1;
		}

		easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
		if (easeFactor < 1.3) easeFactor = 1.3;

		const nextReviewAt = Date.now() + interval * 24 * 60 * 60 * 1000;

		const finalData = {
			userId: user._id,
			flashcardId,
			interval,
			easeFactor,
			repetitions,
			nextReviewAt,
			lastReviewedAt: Date.now()
		};

		if (existing) {
			await ctx.db.patch(existing._id, finalData);
			return { ...finalData, _id: existing._id, _creationTime: existing._creationTime };
		} else {
			const id = await ctx.db.insert('user_flashcard_progress', finalData);
			const doc = await ctx.db.get(id);
			return doc!;
		}
	}
});
