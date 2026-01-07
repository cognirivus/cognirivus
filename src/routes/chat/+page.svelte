<script lang="ts">
	import { Chat } from '@ai-sdk/svelte';

	import { browser } from '$app/environment';

	let input = $state('');
	const chat = new Chat({});

	function handleSubmit(event?: Event) {
		event?.preventDefault();
		if (!input.trim()) return;
		chat.sendMessage({ text: input });
		input = '';
		// Reset textarea height if possible, but simpler to just let re-render handle it or manually select.
		// For Svelte reactivity, we might need a tick or just rely on the value binding.
		// To be safe, we can reset height in the DOM if we had a ref, but for now let's just clear input.
	}
</script>

<!-- Premium Layout Container -->
<div
	class="flex h-screen w-full flex-col bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50"
>
	<!-- Header (Optional context) -->
	<header class="flex-none border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
		<h1 class="text-sm font-semibold tracking-tight text-zinc-500 uppercase dark:text-zinc-400">
			Cognirivus Chat
		</h1>
	</header>

	{#if browser}
		<!-- Scrollable Message Area -->
		<div class="flex-1 overflow-y-auto scroll-smooth px-4 py-6">
			<div class="mx-auto flex max-w-3xl flex-col space-y-8 pb-32">
				{#each chat.messages as message, messageIndex (messageIndex)}
					<div class="flex w-full {message.role === 'user' ? 'justify-end' : 'justify-start'}">
						<!-- Message Bubble -->
						<div class="flex max-w-[85%] flex-col gap-2 sm:max-w-[75%]">
							<!-- Role Label (Hidden for sleekness, or subtle) -->
							<!-- <span class="text-xs text-zinc-400 px-1">{message.role}</span> -->

							<div
								class="{message.role === 'user'
									? 'rounded-2xl rounded-tr-sm bg-zinc-900 px-5 py-3 text-zinc-50 shadow-md dark:bg-zinc-100 dark:text-zinc-900'
									: 'bg-transparent px-1 py-1 text-zinc-800 dark:text-zinc-200'} text-[0.95rem] leading-relaxed"
							>
								{#if message.role === 'assistant'}
									<!-- Bot Icon for Assistant -->
									<div class="flex items-start gap-3">
										<div
											class="mt-1 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-indigo-500/10"
										>
											<div class="h-1.5 w-1.5 rounded-full bg-indigo-500"></div>
										</div>
										<div
											class="prose max-w-none prose-zinc dark:prose-invert prose-headings:font-semibold prose-p:leading-7"
										>
											{#each message.parts as part}
												{#if part.type === 'text'}
													<div>{part.text}</div>
												{/if}
											{/each}
										</div>
									</div>
								{:else}
									<!-- User Text -->
									<div class="whitespace-pre-wrap">
										{#each message.parts as part}
											{#if part.type === 'text'}
												{part.text}
											{/if}
										{/each}
									</div>
								{/if}
							</div>
						</div>
					</div>
				{/each}

				{#if chat.status === 'streaming'}
					<div class="flex w-full animate-pulse justify-start">
						<div class="flex items-center gap-2 px-1">
							<div class="h-4 w-4 rounded-full bg-zinc-200 dark:bg-zinc-800"></div>
							<span class="text-sm text-zinc-400">Thinking...</span>
						</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- Floating Input Area -->
		<div class="pointer-events-none fixed bottom-0 left-0 w-full p-4 lg:pb-6">
			<form onsubmit={handleSubmit} class="pointer-events-auto relative mx-auto max-w-3xl">
				<!-- Minimal Input Container -->
				<div
					class="relative flex items-center gap-2 rounded-2xl bg-zinc-100 px-2 py-2 transition-all dark:bg-zinc-900"
				>
					<textarea
						class="max-h-48 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-3 py-2 text-sm text-zinc-900 placeholder-zinc-500 focus:ring-0 focus:ring-offset-0 focus:outline-none dark:text-zinc-100 dark:placeholder-zinc-400"
						bind:value={input}
						placeholder="Message Cognirivus..."
						rows="1"
						oninput={(e) => {
							e.currentTarget.style.height = 'auto';
							e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
						}}
						onkeydown={(e) => {
							if (e.key === 'Enter' && !e.shiftKey) {
								e.preventDefault();
								if (input.trim()) {
									handleSubmit(e);
								}
							}
						}}
					></textarea>

					<div class="flex flex-none items-center pr-1">
						{#if chat.status === 'streaming'}
							<button
								type="button"
								onclick={() => chat.stop()}
								class="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200 text-zinc-900 transition-colors hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-700"
								aria-label="Stop generation"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 20 20"
									fill="currentColor"
									class="h-3 w-3"
								>
									<path
										d="M5.25 3A2.25 2.25 0 0 0 3 5.25v9.5A2.25 2.25 0 0 0 5.25 17h9.5A2.25 2.25 0 0 0 17 14.75v-9.5A2.25 2.25 0 0 0 14.75 3h-9.5Z"
									/>
								</svg>
							</button>
						{:else}
							<button
								type="submit"
								disabled={!input.trim()}
								class="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-white transition-all hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:disabled:hover:bg-zinc-100"
								aria-label="Send message"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 20 20"
									fill="currentColor"
									class="h-4 w-4 translate-x-px -translate-y-px"
								>
									<path
										d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.897 28.897 0 0 0 15.293-7.155.75.75 0 0 0 0-1.114A28.897 28.897 0 0 0 3.105 2.288Z"
									/>
								</svg>
							</button>
						{/if}
					</div>
				</div>

				<div class="mt-2 text-center text-[10px] text-zinc-400 dark:text-zinc-600">
					AI can make mistakes. Check important info.
				</div>
			</form>
		</div>
	{/if}
</div>
