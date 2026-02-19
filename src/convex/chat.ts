import { action } from './_generated/server';
import { v } from 'convex/values';
import { api, internal } from './_generated/api';
import { getGenerationStats, streamChatCompletion } from './lib/llm_client';
import { authComponent } from './auth';
import type { OpenRouterMessage, GeneratedImage, ContextPayload } from './types/chat';
import { detectIntent, orchestrateMultiAgent, getAgentDisplayName } from './agents/router';
import { getUserRole } from './agents/lib/permissions';
import type { AgentWorkResult } from './agents/router';
import { rateLimiter } from './lib/rateLimits';

/**
 * Generates an AI response for a given chat thread.
 *
 * This action performs the following steps:
 * 1. Retrieves message history for the thread.
 * 2. Detects intent and routes to appropriate agent (all requests go through agents).
 * 3. Agent executes with tools (memory search, RAG, web search handled by agent tools).
 * 4. Uses the agent's response directly (no secondary LLM call).
 * 5. Handles image generation if requested.
 * 6. Saves generated images and logs usage/cost metadata.
 *
 * @param threadId - The unique identifier of the chat thread.
 * @param model - Optional. The AI model to use (defaults to google/gemini-2.5-flash-lite).
 * @param includeReasoning - Optional. Whether to include the model's reasoning in the response.
 * @param generateImage - Optional. Whether to attempt to generate an image based on the prompt.
 * @param imageAspectRatio - Optional. The aspect ratio for any generated images (e.g., "1:1").
 * @param useMemory - Optional. Whether to use stored user memories for personalization.
 * @param useRag - Optional. Whether to search blog posts for relevant context (defaults to true).
 *
 * @throws {Error} if the user is not authenticated or if the OpenRouter API call fails.
 */
export const generate = action({
	args: {
		threadId: v.id('threads'),
		model: v.optional(v.string()),
		includeReasoning: v.optional(v.boolean()),
		generateImage: v.optional(v.boolean()),
		imageAspectRatio: v.optional(v.string()),
		useMemory: v.optional(v.boolean()),
		useRag: v.optional(v.boolean()),
		useWebSearch: v.optional(v.boolean())
	},
	handler: async (
		ctx,
		{
			threadId,
			model,
			includeReasoning,
			generateImage,
			imageAspectRatio,
			useMemory,
			useRag,
			useWebSearch
		}
	) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Unauthorized');
		const userId = user._id;
		const userRole = getUserRole(user);

		await rateLimiter.limit(ctx, 'aiGenerate', { key: userId, throws: true });

		// 1. Get previous messages
		const messages = await ctx.runQuery(internal.messages.internalList, {
			threadId,
			limit: 100
		});

		// Get the last user message for image prompt and memory storage
		const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
		const userPrompt = lastUserMessage?.body || 'Chat generated image';

		// 2. Detect intent and route to appropriate agent
		// ALL requests now go through agents (including 'chat' for memory/RAG via tools)
		const intent = await detectIntent(ctx, userPrompt, messages, userRole, userId, threadId);

		// Determine if this is a specialized agent or default chat agent
		const isSpecializedAgent = intent.primaryAgent !== 'chat' && intent.confidence >= 0.7;
		const agentToUse = isSpecializedAgent ? intent.primaryAgent : 'chat';

		const agentDisplayName = await getAgentDisplayName(ctx, agentToUse);

		// Create assistant message early to show real-time status
		const messageId = await ctx.runMutation(internal.messages.internalCreate, {
			body: '',
			userId,
			threadId,
			role: 'assistant',
			model: model || 'google/gemini-2.5-flash-lite',
			metadata: {
				status: 'agent_working',
				agentWork: {
					agentName: agentToUse,
					agentDisplayName,
					intentConfidence: intent.confidence,
					intentReasoning: isSpecializedAgent ? intent.reasoning : 'General chat',
					toolExecutions: [],
					llmCalls: [],
					agentResponse: '',
					cost: 0,
					isStreaming: true
				}
			}
		});

		// Route ALL requests through agent system
		// Chat agent has tools: searchMemories, searchBlogs, webSearch, analyzeContent
		// It will use them as needed based on the query
		let agentWork: AgentWorkResult | null = null;
		let agentTokens: { prompt: number; completion: number } | undefined;

		const agentIntent = isSpecializedAgent
			? intent
			: { primaryAgent: 'chat', confidence: 1, reasoning: 'General chat', subagents: [] };

		console.log(`[Chat:Generate] useWebSearch: ${useWebSearch}, useRag: ${useRag}`);

		try {
			const agentResult = await orchestrateMultiAgent(
				ctx,
				threadId,
				userId,
				lastUserMessage?._id,
				userPrompt,
				userRole,
				agentIntent,
				messageId,
				{
					useMemory,
					useRag,
					useWebSearch
				}
			);
			agentWork = agentResult.agentWork;
			agentTokens = agentResult.tokens;
		} catch (e: unknown) {
			const errorMessage = e instanceof Error ? e.message : String(e);
			console.error('[Chat] Agent execution failed:', errorMessage);
		}

		// Get model configuration
		const modelConfig = await ctx.runQuery(api.tasks.getConfig, { task: 'chat_primary' });
		const modelToUse = model || modelConfig?.modelId || 'google/gemini-2.5-flash-lite';

		// If agent produced a response, use it directly (no secondary LLM call)
		// This is the key change: agents now produce the final response
		if (agentWork?.agentResponse) {
			// Build context payload for debugging
			const contextPayload: ContextPayload = {
				model: modelToUse,
				messages: [],
				stream: false,
				include_reasoning: false
			};

			const finalMetadata = {
				status: 'complete',
				agentWork: { ...agentWork, isStreaming: false },
				requestPayload: contextPayload
			};

			// Update message with agent's response
			await ctx.runMutation(internal.messages.internalUpdate, {
				messageId,
				body: agentWork.agentResponse,
				metadata: finalMetadata,
				cost: agentWork.cost,
				usage: agentTokens
					? {
							promptTokens: agentTokens.prompt,
							completionTokens: agentTokens.completion,
							totalTokens: agentTokens.prompt + agentTokens.completion
						}
					: undefined
			});

			// Log usage for agent work
			await ctx.runMutation(internal.usage.logUsage, {
				userId,
				threadId,
				messageId,
				purpose: 'agent_chat',
				model: modelToUse,
				promptTokens: agentTokens?.prompt ?? 0,
				completionTokens: agentTokens?.completion ?? 0,
				totalTokens: agentTokens ? agentTokens.prompt + agentTokens.completion : 0,
				cost: agentWork.cost,
				raw_response: { agentWork }
			});

			return;
		}

		// Fallback: If agent didn't produce a response, use streaming LLM
		// This handles edge cases and image generation
		const controller = new AbortController();

		// 4. Prepare OpenRouter payload
	const openRouterMessages: OpenRouterMessage[] = messages.map((m: (typeof messages)[number]) => ({
		role: m.role,
		content:
			m.isCancelled || (m.metadata as Record<string, unknown>)?.cancelled
					? `[CANCELLED BY USER] ${m.body}`
					: m.body
		}));

		// Build system prompt
		const systemContent = `You are a helpful AI assistant.
MANDATORY: In every response, wrap only key terms with <hl>...</hl>.
Focus highlighting on direct answers, essential facts, and core concepts relevant to the question.
Example: "The capital of France is <hl>Paris</hl>, with a population of <hl>2.1 million</hl>."`;

		openRouterMessages.unshift({
			role: 'system',
			content: systemContent
		});

		// Build request options
		const requestOptions = {
			model: modelToUse,
			messages: openRouterMessages.map((m) => ({
				role: m.role as 'system' | 'user' | 'assistant',
				content: m.content
			})),
			temperature: modelConfig?.temperature,
			maxTokens: modelConfig?.maxTokens,
			includeReasoning: includeReasoning ?? false,
			stream: true as const
		};

		// Use the unified streaming client
		const { response, generationId } = await streamChatCompletion(requestOptions);

		if (!response.body) throw new Error('No response body');

		// Store context payload for debugging
		const contextPayload: ContextPayload = {
			model: modelToUse,
			messages: openRouterMessages,
			stream: true,
			stream_options: { include_usage: true },
			include_reasoning: includeReasoning ?? false,
			temperature: modelConfig?.temperature ?? undefined,
			max_tokens: modelConfig?.maxTokens ?? undefined
		};

		const initialMetadata = {
			status: 'streaming',
			...(generateImage ? { isGeneratingImage: true, imageAspectRatio } : {}),
			...(agentWork ? { agentWork } : {}),
			requestPayload: contextPayload
		};

		await ctx.runMutation(internal.messages.internalUpdate, {
			messageId,
			body: '',
			metadata: initialMetadata
		});

		// 7. Stream and update
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

							// Check for mid-stream errors from OpenRouter/Provider
							if (json.error) {
								console.error('Cognirivus: OpenRouter stream error:', json.error);
								throw new Error(
									`OpenRouter Error: ${json.error.message || JSON.stringify(json.error)}`
								);
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
								});
								continue;
							}

							const delta = json.choices[0]?.delta;
							const content = delta?.content || '';
							const reasoning = delta?.reasoning || delta?.reasoning_content || '';
							const images = delta?.images;

							if (images) {
								for (const img of images) {
									if (img.image_url?.url) {
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

								if (chunkCount % 50 === 0) {
									console.log(
										`Cognirivus: Stream progress - chunks: ${chunkCount}, content length: ${fullContent.length}`
									);
								}

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
		} catch (e: unknown) {
			const error = e as Error;
			if (error.name === 'AbortError') {
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
				// Prevent empty responses if we expect content
				if (!fullContent && !fullReasoning && generatedImages.length === 0) {
					console.warn('Cognirivus: Stream ended with no content/images. Adding fallback message.');
					fullContent = '_[No response received from AI]_';
				}

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
				const data = await getGenerationStats(generationId);

				if (data) {
					await ctx.runMutation(internal.messages.internalUpdate, {
						messageId,
						body: fullContent,
						reasoning: fullReasoning || undefined,
						isCancelled: isStopped ? true : undefined,
						cost: data.usage ?? data.total_cost ?? 0,
						usage: {
							promptTokens: data.native_tokens_prompt ?? 0,
							completionTokens: data.native_tokens_completion ?? 0,
							totalTokens: (data.native_tokens_prompt ?? 0) + (data.native_tokens_completion ?? 0)
						},
						metadata: initialMetadata
					});

					// 7. Log usage
					await ctx.runMutation(internal.usage.logUsage, {
						userId,
						messageId,
						purpose: 'chat',
						model: data.model,
						promptTokens: data.native_tokens_prompt ?? 0,
						completionTokens: data.native_tokens_completion ?? 0,
						totalTokens: (data.native_tokens_prompt ?? 0) + (data.native_tokens_completion ?? 0),
						cost: data.usage ?? data.total_cost ?? 0,
						raw_response: data || { generationId }
					});
				}
			} catch (e) {
				console.error('Failed to fetch generation metadata', e);
			}
		}
	}
});
