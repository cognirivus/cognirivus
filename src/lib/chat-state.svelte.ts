type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error';

export class ChatContext {
	// Settings and drafts (local to tab)
	selectedModel = $state('openai/gpt-oss-20b');
	includeReasoning = $state(false);
	useMemory = $state(false); // Memory-based personalization (off by default)
	generateImage = $state(false);
	imageAspectRatio = $state<string>('1:1');
	input = $state('');

	// Local streaming status
	status = $state<ChatStatus>('ready');
	isActuallyStreaming = $state(false);
	isMobile = $state(false);
	sidebarOpenDesktop = $state(true);
	sidebarOpenMobile = $state(false);

	isSidebarOpen = $derived(this.isMobile ? this.sidebarOpenMobile : this.sidebarOpenDesktop);

	toggleSidebar() {
		if (this.isMobile) {
			this.sidebarOpenMobile = !this.sidebarOpenMobile;
		} else {
			this.sidebarOpenDesktop = !this.sidebarOpenDesktop;
		}
	}

	setSidebar(value: boolean) {
		if (this.isMobile) {
			this.sidebarOpenMobile = value;
		} else {
			this.sidebarOpenDesktop = value;
		}
	}

	// Session stats
	totalTokens = $state(0);
	totalPromptTokens = $state(0);
	totalCompletionTokens = $state(0);
	totalCost = $state(0);

	resetStats() {
		this.totalTokens = 0;
		this.totalPromptTokens = 0;
		this.totalCompletionTokens = 0;
		this.totalCost = 0;
	}

	// Callbacks to be filled by the active page
	handleSubmit = $state<((e?: Event) => void) | null>(null);
	stopChat = $state<(() => void) | null>(null);
	viewContext = $state<(() => void) | null>(null);

	// Flag to trigger AI response after navigation
	shouldTrigger = $state(false);

	models = $state<
		{
			id: string;
			name: string;
			context_length: number;
			pricing: { prompt: string; completion: string };
			output_modalities: string[];
		}[]
	>([]);

	isLoadingModels = $state(true);

	constructor(private client: any) {
		this.loadModels();
	}

	async loadModels() {
		this.isLoadingModels = true;
		try {
			const models = await this.client.action(api.chat.listModels);
			// Process and sort models if needed, or just take them raw
			// Assuming the API returns objects with at least id and name
			this.models = models.map((m: any) => ({
				id: m.id,
				name: m.name,
				context_length: m.context_length,
				pricing: m.pricing,
				output_modalities: m.architecture?.output_modalities || []
			}));
			// If selectedModel is not in the list, default to first or keep current if valid
			if (this.models.length > 0 && !this.models.find((m) => m.id === this.selectedModel)) {
				// Try to keep a reasonable default if available, otherwise first
				this.selectedModel = this.models[0].id;
			}
		} catch (error) {
			console.error('Failed to load models:', error);
			// Fallback or empty state
		} finally {
			this.isLoadingModels = false;
		}
	}
}

import { setContext, getContext } from 'svelte';
import { api } from '../convex/_generated/api';
import { useConvexClient } from 'convex-svelte';

const KEY = Symbol('chat-context');

export function setChatContext() {
	const client = useConvexClient();
	return setContext(KEY, new ChatContext(client));
}

export function useChatContext() {
	return getContext<ChatContext>(KEY);
}
