<script lang="ts">
	import { Terminal, Square, Image, ImageOff } from '@lucide/svelte';
	import { Message, MessageContent } from '$lib/components/prompt-kit/message/index.js';
	import {
		Reasoning,
		ReasoningContent,
		ReasoningTrigger
	} from '$lib/components/prompt-kit/reasoning/index.js';

	let { message, isLast, isStreaming, onViewContext } = $props<{
		message: any;
		isLast: boolean;
		isStreaming: boolean;
		onViewContext: (id: string) => void;
	}>();

	let revealedMetadata = $state(false);

	const ASPECT_SIZE_MAP: Record<string, string> = {
		'1:1': 'h-64 w-64',
		'16:9': 'h-36 w-64',
		'9:16': 'h-64 w-36',
		'4:3': 'h-48 w-64',
		'3:4': 'h-64 w-48',
		'3:2': 'h-42 w-64',
		'2:3': 'h-64 w-42'
	};

	function getAspectSizeClass(ratio: string): string {
		return ASPECT_SIZE_MAP[ratio] || 'h-64 w-64';
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	onclick={() => (revealedMetadata = !revealedMetadata)}
	class="group flex w-full cursor-pointer flex-col {message.role === 'user'
		? 'items-end'
		: 'items-start'}"
>
	<Message class="w-full flex-col gap-2 {message.role === 'user' ? 'items-end' : 'items-start'}">
		{#if message.role === 'assistant'}
			{#if message.reasoning}
				<Reasoning isStreaming={isLast && isStreaming && !message.body}>
					<ReasoningTrigger
						onclick={(e) => e.stopPropagation()}
						class="text-sm text-zinc-500 dark:text-zinc-400"
					>
						Reasoning
					</ReasoningTrigger>
					<ReasoningContent
						markdown
						content={message.reasoning}
						class="border-l-2 border-zinc-200 pl-3 dark:border-zinc-700"
					/>
				</Reasoning>
			{/if}
			<MessageContent
				markdown
				content={message.body}
				class="w-full max-w-none bg-transparent p-0"
			/>
			{#if message.imageUrls?.length > 0 || message.deletedImageCount > 0}
				<div class="mt-2 flex flex-wrap gap-2">
					{#each message.imageUrls as url}
						<img src={url} alt="Generated content" class="max-w-md rounded-lg shadow-md" />
					{/each}
					{#each Array(message.deletedImageCount || 0) as _}
						<div
							class="flex h-32 w-32 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800"
						>
							<ImageOff class="h-6 w-6 text-zinc-400" />
							<span class="text-[10px] text-zinc-400">Deleted</span>
						</div>
					{/each}
				</div>
			{:else if message.metadata?.isGeneratingImage}
				<div
					class="mt-2 flex animate-pulse items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 {getAspectSizeClass(
						message.metadata?.imageAspectRatio || '1:1'
					)}"
				>
					<Image class="h-8 w-8 text-zinc-300 dark:text-zinc-700" />
				</div>
			{/if}
		{:else}
			<MessageContent
				class="max-w-[90%] rounded-2xl rounded-tr-sm bg-zinc-900 px-5 py-3 text-[0.95rem] leading-relaxed whitespace-pre-wrap text-zinc-50 shadow-md md:max-w-[85%] dark:bg-zinc-100 dark:text-zinc-900"
			>
				{message.body}
			</MessageContent>
		{/if}
	</Message>

	{#if message.role === 'assistant' && message.usage}
		<div
			class="mt-1 px-1 transition-opacity duration-200 {revealedMetadata
				? 'opacity-100'
				: 'opacity-0 group-hover:opacity-100'}"
		>
			<div class="flex flex-col gap-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">
				<div class="flex items-center gap-2">
					<span class="font-medium text-zinc-500 dark:text-zinc-400">
						{message.model || 'Unknown Model'}
					</span>
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
			class="mt-1 flex items-center justify-end gap-2 px-1 transition-opacity duration-200 {revealedMetadata
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
