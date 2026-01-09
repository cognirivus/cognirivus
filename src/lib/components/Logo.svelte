<script lang="ts">
	import { Sparkles } from '@lucide/svelte';
	import { cn } from '$lib/utils';

	let { class: className = '', size = 'md' } = $props();

	const sizes = {
		sm: { container: 'h-8 w-8', icon: 'size-4', text: 'text-lg' },
		md: { container: 'h-9 w-9', icon: 'size-5', text: 'text-xl' }
	};

	const current = $derived(sizes[size as keyof typeof sizes] || sizes.md);
</script>

<a href="/" class={cn('flex items-center gap-2.5 transition-all hover:opacity-90', className)}>
	<div
		class={cn(
			'flex items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm',
			current.container
		)}
	>
		<Sparkles class={current.icon} />
	</div>
	<span class={cn('font-bold tracking-tight', current.text)}>Cognirivus</span>
</a>
