<script lang="ts">
	import { PanelLeft, PanelRight } from '@lucide/svelte';
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';

	let {
		onclick,
		isOpen,
		class: className = '',
		title = 'Toggle sidebar',
		side = 'left'
	} = $props();

	const Icon = $derived(side === 'left' ? PanelLeft : PanelRight);
</script>

{#if !isOpen}
	<div class={cn('absolute top-4 z-50', side === 'left' ? 'left-4' : 'right-4', className)}>
		<Tooltip.Provider>
			<Tooltip.Root delayDuration={400}>
				<Tooltip.Trigger>
					<Button
						variant="outline"
						size="icon"
						{onclick}
						class="size-9 bg-card text-muted-foreground shadow-sm transition-all hover:bg-accent hover:text-foreground"
					>
						<Icon class="size-5" />
					</Button>
				</Tooltip.Trigger>
				<Tooltip.Content side="right">{title}</Tooltip.Content>
			</Tooltip.Root>
		</Tooltip.Provider>
	</div>
{/if}
