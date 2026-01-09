<script lang="ts">
	import { Plus, Trash2, BarChart3, X, MessageSquare, ImageIcon } from '@lucide/svelte';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '../../convex/_generated/api';
	import type { Id } from '../../convex/_generated/dataModel';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { useChatContext } from '$lib/chat-state.svelte';

	const chatState = useChatContext();

	const threads = useQuery(api.threads.list, {});
	const client = useConvexClient();

	async function handleDelete(id: Id<'threads'>, event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		if (confirm('Are you sure you want to delete this chat?')) {
			await client.mutation(api.threads.remove, { id });
			if (page.params.id === id) {
				goto('/chat');
			}
		}
	}
</script>

<aside
	class="fixed inset-y-0 left-0 z-50 flex h-full w-80 flex-col border-r border-zinc-200 bg-zinc-50 transition-all duration-300 dark:border-zinc-800 dark:bg-zinc-950
    {chatState.isSidebarOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0'}
    md:relative md:translate-x-0 md:opacity-100
    {chatState.isSidebarOpen
		? 'md:w-80'
		: 'md:pointer-events-none md:w-0 md:overflow-hidden md:border-none'}"
>
	<div class="flex items-center gap-2 p-4">
		<a
			href="/chat"
			class="flex flex-1 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
		>
			<Plus class="h-4 w-4" />
			New Chat
		</a>
		<button
			onclick={() => chatState.setSidebar(false)}
			class="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 md:hidden dark:border-zinc-800 dark:bg-zinc-900"
		>
			<X class="h-5 w-5" />
		</button>
	</div>

	<div class="flex-1 overflow-y-auto px-2 py-2">
		<div class="space-y-1">
			{#if threads.isLoading}
				<div class="flex items-center justify-center py-4">
					<div
						class="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600 dark:border-zinc-700 dark:border-t-zinc-400"
					></div>
				</div>
			{:else if threads.data}
				{#each threads.data as thread}
					<a
						href="/chat/{thread._id}"
						class="group flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors {page
							.params.id === thread._id
							? 'bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
							: 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900'}"
					>
						<span class="truncate">{thread.title}</span>
						<button
							onclick={(e) => handleDelete(thread._id, e)}
							class="hidden h-5 w-5 items-center justify-center rounded text-zinc-400 group-hover:flex hover:bg-zinc-300 hover:text-red-500 dark:hover:bg-zinc-700"
							title="Delete chat"
						>
							<Trash2 class="h-3.5 w-3.5" />
						</button>
					</a>
				{/each}
			{/if}
		</div>
	</div>

	<div class="mt-auto border-t border-zinc-200 p-2 dark:border-zinc-800">
		<a
			href="/chat/usage"
			class="mb-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50 {page
				.url.pathname === '/chat/usage'
				? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-50'
				: ''}"
		>
			<BarChart3 class="h-4 w-4" />
			Usage
		</a>

		<!-- Mode Switcher -->
		<div class="flex rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
			<a
				href="/chat"
				class="flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-xs font-medium transition-colors {page
					.url.pathname.startsWith('/chat')
					? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100'
					: 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'}"
			>
				<MessageSquare class="h-4 w-4" />
				Chat
			</a>
			<a
				href="/image"
				class="flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-xs font-medium transition-colors {page
					.url.pathname.startsWith('/image')
					? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100'
					: 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'}"
			>
				<ImageIcon class="h-4 w-4" />
				Image
			</a>
		</div>
	</div>
</aside>
