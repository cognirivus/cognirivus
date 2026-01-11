<script lang="ts">
	import { Terminal, Square, Image, ImageOff, Brain } from '@lucide/svelte';
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
	let showLearnedFacts = $state(false);
	let showUsedMemories = $state(false);

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

	import { onMount } from 'svelte';
	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});
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
						class="text-sm text-muted-foreground transition-colors hover:text-foreground"
					>
						Reasoning
					</ReasoningTrigger>
					<ReasoningContent
						markdown
						content={message.reasoning}
						class="border-l-2 border-border pl-4 italic"
					/>
				</Reasoning>
			{/if}
			<MessageContent
				markdown
				content={message.body}
				class="w-full max-w-none bg-transparent p-0 leading-relaxed"
			/>
			{#if message.imageUrls?.length > 0 || message.deletedImageCount > 0}
				<div class="mt-2 flex flex-wrap gap-2">
					{#each message.imageUrls as url}
						<img
							src={url}
							alt="Generated content"
							class="max-w-md rounded-lg border border-border shadow-sm"
						/>
					{/each}
					{#each Array(message.deletedImageCount || 0) as _}
						<div
							class="flex h-32 w-32 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-muted/30"
						>
							<ImageOff class="h-6 w-6 text-muted-foreground" />
							<span class="text-[10px] text-muted-foreground">Deleted</span>
						</div>
					{/each}
				</div>
			{:else if message.metadata?.isGeneratingImage}
				<div
					class="mt-2 flex animate-pulse items-center justify-center rounded-lg border border-border bg-muted/50 {getAspectSizeClass(
						message.metadata?.imageAspectRatio || '1:1'
					)}"
				>
					<div class="flex flex-col items-center gap-2">
						<Image class="h-8 w-8 text-muted-foreground/30" />
						<span class="text-[10px] font-medium tracking-wider text-muted-foreground/50"
							>GENERATING...</span
						>
					</div>
				</div>
			{/if}
		{:else}
			<MessageContent
				class="max-w-[90%] rounded-2xl rounded-tr-sm bg-primary px-5 py-3 text-[0.95rem] leading-relaxed whitespace-pre-wrap text-primary-foreground shadow-md md:max-w-[85%]"
			>
				{message.body}
			</MessageContent>
		{/if}
	</Message>

	{#if message.role === 'user' && message.metadata?.memoriesAdded?.length > 0}
		<div
			class="mt-1 flex animate-in items-center gap-1.5 px-1 duration-500 fade-in slide-in-from-right-2"
		>
			<button
				onclick={(e) => {
					e.stopPropagation();
					showLearnedFacts = !showLearnedFacts;
				}}
				class="group/learned relative flex cursor-pointer items-center gap-1 rounded-full border border-emerald-200/50 bg-emerald-100 px-2 py-0.5 text-[9px] font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-950/30 dark:text-emerald-400"
			>
				<Brain class="h-2.5 w-2.5" />
				<span
					>Learned {message.metadata.memoriesAdded.length}
					{message.metadata.memoriesAdded.length === 1 ? 'Fact' : 'Facts'}</span
				>

				<!-- Tooltip with the actual facts -->
				<div
					class="pointer-events-none absolute right-0 bottom-full z-10 mb-2 w-64 rounded-xl border border-border bg-popover p-3 text-left text-popover-foreground shadow-xl transition-all duration-200 {showLearnedFacts
						? 'block translate-y-0 opacity-100'
						: 'hidden group-hover/learned:block'}"
				>
					<p class="mb-2 text-[10px] font-bold text-foreground">New Memories Learned:</p>
					<div class="space-y-2">
						{#each message.metadata.memoriesAdded as mem}
							<div class="flex flex-col gap-0.5 border-l-2 border-emerald-500/30 pl-2">
								<span class="text-[10px] leading-relaxed text-foreground/90">{mem.text}</span>
								<span class="text-[8px] font-bold tracking-wider text-emerald-600/80 uppercase"
									>{mem.category}</span
								>
							</div>
						{/each}
					</div>
				</div>
			</button>
		</div>
	{/if}

	{#if message.role === 'assistant' && message.usage}
		<div
			class="mt-1 px-1 transition-opacity duration-200 {revealedMetadata
				? 'opacity-100'
				: 'opacity-0 group-hover:opacity-100'}"
		>
			<div class="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
				<div class="flex items-center gap-2">
					<span class="font-bold tracking-tight text-foreground/70">
						{message.model?.split('/').pop() || 'Unknown Model'}
					</span>
					<span class="text-border">•</span>
					<span>{mounted ? new Date(message.createdAt).toLocaleString() : ''}</span>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<span>Prompt: {message.usage.promptTokens}</span>
					<span>Completions: {message.usage.completionTokens}</span>
					{#if message.cost !== undefined}
						<span class="font-bold text-foreground/80">
							${message.cost.toFixed(6)}
						</span>
					{/if}
					{#if message.isCancelled || message.metadata?.cancelled}
						<div
							class="flex items-center gap-1 text-[9px] font-bold tracking-tight text-destructive/80 uppercase"
						>
							<Square class="h-2.5 w-2.5" fill="currentColor" />
							<span>Cancelled</span>
						</div>
					{/if}
					{#if message.metadata?.usedMemories?.length > 0}
						<button
							class="group/mem relative flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary transition-colors hover:bg-primary/20"
							title="Memories used for this response"
							onclick={(e) => {
								e.stopPropagation();
								showUsedMemories = !showUsedMemories;
							}}
						>
							<Brain class="h-3 w-3" />
							<span>{message.metadata.usedMemories.length} memories</span>
							<div
								class="pointer-events-none absolute bottom-full left-0 z-50 mb-2 w-64 rounded-lg border border-border bg-popover p-2 text-left text-popover-foreground shadow-lg transition-all duration-200 {showUsedMemories
									? 'block translate-y-0 opacity-100'
									: 'hidden group-hover/mem:block'}"
							>
								<p class="mb-1 text-[10px] font-semibold">Memories used:</p>
								<ul class="list-inside list-disc space-y-0.5 text-[10px]">
									{#each message.metadata.usedMemories as mem}
										<li class="flex items-center gap-1">
											<span class="flex-1 truncate">{mem.text}</span>
											{#if mem._score !== undefined}
												<span
													class="shrink-0 rounded bg-primary/20 px-1 text-[8px] font-medium text-primary"
												>
													{(mem._score * 100).toFixed(0)}%
												</span>
											{/if}
										</li>
									{/each}
								</ul>
							</div>
						</button>
					{/if}

					<button
						class="flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
						title="View technical context (JSON)"
						onclick={(e) => {
							e.stopPropagation();
							onViewContext(message._id);
						}}
					>
						<Terminal class="h-3 w-3" />
						<span>Context</span>
					</button>
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
			<span class="text-[10px] text-muted-foreground">
				{mounted ? new Date(message.createdAt).toLocaleString() : ''}
			</span>
			<button
				onclick={(e) => {
					e.stopPropagation();
					onViewContext(message._id);
				}}
				class="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
				title="View context sent to AI"
			>
				<Terminal class="h-3.5 w-3.5" />
			</button>
		</div>
	{/if}
</div>
