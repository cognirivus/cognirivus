<script lang="ts">
	import { page } from '$app/state';
	import { ChartLine, Settings, BookCheck } from '@lucide/svelte';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils.js';

	let { children } = $props();

	const navItems = [
		{
			name: 'Content Progress',
			href: '/dashboard/content',
			icon: BookCheck
		},
		{
			name: 'Usage',
			href: '/dashboard/usage',
			icon: ChartLine
		},
		{
			name: 'Memories',
			href: '/dashboard/memories',
			icon: Settings
		}
	];

	const activePath = $derived(page.url.pathname);
</script>

<div class="flex h-[calc(100vh-4rem)] w-full flex-col bg-background">
	<!-- Sub-navigation Navbar -->
	<header class="border-b border-border bg-background/80 backdrop-blur-md">
		<div
			class="mx-auto flex h-auto min-h-[4rem] max-w-6xl flex-col items-start justify-center gap-2 py-3 sm:h-16 sm:flex-row sm:items-center sm:justify-between sm:py-0"
		>
			<div class="flex w-full items-center justify-between gap-8 sm:w-auto sm:justify-start">
				<a
					href="/dashboard"
					class="text-lg font-bold tracking-tight text-foreground hover:text-primary sm:text-xl"
					>Dashboard</a
				>
				<!-- Hidden on desktop, shown on mobile for compact menu -->
			</div>
			<nav class="flex w-full items-center gap-1 overflow-x-auto pb-1 sm:w-auto sm:pb-0">
				{#each navItems as item}
					{@const isActive = activePath === item.href}
					<a
						href={item.href}
						class={cn(
							buttonVariants({
								variant: isActive ? 'secondary' : 'ghost',
								size: 'sm'
							}),
							'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
							isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
						)}
					>
						<item.icon class="h-4 w-4" />
						{item.name}
					</a>
				{/each}
			</nav>
		</div>
	</header>

	<!-- Main Content area -->
	<main class="flex-1 overflow-y-auto">
		{@render children()}
	</main>
</div>
