<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { page } from '$app/state';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import { Separator } from '$lib/components/ui/separator';
	import { Switch } from '$lib/components/ui/switch';
	import { Badge } from '$lib/components/ui/badge';
	import * as Dialog from '$lib/components/ui/dialog';
	import {
		Settings,
		Save,
		Trash2,
		AlertTriangle,
		Users,
		Check,
		X,
		Shield,
		Globe,
		Lock,
		UserMinus,
		Copy
	} from '@lucide/svelte';
	import type { Id } from '$convex/_generated/dataModel';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';
	import { toast } from 'svelte-sonner';

	const groupId = $derived(page.params.id as Id<'groups'>);
	const client = useConvexClient();

	const groupQuery = useQuery((api as any).groups.get, () => (groupId ? { groupId } : 'skip'));
	const group = $derived(groupQuery.data);

	const pendingMembersQuery = useQuery((api as any).groups.getPendingMembers, () =>
		groupId ? { groupId } : 'skip'
	);
	const pendingMembers = $derived(pendingMembersQuery.data ?? []);

	const membersQuery = useQuery((api as any).groups.getMembers, () =>
		groupId ? { groupId } : 'skip'
	);
	const members = $derived(membersQuery.data ?? []);

	let name = $state('');
	let description = $state('');
	let isPublic = $state(false);
	let showPrivacyConfirm = $state(false);
	let pendingPublicValue = $state(false);
	let confirmName = $state('');
	let isSaving = $state(false);
	let isDeleting = $state(false);
	let showDeleteConfirm = $state(false);

	let memberToRemove = $state<{ id: Id<'group_memberships'>; name: string } | null>(null);
	let isRemoveMemberDialogOpen = $state(false);

	$effect(() => {
		if (group) {
			name = group.name;
			description = group.description || '';
			isPublic = group.isPublic;
		}
	});

	const isOwner = $derived(
		group?.ownerId === (page.data as any).currentUser?._id ||
			group?.ownerId === (page.data as any).currentUser?.id
	);

	const isAdmin = $derived(group?.membershipRole === 'admin' || isOwner);

	const isDeleteEnabled = $derived(confirmName === group?.name);

	function copyInviteCode() {
		if (group?.inviteCode) {
			navigator.clipboard.writeText(group.inviteCode);
			toast.success('Invite code copied to clipboard!');
		}
	}

	async function handleUpdate() {
		if (!name.trim()) return;
		isSaving = true;
		try {
			await client.mutation((api as any).groups.update, {
				groupId,
				name: name.trim(),
				description: description.trim()
			});
			toast.success('Group settings updated');
		} catch (e: any) {
			console.error(e);
			toast.error(e.message || 'Failed to update group');
		} finally {
			isSaving = false;
		}
	}

	async function handleResponse(
		membershipId: Id<'group_memberships'>,
		action: 'accept' | 'decline'
	) {
		try {
			await client.mutation((api as any).groups.respondToRequest, {
				membershipId,
				action
			});
			toast.success(`Request ${action === 'accept' ? 'accepted' : 'declined'}`);
		} catch (e: any) {
			toast.error(e.message || 'Failed to respond to request');
		}
	}

	async function confirmRemoveMember() {
		if (!memberToRemove) return;
		try {
			await client.mutation((api as any).groups.removeMember, {
				membershipId: memberToRemove.id
			});
			toast.success('Member removed');
			memberToRemove = null;
			isRemoveMemberDialogOpen = false;
		} catch (e: any) {
			toast.error(e.message || 'Failed to remove member');
		}
	}

	async function handleDelete() {
		isDeleting = true;
		try {
			await client.mutation((api as any).groups.remove, { groupId });
			toast.success('Group deleted');
			window.location.href = '/groups';
		} catch (e) {
			console.error(e);
			toast.error('Failed to delete group');
			isDeleting = false;
		}
	}
</script>

<div class="p-6 lg:p-8">
	{#if groupQuery.isLoading}
		<div class="flex h-[50vh] items-center justify-center">
			<Loader variant="circular" size="lg" />
		</div>
	{:else if !group || !isAdmin}
		<div class="flex flex-col items-center justify-center py-20 text-center">
			<h2 class="text-xl font-bold">Access Denied</h2>
			<p class="text-muted-foreground">You don't have permission to manage this group.</p>
			<Button href="/groups/{groupId}" variant="outline" class="mt-4">Back to Group</Button>
		</div>
	{:else}
		<div class="mx-auto flex w-full max-w-4xl flex-col gap-10 pb-20">
			<header class="space-y-2">
				<div
					class="flex items-center gap-2.5 text-xs font-bold tracking-widest text-primary uppercase"
				>
					<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
						<Settings class="h-4 w-4" />
					</div>
					Group Settings
				</div>
				<h1 class="text-3xl font-semibold tracking-tight">{group.name}</h1>
				<p class="font-mono text-xs text-muted-foreground">@{group.groupname}</p>
			</header>

			<div class="grid gap-10 lg:grid-cols-2">
				<div class="space-y-8">
					<!-- General Settings -->
					<div class="rounded-xl border bg-card">
						<div class="border-b px-6 py-4">
							<h3 class="font-semibold">General Info</h3>
							<p class="text-xs text-muted-foreground">Update name and description.</p>
						</div>
						<div class="space-y-4 p-6">
							<div class="space-y-2">
								<Label for="name" class="text-xs font-semibold text-muted-foreground uppercase"
									>Group Name</Label
								>
								<Input id="name" bind:value={name} placeholder="Enter group name" class="h-10" />
							</div>
							<div class="space-y-2">
								<Label
									for="description"
									class="text-xs font-semibold text-muted-foreground uppercase">Description</Label
								>
								<Textarea
									id="description"
									bind:value={description}
									placeholder="What is this group about?"
									rows={4}
									class="resize-none"
								/>
							</div>
						</div>
						<div class="flex justify-end border-t bg-muted/20 px-6 py-3">
							<Button onclick={handleUpdate} disabled={isSaving || !name.trim()} size="sm">
								{#if isSaving}
									<Loader variant="circular" size="sm" class="mr-2" />
								{:else}
									<Save class="mr-2 h-3.5 w-3.5" />
								{/if}
								Save Changes
							</Button>
						</div>
					</div>

					<!-- Invite Code -->
					<div class="rounded-xl border bg-card">
						<div class="border-b px-6 py-4">
							<h3 class="font-semibold">Invite Peer</h3>
							<p class="text-xs text-muted-foreground">Share this code to let others join.</p>
						</div>
						<div class="p-6">
							<div
								class="flex items-center justify-between rounded-lg border-2 border-dashed bg-muted/30 p-4"
							>
								<code class="font-mono text-2xl font-black tracking-wider text-primary"
									>{group?.inviteCode || '...'}</code
								>
								<Button variant="outline" size="sm" onclick={copyInviteCode} class="gap-2">
									<Copy class="h-4 w-4" />
									Copy
								</Button>
							</div>
						</div>
					</div>

					<!-- Privacy -->
					<div class="rounded-xl border bg-card">
						<div class="border-b px-6 py-4">
							<h3 class="font-semibold">Privacy & Access</h3>
							<p class="text-xs text-muted-foreground">Control how people find and join.</p>
						</div>
						<div class="space-y-4 p-6">
							<div class="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
								<div class="space-y-1">
									<div class="flex items-center gap-2">
										{#if isPublic}
											<Globe class="h-4 w-4 text-green-500" />
											<span class="font-bold">Public Group</span>
										{:else}
											<Lock class="h-4 w-4 text-amber-500" />
											<span class="font-bold">Private Group</span>
										{/if}
									</div>
									<p class="max-w-[180px] text-[10px] leading-snug text-muted-foreground">
										{isPublic
											? 'Anyone can join automatically.'
											: 'Admin approval required to join.'}
									</p>
								</div>
								<Switch
									checked={isPublic}
									onCheckedChange={(checked) => {
										pendingPublicValue = checked;
										showPrivacyConfirm = true;
									}}
								/>
							</div>
						</div>
					</div>
				</div>

				<div class="space-y-8">
					<!-- Pending Requests -->
					<div
						class="rounded-xl border bg-card {pendingMembers.length > 0
							? 'border-primary/30 ring-1 ring-primary/10'
							: ''}"
					>
						<div class="flex items-center justify-between border-b px-6 py-4">
							<div>
								<h3 class="font-semibold">Pending Requests</h3>
								<p class="text-xs text-muted-foreground">Review users waiting to join.</p>
							</div>
							{#if pendingMembers.length > 0}
								<Badge variant="destructive" class="animate-pulse">{pendingMembers.length}</Badge>
							{/if}
						</div>
						<div class="p-6">
							{#if pendingMembers.length === 0}
								<div class="flex flex-col items-center justify-center py-8 text-center opacity-40">
									<Users class="mb-2 h-8 w-8" />
									<p class="text-xs">No pending requests</p>
								</div>
							{:else}
								<div class="space-y-3">
									{#each pendingMembers as member}
										<div
											class="flex items-center justify-between rounded-lg border bg-muted/20 p-3"
										>
											<div class="min-w-0 flex-1">
												<p class="truncate text-sm font-bold">{member.userName}</p>
												<p class="truncate text-[10px] text-muted-foreground">{member.userEmail}</p>
											</div>
											<div class="flex items-center gap-1">
												<Button
													variant="outline"
													size="icon"
													class="h-8 w-8 text-green-600 hover:bg-green-50"
													onclick={() => handleResponse(member._id, 'accept')}
												>
													<Check class="h-4 w-4" />
												</Button>
												<Button
													variant="outline"
													size="icon"
													class="h-8 w-8 text-destructive hover:bg-red-50"
													onclick={() => handleResponse(member._id, 'decline')}
												>
													<X class="h-4 w-4" />
												</Button>
											</div>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					</div>

					<!-- Active Members -->
					<div class="rounded-xl border bg-card">
						<div class="border-b px-6 py-4">
							<h3 class="font-semibold">Active Members</h3>
							<p class="text-xs text-muted-foreground">Manage who is in this group.</p>
						</div>
						<div class="p-6">
							<div class="space-y-3">
								{#each members as member}
									<div class="flex items-center justify-between rounded-lg border bg-muted/10 p-3">
										<div class="flex min-w-0 flex-1 items-center gap-3">
											<div
												class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary"
											>
												{member.name.charAt(0)}
											</div>
											<div class="min-w-0">
												<p class="truncate text-sm font-bold">
													{member.name}
													{#if member.userId === group.ownerId}
														<Badge
															variant="outline"
															class="ml-1 h-4 border-amber-600/30 px-1 py-0 text-[8px] font-black text-amber-600 uppercase"
															>Owner</Badge
														>
													{/if}
												</p>
												<p class="text-[9px] tracking-wider text-muted-foreground uppercase">
													{member.role}
												</p>
											</div>
										</div>

										{#if member.userId !== group.ownerId}
											<Button
												variant="ghost"
												size="icon"
												class="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
												onclick={() => {
													memberToRemove = { id: member._id, name: member.name };
													isRemoveMemberDialogOpen = true;
												}}
											>
												<UserMinus class="h-4 w-4" />
											</Button>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					</div>

					<!-- Danger Zone -->
					<div class="overflow-hidden rounded-xl border border-destructive/20 bg-destructive/5">
						<div class="border-b border-destructive/10 bg-destructive/10 px-6 py-4">
							<h3 class="flex items-center gap-2 font-semibold text-destructive">
								<AlertTriangle class="h-4 w-4" />
								Danger Zone
							</h3>
						</div>
						<div class="p-6">
							{#if !showDeleteConfirm}
								<Button
									variant="destructive"
									size="sm"
									class="w-full gap-2 font-semibold"
									onclick={() => (showDeleteConfirm = true)}
								>
									<Trash2 class="h-4 w-4" />
									Delete Group
								</Button>
							{:else}
								<div class="animate-in space-y-4 fade-in slide-in-from-top-2">
									<p class="text-xs font-medium text-destructive/80">
										Type <strong class="text-destructive">{group.name}</strong> to confirm.
									</p>
									<Input
										placeholder="Group name"
										bind:value={confirmName}
										class="h-9 border-destructive/30 text-xs focus-visible:ring-destructive/30"
									/>
									<div class="flex gap-3">
										<Button
											variant="destructive"
											size="sm"
											class="flex-1 font-semibold"
											onclick={handleDelete}
											disabled={isDeleting || !isDeleteEnabled}
										>
											Confirm Delete
										</Button>
										<Button
											variant="outline"
											size="sm"
											class="flex-1 border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
											onclick={() => {
												showDeleteConfirm = false;
												confirmName = '';
											}}
										>
											Cancel
										</Button>
									</div>
								</div>
							{/if}
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<Dialog.Root
	bind:open={showPrivacyConfirm}
	onOpenChange={(open) => {
		if (!open) showPrivacyConfirm = false;
	}}
>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Change Group Privacy?</Dialog.Title>
			<Dialog.Description>
				Are you sure you want to make this group <span class="font-bold text-foreground"
					>{pendingPublicValue ? 'Public' : 'Private'}</span
				>?
				{#if pendingPublicValue}
					Anyone will be able to find and join this group without approval.
				{:else}
					New members will need an invite code and admin approval to join.
				{/if}
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (showPrivacyConfirm = false)}>Cancel</Button>
			<Button
				onclick={async () => {
					try {
						await client.mutation((api as any).groups.updatePrivacy, {
							groupId,
							isPublic: pendingPublicValue
						});
						isPublic = pendingPublicValue;
						toast.success('Privacy updated');
					} catch (e: any) {
						toast.error(e.message || 'Failed to update privacy');
					} finally {
						showPrivacyConfirm = false;
					}
				}}>Confirm Change</Button
			>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
