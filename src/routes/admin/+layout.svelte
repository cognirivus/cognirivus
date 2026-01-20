<script lang="ts">
	import { page } from '$app/state';
	import { Shield, BookOpen, LayoutDashboard, FileText, Newspaper, Brain } from '@lucide/svelte';
	import { buttonVariants } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import { cn } from '$lib/utils.js';
	import { redirect } from '@sveltejs/kit';

	let { children } = $props();

	const user = $derived(page.data.currentUser);
	const isAdmin = $derived(
		user?.role && (Array.isArray(user.role) ? user.role.includes('admin') : user.role === 'admin')
	);

	// Client-side guard (Server-side should also be implemented in +layout.server.ts for full security)
	$effect(() => {
		if (user && !isAdmin) {
			window.location.href = '/';
		}
	});

	const navItems = [
		{
			name: 'Users',
			href: '/admin',
			icon: LayoutDashboard
		},
		{
			name: 'Blog',
			href: '/admin/blog',
			icon: BookOpen
		},
		{
			name: 'Content',
			href: '/admin/content',
			icon: FileText
		},
		{
			name: 'News',
			href: '/admin/news',
			icon: Newspaper
		},
		{
			name: 'Flashcards',
			href: '/admin/flashcards',
			icon: Brain
		}
	];

	const activePath = $derived(page.url.pathname);
</script>

<div class="flex h-[calc(100vh-4rem)] w-full flex-col bg-background">
	<!-- Admin Navbar -->
	<header class="border-b border-border bg-background/80 backdrop-blur-md">
		<div
			class="mx-auto flex h-auto min-h-[4rem] max-w-7xl flex-col items-start justify-center gap-2 px-6 py-3 sm:h-16 sm:flex-row sm:items-center sm:justify-between sm:py-0"
		>
			<div class="flex w-full items-center justify-between gap-8 sm:w-auto sm:justify-start">
				<div class="flex items-center gap-2">
					<Shield class="h-5 w-5 text-primary" />
					<h2 class="text-lg font-bold tracking-tight text-foreground sm:text-xl">Admin</h2>
				</div>
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
