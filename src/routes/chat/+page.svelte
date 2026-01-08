<script lang="ts">
	import { browser } from '$app/environment';
	import { useConvexClient } from 'convex-svelte';
	import { api } from '../../convex/_generated/api';
	import { goto } from '$app/navigation';
	import { useChatContext } from '$lib/chat-state.svelte';

	const client = useConvexClient();
	const chatState = useChatContext();

	async function handleSubmit(event?: Event) {
		event?.preventDefault();
		if (!chatState.input.trim()) return;

		const currentInput = chatState.input;
		chatState.input = ''; // Clear early

		// 1. Create new thread
		const title = currentInput.slice(0, 30) + (currentInput.length > 30 ? '...' : '');
		const threadId = await client.mutation(api.threads.create, { title });

		// 2. Save user message to Convex
		await client.mutation(api.messages.send, {
			body: currentInput,
			threadId: threadId,
			role: 'user'
		});

		// 3. Navigate to new thread
		chatState.shouldTrigger = true;
		goto(`/chat/${threadId}`);
	}

	$effect(() => {
		chatState.handleSubmit = handleSubmit;
		chatState.status = 'ready';
		chatState.stopChat = null;
		chatState.viewContext = null;
	});
</script>

<div class="flex flex-1 flex-col items-center justify-center p-4">
	<div class="mb-32 animate-in text-center duration-700 fade-in slide-in-from-bottom-4">
		<h2 class="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Cognirivus</h2>
		<p class="mt-2 text-zinc-500 dark:text-zinc-400">How can I help you today?</p>
	</div>
</div>
