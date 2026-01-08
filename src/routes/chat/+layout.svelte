<script lang="ts">
	import Sidebar from '$lib/components/Sidebar.svelte';
	import ChatInput from '$lib/components/ChatInput.svelte';
	import { setChatContext } from '$lib/chat-state.svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/state';

	let { children } = $props();
	const chatState = setChatContext();
</script>

<div
	class="flex h-screen w-full bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50"
>
	<Sidebar />
	<div class="flex flex-1 flex-col overflow-hidden">
		{@render children()}

		{#if browser && page.url.pathname !== '/chat/usage'}
			<ChatInput
				bind:input={chatState.input}
				handleSubmit={(e: Event) => chatState.handleSubmit?.(e)}
				chatStatus={chatState.status}
				stopChat={() => chatState.stopChat?.()}
				models={chatState.models}
				bind:selectedModel={chatState.selectedModel}
				bind:includeReasoning={chatState.includeReasoning}
				viewContext={chatState.viewContext ? () => chatState.viewContext?.() : null}
				totalTokens={chatState.totalTokens}
				totalPromptTokens={chatState.totalPromptTokens}
				totalCompletionTokens={chatState.totalCompletionTokens}
				totalCost={chatState.totalCost}
				isActuallyStreaming={chatState.isActuallyStreaming}
			/>
		{/if}
	</div>
</div>
