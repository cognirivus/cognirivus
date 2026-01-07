<script lang="ts">
	import { Chat } from '@ai-sdk/svelte';

	let input = $state('');
	const chat = new Chat({});

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		chat.sendMessage({ text: input });
		input = '';
	}
</script>

<main class="stretch mx-auto flex w-full max-w-md flex-col py-24">
	<ul class="space-y-4">
		{#each chat.messages as message, messageIndex (messageIndex)}
			<li class="flex flex-col">
				<div class="font-bold">{message.role}</div>
				<div class="prose dark:prose-invert">
					{#each message.parts as part, partIndex (partIndex)}
						{#if part.type === 'text'}
							<div>{part.text}</div>
						{/if}
					{/each}
				</div>
			</li>
		{/each}
	</ul>
	<form
		onsubmit={handleSubmit}
		class="fixed bottom-0 mb-8 w-full max-w-md rounded border border-gray-300 bg-white p-2 shadow-xl dark:bg-gray-800"
	>
		<input
			class="w-full rounded border border-gray-300 p-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
			bind:value={input}
			placeholder="Say something..."
		/>
		<button type="submit" class="hidden">Send</button>
	</form>
</main>
