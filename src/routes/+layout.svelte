<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { createSvelteAuthClient } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { authClient } from '$lib/auth-client';
	import { ModeWatcher } from 'mode-watcher';
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import Toaster from '$lib/components/ui/sonner/sonner.svelte';
	import ThemeToggle from '$lib/components/theme-toggle.svelte';
	import { page } from '$app/state';

	let { children, data } = $props();

	createSvelteAuthClient({
		authClient,
		getServerState: () => data.authState
	});

	const routeLabels: Record<string, string> = {
		'': 'Home',
		feed: 'Feed',
		c: 'Communities',
		submit: 'Submit Post',
		settings: 'Settings',
		u: 'Users',
		post: 'Post',
		new: 'New',
		manage: 'Manage',
		members: 'Members',
		signin: 'Sign In',
		signup: 'Sign Up',
		username: 'Username',
		followers: 'Followers',
		following: 'Following'
	};

	const isAuthPage = $derived(
		page.url.pathname === '/signin' || page.url.pathname === '/signup'
	);

	let breadcrumbs = $derived.by(() => {
		const segments = page.url.pathname.split('/').filter((s) => s !== '');
		const crumbs: { label: string; href: string }[] = [{ label: 'Home', href: '/' }];
		let accumulated = '';
		for (const segment of segments) {
			accumulated += '/' + segment;
			const label = routeLabels[segment] ?? segment;
			crumbs.push({ label, href: accumulated });
		}
		return crumbs;
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<ModeWatcher />
<Sidebar.Provider>
	<AppSidebar />
	<Sidebar.Inset>
		<header
			class="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border/50 px-4 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12"
		>
			<div class="flex items-center gap-2">
				<Sidebar.Trigger class="-ms-1" />
				<Separator orientation="vertical" class="me-2 data-[orientation=vertical]:h-4" />
				<Breadcrumb.Root>
					<Breadcrumb.List>
						{#each breadcrumbs as crumb, i (crumb.href)}
							{#if i > 0}
								<Breadcrumb.Separator />
							{/if}
							<Breadcrumb.Item>
								{#if i === breadcrumbs.length - 1}
									<Breadcrumb.Page>{crumb.label}</Breadcrumb.Page>
								{:else}
									<Breadcrumb.Link href={crumb.href}>{crumb.label}</Breadcrumb.Link>
								{/if}
							</Breadcrumb.Item>
						{/each}
					</Breadcrumb.List>
				</Breadcrumb.Root>
			</div>
			<ThemeToggle />
		</header>
		<div class="flex min-h-0 flex-1">
			<div class="flex min-h-0 flex-1 flex-col">
				{@render children()}
			</div>
			{#if !isAuthPage}
				<aside
					class="hidden w-64 shrink-0 border-l border-border/50 bg-background lg:block"
				>
				</aside>
			{/if}
		</div>
	</Sidebar.Inset>
</Sidebar.Provider>
<Toaster />
