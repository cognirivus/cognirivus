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
	import { Button } from '$lib/components/ui/button';
	import ThemeToggle from '$lib/components/theme-toggle.svelte';
	import { page } from '$app/state';
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import CommunityPresenceWidget from '$lib/components/CommunityPresenceWidget.svelte';
	import * as Sheet from '$lib/components/ui/sheet';
	import { PanelRight } from '@lucide/svelte';

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

	const isAuthPage = $derived(page.url.pathname === '/signin' || page.url.pathname === '/signup');

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

	const slug = $derived(page.params.slug);
	const isChatPage = $derived(
		page.url.pathname.startsWith('/c/') && page.url.pathname.endsWith('/chat')
	);
	const communityQuery = useQuery((api as any).communities.getBySlug, () =>
		slug ? { slug } : 'skip'
	);
	const communityId = $derived(communityQuery.data?.community?._id);
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
			<div class="flex min-w-0 items-center gap-2 overflow-hidden">
				<Sidebar.Trigger class="-ms-1 shrink-0" />
				<Separator orientation="vertical" class="me-2 shrink-0 data-[orientation=vertical]:h-4" />
				<Breadcrumb.Root class="min-w-0 truncate">
					<Breadcrumb.List class="flex-nowrap">
						{#each breadcrumbs as crumb, i (crumb.href)}
							{#if i > 0}
								<Breadcrumb.Separator class="shrink-0" />
							{/if}
							<Breadcrumb.Item class="truncate">
								{#if i === breadcrumbs.length - 1}
									<Breadcrumb.Page class="truncate">{crumb.label}</Breadcrumb.Page>
								{:else}
									<Breadcrumb.Link href={crumb.href} class="truncate">
										{crumb.label}
									</Breadcrumb.Link>
								{/if}
							</Breadcrumb.Item>
						{/each}
					</Breadcrumb.List>
				</Breadcrumb.Root>
			</div>
			<div class="flex shrink-0 items-center gap-2">
				{#if isChatPage && communityId}
					<Sheet.Root>
						<Sheet.Trigger asChild>
							{#snippet children({ props })}
								<Button {...props} variant="ghost" size="icon" class="relative h-9 w-9 lg:hidden">
									<PanelRight class="h-4.5 w-4.5" />
									<span class="sr-only">Toggle members</span>
								</Button>
							{/snippet}
						</Sheet.Trigger>
						<Sheet.Content side="right" class="w-[85vw] p-0 sm:w-80">
							<Sheet.Header class="border-b p-4">
								<Sheet.Title>Community Members</Sheet.Title>
							</Sheet.Header>
							<div class="h-full overflow-y-auto p-4">
								<CommunityPresenceWidget {communityId} />
							</div>
						</Sheet.Content>
					</Sheet.Root>
				{/if}
				<ThemeToggle />
			</div>
		</header>
		<div class="flex min-h-0 flex-1">
			<div class="flex min-h-0 flex-1 flex-col">
				{@render children()}
			</div>
			{#if !isAuthPage}
				<aside
					class="hidden w-64 shrink-0 overflow-y-auto border-l border-border/50 bg-background lg:block"
				>
					{#if communityId && isChatPage}
						<div class="px-4 py-6">
							<CommunityPresenceWidget {communityId} />
						</div>
					{/if}
				</aside>
			{/if}
		</div>
	</Sidebar.Inset>
</Sidebar.Provider>
<Toaster />
