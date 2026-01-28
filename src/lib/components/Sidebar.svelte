<script lang="ts">
	import { Plus, Trash2, ChartLine, MessageSquare, ImageIcon } from '@lucide/svelte';
	import SidebarHeader from './SidebarHeader.svelte';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '../../convex/_generated/api';
	import type { Id } from '../../convex/_generated/dataModel';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { useChatContext } from '$lib/chat-state.svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';

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

	function formatTimestamp(timestamp: number) {
		if (!timestamp) return '';
		const date = new Date(timestamp);
		const now = new Date();
		const isToday = date.toDateString() === now.toDateString();

		if (isToday) {
			return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		} else {
			return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
		}
	}
</script>

<aside
	class="fixed inset-y-0 left-0 z-50 flex h-full flex-col border-r border-border/40 bg-background transition-all duration-300 ease-out
    {chatState.isSidebarOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0'}
    md:relative md:translate-x-0 md:opacity-100
    {chatState.isSidebarOpen ? 'w-72' : 'md:w-0 md:overflow-hidden md:border-transparent'}"
>
	<SidebarHeader onClose={() => chatState.setSidebar(false)} />

	<div class="px-3 pb-3">
		<a
			href="/chat"
			class={buttonVariants({
				variant: 'outline',
				class: 'w-full gap-2 border-border/50 bg-transparent hover:bg-accent'
			})}
		>
			<Plus class="h-4 w-4" />
			New Chat
		</a>
	</div>

	<div class="flex-1 overflow-y-auto px-2">
		<div class="space-y-0.5">
			{#if threads.isLoading}
				<div class="flex items-center justify-center py-8">
					<Loader variant="circular" size="sm" />
				</div>
			{:else if threads.data}
				{#each threads.data as thread}
					<a
						href="/chat/{thread._id}"
						class="group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors {page
							.params.id === thread._id
							? 'bg-accent text-foreground'
							: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
					>
						<span class="min-w-0 flex-1 truncate">{thread.title}</span>
						<span class="shrink-0 text-[10px] text-muted-foreground/50 group-hover:hidden">
							{formatTimestamp(thread.updatedAt)}
						</span>
						<button
							onclick={(e) => handleDelete(thread._id, e)}
							class="hidden h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground group-hover:flex hover:bg-destructive/10 hover:text-destructive"
							title="Delete chat"
						>
							<Trash2 class="h-3.5 w-3.5" />
						</button>
					</a>
				{/each}
			{/if}
		</div>
	</div>

	<div class="mt-auto border-t border-border/40 p-3">
		<a
			href="/dashboard"
			class={buttonVariants({
				variant: 'ghost',
				class: 'mb-2 w-full justify-start gap-2.5 text-muted-foreground hover:text-foreground'
			})}
		>
			<ChartLine class="h-4 w-4" />
			Dashboard
		</a>

		<!-- Mode Switcher -->
		<div class="flex rounded-lg bg-accent/50 p-1">
			<a
				href="/chat"
				class="flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-xs font-medium transition-colors {page.url.pathname.startsWith(
					'/chat'
				)
					? 'bg-background text-foreground shadow-sm'
					: 'text-muted-foreground hover:text-foreground'}"
			>
				<MessageSquare class="h-4 w-4" />
				Chat
			</a>
			<a
				href="/image"
				class="flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-xs font-medium transition-colors {page.url.pathname.startsWith(
					'/image'
				)
					? 'bg-background text-foreground shadow-sm'
					: 'text-muted-foreground hover:text-foreground'}"
			>
				<ImageIcon class="h-4 w-4" />
				Image
			</a>
		</div>
	</div>
</aside>
