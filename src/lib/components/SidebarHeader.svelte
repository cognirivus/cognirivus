<script lang="ts">
	import Logo from './Logo.svelte';
	import { PanelLeft, PanelRight, X } from '@lucide/svelte';

	let {
		onClose,
		title = 'Close sidebar',
		side = 'left',
		showLogo = true,
		icon: IconOverride = null
	} = $props();

	const DefaultIcon = $derived(side === 'left' ? PanelLeft : PanelRight);
	const Icon = $derived(IconOverride || DefaultIcon);
</script>

<div
	class="flex items-center justify-between px-4 py-5 {side === 'right' ? 'flex-row-reverse' : ''}"
>
	{#if showLogo}
		<Logo size="sm" />
	{:else}
		<div class="w-8"></div>
	{/if}
	<button
		onclick={onClose}
		class="flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
		{title}
	>
		<Icon class="size-5" />
	</button>
</div>
