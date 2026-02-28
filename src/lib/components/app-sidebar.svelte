<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation'
	import { page } from '$app/state'
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte'
	import { useQuery } from 'convex-svelte'
	import { api } from '$convex/_generated/api'
	import { authClient } from '$lib/auth-client'
	import {
		Compass,
		Users,
		Send,
		CirclePlus,
		User,
		Settings,
		LogOut,
		LogIn,
		UserPlus,
		ChevronsUpDown
	} from '@lucide/svelte'
	import * as Sidebar from '$lib/components/ui/sidebar/index.js'
	import { useSidebar } from '$lib/components/ui/sidebar/index.js'
	import * as Avatar from '$lib/components/ui/avatar/index.js'
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js'
	import Logo from './Logo.svelte'
	import { Button } from '$lib/components/ui/button/index.js'
	import type { ComponentProps } from 'svelte'

	let {
		ref = $bindable(null),
		collapsible = 'icon',
		...restProps
	}: ComponentProps<typeof Sidebar.Root> = $props()

	const auth = useAuth()
	const sidebar = useSidebar()

	const currentUserQuery = useQuery(api.auth.getCurrentUser, {})
	const currentUser = $derived(currentUserQuery.data)
	const profileHref = $derived(
		currentUser?.username ? `/u/${currentUser.username}` : '/settings/username'
	)

	const myCommunitiesQuery = useQuery((api as any).communities.listMine, {})
	const myCommunities = $derived(myCommunitiesQuery.data ?? [])

	const redirectTo = $derived(encodeURIComponent(page.url.pathname + page.url.search))

	const navItems = [
		{ title: 'Feed', url: '/feed', icon: Compass, authOnly: false },
		{ title: 'Communities', url: '/c', icon: Users, authOnly: false },
		{ title: 'Submit Post', url: '/submit', icon: Send, authOnly: true },
		{ title: 'Create Community', url: '/c/new', icon: CirclePlus, authOnly: true }
	]

	function isActive(href: string) {
		if (href === '/c') {
			return page.url.pathname === '/c' || page.url.pathname.startsWith('/c/')
		}
		return page.url.pathname === href
	}

	async function signOut() {
		await authClient.signOut()
		await invalidateAll()
	}
</script>

<Sidebar.Root {collapsible} {...restProps}>
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="lg">
					{#snippet child({ props })}
						<a href="/" {...props}>
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
						{#if !item.authOnly || auth.isAuthenticated}
							<Sidebar.MenuItem>
								<Sidebar.MenuButton
									tooltipContent={item.title}
									isActive={isActive(item.url)}
								>
									{#snippet child({ props })}
										<a href={item.url} {...props}>
											<item.icon />
											<span>{item.title}</span>
										</a>
									{/snippet}
								</Sidebar.MenuButton>
							</Sidebar.MenuItem>
						{/if}
					{/each}
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
										<a href={`/c/${item.community.slug}`} {...props}>
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
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Sidebar.MenuButton
									size="lg"
									class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
									{...props}
								>
									<Avatar.Root class="size-8 rounded-lg">
										{#if currentUser.image}
											<Avatar.Image src={currentUser.image} alt={currentUser.name} />
										{/if}
										<Avatar.Fallback class="rounded-lg">
											{(currentUser.name ?? currentUser.email ?? '?')
												.slice(0, 2)
												.toUpperCase()}
										</Avatar.Fallback>
									</Avatar.Root>
									<div class="grid flex-1 text-start text-sm leading-tight">
										<span class="truncate font-medium">
											{currentUser.username ?? currentUser.name}
										</span>
										<span class="truncate text-xs">{currentUser.email}</span>
									</div>
									<ChevronsUpDown class="ms-auto size-4" />
								</Sidebar.MenuButton>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content
							class="w-(--bits-dropdown-menu-anchor-width) min-w-56 rounded-lg"
							side={sidebar.isMobile ? 'bottom' : 'right'}
							align="end"
							sideOffset={4}
						>
							<DropdownMenu.Label class="p-0 font-normal">
								<div class="flex items-center gap-2 px-1 py-1.5 text-start text-sm">
									<Avatar.Root class="size-8 rounded-lg">
										{#if currentUser.image}
											<Avatar.Image src={currentUser.image} alt={currentUser.name} />
										{/if}
										<Avatar.Fallback class="rounded-lg">
											{(currentUser.name ?? currentUser.email ?? '?')
												.slice(0, 2)
												.toUpperCase()}
										</Avatar.Fallback>
									</Avatar.Root>
									<div class="grid flex-1 text-start text-sm leading-tight">
										<span class="truncate font-medium">
											{currentUser.username ?? currentUser.name}
										</span>
										<span class="truncate text-xs">{currentUser.email}</span>
									</div>
								</div>
							</DropdownMenu.Label>
							<DropdownMenu.Separator />
							<DropdownMenu.Group>
								<DropdownMenu.Item onclick={() => goto(profileHref)}>
									<User />
									Profile
								</DropdownMenu.Item>
								<DropdownMenu.Item onclick={() => goto('/settings')}>
									<Settings />
									Settings
								</DropdownMenu.Item>
							</DropdownMenu.Group>
							<DropdownMenu.Separator />
							<DropdownMenu.Item onclick={signOut}>
								<LogOut />
								Sign out
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		{:else}
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton>
						{#snippet child({ props })}
							<a href={`/signin?redirectTo=${redirectTo}`} {...props}>
								<LogIn />
								<span>Sign in</span>
							</a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton>
						{#snippet child({ props })}
							<a href={`/signup?redirectTo=${redirectTo}`} {...props}>
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
