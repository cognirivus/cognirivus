import { action } from './_generated/server';
import { v } from 'convex/values';
import { api, internal } from './_generated/api';
import { getAuthUserId } from '@convex-dev/auth/server';
import { formulateStandaloneQuery } from './lib/openrouter';

export const generate = action({
	args: {
		threadId: v.id('threads'),
		model: v.optional(v.string()),
		includeReasoning: v.optional(v.boolean()),
		generateImage: v.optional(v.boolean()),
		imageAspectRatio: v.optional(v.string()),
		useMemory: v.optional(v.boolean())
	},
	handler: async (
		ctx,
		{ threadId, model, includeReasoning, generateImage, imageAspectRatio, useMemory }
	) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new Error('Unauthorized');

		// 1. Get previous messages
		const messages = await ctx.runQuery(api.messages.list, { threadId });

		// Get the last user message for image prompt and memory storage
		const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
		const userPrompt = lastUserMessage?.body || 'Chat generated image';

		// Trigger memory storage for the user's new message (fire-and-forget)
		// Always store memories regardless of useMemory flag
		console.log(
			'Cognirivus: Checking last user message for memory storage:',
			lastUserMessage?.body
		);
		if (lastUserMessage && lastUserMessage.body) {
			console.log('Cognirivus: Triggering addMemory action for message');
			ctx
				.runAction(api.memories.addMemory, {
					userId,
					messageId: lastUserMessage._id,
					messageText: lastUserMessage.body
				})
				.catch((e) => console.error('Failed to store memory', e));
		}

		// Retrieve relevant memories (only if useMemory is enabled)
		let relevantMemories: any[] = [];
		let searchOutputText = userPrompt; // Track what was actually used for search
		let rewriterInput: any[] = [];

		if (useMemory !== false && userPrompt) {
			try {
				const enriched = await ctx.runAction(api.memories.getEnrichedContext, {
					userId,
					history: messages.slice(-5).map((m: any) => ({
						role: m.role,
						content: m.body
					})),
					limit: 5
				});

				relevantMemories = enriched.relevantMemories;
				searchOutputText = enriched.formulatedQuery;
				rewriterInput = enriched.rewriterInput;
			} catch (e) {
				console.error('Failed to search memories', e);
			}
		}

		// Format memories for context
		const memoryContext =
			relevantMemories.length > 0
				? `\n\nRelevant memories about the user:\n${relevantMemories.map((m: any) => `- ${m.text}`).join('\n')}\n`
				: '';

		// 2. Prepare OpenRouter payload
		const openRouterMessages = messages.map((m: any) => ({
			role: m.role,
			content: m.isCancelled || m.metadata?.cancelled ? `[CANCELLED BY USER] ${m.body}` : m.body
		}));

		// Inject memories into the system instructions or as a system message at the start
		if (memoryContext) {
			// Check if there is already a system message, if not add one.
			// If existing messages don't have 'system', we can prepend one.
			// However, usually previous messages are just user/assistant.
			// We will prepend a system message with memories.
			openRouterMessages.unshift({
				role: 'system',
				content: `You are a helpful AI assistant. Use the following memories to personalize your response if relevant:${memoryContext}`
			});
		}

		// 3. Call OpenRouter
		const modelToUse = model || 'google/gemini-2.0-flash-exp:free';
		const controller = new AbortController();

		const requestBody: any = {
			model: modelToUse,
			messages: openRouterMessages,
			stream: true,
			stream_options: { include_usage: true },
			include_reasoning: includeReasoning ?? false
		};

		if (generateImage) {
			requestBody.modalities = ['image', 'text'];
			if (imageAspectRatio) {
				requestBody.image_config = { aspect_ratio: imageAspectRatio };
			}
		}

		const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
				'HTTP-Referer': 'https://cognirivus-chat.vercel.app',
				'X-Title': 'Cognirivus Chat',
				'Content-Type': 'application/json'
			},
			signal: controller.signal,
			body: JSON.stringify(requestBody)
		});

		if (!response.ok) {
			throw new Error(`OpenRouter error: ${response.statusText}`);
		}

		let generationId = '';

		if (!response.body) throw new Error('No response body');

		// 4. Create empty assistant message with request context in metadata
		const usedMemoriesForMeta = relevantMemories.map((m: any) => ({
			_id: m._id,
			text: m.text,
			_score: m._score
		}));
		// Store the full request payload for context display
		const contextPayload = {
			...requestBody,
			memorySearchQuery: useMemory !== false ? searchOutputText : undefined,
			memoryFormulationPayload: useMemory !== false ? rewriterInput : undefined,
			embeddingModel: useMemory !== false ? 'qwen/qwen3-embedding-8b' : undefined,
			retrievedMemories: useMemory !== false ? relevantMemories : undefined
		};
		const initialMetadata = {
			...(generateImage ? { isGeneratingImage: true, imageAspectRatio } : {}),
			...(usedMemoriesForMeta.length > 0 ? { usedMemories: usedMemoriesForMeta } : {}),
			requestPayload: contextPayload
		};
		const messageId = await ctx.runMutation(internal.messages.internalCreate, {
			body: '',
			userId,
			threadId,
			role: 'assistant',
			model: modelToUse,
			metadata: initialMetadata
		});

		// 5. Stream and update
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let fullContent = '';
		let fullReasoning = '';
		let generatedImages: { url: string; contentType: string }[] = [];
		let buffer = '';
		let chunkCount = 0;
		let lastWriteTime = 0;
		let isStopped = false;

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				chunkCount++;

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

							// Capture ID on first chunk - MUST happen before we might break
							if (json.id && !generationId) {
								generationId = json.id;
							}

							if (json.usage) {
								// Final usage update from stream
								await ctx.runMutation(internal.messages.internalUpdate, {
									messageId,
									body: fullContent,
									reasoning: fullReasoning || undefined,
									usage: {
										promptTokens: json.usage.prompt_tokens,
										completionTokens: json.usage.completion_tokens,
										totalTokens: json.usage.total_tokens
									}
									// If we captured images during streaming (less likely for images, but possible)
									// We usually handle images after they arrive
								});
								continue;
							}

							const delta = json.choices[0]?.delta;
							const content = delta?.content || '';
							const reasoning = delta?.reasoning || delta?.reasoning_content || '';
							const images = delta?.images; // Check for images in delta

							if (images) {
								for (const img of images) {
									if (img.image_url?.url) {
										// Format: data:image/png;base64,...
										const url = img.image_url.url;
										const match = url.match(/^data:(image\/[a-z]+);base64,(.*)$/);
										if (match) {
											generatedImages.push({
												url: url,
												contentType: match[1]
											});
										}
									}
								}
							}

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

				// Check for cancellation AFTER processing chunks
				if (chunkCount % 10 === 0) {
					const isCancelled = await ctx.runQuery(api.messages.checkCancelled, { messageId });
					if (isCancelled) {
						isStopped = true;
						controller.abort();
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
				// Ignore
			}

			// Process images if any
			const savedImageIds: string[] = [];
			if (generatedImages.length > 0) {
				for (const img of generatedImages) {
					try {
						const match = img.url.match(/^data:(image\/[a-z]+);base64,(.*)$/);
						if (match) {
							const contentType = match[1];
							const base64Data = match[2];
							const binaryString = atob(base64Data);
							const bytes = new Uint8Array(binaryString.length);
							for (let i = 0; i < binaryString.length; i++) {
								bytes[i] = binaryString.charCodeAt(i);
							}
							const blob = new Blob([bytes], { type: contentType });
							const storageId = await ctx.storage.store(blob);
							savedImageIds.push(storageId);

							// Save to generated_images table for unified image gallery
							await ctx.runMutation(internal.image.saveGeneration, {
								userId,
								prompt: userPrompt,
								provider: 'openrouter',
								model: modelToUse,
								aspectRatio: imageAspectRatio || '1:1',
								width: 1024,
								height: 1024,
								imageId: storageId as any,
								messageId
							});
						}
					} catch (imgError) {
						console.error('Failed to store image:', imgError);
					}
				}
			}

			if (!isStopped) {
				await ctx.runMutation(internal.messages.internalUpdate, {
					messageId,
					body: fullContent,
					reasoning: fullReasoning || undefined,
					images: savedImageIds.length > 0 ? (savedImageIds as any) : undefined
				});
			}
		}

		// 6. Fetch Full Metadata - run for both completed and cancelled
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
					const data = genData.data;

					if (data) {
						await ctx.runMutation(internal.messages.internalUpdate, {
							messageId,
							body: fullContent, // Keep existing body
							reasoning: fullReasoning || undefined,
							isCancelled: isStopped ? true : undefined,
							cost: data.total_cost,
							usage: {
								promptTokens: data.native_tokens_prompt,
								completionTokens: data.native_tokens_completion,
								totalTokens: data.native_tokens_prompt + data.native_tokens_completion
							},
							// Merge OpenRouter data with existing metadata to preserve requestPayload and memory context
							metadata: {
								...initialMetadata,
								...data
							}
						});

						// 7. Log usage
						await ctx.runMutation(internal.usage.logUsage, {
							userId,
							messageId,
							model: modelToUse,
							promptTokens: data.native_tokens_prompt,
							completionTokens: data.native_tokens_completion,
							totalTokens: data.native_tokens_prompt + data.native_tokens_completion,
							cost: data.total_cost,
							metadata: data
						});
					}
				}
			} catch (e) {
				console.error('Failed to fetch generation metadata', e);
			}
		}
	}
});

export const listModels = action({
	args: {},
	handler: async () => {
		const response = await fetch('https://openrouter.ai/api/v1/models', {
			headers: {
				Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
				'HTTP-Referer': 'https://cognirivus-chat.vercel.app',
				'X-Title': 'Cognirivus Chat'
			}
		});

		if (!response.ok) {
			throw new Error(`OpenRouter error: ${response.statusText}`);
		}

		const data = await response.json();
		return data.data;
	}
});
