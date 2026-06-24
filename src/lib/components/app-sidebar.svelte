<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { useAppAuth } from '$lib/auth.svelte';
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import {
		BookMarked,
		Compass,
		Users,
		Send,
		User,
		LogIn,
		UserPlus,
		MessageSquare,
		NotebookText,
		Shield,
		Network,
		BookOpen,
		RotateCcw,
		Target,
		Route,
		Sparkles,
		AlertTriangle,
		Bot,
		Globe,
		List
	} from '@lucide/svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { useSidebar } from '$lib/components/ui/sidebar/index.js';
	import Logo from './Logo.svelte';
	import NavUser from './nav-user.svelte';
	import type { ComponentProps } from 'svelte';

	let {
		ref = $bindable(null),
		collapsible = 'icon',
		...restProps
	}: ComponentProps<typeof Sidebar.Root> = $props();

	const auth = useAppAuth();
	const sidebar = useSidebar();

	const currentUserQuery = useQuery(api.auth.getCurrentUser, {});
	const currentUser = $derived(currentUserQuery.data);
	const isAdmin = $derived(auth.isAdmin);

	const myCommunitiesQuery = useQuery((api as any).communities.listMine, {});
	const myCommunities = $derived(myCommunitiesQuery.data ?? []);

	const redirectTo = $derived(encodeURIComponent(page.url.pathname + page.url.search));

	const unreadQuery = useQuery((api as any).dm.getUnreadCount, () =>
		auth.isAuthenticated ? {} : 'skip'
	);
	const unreadCount = $derived(unreadQuery.data ?? 0);
	const knowledgeCountQuery = useQuery((api as any).knowledgeNotes.getPendingReviewCount, () =>
		auth.isAuthenticated ? {} : 'skip'
	);
	const pendingKnowledgeCount = $derived(knowledgeCountQuery.data?.pendingCount ?? 0);
	const runningKnowledgeCount = $derived(knowledgeCountQuery.data?.runningCount ?? 0);

	let knowledgeExpanded = $state(false);

	const navItems = [
		{ title: 'Feed', url: '/feed', icon: User, authOnly: true },
		{ title: 'Collections', url: '/collections', icon: BookMarked, authOnly: true },
		{ title: 'Communities', url: '/c', icon: Compass, authOnly: false },
		{ title: 'Submit', url: '/submit', icon: Send, authOnly: true },
		{ title: 'Chat', url: '/chat', icon: MessageSquare, authOnly: true },
		{ title: 'Admin', url: '/admin', icon: Shield, authOnly: true, adminOnly: true }
	];

	const knowledgeItems = [
		{ title: 'Dashboard', url: '/knowledge', icon: NotebookText },
		{ title: 'Topics', url: '/knowledge/topics', icon: List },
		{ title: 'Notes', url: '/knowledge/notes', icon: BookMarked },
		{ title: 'Graph', url: '/knowledge/graph', icon: Network },
		{ title: 'My Learning', url: '/knowledge/my-learning', icon: BookOpen },
		{ title: 'Review', url: '/knowledge/review', icon: RotateCcw },
		{ title: 'Goals', url: '/knowledge/goals', icon: Target },
		{ title: 'Paths', url: '/knowledge/paths', icon: Route },
		{ title: 'Domains', url: '/knowledge/domains', icon: Globe },
		{ title: 'Entities', url: '/knowledge/entities', icon: Users },
		{ title: 'Conflicts', url: '/knowledge/conflicts', icon: AlertTriangle },
		{ title: 'Agents', url: '/knowledge/agents', icon: Bot }
	];

	function isActive(href: string) {
		if (href === '/chat') {
			return page.url.pathname === '/chat' || page.url.pathname.startsWith('/chat/');
		}
		if (href === '/collections') {
			return page.url.pathname === '/collections' || page.url.pathname.startsWith('/collections/');
		}
		if (href === '/knowledge') {
			return page.url.pathname === '/knowledge' || page.url.pathname.startsWith('/knowledge/');
		}
		if (href === '/c') {
			return page.url.pathname === '/c' || page.url.pathname.startsWith('/c/');
		}
		return page.url.pathname === href;
	}

	function closeMobileSidebar() {
		if (sidebar.isMobile) {
			sidebar.setOpenMobile(false);
		}
	}

	function isKnowledgeActive() {
		return page.url.pathname.startsWith('/knowledge');
	}
</script>

<Sidebar.Root {collapsible} {...restProps}>
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="lg">
					{#snippet child({ props })}
						<a href={resolve('/')} {...props} onclick={closeMobileSidebar}>
							<Logo size="sm" />
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>

	<Sidebar.Content>
		<Sidebar.Group>
			<Sidebar.GroupLabel>Navigate</Sidebar.GroupLabel>
			<Sidebar.GroupContent>
				<Sidebar.Menu>
					{#each navItems as item (item.url)}
						{#if (!item.authOnly || auth.isAuthenticated) && (!item.adminOnly || isAdmin)}
							<Sidebar.MenuItem>
								<Sidebar.MenuButton tooltipContent={item.title} isActive={isActive(item.url)}>
									{#snippet child({ props })}
										<a href={item.url} {...props} onclick={closeMobileSidebar}>
											<item.icon />
											<span>{item.title}</span>
											{#if item.title === 'Chat' && unreadCount > 0}
												<span
													class="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-destructive-foreground text-white"
												>
													{unreadCount > 99 ? '99+' : unreadCount}
												</span>
											{/if}
										</a>
									{/snippet}
								</Sidebar.MenuButton>
							</Sidebar.MenuItem>
						{/if}
					{/each}

					{#if auth.isAuthenticated}
						<Sidebar.MenuItem>
							<Sidebar.MenuButton
								tooltipContent="Knowledge"
								isActive={isKnowledgeActive()}
								onclick={() => (knowledgeExpanded = !knowledgeExpanded)}
							>
								<NotebookText />
								<span>Knowledge</span>
								{#if pendingKnowledgeCount > 0 || runningKnowledgeCount > 0}
									<span
										class="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground"
									>
										{pendingKnowledgeCount > 0
											? pendingKnowledgeCount > 99
												? '99+'
												: pendingKnowledgeCount
											: runningKnowledgeCount}
									</span>
								{/if}
							</Sidebar.MenuButton>
						</Sidebar.MenuItem>
						{#if knowledgeExpanded}
							{#each knowledgeItems as item (item.url)}
								<Sidebar.MenuItem>
									<Sidebar.MenuButton
										tooltipContent={item.title}
										isActive={isActive(item.url)}
										class="pl-8"
									>
										{#snippet child({ props })}
											<a href={item.url} {...props} onclick={closeMobileSidebar}>
												<item.icon />
												<span>{item.title}</span>
											</a>
										{/snippet}
									</Sidebar.MenuButton>
								</Sidebar.MenuItem>
							{/each}
						{/if}
					{/if}
				</Sidebar.Menu>
			</Sidebar.GroupContent>
		</Sidebar.Group>

		{#if auth.isAuthenticated}
			<Sidebar.Group class="group-data-[collapsible=icon]:hidden">
				<Sidebar.GroupLabel>My Communities</Sidebar.GroupLabel>
				<Sidebar.GroupContent>
					<Sidebar.Menu>
						{#each myCommunities as item (item.community._id)}
							<Sidebar.MenuItem>
								<Sidebar.MenuButton isActive={isActive(`/c/${item.community.slug}`)}>
									{#snippet child({ props })}
										<a
											href={resolve(`/c/${item.community.slug}`)}
											{...props}
											onclick={closeMobileSidebar}
										>
											<Users />
											<span>c/{item.community.slug}</span>
										</a>
									{/snippet}
								</Sidebar.MenuButton>
							</Sidebar.MenuItem>
						{/each}
						{#if myCommunities.length === 0}
							<p class="px-2 py-1.5 text-xs text-muted-foreground">No communities yet</p>
						{/if}
					</Sidebar.Menu>
				</Sidebar.GroupContent>
			</Sidebar.Group>
		{/if}
	</Sidebar.Content>

	<Sidebar.Footer>
		{#if auth.isAuthenticated && currentUser}
			<NavUser
				user={{
					name: currentUser.name ?? '',
					email: currentUser.email ?? '',
					image: currentUser.image ?? undefined,
					username: currentUser.username ?? undefined
				}}
			/>
		{:else}
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton>
						{#snippet child({ props })}
							<a href={`/signin?redirectTo=${redirectTo}`} {...props} onclick={closeMobileSidebar}>
								<LogIn />
								<span>Sign in</span>
							</a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton>
						{#snippet child({ props })}
							<a href={`/signup?redirectTo=${redirectTo}`} {...props} onclick={closeMobileSidebar}>
								<UserPlus />
								<span>Sign up</span>
							</a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		{/if}
	</Sidebar.Footer>

	<Sidebar.Rail />
</Sidebar.Root>
