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

<div class="flex h-[calc(100vh-2.5rem)] w-full flex-col bg-background">
	<!-- Sub-navigation Navbar -->
	<header class="bg-background/80 backdrop-blur-md">
		<div
			class="mx-auto flex h-auto min-h-[2.5rem] max-w-6xl flex-col items-start justify-center gap-2 px-4 py-2 sm:h-10 sm:flex-row sm:items-center sm:justify-between sm:py-0"
		>
			<div class="flex w-full items-center justify-between gap-8 sm:w-auto sm:justify-start">
				<a
					href="/dashboard"
					class="text-sm font-bold tracking-tight text-foreground hover:text-primary">Dashboard</a
				>
				<!-- Hidden on desktop, shown on mobile for compact menu -->
			</div>
			<nav class="flex w-full items-center gap-0.5 overflow-x-auto pb-1 sm:w-auto sm:pb-0">
				{#each navItems as item}
					{@const isActive = activePath === item.href}
					<a
						href={item.href}
						class={cn(
							buttonVariants({
								variant: isActive ? 'secondary' : 'ghost',
								size: 'sm'
							}),
							'flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-bold tracking-tight uppercase transition-colors',
							isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
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
	<main class="flex-1 overflow-y-auto">
		{@render children()}
	</main>
</div>
