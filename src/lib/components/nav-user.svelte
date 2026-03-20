<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { useSidebar } from '$lib/components/ui/sidebar/index.js';
	import { authClient } from '$lib/auth-client';
	import {
		BadgeCheck,
		Bell,
		ChevronsUpDown,
		LogOut,
		Sparkles,
		User,
		FileText,
		Archive,
		Settings
	} from '@lucide/svelte';

	let {
		user
	}: {
		user: {
			name: string;
			email: string;
			image?: string;
			username?: string;
		};
	} = $props();

	const sidebar = useSidebar();
	const profileHref = $derived(user.username ? `/u/${user.username}` : '/settings/username');

	async function signOut() {
		await authClient.signOut();
		await invalidateAll();
		goto('/');
	}
</script>

<Sidebar.Menu>
	<Sidebar.MenuItem>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Sidebar.MenuButton
						size="lg"
						class="bg-sidebar data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
						{...props}
					>
						<Avatar.Root class="size-8 rounded-lg">
							{#if user.image}
								<Avatar.Image src={user.image} alt={user.name} />
							{/if}
							<Avatar.Fallback class="rounded-lg">
								{(user.name ?? user.email ?? '?').slice(0, 2).toUpperCase()}
							</Avatar.Fallback>
						</Avatar.Root>
						<div class="grid flex-1 text-start text-sm leading-tight">
							<span class="truncate font-medium">{user.username ?? user.name}</span>
							<span class="truncate text-xs">{user.email}</span>
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
							{#if user.image}
								<Avatar.Image src={user.image} alt={user.name} />
							{/if}
							<Avatar.Fallback class="rounded-lg">
								{(user.name ?? user.email ?? '?').slice(0, 2).toUpperCase()}
							</Avatar.Fallback>
						</Avatar.Root>
						<div class="grid flex-1 text-start text-sm leading-tight">
							<span class="truncate font-medium">{user.username ?? user.name}</span>
							<span class="truncate text-xs">{user.email}</span>
						</div>
					</div>
				</DropdownMenu.Label>
				<DropdownMenu.Separator />
				<DropdownMenu.Group>
					<DropdownMenu.Item>
						<Sparkles class="size-4" />
						Upgrade to Pro
					</DropdownMenu.Item>
				</DropdownMenu.Group>
				<DropdownMenu.Separator />
				<DropdownMenu.Group>
					<DropdownMenu.Item onclick={() => goto(profileHref)}>
						<User class="size-4" />
						Profile
					</DropdownMenu.Item>
					{#if user.username}
						<DropdownMenu.Item onclick={() => goto(`${profileHref}/posts/manage`)}>
							<FileText class="size-4" />
							Manage posts
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={() => goto(`${profileHref}/sources/manage`)}>
							<Archive class="size-4" />
							Manage sources
						</DropdownMenu.Item>
					{/if}
					<DropdownMenu.Item onclick={() => goto('/settings')}>
						<Settings class="size-4" />
						Account Settings
					</DropdownMenu.Item>
				</DropdownMenu.Group>
				<DropdownMenu.Separator />
				<DropdownMenu.Group>
					<DropdownMenu.Item>
						<BadgeCheck class="size-4" />
						Achievements
					</DropdownMenu.Item>
					<DropdownMenu.Item>
						<Bell class="size-4" />
						Notifications
					</DropdownMenu.Item>
				</DropdownMenu.Group>
				<DropdownMenu.Separator />
				<DropdownMenu.Item onclick={signOut}>
					<LogOut class="size-4" />
					Log out
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</Sidebar.MenuItem>
</Sidebar.Menu>
