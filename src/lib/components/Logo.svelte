<script lang="ts">
	import { Sparkles } from '@lucide/svelte';
	import { cn } from '$lib/utils';

	let { class: className = '', size = 'md' } = $props();

	const sizes = {
		sm: { container: 'h-7 w-7', icon: 'size-3.5', text: 'text-base' },
		md: { container: 'h-8 w-8', icon: 'size-4', text: 'text-lg' },
		lg: { container: 'h-10 w-10', icon: 'size-5', text: 'text-xl' }
	};

	const current = $derived(sizes[size as keyof typeof sizes] || sizes.md);
</script>

<a href="/" class={cn('group flex items-center gap-2 transition-all duration-200', className)}>
	<div
		class={cn(
			'relative flex items-center justify-center rounded-lg bg-foreground text-background transition-transform duration-200 group-hover:scale-105',
			current.container
		)}
	>
		<Sparkles class={cn('transition-transform duration-200', current.icon)} />
	</div>
	<span class={cn('font-semibold tracking-tight text-foreground', current.text)}> Cognirivus </span>
</a>
