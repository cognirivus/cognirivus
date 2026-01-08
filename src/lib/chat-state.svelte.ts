type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error';

export class ChatContext {
	// Settings and drafts (local to tab)
	selectedModel = $state('openai/gpt-oss-20b');
	includeReasoning = $state(true);
	input = $state('');

	// Local streaming status
	status = $state<ChatStatus>('ready');
	isActuallyStreaming = $state(false);

	// Session stats
	totalTokens = $state(0);
	totalCost = $state(0);

	// Callbacks to be filled by the active page
	handleSubmit = $state<((e?: Event) => void) | null>(null);
	stopChat = $state<(() => void) | null>(null);
	viewContext = $state<(() => void) | null>(null);

	// Flag to trigger AI response after navigation
	shouldTrigger = $state(false);

	models = [
		{ id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B' },
		{ id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B' },
		{ id: 'google/gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
		{ id: 'qwen/qwen3-235b-a22b-2507', name: 'Qwen: Qwen3 235B A22B Instruct 2507' }
	];

	constructor() {}
}

import { setContext, getContext } from 'svelte';

const KEY = Symbol('chat-context');

export function setChatContext() {
	return setContext(KEY, new ChatContext());
}

export function useChatContext() {
	return getContext<ChatContext>(KEY);
}
