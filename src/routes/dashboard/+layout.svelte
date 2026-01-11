<script lang="ts">
	import { page } from '$app/state';
	import { BarChart3, Settings } from '@lucide/svelte';

	let { children } = $props();

	const navItems = [
		{
			name: 'Usage',
			href: '/dashboard/usage',
			icon: BarChart3
		},
		{
			name: 'Memories',
			href: '/dashboard/memories',
			icon: Settings
		}
	];

	const activePath = $derived(page.url.pathname);
</script>

<div class="flex h-screen w-full flex-col bg-background">
	<!-- Sub-navigation Navbar -->
	<header class="border-b border-border bg-card/50 backdrop-blur-md">
		<div class="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
			<div class="flex items-center gap-8">
				<h2 class="text-xl font-bold tracking-tight text-foreground">Dashboard</h2>
				<nav class="flex items-center gap-1">
					{#each navItems as item}
						{@const isActive = activePath === item.href}
						<a
							href={item.href}
							class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors {isActive
								? 'bg-primary/10 text-primary'
								: 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
						>
							<item.icon class="h-4 w-4" />
							{item.name}
						</a>
					{/each}
				</nav>
			</div>
		</div>
	</header>

	<!-- Main Content area -->
	<main class="flex-1 overflow-y-auto">
		{@render children()}
	</main>
</div>
