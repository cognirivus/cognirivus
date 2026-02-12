<script lang="ts">
	import { browser } from '$app/environment';
	import { useConvexClient } from 'convex-svelte';
	import { api } from '../../convex/_generated/api';
	import { goto } from '$app/navigation';
	import { useChatContext } from '$lib/chat-state.svelte';
	import { Sparkles } from '@lucide/svelte';
	import { handleConvexError } from '$lib/utils/error-handler';

	const client = useConvexClient();
	const chatState = useChatContext();

	async function handleSubmit(event?: Event) {
		event?.preventDefault();
		if (!chatState.input.trim()) return;

		const currentInput = chatState.input;
		chatState.input = ''; // Clear early

		// 1. Create new thread
		try {
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
		} catch (error) {
			handleConvexError(error);
			chatState.input = currentInput; // Restore input on error
		}
	}

	$effect(() => {
		chatState.handleSubmit = handleSubmit;
		chatState.status = 'ready';
		chatState.stopChat = null;
		chatState.viewContext = null;
		chatState.resetStats();
	});
</script>

<div class="flex flex-1 flex-col items-center justify-center px-6">
	<div class="mb-32 max-w-md text-center">
		<div
			class="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-foreground text-background"
		>
			<Sparkles class="h-6 w-6" />
		</div>
		<h1 class="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
			How can I help you today?
		</h1>
		<p class="mt-3 text-sm text-muted-foreground">
			Ask me anything. I'm here to help you learn and understand.
		</p>
	</div>
</div>
