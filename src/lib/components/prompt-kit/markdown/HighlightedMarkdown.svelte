<script lang="ts">
	import { cn } from '$lib/utils';
	import { Streamdown, type StreamdownProps, type Extension } from 'svelte-streamdown';
	import { mode } from 'mode-watcher';
	import type { HTMLAttributes } from 'svelte/elements';
	import { highlightStore } from '$lib/stores/highlights.svelte';

	type Props = {
		content: string;
		id?: string;
		class?: string;
	} & Omit<StreamdownProps, 'content' | 'class'> &
		Omit<HTMLAttributes<HTMLDivElement>, 'content'>;

	let { content, id, class: className, ...restProps }: Props = $props();

	// Custom extension to parse <hl>...</hl> tags
	const highlightExtension: Extension = {
		name: 'highlight',
		level: 'inline',
		start(src: string) {
			return src.indexOf('<hl>');
		},
		tokenizer(src: string) {
			const match = src.match(/^<hl>(.*?)<\/hl>/);
			if (match) {
				return {
					type: 'highlight',
					raw: match[0],
					text: match[1]
				};
			}
			return undefined;
		}
	};
</script>

<div {id} class={cn(className)} {...restProps}>
	<Streamdown
		{content}
		extensions={[highlightExtension]}
		class="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
		shikiTheme={mode.current === 'dark' ? 'github-dark-default' : 'github-light-default'}
		shikiPreloadThemes={['github-dark-default', 'github-light-default']}
		baseTheme="shadcn"
		animation={{
			enabled: true,
			type: 'blur',
			tokenize: 'word',
			duration: 300,
			animateOnMount: true
		}}
	>
		{#snippet children({ token })}
			{#if token.type === 'highlight'}
				{#if highlightStore.enabled}
					<mark class="hl">{token.text}</mark>
				{:else}
					{token.text}
				{/if}
			{/if}
		{/snippet}
	</Streamdown>
</div>

<style>
	:global(.hl) {
		background: #fef08a;
		color: #1a1a1a;
		padding: 0.1em 0.3em;
		border-radius: 0.25em;
		font-weight: 600;
	}

	:global(.dark .hl) {
		background: #facc15;
		color: #0a0a0a;
	}
</style>
