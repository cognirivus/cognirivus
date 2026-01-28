<script lang="ts">
	import { page } from '$app/state';
	import { ChartLine, BookCheck, Highlighter, Brain } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';

	let { children } = $props();

	const navItems = [
		{
			name: 'Content Progress',
			href: '/dashboard/content',
			icon: BookCheck
		},
		{
			name: 'Highlights',
			href: '/dashboard/highlights',
			icon: Highlighter
		},
		{
			name: 'Usage',
			href: '/dashboard/usage',
			icon: ChartLine
		},
		{
			name: 'Memories',
			href: '/dashboard/memories',
			icon: Brain
		}
	];

	const activePath = $derived(page.url.pathname);
</script>

<div class="flex min-h-[calc(100vh-3.5rem)] w-full flex-col bg-background">
	<!-- Sub-navigation Header -->
	<header class="sticky top-14 z-30 border-b border-border/40 bg-background/80 backdrop-blur-xl">
		<div class="mx-auto flex h-12 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
			<div class="flex items-center gap-6">
				<a
					href="/dashboard"
					class="text-sm font-semibold text-foreground transition-colors hover:text-foreground/80"
				>
					Dashboard
				</a>

				<nav class="hidden items-center gap-1 sm:flex">
					{#each navItems as item}
						{@const isActive = activePath === item.href}
						<a
							href={item.href}
							class={cn(
								'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
								isActive
									? 'bg-accent text-foreground'
									: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
							)}
						>
							<item.icon class="h-4 w-4" />
							{item.name}
						</a>
					{/each}
				</nav>
			</div>
		</div>

		<!-- Mobile navigation -->
		<div class="border-t border-border/40 sm:hidden">
			<nav class="flex items-center gap-1 overflow-x-auto px-4 py-2">
				{#each navItems as item}
					{@const isActive = activePath === item.href}
					<a
						href={item.href}
						class={cn(
							'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
							isActive
								? 'bg-accent text-foreground'
								: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
						)}
					>
						<item.icon class="h-3.5 w-3.5" />
						{item.name}
					</a>
				{/each}
			</nav>
		</div>
	</header>

	<!-- Main Content area -->
	<main class="flex-1">
		{@render children()}
	</main>
</div>
