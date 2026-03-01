<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import type { Id } from '$convex/_generated/dataModel';
	import { api } from '$convex/_generated/api';
	import * as Avatar from '$lib/components/ui/avatar';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Circle, Users } from '@lucide/svelte';

	let { communityId } = $props<{ communityId: Id<'communities'> }>();

	const client = useConvexClient();

	const membersQuery = useQuery((api as any).communities.listMembers, () =>
		communityId
			? {
					communityId,
					paginationOpts: { numItems: 100, cursor: null }
				}
			: 'skip'
	);
	const membersPage = $derived(membersQuery.data);
	const members = $derived(membersPage?.page ?? []);

	const currentUserQuery = useQuery((api as any).auth.getCurrentUser, {});
	const currentUserId = $derived(currentUserQuery.data?.id ?? null);

	$effect(() => {
		if (!browser || !currentUserId) return;

		const interval = 20_000;
		const sendHeartbeat = async () => {
			try {
				await client.mutation((api as any).presence.heartbeat, {});
			} catch (error) {
				console.error('Community presence heartbeat failed:', error);
			}
		};

		sendHeartbeat();
		const timer = setInterval(sendHeartbeat, interval);
		return () => clearInterval(timer);
	});

	const memberAuthIds = $derived([
		...new Set(members.map((member: any) => member.userAuthId).filter(Boolean))
	]);
	const presenceQuery = useQuery((api as any).presence.getOnlineUsers, () =>
		browser && memberAuthIds.length > 0 ? { userAuthIds: memberAuthIds } : 'skip'
	);
	const onlineUserIds = $derived(new Set((presenceQuery.data ?? []) as Array<string>));
	const onlineUsers = $derived(
		members.filter((member: any) => onlineUserIds.has(member.userAuthId))
	);

	const memberList = $derived(
		members.map((member: any) => ({
			...member,
			isOnline: onlineUserIds.has(member.userAuthId),
			isYou: member.userAuthId === currentUserId
		}))
	);

	const sortedMembers = $derived(
		memberList.slice().sort((a: any, b: any) => {
			if (a.isOnline && !b.isOnline) return -1;
			if (!a.isOnline && b.isOnline) return 1;
			return (a.name || '').localeCompare(b.name || '');
		})
	);

	const avatarColors = [
		'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30',
		'bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/30',
		'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
		'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
		'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30',
		'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/30'
	];

	function getAvatarColor(userId: string) {
		let hash = 0;
		for (let i = 0; i < userId.length; i++) {
			hash = userId.charCodeAt(i) + ((hash << 5) - hash);
		}
		return avatarColors[Math.abs(hash) % avatarColors.length];
	}

	function getInitials(name: string) {
		return (
			name
				?.split(' ')
				.map((n: string) => n.charAt(0).toUpperCase())
				.join('')
				.slice(0, 2) || '?'
		);
	}

	let selectedMember: any = $state(null);
	let dialogOpen = $derived(!!selectedMember);
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h3 class="text-[10px] font-black tracking-widest text-muted-foreground uppercase">
			Members ({sortedMembers.length})
		</h3>
		<div class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
			<span class="inline-flex items-center gap-1">
				<Users class="h-3 w-3" />
				{sortedMembers.length}
			</span>
			<span>•</span>
			<span class="inline-flex items-center gap-1">
				<span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
				{onlineUsers.length} online
			</span>
		</div>
	</div>

	<div class="space-y-2">
		{#each sortedMembers as member (member.userAuthId)}
			{@const colorClass = getAvatarColor(member.userAuthId)}
			<button
				type="button"
				onclick={() => (selectedMember = member)}
				class="flex w-full items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50"
			>
				<div class="relative">
					{#if member.image}
						<Avatar.Root class="h-8 w-8">
							<Avatar.Image src={member.image} alt={member.name} />
							<Avatar.Fallback>{getInitials(member.name)}</Avatar.Fallback>
						</Avatar.Root>
					{:else}
						<div
							class={`flex h-8 w-8 items-center justify-center rounded-full border ${colorClass}`}
						>
							<span class="text-[10px] font-bold">
								{getInitials(member.name)}
							</span>
						</div>
					{/if}
					{#if member.isOnline}
						<span
							class="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-emerald-500"
						></span>
					{/if}
				</div>
				<div class="flex flex-1 flex-col items-start text-left">
					<span class="text-xs font-medium">
						{member.name}
						{#if member.isYou}
							<span class="ml-1 text-[9px] text-muted-foreground">(You)</span>
						{/if}
					</span>
					<span class="text-[9px] text-muted-foreground">
						{member.isOnline ? 'Online' : 'Offline'}
					</span>
				</div>
				{#if member.role === 'admin' || member.role === 'owner'}
					<Badge variant="secondary" class="h-4 px-1 text-[8px]">
						{member.role === 'owner' ? 'Owner' : 'Admin'}
					</Badge>
				{/if}
			</button>
		{/each}
	</div>
</div>

<Dialog.Root
	open={dialogOpen}
	onOpenChange={(v) => {
		if (!v) selectedMember = null;
	}}
>
	<Dialog.Content class="sm:max-w-[425px]">
		<Dialog.Header>
			<Dialog.Title>Member details</Dialog.Title>
		</Dialog.Header>
		{#if selectedMember}
			<div class="flex items-center gap-4 py-4">
				{#if selectedMember.image}
					<Avatar.Root class="h-16 w-16">
						<Avatar.Image src={selectedMember.image} alt={selectedMember.name} />
						<Avatar.Fallback class="text-lg">
							{getInitials(selectedMember.name)}
						</Avatar.Fallback>
					</Avatar.Root>
				{:else}
					{@const colorClass = getAvatarColor(selectedMember.userAuthId)}
					<div
						class={`flex h-16 w-16 items-center justify-center rounded-full border-2 ${colorClass}`}
					>
						<span class="text-lg font-bold">
							{getInitials(selectedMember.name)}
						</span>
					</div>
				{/if}
				<div>
					<h4 class="text-lg font-semibold">
						{selectedMember.name}
						{#if selectedMember.isYou}
							<span class="ml-2 text-sm font-normal text-muted-foreground">(You)</span>
						{/if}
					</h4>
					<div class="mt-1 flex items-center gap-2">
						{#if selectedMember.isOnline}
							<Badge variant="default" class="bg-emerald-500 hover:bg-emerald-600">
								<Circle class="mr-1 h-2 w-2 fill-current" />
								Online
							</Badge>
						{:else}
							<Badge variant="secondary">Offline</Badge>
						{/if}
						{#if selectedMember.role === 'owner'}
							<Badge variant="outline">Owner</Badge>
						{:else if selectedMember.role === 'admin'}
							<Badge variant="outline">Admin</Badge>
						{/if}
					</div>
				</div>
			</div>
			<div class="space-y-2 text-sm">
				<div class="flex justify-between">
					<span class="text-muted-foreground">Username</span>
					<span>{selectedMember.username || 'Not set'}</span>
				</div>
				<div class="flex justify-between">
					<span class="text-muted-foreground">Role</span>
					<span class="capitalize">{selectedMember.role}</span>
				</div>
			</div>
			<Dialog.Footer class="mt-6 flex gap-2">
				{#if selectedMember.username}
					<Button
						variant="outline"
						size="sm"
						onclick={() => {
							const username = selectedMember.username;
							selectedMember = null;
							goto(`/u/${username}`);
						}}
					>
						View Profile
					</Button>
				{/if}
				<Button variant="outline" size="sm" onclick={() => (selectedMember = null)}>Close</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
