<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import * as Avatar from '$lib/components/ui/avatar';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Circle, Users } from '@lucide/svelte';
	import type { Id } from '$convex/_generated/dataModel';

	const client = useConvexClient();
	const groupId = $derived(page.params.id as Id<'groups'>);
	const currentUser = $derived(page.data.currentUser as any);
	const currentUserId = $derived(currentUser?.id ?? currentUser?._id);
	const sessionId = Math.random().toString(36).substring(2, 15);

	// Get all group members
	const membersQuery = useQuery((api as any).groups.getMembers, () =>
		groupId ? { groupId } : 'skip'
	);
	const members = $derived(membersQuery.data ?? []);

	// Get presence data
	const roomId = $derived(groupId?.toString() ?? '');
	let roomToken = $state<string | null>(null);

	// Presence Heartbeat - only run on client
	$effect(() => {
		if (!browser || !roomId || !currentUserId) return;

		const interval = 10000;
		const sendHeartbeat = async () => {
			try {
				const result = await client.mutation((api as any).presence.heartbeat, {
					roomId: roomId,
					userId: currentUserId,
					sessionId,
					interval: interval * 2
				});
				if (result?.roomToken && !roomToken) {
					roomToken = result.roomToken;
				}
			} catch (err) {
				console.error('Heartbeat failed:', err);
			}
		};

		sendHeartbeat();
		const timer = setInterval(sendHeartbeat, interval);
		return () => clearInterval(timer);
	});

	const presenceQuery = useQuery((api as any).presence.list, () => {
		if (!browser || !roomToken) return 'skip';
		return { roomToken };
	});
	const onlineUsers = $derived(
		(presenceQuery.data ?? []).filter((u: any) => u.online)
	);

	// Create a set of online user IDs for quick lookup
	const onlineUserIds = $derived(new Set(onlineUsers.map((u: any) => u.userId)));

	// Combine members with presence data
	const memberList = $derived(
		members.map((member: any) => ({
			...member,
			isOnline: onlineUserIds.has(member.userId),
			isYou: member.userId === currentUserId
		}))
	);

	// Sort: online first, then by name
	const sortedMembers = $derived(
		memberList.sort((a: any, b: any) => {
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
		<div class="flex items-center gap-1.5">
			<span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
			<span class="text-[10px] font-medium text-muted-foreground">
				{onlineUsers.length} online
			</span>
		</div>
	</div>

	<div class="space-y-2">
		{#each sortedMembers as member, index (member.userId)}
			{@const colorClass = getAvatarColor(member.userId)}
			<Tooltip.Provider>
				<Tooltip.Root>
					<Tooltip.Trigger
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
										class="flex h-8 w-8 items-center justify-center rounded-full border {colorClass}"
									>
										<span class="text-[10px] font-bold">{getInitials(member.name)}</span>
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
							{#if member.role === 'admin'}
								<Badge variant="secondary" class="h-4 px-1 text-[8px]">Admin</Badge>
							{/if}
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p class="text-xs">Click to view details</p>
					</Tooltip.Content>
				</Tooltip.Root>
			</Tooltip.Provider>
		{/each}
	</div>
</div>

<!-- User Details Dialog -->
<Dialog.Root
	open={dialogOpen}
	onOpenChange={(v) => {
		if (!v) selectedMember = null;
	}}
>
	<Dialog.Content class="sm:max-w-[425px]">
		<Dialog.Header>
			<Dialog.Title>Member Details</Dialog.Title>
		</Dialog.Header>
		{#if selectedMember}
			<div class="flex items-center gap-4 py-4">
				{#if selectedMember.image}
					<Avatar.Root class="h-16 w-16">
						<Avatar.Image src={selectedMember.image} alt={selectedMember.name} />
						<Avatar.Fallback class="text-lg">{getInitials(selectedMember.name)}</Avatar.Fallback>
					</Avatar.Root>
				{:else}
					{@const colorClass = getAvatarColor(selectedMember.userId)}
					<div
						class="flex h-16 w-16 items-center justify-center rounded-full border-2 {colorClass}"
					>
						<span class="text-lg font-bold">{getInitials(selectedMember.name)}</span>
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
						{#if selectedMember.role === 'admin'}
							<Badge variant="outline">Admin</Badge>
						{/if}
					</div>
				</div>
			</div>
			<div class="space-y-2 text-sm">
				<div class="flex justify-between">
					<span class="text-muted-foreground">Email</span>
					<span>{selectedMember.email || 'Not available'}</span>
				</div>
				<div class="flex justify-between">
					<span class="text-muted-foreground">Role</span>
					<span class="capitalize">{selectedMember.role}</span>
				</div>
				<div class="flex justify-between">
					<span class="text-muted-foreground">Status</span>
					<span>{selectedMember.isOnline ? 'Active now' : 'Offline'}</span>
				</div>
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>
