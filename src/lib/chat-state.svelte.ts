import { lsSync } from 'rune-sync/localstorage';

export class ChatContext {
	// Persistent settings and drafts
	settings = lsSync('cognirivus-chat-settings-v3', {
		selectedModel: 'openai/gpt-oss-20b',
		includeReasoning: true,
		input: ''
	});

	// Shorthand getters/setters for existing code compatibility
	get input() {
		return this.settings.input;
	}
	set input(value: string) {
		this.settings.input = value;
	}

	get selectedModel() {
		return this.settings.selectedModel;
	}
	set selectedModel(value: string) {
		this.settings.selectedModel = value;
	}

	get includeReasoning() {
		return this.settings.includeReasoning;
	}
	set includeReasoning(value: boolean) {
		this.settings.includeReasoning = value;
	}

	// Callbacks to be filled by the active page
	handleSubmit = $state<((e?: Event) => void) | null>(null);
	stopChat = $state<(() => void) | null>(null);
	viewContext = $state<(() => void) | null>(null);
	status = $state<'idle' | 'submitted' | 'streaming' | 'error' | 'ready'>('idle');

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
