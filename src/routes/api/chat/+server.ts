import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText, convertToModelMessages } from 'ai';
import { OPENROUTER_API_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';

const openrouter = createOpenRouter({
	apiKey: OPENROUTER_API_KEY
});

export const POST: RequestHandler = async ({ request }) => {
	const { messages } = await request.json();

	const result = streamText({
		model: openrouter.chat('qwen/qwen3-235b-a22b-2507'),
		messages: await convertToModelMessages(messages)
	});

	return result.toUIMessageStreamResponse();
};
