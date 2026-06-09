<script lang="ts">
	import { getPrevAndNextDoc } from '../../../docs/registry';
	import { ArrowLeft, ArrowRight } from '@lucide/svelte';

	let { currentSlug = '' } = $props<{ currentSlug: string }>();

	const nav = $derived(getPrevAndNextDoc(currentSlug));
</script>

{#if nav.prev || nav.next}
	<div
		class="mt-16 flex flex-col gap-4 border-t border-border/50 pt-8 sm:flex-row sm:justify-between"
	>
		{#if nav.prev}
			<a
				href="/docs/{nav.prev.slug}"
				class="group flex flex-1 items-center gap-4 rounded-2xl border border-border/50 bg-card/30 p-5 transition-all duration-200 hover:border-border hover:bg-muted/10"
			>
				<ArrowLeft
					class="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:-translate-x-1"
				/>
				<div class="flex min-w-0 flex-col gap-1">
					<span class="text-xs font-semibold tracking-wider text-muted-foreground/60 uppercase"
						>Previous</span
					>
					<span class="truncate font-medium text-foreground">{nav.prev.title}</span>
				</div>
			</a>
		{:else}
			<div class="hidden flex-1 sm:block"></div>
		{/if}

		{#if nav.next}
			<a
				href="/docs/{nav.next.slug}"
				class="group flex flex-1 items-center justify-between gap-4 rounded-2xl border border-border/50 bg-card/30 p-5 text-right transition-all duration-200 hover:border-border hover:bg-muted/10"
			>
				<div class="flex min-w-0 flex-col gap-1 text-left sm:text-right">
					<span class="text-xs font-semibold tracking-wider text-muted-foreground/60 uppercase"
						>Next</span
					>
					<span class="truncate font-medium text-foreground">{nav.next.title}</span>
				</div>
				<ArrowRight
					class="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1"
				/>
			</a>
		{:else}
			<div class="hidden flex-1 sm:block"></div>
		{/if}
	</div>
{/if}
