<script lang="ts">
	import { useAuth } from '@mmailaender/convex-auth-svelte/sveltekit';
	import { page } from '$app/state';
	import ThemeToggle from './theme-toggle.svelte';
	import {
		LogIn,
		LogOut,
		MessageSquare,
		Image as ImageIcon,
		LayoutDashboard,
		Menu,
		X
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import Logo from './Logo.svelte';

	const auth = useAuth();

	let isMobileMenuOpen = $state(false);

	const navItems = [
		{ name: 'Chat', href: '/chat', icon: MessageSquare, authRequired: true },
		{ name: 'Images', href: '/image', icon: ImageIcon, authRequired: true },
		{ name: 'Usage', href: '/chat/usage', icon: LayoutDashboard, authRequired: true }
	];

	const filteredNavItems = $derived(
		navItems.filter((item) => !item.authRequired || auth.isAuthenticated)
	);
</script>

<nav class="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md">
	<div
		class="container mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8"
	>
		<!-- Logo -->
		<Logo />

		<!-- Desktop Navigation -->
		<div class="hidden md:flex md:items-center md:gap-1">
			{#each filteredNavItems as item}
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

			<div class="ml-4 flex items-center gap-3 border-l border-border pl-4">
				<ThemeToggle />
				{#if auth.isAuthenticated}
					<Button
						variant="ghost"
						size="sm"
						onclick={() => auth.signOut()}
						class="gap-2 text-muted-foreground hover:text-destructive"
					>
						<LogOut class="h-4 w-4" />
						<span>Sign Out</span>
					</Button>
				{:else}
					<Button variant="default" size="sm" href="/signin" class="gap-2 shadow-sm">
						<LogIn class="h-4 w-4" />
						<span>Sign In</span>
					</Button>
				{/if}
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
		<div class="border-t border-border bg-background/95 backdrop-blur-md md:hidden">
			<div class="space-y-1 px-4 py-4">
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
				<div class="mt-4 border-t border-border pt-4">
					{#if auth.isAuthenticated}
						<button
							onclick={() => {
								auth.signOut();
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
