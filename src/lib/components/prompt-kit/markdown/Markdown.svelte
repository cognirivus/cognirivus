<script lang="ts">
	import { cn } from '$lib/utils';
	import { Streamdown, type StreamdownProps } from 'svelte-streamdown';
	import { mode } from 'mode-watcher';
	import type { HTMLAttributes } from 'svelte/elements';

	type Props = {
		content: string;
		id?: string;
		class?: string;
		sources?: Record<string, any>;
	} & Omit<StreamdownProps, 'content' | 'class' | 'sources'> &
		Omit<HTMLAttributes<HTMLDivElement>, 'content'>;

	let { content, id, class: className, sources, ...restProps }: Props = $props();
</script>

<div {id} class={cn(className)} {...restProps}>
	<Streamdown
		{content}
		{sources}
		class="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
		shikiTheme={mode.current === 'dark' ? 'github-dark-default' : 'github-light-default'}
		shikiPreloadThemes={['github-dark-default', 'github-light-default']}
		baseTheme="shadcn"
	>
		{#snippet inlineCitationContent({ source })}
			<div class="flex max-w-[300px] flex-col gap-2 p-1">
				<div class="flex items-start justify-between gap-4">
					<h4 class="text-sm leading-tight font-bold text-foreground">{source.title}</h4>
				</div>
				<p class="line-clamp-4 text-xs leading-relaxed text-muted-foreground">
					{source.content}
				</p>
				<div class="mt-1 flex flex-wrap gap-x-4 gap-y-2 border-t pt-2">
					<a
						href={source.url}
						class="flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline"
					>
						View Content
					</a>
				</div>
			</div>
		{/snippet}
	</Streamdown>
</div>
