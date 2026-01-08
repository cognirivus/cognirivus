<script lang="ts">
	import Sidebar from '$lib/components/Sidebar.svelte';
	import ChatInput from '$lib/components/ChatInput.svelte';
	import { setChatContext } from '$lib/chat-state.svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { Menu, PanelLeft } from '@lucide/svelte';

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

<div
	class="flex h-screen w-full overflow-hidden bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50"
>
	<!-- Mobile Header -->
	<header
		class="fixed top-0 right-0 left-0 z-30 flex h-14 items-center border-b border-zinc-200 bg-white/80 px-4 backdrop-blur-md md:hidden dark:border-zinc-800 dark:bg-zinc-900/80"
	>
		<button
			onclick={() => chatState.toggleSidebar()}
			class="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
		>
			<Menu class="h-6 w-6" />
		</button>
		<div class="ml-3 text-sm font-bold tracking-tight">Cognirivus</div>
	</header>

	<Sidebar />

	{#if chatState.isSidebarOpen && chatState.isMobile}
		<!-- Mobile Overlay -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			onclick={() => chatState.setSidebar(false)}
			class="fixed inset-0 z-30 bg-zinc-950/20 backdrop-blur-sm transition-opacity duration-300 md:hidden"
		></div>
	{/if}

	<div class="relative flex flex-1 flex-col overflow-hidden pt-14 md:pt-0">
		<!-- Desktop Toggle Button -->
		<div class="absolute top-4 left-4 z-50 hidden md:block">
			<button
				onclick={() => chatState.toggleSidebar()}
				class="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 shadow-sm transition-all hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
				title={chatState.isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
			>
				<PanelLeft class="h-5 w-5" />
			</button>
		</div>

		<div class="flex flex-1 flex-col overflow-hidden">
			{@render children()}
		</div>

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
