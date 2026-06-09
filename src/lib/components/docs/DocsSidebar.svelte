<script lang="ts">
	import { page } from '$app/state';
	import { categories } from '../../../docs/registry';
	import * as Icons from '@lucide/svelte';

	let { currentSlug = '', onSelectPage = null } = $props<{
		currentSlug?: string;
		onSelectPage?: (() => void) | null;
	}>();

	// Type helper for Lucide icons
	function getIconComponent(name: string) {
		const IconComp = (Icons as any)[name];
		return IconComp || Icons.FileText;
	}
</script>

<nav class="flex flex-col gap-6 py-4">
	<!-- Top Level Links -->
	<div class="flex flex-col gap-1 border-b border-border/40 pb-4">
		<a
			href="/"
			class="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all duration-200"
		>
			<Icons.Home class="h-4 w-4 shrink-0 opacity-80" />
			<span>Home</span>
		</a>
		<a
			href="/docs"
			onclick={() => onSelectPage?.()}
			class="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-all duration-200
				{currentSlug === ''
				? 'bg-accent text-foreground'
				: 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}"
		>
			<Icons.BookOpen class="h-4 w-4 shrink-0 opacity-80" />
			<span>Docs Overview</span>
		</a>
	</div>

	{#each categories as category}
		<div class="flex flex-col gap-2">
			<h4 class="px-2 text-xs font-semibold tracking-wider text-muted-foreground/80 uppercase">
				{category.name}
			</h4>
			<ul class="flex flex-col gap-1">
				{#each category.docs as doc}
					{@const Icon = getIconComponent(doc.icon)}
					<li>
						<a
							href="/docs/{doc.slug}"
							onclick={() => onSelectPage?.()}
							class="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-all duration-200
								{currentSlug === doc.slug
								? 'bg-accent text-foreground'
								: 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}"
						>
							<Icon class="h-4 w-4 shrink-0 opacity-80" />
							<span class="truncate">{doc.title}</span>
						</a>
					</li>
				{/each}
			</ul>
		</div>
	{/each}
</nav>
