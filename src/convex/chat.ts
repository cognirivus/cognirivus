import { action } from './_generated/server';
import { v } from 'convex/values';
import { api, internal } from './_generated/api';
import { getGenerationStats } from './lib/openrouter';
import { highlightText } from './lib/semantic';
import { authComponent } from './auth';
import { rag, RAG_CONFIG, type RagEntry, type RagUsage } from './rag';
import type {
	Memory,
	OpenRouterMessage,
	OpenRouterRequestBody,
	GeneratedImage,
	ContextPayload
} from './types/chat';

/**
 * Generates an AI response for a given chat thread.
 *
 * This action performs the following steps:
 * 1. Retrieves message history for the thread.
 * 2. Fetches relevant user memories (if enabled) to provide context.
 * 3. Prepares a payload for the OpenRouter API.
 * 4. Calls OpenRouter to stream a response (text and optionally images).
 * 5. Creates an assistant message in the database and updates it in real-time as the stream progresses.
 * 6. Handles user cancellation during streaming.
 * 7. Saves any generated images and logs usage/cost metadata.
 *
 * @param threadId - The unique identifier of the chat thread.
 * @param model - Optional. The AI model to use (defaults to google/gemini-2.0-flash-exp:free).
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
		useRag: v.optional(v.boolean())
	},
	handler: async (
		ctx,
		{ threadId, model, includeReasoning, generateImage, imageAspectRatio, useMemory, useRag }
	) => {
		const user = await authComponent.getAuthUser(ctx);
		if (!user) throw new Error('Unauthorized');
		const userId = user._id;

		// 1. Get previous messages
		const messages = await ctx.runQuery(api.messages.list, { threadId });

		// Get the last user message for image prompt and memory storage
		const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
		const userPrompt = lastUserMessage?.body || 'Chat generated image';

		// Trigger memory storage for the user's new message (fire-and-forget)
		// Always store memories regardless of useMemory flag

		if (lastUserMessage && lastUserMessage.body) {
			await ctx.scheduler.runAfter(0, internal.memories.addMemory, {
				userId,
				messageId: lastUserMessage._id,
				messageText: lastUserMessage.body
			});
		}

		// Retrieve relevant memories (only if useMemory is enabled)
		let relevantMemories: Memory[] = [];
		let searchOutputText = userPrompt; // Track what was actually used for search
		let rewriterInput: OpenRouterMessage[] = [];

		if (useMemory !== false && userPrompt) {
			try {
				const enriched = await ctx.runAction(internal.memories.getEnrichedContext, {
					userId,
					history: messages.slice(-5).map((m) => ({
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

		// 2. Create empty assistant message early to show "Searching..." status
		const messageId = await ctx.runMutation(internal.messages.internalCreate, {
			body: '',
			userId,
			threadId,
			role: 'assistant',
			model: model || 'google/gemini-2.0-flash-exp:free',
			metadata: { status: 'searching' }
		});

		// 3. RAG Search for Blogs (only if enabled)
		let ragContext = '';
		let ragEntries: RagEntry[] = [];
		let ragUsage: RagUsage | null = null;
		let ragError: string | undefined;

		if (useRag !== false) {
			try {
				// 1. Vector Search
				const vectorResult = await rag.search(ctx, {
					namespace: RAG_CONFIG.namespace,
					query: userPrompt,
					limit: RAG_CONFIG.search.limit,
					vectorScoreThreshold: RAG_CONFIG.search.scoreThreshold,
					chunkContext: RAG_CONFIG.search.chunkContext
				});

				// 2. Text Search (Hybrid)
				const textResults = await ctx.runQuery(internal.blogs.searchInternal, {
					query: userPrompt,
					limit: 2
				});

				const { results: vectorResults, entries, usage } = vectorResult;
				ragUsage = usage;

				// Combine and deduplicate
				const uniqueBlogIds = new Set([...entries.map((e) => e.key as string)]);
				for (const blog of textResults) {
					uniqueBlogIds.add(blog._id);
				}

				console.log(
					`RAG Search Results: ${entries.length} vector, ${textResults.length} text, ${uniqueBlogIds.size} unique docs`
				);

				if (uniqueBlogIds.size > 0) {
					// Fetch all unique blog docs
					const blogDocs = await Promise.all(
						[...uniqueBlogIds].map((id) => ctx.runQuery(api.blogs.get, { id: id as any }))
					);
					const blogMap = new Map(blogDocs.filter(Boolean).map((b) => [b!._id, b!]));

					// 1. Collect all chunks (Vector + Text)
					let allContext = '';
					const contextSources: { id: string; title: string; text: string; score: number }[] = [];

					// Add Vector Results
					for (const r of vectorResults) {
						const entry = entries.find((e) => e.entryId === r.entryId);
						const blogId = entry?.key as string | undefined;
						const blog = blogId ? blogMap.get(blogId as any) : undefined;
						const text = r.content[0]?.text || '';

						if (text) {
							allContext += `\n\n--- Source: ${blog?.title || 'Unknown'} ---\n${text}\n`;
							contextSources.push({
								id: blog?._id || '',
								title: blog?.title || 'Unknown',
								text,
								score: r.score
							});
						}
					}

					// Add Text Results
					const uniqueTextResults = textResults.filter(
						(blog) => !entries.some((e) => e.key === blog._id)
					);
					for (const blog of uniqueTextResults) {
						const text = blog.content.substring(0, 1000);
						if (text) {
							allContext += `\n\n--- Source: ${blog.title} ---\n${text}\n`;
							contextSources.push({
								id: blog._id,
								title: blog.title,
								text,
								score: 0.8
							});
						}
					}

					// 2. Single API Call to Highlight Combined Context
					if (allContext) {
						// Update status to 'highlighting'
						await ctx.runMutation(internal.messages.internalUpdate, {
							messageId,
							body: '',
							metadata: { status: 'highlighting' }
						});

						console.log('Sending combined context to highlighter...');
						const { highlightedText, scores } = await highlightText(userPrompt, allContext);

						if (highlightedText) {
							console.log('--- Highlighted Sentences (Combined) ---');
							console.log(highlightedText);

							if (scores) {
								console.log(`--- Scores (Raw: ${scores.length}) ---`);
								// Just log the first few stats about scores to avoid spamming mismatched logs
								console.log(
									`Min: ${Math.min(...scores).toFixed(4)}, Max: ${Math.max(...scores).toFixed(4)}, Avg: ${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(4)}`
								);
							}

							console.log('RAG found relevant blogs (Highlighted)');
							ragContext = `\n\nRelevant blog posts (Highlighted):\n${highlightedText}\n`;
						} else {
							console.warn('Highlighter returned empty result for combined context.');
							ragContext = ''; // Or fallback to allContext if preferred? Currently strict no-fallback.
						}

						// Map for UI - We show the sources that contributed to the context
						ragEntries = contextSources.map((s) => ({
							key: s.id,
							title: s.title,
							text: s.text,
							_score: s.score
						}));

						// Add a special entry for the AI Highlights if available
						if (highlightedText) {
							// Format the text to include scores if available
							let formattedText = highlightedText;
							if (scores && scores.length > 0) {
								const lines = highlightedText.split('\n');
								// Only format if lengths match to be safe
								if (lines.length === scores.length) {
									formattedText = lines
										.map((line, i) => {
											const percent = Math.round(scores[i] * 100);
											// Using bold for visibility, similar to a text badge
											return `**[${percent}%]** ${line}`;
										})
										.join('\n');
								}
							}

							ragEntries.unshift({
								key: 'ai-highlights',
								title: '✨ AI Highlights',
								text: formattedText,
								_score: 1.0
							});
						}
					}
				}

				// Log RAG embedding usage
				if (usage) {
					await ctx.runMutation(internal.usage.logUsage, {
						userId,
						messageId: undefined,
						purpose: 'rag_search',
						model: RAG_CONFIG.model,
						promptTokens: usage.tokens,
						completionTokens: 0,
						totalTokens: usage.tokens,
						cost: 0,
						raw_response: { usage }
					});
				}
			} catch (e) {
				console.error('Failed to search blogs', e);
				ragError = e instanceof Error ? e.message : String(e);
				// Graceful degradation - continue without RAG context
			}
		}

		// Update message status to "generating"
		await ctx.runMutation(internal.messages.internalUpdate, {
			messageId,
			body: '',
			metadata: { status: 'generating' }
		});

		// Format memories for context
		const memoryContext =
			relevantMemories.length > 0
				? `\n\nRelevant memories about the user:\n${relevantMemories.map((m) => `- ${m.text}`).join('\n')}\n`
				: '';

		// 4. Prepare OpenRouter payload
		const openRouterMessages: OpenRouterMessage[] = messages.map((m) => ({
			role: m.role,
			content: m.isCancelled || m.metadata?.cancelled ? `[CANCELLED BY USER] ${m.body}` : m.body
		}));

		// Inject memories and RAG context into the system instructions
		const systemContent = `You are a helpful AI assistant.${memoryContext}${ragContext ? `\n\nUse the following blog posts to answer if relevant. If you use information from a blog, cite it like [Source Title].\n\n${ragContext}` : ''}`;

		if (memoryContext || ragContext) {
			// Check if there is already a system message, if not add one.
			// If existing messages don't have 'system', we can prepend one.
			openRouterMessages.unshift({
				role: 'system',
				content: systemContent
			});
		}

		// 5. Call OpenRouter
		const modelToUse = model || 'google/gemini-2.0-flash-exp:free';
		const controller = new AbortController();

		const requestBody: OpenRouterRequestBody = {
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
				'HTTP-Referer': 'https://cognirivus.vercel.app',
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

		// 6. Update assistant message with request context in metadata
		const usedMemoriesForMeta = relevantMemories.map((m) => ({
			_id: m._id,
			text: m.text,
			_score: m._score
		}));
		// Store the full request payload for context display
		const contextPayload: ContextPayload = {
			...requestBody,
			memorySearchQuery: useMemory !== false ? searchOutputText : undefined,
			memoryFormulationPayload: useMemory !== false ? rewriterInput : undefined,
			embeddingModel: useMemory !== false ? 'qwen/qwen3-embedding-8b' : undefined,
			retrievedMemories: useMemory !== false ? relevantMemories : undefined,
			ragResults: ragEntries,
			ragError: ragError
		};
		const initialMetadata = {
			status: 'streaming',
			...(generateImage ? { isGeneratingImage: true, imageAspectRatio } : {}),
			...(usedMemoriesForMeta.length > 0 ? { usedMemories: usedMemoriesForMeta } : {}),
			...(ragEntries.length > 0 ? { ragResults: ragEntries } : {}),
			...(ragError ? { ragError } : {}),
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
						body: fullContent, // Keep existing body
						reasoning: fullReasoning || undefined,
						isCancelled: isStopped ? true : undefined,
						cost: data.usage ?? data.total_cost ?? 0,
						usage: {
							promptTokens: data.native_tokens_prompt ?? 0,
							completionTokens: data.native_tokens_completion ?? 0,
							totalTokens: (data.native_tokens_prompt ?? 0) + (data.native_tokens_completion ?? 0)
						},
						// Store request payload for debugging, not generation data
						metadata: initialMetadata
					});

					// 7. Log usage
					const finalStats = data || {
						model: modelToUse,
						native_tokens_prompt: 0,
						native_tokens_completion: 0,
						usage: 0,
						_is_fallback: !data
					};

					await ctx.runMutation(internal.usage.logUsage, {
						userId,
						messageId,
						purpose: 'chat',
						model: finalStats.model,
						promptTokens: finalStats.native_tokens_prompt ?? 0,
						completionTokens: finalStats.native_tokens_completion ?? 0,
						totalTokens:
							(finalStats.native_tokens_prompt ?? 0) + (finalStats.native_tokens_completion ?? 0),
						cost: finalStats.usage ?? finalStats.total_cost ?? 0,
						raw_response: data || { generationId }
					});
				}
			} catch (e) {
				console.error('Failed to fetch generation metadata', e);
			}
		}
	}
});
