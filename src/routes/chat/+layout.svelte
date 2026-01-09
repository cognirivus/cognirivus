<script lang="ts">
	import Sidebar from '$lib/components/Sidebar.svelte';
	import ChatInput from '$lib/components/ChatInput.svelte';
	import { setChatContext } from '$lib/chat-state.svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import SidebarToggle from '$lib/components/SidebarToggle.svelte';

	let { children } = $props();
	const chatState = setChatContext();

	// Browser responsiveness
	$effect(() => {
		if (browser) {
			const checkMobile = () => {
				chatState.isMobile = window.innerWidth < 768;
			};
			checkMobile();
			window.addEventListener('resize', checkMobile);
			return () => window.removeEventListener('resize', checkMobile);
		}
	});
</script>

<div class="flex h-dvh w-full overflow-hidden bg-background font-sans text-foreground">
	<Sidebar />

	{#if chatState.isSidebarOpen && chatState.isMobile}
		<!-- Mobile Overlay -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			onclick={() => chatState.setSidebar(false)}
			class="fixed inset-0 z-30 bg-foreground/20 backdrop-blur-sm transition-opacity duration-300 md:hidden"
		></div>
	{/if}

	<div class="relative flex flex-1 flex-col overflow-hidden">
		<SidebarToggle
			onclick={() => chatState.toggleSidebar()}
			isOpen={chatState.isSidebarOpen}
			title="Open sidebar"
		/>

		<div class="flex flex-1 flex-col overflow-hidden">
			{@render children()}
		</div>

		{#if page.url.pathname !== '/chat/usage'}
			<ChatInput
				bind:input={chatState.input}
				handleSubmit={(e: Event) => chatState.handleSubmit?.(e)}
				chatStatus={chatState.status}
				stopChat={() => chatState.stopChat?.()}
				models={chatState.models}
				bind:selectedModel={chatState.selectedModel}
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
