<script lang="ts">
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { authClient } from '$lib/auth-client';
	import { page } from '$app/state';
	import ThemeToggle from './theme-toggle.svelte';
	import {
		LogIn,
		LogOut,
		MessageSquare,
		Image as ImageIcon,
		LayoutDashboard,
		ShieldCheck,
		User,
		Menu,
		BookOpen,
		Brain,
		X,
		ChevronDown,
		Newspaper
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Separator } from '$lib/components/ui/separator';
	import Logo from './Logo.svelte';
	import { invalidateAll } from '$app/navigation';

	const auth = useAuth();
	const currentUserQuery = useQuery(api.auth.getCurrentUser, {}, () => ({
		initialData: (page.data as any).currentUser,
		keepPreviousData: true
	}));
	const user = $derived(currentUserQuery.data);

	// Helper to check admin status
	const isAdmin = $derived(
		user?.role && (Array.isArray(user.role) ? user.role.includes('admin') : user.role === 'admin')
	);

	let isMobileMenuOpen = $state(false);

	const navItems = [
		{ name: 'Chat', href: '/chat', icon: MessageSquare, authRequired: true },
		{ name: 'Images', href: '/image', icon: ImageIcon, authRequired: true },
		{ name: 'Current Affairs', href: '/currentaffairs', icon: Newspaper, authRequired: false },
		{ name: 'Knowledge Base', href: '/content', icon: Brain, authRequired: false },
		{ name: 'Blog', href: '/blog', icon: BookOpen, authRequired: false },
		{ name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, authRequired: true },
		{ name: 'Admin', href: '/admin', icon: ShieldCheck, adminOnly: true }
	];

	const filteredNavItems = $derived(
		navItems.filter((item) => {
			if (item.adminOnly) {
				return isAdmin;
			}
			return !item.authRequired || !!user;
		})
	);

	// For desktop: Hide Dashboard and Admin from the main bar (move to dropdown)
	const desktopNavItems = $derived(
		filteredNavItems.filter((item) => !['Dashboard', 'Admin'].includes(item.name))
	);

	async function signOut() {
		await authClient.signOut();
		await invalidateAll();
	}
</script>

<nav class="sticky top-0 z-40 w-full bg-background/80 backdrop-blur-md">
	<div
		class="container mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8"
	>
		<!-- Logo -->
		<Logo />

		<!-- Desktop Navigation -->
		<div class="hidden md:flex md:items-center md:gap-1">
			{#if auth.isLoading && !user}
				<div class="flex items-center gap-2">
					<div class="h-8 w-16 animate-pulse rounded-md bg-muted/60"></div>
					<div class="h-8 w-16 animate-pulse rounded-md bg-muted/60"></div>
					<div class="h-8 w-20 animate-pulse rounded-md bg-muted/60"></div>
				</div>
			{:else}
				<!-- Only show content links here, management links go to dropdown -->
				{#each desktopNavItems as item}
					<a
						href={item.href}
						class="rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground {page
							.url.pathname === item.href
							? 'text-primary'
							: 'text-muted-foreground'}"
					>
						{item.name}
					</a>
				{/each}
			{/if}

			<div class="ml-4 flex items-center gap-3">
				{#if auth.isLoading && !user}
					<div class="flex items-center gap-3">
						<div class="h-8 w-24 animate-pulse rounded-md bg-muted/60"></div>
					</div>
				{:else if user}
					<!-- User Dropdown Menu -->
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button variant="ghost" size="sm" class="gap-2" {...props}>
									<User class="h-4 w-4" />
									<span class="max-w-25 truncate">{user.name ?? 'Account'}</span>
									<ChevronDown class="h-3 w-3 opacity-50" />
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end" class="w-56">
							<DropdownMenu.Label>
								<div class="flex flex-col space-y-1">
									<p class="text-sm leading-none font-medium">{user.name}</p>
									<p class="text-xs leading-none text-muted-foreground">
										{user.email}
									</p>
								</div>
							</DropdownMenu.Label>
							<DropdownMenu.Separator />
							<DropdownMenu.Group>
								<DropdownMenu.Item>
									<a href="/dashboard" class="flex w-full items-center">
										<LayoutDashboard class="mr-2 h-4 w-4" />
										<span>Dashboard</span>
									</a>
								</DropdownMenu.Item>
								{#if isAdmin}
									<DropdownMenu.Item>
										<a href="/admin" class="flex w-full items-center">
											<ShieldCheck class="mr-2 h-4 w-4" />
											<span>Admin</span>
										</a>
									</DropdownMenu.Item>
								{/if}
								<DropdownMenu.Item>
									<a href="/profile" class="flex w-full items-center">
										<User class="mr-2 h-4 w-4" />
										<span>Profile</span>
									</a>
								</DropdownMenu.Item>
							</DropdownMenu.Group>
							<DropdownMenu.Separator />
							<DropdownMenu.Item onclick={signOut}>
								<LogOut class="mr-2 h-4 w-4" />
								<span>Sign Out</span>
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				{:else}
					<Button variant="default" size="sm" href="/signin" class="gap-2 shadow-sm">
						<LogIn class="h-4 w-4" />
						<span>Sign In</span>
					</Button>
				{/if}
				<ThemeToggle />
			</div>
		</div>

		<!-- Mobile Menu Button -->
		<div class="flex items-center gap-2 md:hidden">
			<ThemeToggle />
			<Button
				variant="ghost"
				size="icon"
				onclick={() => (isMobileMenuOpen = !isMobileMenuOpen)}
				aria-label="Toggle menu"
			>
				{#if isMobileMenuOpen}
					<X class="h-5 w-5" />
				{:else}
					<Menu class="h-5 w-5" />
				{/if}
			</Button>
		</div>
	</div>

	<!-- Mobile Navigation -->
	{#if isMobileMenuOpen}
		<div class="border-b border-border bg-background/95 backdrop-blur-md md:hidden">
			<div class="space-y-1 px-4 py-4">
				{#if auth.isLoading && !user}
					<div class="space-y-2 py-2">
						<div class="h-12 w-full animate-pulse rounded-lg bg-muted/60"></div>
						<div class="h-12 w-full animate-pulse rounded-lg bg-muted/60"></div>
						<div class="h-12 w-full animate-pulse rounded-lg bg-muted/60"></div>
					</div>
				{:else}
					<!-- In mobile, show ALL items including Dashboard/Admin in the main list -->
					{#each filteredNavItems as item}
						<a
							href={item.href}
							class="flex items-center gap-3 rounded-lg px-3 py-3 text-base font-medium transition-colors hover:bg-accent {page
								.url.pathname === item.href
								? 'bg-accent/50 text-primary'
								: 'text-muted-foreground'}"
							onclick={() => (isMobileMenuOpen = false)}
						>
							<item.icon class="h-5 w-5" />
							{item.name}
						</a>
					{/each}
				{/if}

				<Separator class="my-2" />

				<div>
					{#if auth.isLoading && !user}
						<div class="mt-2 space-y-2">
							<div class="h-12 w-full animate-pulse rounded-lg bg-muted/60"></div>
						</div>
					{:else if user}
						<a
							href="/profile"
							class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-base font-medium text-muted-foreground transition-colors hover:bg-accent"
							onclick={() => (isMobileMenuOpen = false)}
						>
							<User class="h-5 w-5" />
							Profile
						</a>
						<button
							onclick={() => {
								signOut();
								isMobileMenuOpen = false;
							}}
							class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-base font-medium text-destructive transition-colors hover:bg-destructive/10"
						>
							<LogOut class="h-5 w-5" />
							Sign Out
						</button>
					{:else}
						<a
							href="/signin"
							class="flex items-center gap-3 rounded-lg px-3 py-3 text-base font-medium transition-colors hover:bg-accent"
							onclick={() => (isMobileMenuOpen = false)}
						>
							<LogIn class="h-5 w-5" />
							Sign In
						</a>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</nav>
