<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { useQuery } from 'convex-svelte';
	import {
		CirclePlus,
		Compass,
		LogIn,
		LogOut,
		Menu,
		Send,
		Settings,
		User,
		UserPlus,
		Users
	} from '@lucide/svelte';
	import { api } from '$convex/_generated/api';
	import { authClient } from '$lib/auth-client';
	import Logo from './Logo.svelte';
	import ThemeToggle from './theme-toggle.svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuLabel,
		DropdownMenuSeparator,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';

	const auth = useAuth();
	const currentUserQuery = useQuery(api.auth.getCurrentUser, {}, () => ({
		initialData: (page.data as any).currentUser,
		keepPreviousData: true
	}));
	const currentUser = $derived(currentUserQuery.data);
	const profileHref = $derived(
		currentUser?.username ? `/u/${currentUser.username}` : '/settings/username'
	);
	const redirectTo = $derived(encodeURIComponent(page.url.pathname + page.url.search));

	function isRouteActive(href: string) {
		if (href === '/c') {
			return page.url.pathname === '/c' || page.url.pathname.startsWith('/c/');
		}
		return page.url.pathname === href;
	}

	function navigateTo(href: string) {
		goto(href);
	}

	async function signOut() {
		await authClient.signOut();
		await invalidateAll();
	}
</script>

<nav class="sticky top-0 z-40 border-b border-border/50 bg-background/85 backdrop-blur">
	<div class="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
		<div class="flex items-center gap-3">
			<DropdownMenu>
				<DropdownMenuTrigger>
					<Button
						variant="outline"
						size="icon-sm"
						class="md:hidden"
						aria-label="Open navigation menu"
					>
						<Menu class="size-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" class="w-56">
					<DropdownMenuLabel>Navigation</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuItem onclick={() => navigateTo('/feed')}>
						<Compass class="size-4" />
						Feed
					</DropdownMenuItem>
					<DropdownMenuItem onclick={() => navigateTo('/c')}>
						<Users class="size-4" />
						Communities
					</DropdownMenuItem>
					{#if auth.isAuthenticated}
						<DropdownMenuItem onclick={() => navigateTo('/submit')}>
							<Send class="size-4" />
							Submit Post
						</DropdownMenuItem>
						<DropdownMenuItem onclick={() => navigateTo('/c/new')}>
							<CirclePlus class="size-4" />
							Create Community
						</DropdownMenuItem>
					{/if}
				</DropdownMenuContent>
			</DropdownMenu>

			<a href="/" class="transition-opacity hover:opacity-80">
				<Logo size="sm" />
			</a>
			<div class="hidden items-center gap-2 md:flex">
				<a
					href="/feed"
					class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium {isRouteActive(
						'/feed'
					)
						? 'text-foreground'
						: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
				>
					<Compass class="size-4" />
					Feed
				</a>
				<a
					href="/c"
					class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium {isRouteActive(
						'/c'
					)
						? 'text-foreground'
						: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
				>
					<Users class="size-4" />
					Communities
				</a>
				{#if auth.isAuthenticated}
					<a
						href="/submit"
						class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium {isRouteActive(
							'/submit'
						)
							? 'text-foreground'
							: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
					>
						<Send class="size-4" />
						Submit
					</a>
					<a
						href="/c/new"
						class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium {isRouteActive(
							'/c/new'
						)
							? 'text-foreground'
							: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
					>
						<CirclePlus class="size-4" />
						Create
					</a>
				{/if}
			</div>
		</div>

		<div class="flex items-center gap-2">
			{#if auth.isAuthenticated && currentUser}
				<DropdownMenu>
					<DropdownMenuTrigger>
						<Button variant="outline" size="sm" class="inline-flex items-center gap-2">
							<User class="size-4" />
							<span class="hidden sm:inline">
								{currentUser.username ?? currentUser.name}
							</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" class="w-56">
						<DropdownMenuLabel>Account</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuItem onclick={() => navigateTo(profileHref)}>
							<User class="size-4" />
							Profile
						</DropdownMenuItem>
						<DropdownMenuItem onclick={() => navigateTo('/settings')}>
							<Settings class="size-4" />
							Settings
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem variant="destructive" onclick={signOut}>
							<LogOut class="size-4" />
							Sign out
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			{:else}
				<div class="hidden items-center gap-2 sm:flex">
					<Button variant="outline" size="sm" href={`/signin?redirectTo=${redirectTo}`}>
						<LogIn class="size-4" />
						Sign in
					</Button>
					<Button size="sm" href={`/signup?redirectTo=${redirectTo}`}>
						<UserPlus class="size-4" />
						Sign up
					</Button>
				</div>
				<DropdownMenu>
					<DropdownMenuTrigger>
						<Button variant="outline" size="icon-sm" class="sm:hidden" aria-label="Open auth menu">
							<User class="size-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" class="w-44">
						<DropdownMenuItem onclick={() => navigateTo(`/signin?redirectTo=${redirectTo}`)}>
							<LogIn class="size-4" />
							Sign in
						</DropdownMenuItem>
						<DropdownMenuItem onclick={() => navigateTo(`/signup?redirectTo=${redirectTo}`)}>
							<UserPlus class="size-4" />
							Sign up
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			{/if}
			<div class="ml-1">
				<ThemeToggle />
			</div>
		</div>
	</div>
</nav>
