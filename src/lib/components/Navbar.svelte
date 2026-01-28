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
		LayoutDashboard,
		ShieldCheck,
		User,
		Users,
		Menu,
		BookOpen,
		Brain,
		X,
		ChevronDown,
		Library
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
		{ name: 'Knowledge Base', href: '/content', icon: Library, authRequired: false, inPrep: true },
		{ name: 'Flashcards', href: '/flashcards', icon: Brain, authRequired: true, inPrep: true },
		{ name: 'Groups', href: '/groups', icon: Users, authRequired: true },
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

	// Prep dropdown items
	const prepItems = $derived(filteredNavItems.filter((item) => (item as any).inPrep));

	// For desktop: Hide Dashboard, Admin and Prep items from the main bar
	const desktopNavItems = $derived(
		filteredNavItems.filter(
			(item) => !['Dashboard', 'Admin'].includes(item.name) && !(item as any).inPrep
		)
	);

	async function signOut() {
		await authClient.signOut();
		await invalidateAll();
	}
</script>

<nav class="sticky top-0 z-40 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl">
	<div class="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
		<!-- Logo -->
		<Logo />

		<!-- Desktop Navigation -->
		<div class="hidden items-center gap-1 md:flex">
			{#if auth.isLoading && !user}
				<div class="flex items-center gap-1">
					<div class="h-8 w-14 animate-pulse rounded-md bg-muted"></div>
					<div class="h-8 w-14 animate-pulse rounded-md bg-muted"></div>
					<div class="h-8 w-16 animate-pulse rounded-md bg-muted"></div>
				</div>
			{:else}
				<!-- Only show content links here, management links go to dropdown -->
				{#each desktopNavItems as item}
					<a
						href={item.href}
						class="rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 {page.url
							.pathname === item.href
							? 'bg-accent text-foreground'
							: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
					>
						{item.name}
					</a>
				{/each}

				<!-- Prep Dropdown -->
				{#if prepItems.length > 0}
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button
									variant="ghost"
									size="sm"
									class="h-9 gap-1.5 px-3 text-sm font-medium {prepItems.some(
										(i) => page.url.pathname === i.href
									)
										? 'bg-accent text-foreground'
										: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
									{...props}
								>
									Prep
									<ChevronDown class="h-3.5 w-3.5 opacity-60" />
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="start" class="w-48">
							{#each prepItems as item}
								<DropdownMenu.Item>
									<a href={item.href} class="flex w-full items-center gap-2.5">
										<item.icon class="h-4 w-4 text-muted-foreground" />
										<span>{item.name}</span>
									</a>
								</DropdownMenu.Item>
							{/each}
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				{/if}
			{/if}
		</div>

		<!-- Right side actions -->
		<div class="hidden items-center gap-2 md:flex">
			{#if auth.isLoading && !user}
				<div class="flex items-center gap-2">
					<div class="h-8 w-20 animate-pulse rounded-md bg-muted"></div>
				</div>
			{:else if user}
				<!-- User Dropdown Menu -->
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button
								variant="ghost"
								size="sm"
								class="h-9 gap-2 px-3 text-sm font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground"
								{...props}
							>
								<div class="flex h-6 w-6 items-center justify-center rounded-full bg-foreground/10">
									<User class="h-3.5 w-3.5" />
								</div>
								<span class="max-w-24 truncate">{user.name ?? 'Account'}</span>
								<ChevronDown class="h-3.5 w-3.5 opacity-60" />
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
									<LayoutDashboard class="mr-2.5 h-4 w-4 text-muted-foreground" />
									<span>Dashboard</span>
								</a>
							</DropdownMenu.Item>
							{#if isAdmin}
								<DropdownMenu.Item>
									<a href="/admin" class="flex w-full items-center">
										<ShieldCheck class="mr-2.5 h-4 w-4 text-muted-foreground" />
										<span>Admin</span>
									</a>
								</DropdownMenu.Item>
							{/if}
							<DropdownMenu.Item>
								<a href="/profile" class="flex w-full items-center">
									<User class="mr-2.5 h-4 w-4 text-muted-foreground" />
									<span>Profile</span>
								</a>
							</DropdownMenu.Item>
						</DropdownMenu.Group>
						<DropdownMenu.Separator />
						<DropdownMenu.Item onclick={signOut}>
							<LogOut class="mr-2.5 h-4 w-4 text-muted-foreground" />
							<span>Sign Out</span>
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{:else}
				<Button
					variant="default"
					size="sm"
					href="/signin"
					class="h-9 gap-2 px-4 text-sm font-medium"
				>
					<span>Sign In</span>
				</Button>
			{/if}
			<ThemeToggle />
		</div>

		<!-- Mobile Menu Button -->
		<div class="flex items-center gap-2 md:hidden">
			<ThemeToggle />
			<Button
				variant="ghost"
				size="icon"
				class="h-9 w-9"
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
		<div class="border-t border-border/40 bg-background md:hidden">
			<div class="space-y-1 px-4 py-4">
				{#if auth.isLoading && !user}
					<div class="space-y-2">
						<div class="h-11 w-full animate-pulse rounded-lg bg-muted"></div>
						<div class="h-11 w-full animate-pulse rounded-lg bg-muted"></div>
						<div class="h-11 w-full animate-pulse rounded-lg bg-muted"></div>
					</div>
				{:else}
					<!-- In mobile, show items grouped logically -->
					{#each filteredNavItems.filter((item) => !item.inPrep) as item}
						<a
							href={item.href}
							class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors {page
								.url.pathname === item.href
								? 'bg-accent text-foreground'
								: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
							onclick={() => (isMobileMenuOpen = false)}
						>
							<item.icon class="h-4 w-4" />
							{item.name}
						</a>
					{/each}

					{#if prepItems.length > 0}
						<div class="pt-4 pb-1">
							<p class="px-3 text-xs font-medium tracking-wide text-muted-foreground/60 uppercase">
								Prep Tools
							</p>
						</div>

						{#each prepItems as item}
							<a
								href={item.href}
								class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors {page
									.url.pathname === item.href
									? 'bg-accent text-foreground'
									: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
								onclick={() => (isMobileMenuOpen = false)}
							>
								<item.icon class="h-4 w-4" />
								{item.name}
							</a>
						{/each}
					{/if}
				{/if}

				<Separator class="my-3" />

				<div>
					{#if auth.isLoading && !user}
						<div class="mt-2">
							<div class="h-11 w-full animate-pulse rounded-lg bg-muted"></div>
						</div>
					{:else if user}
						<a
							href="/profile"
							class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
							onclick={() => (isMobileMenuOpen = false)}
						>
							<User class="h-4 w-4" />
							Profile
						</a>
						<button
							onclick={() => {
								signOut();
								isMobileMenuOpen = false;
							}}
							class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
						>
							<LogOut class="h-4 w-4" />
							Sign Out
						</button>
					{:else}
						<a
							href="/signin"
							class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent/50"
							onclick={() => (isMobileMenuOpen = false)}
						>
							<LogIn class="h-4 w-4" />
							Sign In
						</a>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</nav>
