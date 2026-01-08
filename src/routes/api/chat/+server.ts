import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText, convertToModelMessages } from 'ai';
import { OPENROUTER_API_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';

const openrouter = createOpenRouter({
	apiKey: OPENROUTER_API_KEY
});

export const POST: RequestHandler = async ({ request }) => {
	const { messages, model, includeReasoning } = await request.json();

	try {
		const result = streamText({
			model: openrouter.chat(model || 'openai/gpt-oss-20b'),
			messages: await convertToModelMessages(messages),
			providerOptions: {
				openrouter: {
					include_reasoning: includeReasoning ?? true
				}
			}
		});

		return result.toUIMessageStreamResponse();
	} catch (error) {
		console.error('streamText error:', error);
		throw error;
	}
};
