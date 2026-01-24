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
		ArrowLeft,
		Save,
		Trash2,
		AlertTriangle,
		LoaderCircle,
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

	let memberToRemove = $state<{ id: Id<'memberships'>; name: string } | null>(null);
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
			toast.success('Circle settings updated');
		} catch (e: any) {
			console.error(e);
			toast.error(e.message || 'Failed to update circle');
		} finally {
			isSaving = false;
		}
	}

	async function handleResponse(membershipId: Id<'memberships'>, action: 'accept' | 'decline') {
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
			toast.success('Circle deleted');
			window.location.href = '/groups';
		} catch (e) {
			console.error(e);
			toast.error('Failed to delete circle');
			isDeleting = false;
		}
	}
</script>

<div class="p-6">
	{#if groupQuery.isLoading}
		<div class="flex h-[50vh] items-center justify-center">
			<Loader variant="circular" size="lg" />
		</div>
	{:else if !group || !isAdmin}
		<div class="flex flex-col items-center justify-center py-20 text-center">
			<h2 class="text-xl font-bold">Access Denied</h2>
			<p class="text-muted-foreground">You don't have permission to manage this circle.</p>
			<Button href="/groups/{groupId}" variant="outline" class="mt-4">Back to Circle</Button>
		</div>
	{:else}
		<div class="mx-auto flex w-full max-w-4xl flex-col gap-8 pb-20">
			<header>
				<div
					class="mb-1 flex items-center gap-2 text-sm font-bold tracking-wider text-primary uppercase"
				>
					<Settings class="h-4 w-4" />
					Circle Settings
				</div>
				<h1 class="text-3xl font-extrabold tracking-tight">{group.name}</h1>
				<p class="font-mono text-xs text-muted-foreground">@{group.groupname}</p>
			</header>

			<Separator />

			<div class="grid gap-8 lg:grid-cols-2">
				<div class="space-y-8">
					<!-- General Settings -->
					<Card.Root>
						<Card.Header>
							<Card.Title>General Info</Card.Title>
							<Card.Description>Update name and description.</Card.Description>
						</Card.Header>
						<Card.Content class="space-y-4">
							<div class="space-y-2">
								<Label for="name">Circle Name</Label>
								<Input id="name" bind:value={name} placeholder="Enter circle name" />
							</div>
							<div class="space-y-2">
								<Label for="description">Description</Label>
								<Textarea
									id="description"
									bind:value={description}
									placeholder="What is this circle about?"
									rows={4}
								/>
							</div>
						</Card.Content>
						<Card.Footer class="flex justify-end border-t p-4">
							<Button onclick={handleUpdate} disabled={isSaving || !name.trim()} size="sm">
								{isSaving ? 'Saving...' : 'Save Changes'}
							</Button>
						</Card.Footer>
					</Card.Root>

					<!-- Invite Code (Admin Only) -->
					{#if isAdmin}
						<Card.Root>
							<Card.Header>
								<Card.Title>Invite Peer</Card.Title>
								<Card.Description>Share this code to let others join your circle.</Card.Description>
							</Card.Header>
							<Card.Content>
								<div class="flex items-center justify-between rounded-lg border bg-muted/20 p-4">
									<code class="font-mono text-xl font-black text-primary"
										>{group?.inviteCode || '...'}</code
									>
									<Button variant="outline" size="sm" onclick={copyInviteCode} class="gap-2">
										<Copy class="h-4 w-4" />
										Copy Code
									</Button>
								</div>
							</Card.Content>
						</Card.Root>
					{/if}

					<!-- Privacy Settings -->
					<Card.Root>
						<Card.Header>
							<Card.Title>Privacy & Access</Card.Title>
							<Card.Description>Control how people find and join.</Card.Description>
						</Card.Header>
						<Card.Content class="space-y-4">
							<div class="flex items-center justify-between rounded-lg border bg-muted/20 p-4">
								<div class="space-y-1">
									<div class="flex items-center gap-2">
										{#if isPublic}
											<Globe class="h-4 w-4 text-green-500" />
											<span class="font-bold">Public Circle</span>
										{:else}
											<Lock class="h-4 w-4 text-amber-500" />
											<span class="font-bold">Private Circle</span>
										{/if}
									</div>
									<p class="text-xs leading-snug text-muted-foreground">
										{isPublic
											? 'Anyone can find and join this circle automatically.'
											: 'Only people with the invite code can request to join. Admin approval required.'}
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
						</Card.Content>
						<Card.Footer class="flex justify-end border-t p-4">
							<Badge variant="outline" class="text-[10px] uppercase">
								{isPublic ? 'Public' : 'Private'}
							</Badge>
						</Card.Footer>
					</Card.Root>
				</div>

				<div class="space-y-8">
					<!-- Pending Requests -->
					<Card.Root
						class={pendingMembers.length > 0 ? 'border-primary/30 ring-1 ring-primary/10' : ''}
					>
						<Card.Header>
							<div class="flex items-center justify-between">
								<Card.Title class="flex items-center gap-2 text-lg font-bold">
									<Users class="h-5 w-5" />
									Pending Requests
								</Card.Title>
								{#if pendingMembers.length > 0}
									<Badge variant="destructive" class="animate-pulse">{pendingMembers.length}</Badge>
								{/if}
							</div>
							<Card.Description>Review users waiting to join.</Card.Description>
						</Card.Header>
						<Card.Content>
							{#if pendingMembers.length === 0}
								<div class="flex flex-col items-center justify-center py-8 text-center opacity-50">
									<Users class="mb-2 h-8 w-8" />
									<p class="text-xs">No pending requests</p>
								</div>
							{:else}
								<div class="space-y-4">
									{#each pendingMembers as member}
										<div
											class="flex items-center justify-between rounded-lg border bg-muted/30 p-3"
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
						</Card.Content>
					</Card.Root>

					<!-- Active Members Management -->
					<Card.Root>
						<Card.Header>
							<Card.Title class="flex items-center gap-2 text-lg font-bold">
								<Shield class="h-5 w-5 text-primary" />
								Active Members
							</Card.Title>
							<Card.Description>Manage who is in this circle.</Card.Description>
						</Card.Header>
						<Card.Content>
							<div class="space-y-4">
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
															class="ml-1 border-amber-600/30 px-1 py-0 text-[8px] font-black text-amber-600 uppercase"
															>Owner</Badge
														>
													{/if}
													{#if member.userId === (page.data.currentUser as any)?.id || member.userId === (page.data.currentUser as any)?._id}
														<Badge
															variant="outline"
															class="ml-1 border-primary/30 px-1 py-0 text-[8px] font-black text-primary uppercase"
															>You</Badge
														>
													{/if}
												</p>
												<p class="text-[10px] text-muted-foreground uppercase">{member.role}</p>
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
						</Card.Content>
					</Card.Root>
				</div>
			</div>

			<!-- Danger Zone -->
			<Card.Root class="border-destructive/20 bg-destructive/5">
				<Card.Header>
					<Card.Title class="flex items-center gap-2 text-destructive">
						<AlertTriangle class="h-5 w-5" />
						Danger Zone
					</Card.Title>
				</Card.Header>
				<Card.Content>
					{#if !showDeleteConfirm}
						<Button
							variant="destructive"
							size="sm"
							class="w-full gap-2"
							onclick={() => (showDeleteConfirm = true)}
						>
							<Trash2 class="h-4 w-4" />
							Delete Circle
						</Button>
					{:else}
						<div class="animate-in space-y-4 fade-in slide-in-from-top-2">
							<p class="text-xs text-muted-foreground">
								Type <strong>{group.name}</strong> to confirm.
							</p>
							<Input placeholder="Circle name" bind:value={confirmName} class="h-8 text-xs" />
							<div class="flex gap-2">
								<Button
									variant="destructive"
									size="sm"
									class="flex-1"
									onclick={handleDelete}
									disabled={isDeleting || !isDeleteEnabled}
								>
									Confirm
								</Button>
								<Button
									variant="outline"
									size="sm"
									class="flex-1"
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
				</Card.Content>
			</Card.Root>
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
			<Dialog.Title>Change Circle Privacy?</Dialog.Title>
			<Dialog.Description>
				Are you sure you want to make this circle <span class="font-bold text-foreground"
					>{pendingPublicValue ? 'Public' : 'Private'}</span
				>?
				{#if pendingPublicValue}
					Anyone will be able to find and join this circle without approval.
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
