import { action } from './_generated/server';
import { v } from 'convex/values';
import { api, internal } from './_generated/api';
import { getAuthUserId } from '@convex-dev/auth/server';

export const generate = action({
	args: {
		threadId: v.id('threads'),
		model: v.optional(v.string()),
		includeReasoning: v.optional(v.boolean())
	},
	handler: async (ctx, { threadId, model, includeReasoning }) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new Error('Unauthorized');

		// 1. Get previous messages
		const messages = await ctx.runQuery(api.messages.list, { threadId });

		// 2. Prepare OpenRouter payload
		const openRouterMessages = messages.map((m) => ({
			role: m.role,
			content: m.body
		}));

		// 3. Call OpenRouter
		const modelToUse = model || 'google/gemini-2.0-flash-exp:free';
		const controller = new AbortController();

		const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
				'HTTP-Referer': 'https://cognirivus-chat.vercel.app',
				'X-Title': 'Cognirivus Chat',
				'Content-Type': 'application/json'
			},
			signal: controller.signal,
			body: JSON.stringify({
				model: modelToUse,
				messages: openRouterMessages,
				stream: true,
				stream_options: { include_usage: true },
				include_reasoning: includeReasoning ?? false
			})
		});

		if (!response.ok) {
			throw new Error(`OpenRouter error: ${response.statusText}`);
		}

		// Capture Generation ID from headers or (more reliably) it might be in the first chunk,
		// but typically OpenRouter returns it in the response if not streaming, or we get it via a separate getter if we have an ID.
		// Actually, checking OpenRouter docs, for streaming 'chat/completions', the ID is in the chunks: `id: "gen-..."`
		let generationId = '';

		if (!response.body) throw new Error('No response body');

		// 4. Create empty assistant message
		const messageId = await ctx.runMutation(internal.messages.internalCreate, {
			body: '',
			userId,
			threadId,
			role: 'assistant',
			model: modelToUse
		});

		// 5. Stream and update
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let fullContent = '';
		let fullReasoning = '';
		let buffer = '';
		let chunkCount = 0;
		let lastWriteTime = 0;
		let isStopped = false;

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				chunkCount++;
				if (chunkCount % 10 === 0) {
					const isCancelled = await ctx.runQuery(api.messages.checkCancelled, { messageId });
					if (isCancelled) {
						isStopped = true;
						controller.abort(); // Signal OpenRouter to stop billing/generation
						await ctx.runMutation(internal.messages.internalCleanupCancellation, { messageId });
						await ctx.runMutation(internal.messages.internalUpdate, {
							messageId,
							body: fullContent,
							reasoning: fullReasoning || undefined,
							isCancelled: true
						});
						break;
					}
				}

				const chunk = decoder.decode(value, { stream: true });
				buffer += chunk;

				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					const trimmed = line.trim();
					if (trimmed === 'data: [DONE]') continue;
					if (trimmed.startsWith('data: ')) {
						try {
							const json = JSON.parse(trimmed.replace('data: ', ''));

							// Capture ID on first chunk
							if (json.id && !generationId) {
								generationId = json.id;
							}

							if (json.usage) {
								// Final usage update from stream (may be approximate cost, but good token counts)
								// We will overwrite this with exact data from /generation later if successful
								await ctx.runMutation(internal.messages.internalUpdate, {
									messageId,
									body: fullContent,
									reasoning: fullReasoning || undefined,
									usage: {
										promptTokens: json.usage.prompt_tokens,
										completionTokens: json.usage.completion_tokens,
										totalTokens: json.usage.total_tokens
									}
								});
								continue;
							}

							const delta = json.choices[0]?.delta;
							const content = delta?.content || '';
							const reasoning = delta?.reasoning || delta?.reasoning_content || '';

							if (content || reasoning) {
								if (content) fullContent += content;
								if (reasoning) fullReasoning += reasoning;

								// Throttle DB updates to every 200ms
								const now = Date.now();
								if (now - lastWriteTime > 200) {
									lastWriteTime = now;
									await ctx.runMutation(internal.messages.internalUpdate, {
										messageId,
										body: fullContent,
										reasoning: fullReasoning || undefined
									});
								}
							}
						} catch (e) {
							console.error('Error parsing stream', e);
						}
					}
				}
			}
		} catch (e: any) {
			if (e.name === 'AbortError') {
				console.log('Cognirivus: Stream aborted by user (AbortController).');
			} else {
				console.error('Stream error', e);
			}
		} finally {
			try {
				reader.releaseLock();
			} catch (e) {
				// Ignore errors if reader is already closed/unlocked
			}
			if (!isStopped) {
				await ctx.runMutation(internal.messages.internalUpdate, {
					messageId,
					body: fullContent,
					reasoning: fullReasoning || undefined
				});
			}
		}

		// 6. Fetch Full Metadata (Cost, etc.)
		if (generationId) {
			try {
				// Small delay to ensure OpenRouter has processed the stats
				await new Promise((resolve) => setTimeout(resolve, 1000));

				const genResponse = await fetch(
					`https://openrouter.ai/api/v1/generation?id=${generationId}`,
					{
						headers: {
							Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`
						}
					}
				);

				if (genResponse.ok) {
					const genData = await genResponse.json();
					const data = genData.data; // OpenRouter returns { data: { ... } }

					if (data) {
						await ctx.runMutation(internal.messages.internalUpdate, {
							messageId,
							body: fullContent, // Keep existing body
							reasoning: fullReasoning || undefined,
							isCancelled: isStopped ? true : undefined,
							cost: data.total_cost,
							usage: {
								promptTokens: data.tokens_prompt,
								completionTokens: data.tokens_completion,
								totalTokens: data.tokens_prompt + data.tokens_completion
							},
							metadata: data // Store everything
						});
					}
				}
			} catch (e) {
				console.error('Failed to fetch generation metadata', e);
			}
		}
	}
});
