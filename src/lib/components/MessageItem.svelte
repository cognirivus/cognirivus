<script lang="ts">
	import { Brain, ChevronDown, ChevronRight, Terminal, Square } from '@lucide/svelte';

	let { message, isLast, isStreaming, onViewContext } = $props<{
		message: any;
		isLast: boolean;
		isStreaming: boolean;
		onViewContext: (id: string) => void;
	}>();

	let expandedReasoning = $state(false);
	let revealedMetadata = $state(false);

	const parts = $derived.by(() => {
		const result = [{ type: 'text', text: message.body }];
		if (message.reasoning) {
			result.unshift({ type: 'reasoning', text: message.reasoning });
		}
		return result;
	});

	// Auto-expand reasoning while it's active, collapse when response starts
	$effect(() => {
		if (isLast && isStreaming) {
			if (message.reasoning && !message.body) {
				expandedReasoning = true;
			} else if (message.body) {
				expandedReasoning = false;
			}
		}
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	onclick={() => (revealedMetadata = !revealedMetadata)}
	class="group flex w-full cursor-pointer {message.role === 'user'
		? 'justify-end'
		: 'justify-start'}"
>
	<div class="flex flex-col gap-1">
		<div
			class="{message.role === 'user'
				? 'rounded-2xl rounded-tr-sm bg-zinc-900 px-5 py-3 text-zinc-50 shadow-md dark:bg-zinc-100 dark:text-zinc-900'
				: 'bg-transparent px-1 py-1 text-zinc-800 dark:text-zinc-200'} text-[0.95rem] leading-relaxed"
		>
			{#if message.role === 'assistant'}
				<div class="flex items-start gap-3">
					<div
						class="prose prose-zinc prose-headings:font-semibold prose-p:leading-7 dark:prose-invert max-w-none"
					>
						{#each parts as part}
							{#if part.type === 'reasoning'}
								<div class="mb-4 flex flex-col gap-2 text-sm text-zinc-500 dark:text-zinc-400">
									<button
										onclick={(e) => {
											e.stopPropagation();
											expandedReasoning = !expandedReasoning;
										}}
										class="flex items-center gap-2 font-medium transition-colors hover:text-zinc-700 dark:hover:text-zinc-300"
									>
										<Brain class="h-3.5 w-3.5" />
										<span>Reasoning</span>
										{#if expandedReasoning}
											<ChevronDown class="h-3.5 w-3.5" />
										{:else}
											<ChevronRight class="h-3.5 w-3.5" />
										{/if}
									</button>
									{#if expandedReasoning}
										<div
											class="ml-1.5 border-l-2 border-zinc-200 py-1 pl-4 whitespace-pre-wrap text-zinc-600 italic dark:border-zinc-800 dark:text-zinc-400"
										>
											{part.text}
										</div>
									{/if}
								</div>
							{:else if part.type === 'text'}
								<div class="whitespace-pre-wrap">{part.text}</div>
							{/if}
						{/each}
					</div>
				</div>
			{:else}
				<div class="whitespace-pre-wrap">
					{#each parts as part}
						{#if part.type === 'text'}
							{part.text}
						{/if}
					{/each}
				</div>
			{/if}
		</div>

		{#if message.role === 'assistant' && message.usage}
			<div
				class="px-1 transition-opacity duration-200 {revealedMetadata
					? 'opacity-100'
					: 'opacity-0 group-hover:opacity-100'}"
			>
				<div class="flex flex-col gap-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">
					<div class="flex items-center gap-2">
						<span class="font-medium text-zinc-500 dark:text-zinc-400"
							>{message.model || 'Unknown Model'}</span
						>
						<span class="text-zinc-400 dark:text-zinc-600">•</span>
						<span>{new Date(message.createdAt).toLocaleString()}</span>
					</div>
					<div class="flex items-center gap-2">
						<span>Prompt: {message.usage.promptTokens}</span>
						<span>Completions: {message.usage.completionTokens}</span>
						{#if message.cost !== undefined}
							<span class="font-medium text-zinc-600 dark:text-zinc-300">
								${message.cost.toFixed(6)}
							</span>
						{/if}
						{#if message.isCancelled || message.metadata?.cancelled}
							<div
								class="flex items-center gap-1 text-[9px] font-semibold tracking-tight text-red-500/80 uppercase"
							>
								<Square class="h-2 w-2" fill="currentColor" />
								<span>Cancelled</span>
							</div>
						{/if}
					</div>
				</div>
			</div>
		{/if}

		{#if message.role === 'user'}
			<div
				class="flex items-center justify-end gap-2 px-1 transition-opacity duration-200 {revealedMetadata
					? 'opacity-100'
					: 'opacity-0 group-hover:opacity-100'}"
			>
				<span class="text-[10px] text-zinc-400 dark:text-zinc-500">
					{new Date(message.createdAt).toLocaleString()}
				</span>
				<button
					onclick={(e) => {
						e.stopPropagation();
						onViewContext(message._id);
					}}
					class="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] font-medium text-zinc-400 transition-all hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-400"
					title="View context sent to AI"
				>
					<Terminal class="h-3 w-3" />
				</button>
			</div>
		{/if}
	</div>
</div>
