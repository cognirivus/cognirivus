<script lang="ts">
	import { Plus, Trash2, BarChart3, X, MessageSquare, ImageIcon } from '@lucide/svelte';
	import SidebarHeader from './SidebarHeader.svelte';
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
	class="fixed inset-y-0 left-0 z-50 flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-[transform,opacity,width] duration-300 ease-in-out
    {chatState.isSidebarOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0'}
    md:relative md:translate-x-0 md:opacity-100
    {chatState.isSidebarOpen ? 'w-80' : 'md:w-0 md:overflow-hidden md:border-transparent'}"
>
	<SidebarHeader onClose={() => chatState.setSidebar(false)} />

	<div class="px-4 pb-4">
		<a
			href="/chat"
			class="flex w-full items-center justify-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/50 px-4 py-2 text-sm font-medium text-sidebar-foreground transition-all hover:bg-sidebar-accent"
		>
			<Plus class="h-4 w-4" />
			New Chat
		</a>
	</div>

	<div class="flex-1 overflow-y-auto px-2 py-2">
		<div class="space-y-1">
			{#if threads.isLoading}
				<div class="flex items-center justify-center py-4">
					<div
						class="h-4 w-4 animate-spin rounded-full border-2 border-sidebar-border border-t-sidebar-foreground"
					></div>
				</div>
			{:else if threads.data}
				{#each threads.data as thread}
					<a
						href="/chat/{thread._id}"
						class="group flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors {page
							.params.id === thread._id
							? 'bg-sidebar-accent text-sidebar-foreground shadow-sm'
							: 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'}"
					>
						<span class="truncate">{thread.title}</span>
						<button
							onclick={(e) => handleDelete(thread._id, e)}
							class="hidden h-5 w-5 items-center justify-center rounded text-sidebar-foreground/50 group-hover:flex hover:bg-sidebar-accent hover:text-destructive"
							title="Delete chat"
						>
							<Trash2 class="h-3.5 w-3.5" />
						</button>
					</a>
				{/each}
			{/if}
		</div>
	</div>

	<div class="mt-auto border-t border-sidebar-border p-2">
		<a
			href="/chat/usage"
			class="mb-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground {page
				.url.pathname === '/chat/usage'
				? 'bg-sidebar-accent font-semibold text-sidebar-foreground shadow-sm'
				: ''}"
		>
			<BarChart3 class="h-4 w-4" />
			Usage
		</a>

		<!-- Mode Switcher -->
		<div class="flex rounded-lg bg-sidebar-accent/50 p-1">
			<a
				href="/chat"
				class="flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-xs font-medium transition-colors {page.url.pathname.startsWith(
					'/chat'
				)
					? 'bg-sidebar-accent text-sidebar-foreground shadow-sm ring-1 ring-sidebar-border'
					: 'text-sidebar-foreground/60 hover:text-sidebar-foreground'}"
			>
				<MessageSquare class="h-4 w-4" />
				Chat
			</a>
			<a
				href="/image"
				class="flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-xs font-medium transition-colors {page.url.pathname.startsWith(
					'/image'
				)
					? 'bg-sidebar-accent text-sidebar-foreground shadow-sm ring-1 ring-sidebar-border'
					: 'text-sidebar-foreground/60 hover:text-sidebar-foreground'}"
			>
				<ImageIcon class="h-4 w-4" />
				Image
			</a>
		</div>
	</div>
</aside>
