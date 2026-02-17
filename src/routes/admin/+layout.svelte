<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { RouteId } from '$app/types';
	import {
		Shield,
		BookOpen,
		LayoutDashboard,
		FileText,
		Newspaper,
		Brain,
		CircleHelp,
		Sparkles,
		Bot,
		Cpu,
		ShieldCheck,
		Database
	} from '@lucide/svelte';
	import { buttonVariants } from '$lib/components/ui/button';
	import { cn } from '$lib/utils.js';

	let { children } = $props();

	type AdminUser = {
		role?: string | string[];
	} | null;

	type AdminNavHref =
		| '/admin'
		| '/admin/blog'
		| '/admin/content'
		| '/admin/news'
		| '/admin/syllabus'
		| '/admin/flashcards'
		| '/admin/mcqs'
		| '/admin/extraction'
		| '/admin/article'
		| '/admin/entities'
		| '/admin/agents'
		| '/admin/models'
		| '/admin/limits';

	type NavItem = {
		name: string;
		href: Extract<Exclude<RouteId, null>, AdminNavHref>;
		icon: typeof Shield;
	};

	const user = $derived(page.data.currentUser as AdminUser);
	const isAdmin = $derived(
		user?.role && (Array.isArray(user.role) ? user.role.includes('admin') : user.role === 'admin')
	);

	// Client-side guard (Server-side should also be implemented in +layout.server.ts for full security)
	$effect(() => {
		if (user && !isAdmin) {
			window.location.href = '/';
		}
	});

	const navItems: NavItem[] = [
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
			name: 'Syllabus',
			href: '/admin/syllabus',
			icon: BookOpen
		},
		{
			name: 'Flashcards',
			href: '/admin/flashcards',
			icon: Brain
		},
		{
			name: 'MCQs',
			href: '/admin/mcqs',
			icon: CircleHelp
		},
		{
			name: 'Extraction',
			href: '/admin/extraction',
			icon: Sparkles
		},
		{
			name: 'Articles',
			href: '/admin/article',
			icon: FileText
		},
		{
			name: 'Entities',
			href: '/admin/entities',
			icon: Database
		},
		{
			name: 'Agents',
			href: '/admin/agents',
			icon: Bot
		},
		{
			name: 'Models',
			href: '/admin/models',
			icon: Cpu
		},
		{
			name: 'Rate Limits',
			href: '/admin/limits',
			icon: ShieldCheck
		}
	];

	const activePath = $derived(page.url.pathname);
</script>

<div class="flex h-[calc(100vh-2.5rem)] w-full flex-col bg-background">
	<!-- Admin Navbar -->
	<header class="bg-background/80 backdrop-blur-md">
		<div
			class="mx-auto flex h-auto min-h-[2.5rem] max-w-7xl flex-col items-start justify-center gap-2 px-6 py-2 sm:h-10 sm:flex-row sm:items-center sm:justify-between sm:py-0"
		>
			<div class="flex w-full items-center justify-between gap-8 sm:w-auto sm:justify-start">
				<div class="flex items-center gap-2">
					<Shield class="h-4 w-4 text-primary" />
					<h2 class="text-sm font-bold tracking-tight text-foreground uppercase">Admin</h2>
				</div>
			</div>
			<nav class="flex w-full items-center gap-0.5 overflow-x-auto pb-1 sm:w-auto sm:pb-0">
				{#each navItems as item (item.href)}
					{@const isActive = activePath === item.href}
					<a
						href={resolve(item.href)}
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
