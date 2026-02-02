<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';
	import { AlertCircle } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';

	type Props = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		message: string;
		title?: string;
		onRetry?: () => void;
	};

	let {
		ref = $bindable(null),
		class: className,
		message,
		title = 'Something went wrong',
		onRetry,
		...restProps
	}: Props = $props();
</script>

<div
	bind:this={ref}
	data-slot="error-state"
	role="alert"
	aria-live="assertive"
	class={cn(
		'flex flex-col items-center justify-center gap-4 rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center',
		className
	)}
	{...restProps}
>
	<div
		class="flex size-12 items-center justify-center rounded-full bg-destructive/20"
		aria-hidden="true"
	>
		<AlertCircle class="size-6 text-destructive" />
	</div>

	<div class="flex flex-col gap-1">
		<h3 class="text-lg font-semibold text-foreground">
			{title}
		</h3>
		<p class="text-sm text-muted-foreground">
			{message}
		</p>
	</div>

	{#if onRetry}
		<Button variant="outline" size="sm" onclick={onRetry}>Try again</Button>
	{/if}
</div>
