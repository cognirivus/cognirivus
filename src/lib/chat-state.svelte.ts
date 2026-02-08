type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error';

export class ChatContext {
	// Settings and drafts (local to tab)
	selectedModel = $state('openai/gpt-oss-20b:free');
	includeReasoning = $state(false);
	useMemory = $state(false); // Memory-based personalization (off by default)
	/** RAG toggle state */
	useRag = $state(false); // RAG-based blog search (off by default)
	/** Web Search toggle state */
	useWebSearch = $state(false); // Direct Exa web search (off by default)
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
			supported_parameters: string[];
		}[]
	>([]);

	private STORAGE_KEY = 'cognirivus_models_cache';

	isLoadingModels = $state(true);

	constructor(private client: any) {
		this.loadModels();
	}

	async loadModels() {
		// 1. Initial Load from LocalStorage (Instant UI)
		if (typeof window !== 'undefined') {
			try {
				const cached = localStorage.getItem(this.STORAGE_KEY);
				if (cached) {
					const parsed = JSON.parse(cached);
					if (Array.isArray(parsed) && parsed.length > 0) {
						this.models = parsed;
						this.isLoadingModels = false;
						// Ensure we have a valid selection from cache
						if (!this.models.find((m) => m.id === this.selectedModel)) {
							this.selectedModel = this.models[0].id;
						}
					}
				}
			} catch (e) {
				console.warn('Failed to load models from localStorage', e);
			}
		}

		// 2. Fetch from Convex (Background Sync)
		try {
			const models = await this.client.query(api.models.list);
			const mappedModels = models.map((m: any) => ({
				id: m.modelId,
				name: m.name,
				context_length: m.attributes.context_length,
				pricing: m.attributes.pricing,
				output_modalities: m.attributes.architecture?.output_modalities || [],
				supported_parameters: m.attributes.supported_parameters || []
			}));

			this.models = mappedModels;

			// 3. Update LocalStorage
			if (typeof window !== 'undefined') {
				try {
					localStorage.setItem(this.STORAGE_KEY, JSON.stringify(mappedModels));
				} catch (e) {
					console.warn('Failed to save models to localStorage', e);
				}
			}

			if (this.models.length > 0 && !this.models.find((m) => m.id === this.selectedModel)) {
				this.selectedModel = this.models[0].id;
			}
		} catch (error) {
			console.error('Failed to load models from Convex:', error);
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
