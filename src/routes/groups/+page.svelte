<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import { Switch } from '$lib/components/ui/switch';
	import { Label } from '$lib/components/ui/label';
	import {
		Users,
		Plus,
		UserPlus,
		ArrowRight,
		Shield,
		Share2,
		TrendingUp,
		Search,
		Clock,
		PanelRight,
		Info,
		X
	} from '@lucide/svelte';
	import { Separator } from '$lib/components/ui/separator';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';
	import type { Id } from '$convex/_generated/dataModel';
	import { toast } from 'svelte-sonner';
	import { browser } from '$app/environment';

	const client = useConvexClient();
	const groupsQuery = useQuery((api as any).groups.list, {});
	const groups = $derived(groupsQuery.data ?? []);

	let groupName = $state('');
	let groupSlug = $state('');
	let isPublic = $state(false);
	let inviteCode = $state('');
	let searchQuery = $state('');
	let isCreating = $state(false);
	let isJoining = $state(false);

	// Sidebar state
	let isRightSidebarOpen = $state(false);
	let isMobile = $state(false);

	$effect(() => {
		if (browser) {
			const checkMobile = () => {
				const mobile = window.innerWidth < 1024;
				if (mobile !== isMobile) {
					isMobile = mobile;
					if (!mobile) {
						isRightSidebarOpen = true;
					} else {
						isRightSidebarOpen = false;
					}
				}
			};
			checkMobile();
			window.addEventListener('resize', checkMobile);
			return () => window.removeEventListener('resize', checkMobile);
		}
	});

	const searchResultsQuery = useQuery((api as any).groups.searchPublicGroups, () =>
		searchQuery.length >= 2 ? { query: searchQuery } : 'skip'
	);
	const searchResults = $derived(searchResultsQuery.data ?? []);

	async function handleCreateGroup() {
		if (!groupName || !groupSlug) return;
		isCreating = true;
		try {
			const groupId = await client.mutation((api as any).groups.create, {
				name: groupName,
				groupname: groupSlug,
				isPublic
			});
			groupName = '';
			groupSlug = '';
			if (isMobile) isRightSidebarOpen = false;
			window.location.href = `/groups/${groupId}`;
		} catch (e: any) {
			toast.error(e.message || 'Failed to create group');
			console.error('Failed to create group:', e);
		} finally {
			isCreating = false;
		}
	}

	async function handleJoinGroup(id?: Id<'groups'>) {
		if (!inviteCode && !id) return;
		isJoining = true;
		try {
			const groupId = await client.mutation((api as any).groups.join, {
				inviteCode: inviteCode || undefined,
				groupId: id
			});

			// Check if the group is in our list and its status
			const joinedGroup = await client.query((api as any).groups.get, { groupId });

			if (joinedGroup?.membershipStatus === 'pending') {
				toast.success('Join request sent! Waiting for admin approval.');
				inviteCode = '';
				searchQuery = '';
			} else {
				window.location.href = `/groups/${groupId}`;
			}
			if (isMobile) isRightSidebarOpen = false;
		} catch (e: any) {
			toast.error(e.message || 'Invalid invite code or group not found');
			console.error('Failed to join group:', e);
		} finally {
			isJoining = false;
		}
	}
</script>

<div class="flex h-[calc(100vh-40px)] w-full max-w-full overflow-hidden bg-background/50">
	<!-- Mobile Overlay -->
	{#if isRightSidebarOpen && isMobile}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			onclick={() => {
				isRightSidebarOpen = false;
			}}
			class="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm transition-opacity duration-300 lg:hidden"
		></div>
	{/if}

	<main class="relative flex flex-1 flex-col overflow-hidden">
		<div class="flex-1 overflow-y-auto p-6">
			<div class="mx-auto flex w-full max-w-5xl flex-col gap-12">
				<!-- Hero Section -->
				<header class="text-center">
					<div
						class="mb-4 inline-flex items-center gap-2 rounded-full border bg-primary/5 px-4 py-1.5 text-xs font-bold tracking-widest text-primary uppercase"
					>
						<Users class="h-3 w-3" />
						Collaborative Learning
					</div>
					<h1 class="text-4xl font-black tracking-tight sm:text-5xl">Cognirivus Groups</h1>
					<p class="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
						Private spaces for your study groups to share intelligence, track collective progress,
						and engage in scoped discussions.
					</p>

					<!-- Public Search -->
					<div class="mx-auto mt-8 max-w-md">
						<div class="relative">
							<Search
								class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
							/>
							<Input
								placeholder="Search public groups by name or @id..."
								bind:value={searchQuery}
								class="h-12 pr-4 pl-10 shadow-sm focus:ring-primary/20"
							/>
						</div>
						{#if searchQuery.length >= 2}
							<div
								class="mt-2 animate-in overflow-hidden rounded-xl border bg-card shadow-lg fade-in slide-in-from-top-2"
							>
								{#if searchResultsQuery.isLoading}
									<div class="flex items-center justify-center p-8">
										<Loader variant="circular" size="sm" />
									</div>
								{:else if searchResults.length > 0}
									<div class="divide-y">
										{#each searchResults as result}
											<div class="flex items-center justify-between p-4 hover:bg-muted/50">
												<div class="flex items-center gap-3 text-left">
													<div
														class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 font-bold text-primary"
													>
														{result.name.charAt(0)}
													</div>
													<div>
														<p class="font-bold">{result.name}</p>
														<p class="text-xs text-muted-foreground">@{result.groupname}</p>
													</div>
												</div>
												<Button
													size="sm"
													onclick={() => handleJoinGroup(result._id)}
													disabled={isJoining}
												>
													Join
												</Button>
											</div>
										{/each}
									</div>
								{:else}
									<div class="p-8 text-center text-sm text-muted-foreground">
										No public groups found matching "{searchQuery}"
									</div>
								{/if}
							</div>
						{/if}
					</div>
				</header>

				<!-- Main Column: My Groups -->
				<div class="space-y-6">
					<div class="flex items-center justify-between">
						<h2 class="text-xl font-black tracking-tight">My Active Groups</h2>
						<Badge variant="outline" class="font-bold uppercase tabular-nums"
							>{groups.length} Groups</Badge
						>
					</div>

					{#if groupsQuery.isLoading}
						<div class="flex h-40 items-center justify-center">
							<Loader variant="circular" size="md" />
						</div>
					{:else if groups.length > 0}
						<div class="grid gap-4 sm:grid-cols-2">
							{#each groups as group}
								{@const isPending = group.membershipStatus === 'pending'}
								<div class="h-full">
									{#if isPending}
										<div
											class="relative flex h-full flex-col gap-4 rounded-xl border-2 border-dashed bg-muted/10 p-6 grayscale-[0.5]"
										>
											<div class="flex items-center justify-between">
												<div
													class="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-xl font-black text-primary"
												>
													{group.name.charAt(0).toUpperCase()}
												</div>
												<Badge
													variant="outline"
													class="animate-pulse bg-amber-500/10 text-[9px] font-bold text-amber-600 uppercase"
													>Pending Approval</Badge
												>
											</div>
											<div>
												<Card.Title class="text-xl font-bold">{group.name}</Card.Title>
												<p class="mb-1 font-mono text-xs text-muted-foreground">
													@{group.groupname}
												</p>
												<Card.Description class="mt-1 line-clamp-2 text-sm leading-relaxed">
													{group.description ||
														'Access will be granted once an admin approves your request.'}
												</Card.Description>
											</div>
											<div
												class="mt-auto flex items-center gap-1.5 border-t border-border/50 pt-4 text-[10px] font-bold text-muted-foreground uppercase"
											>
												<Clock class="h-3 w-3" />
												Waiting for admin...
											</div>
										</div>
									{:else}
										<a href={`/groups/${group._id}`} class="group block h-full">
											<Card.Root
												class="h-full border-2 transition-all hover:border-primary/50 hover:bg-primary/5 hover:shadow-lg"
											>
												<Card.Header class="p-6">
													<div class="flex flex-col gap-4">
														<div class="flex items-center justify-between">
															<div
																class="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-xl font-black text-primary"
															>
																{group.name.charAt(0).toUpperCase()}
															</div>
															<div class="flex items-center gap-2">
																{#if group.isPublic}
																	<Badge
																		variant="secondary"
																		class="bg-green-500/10 text-[9px] font-bold text-green-600 uppercase"
																		>Public</Badge
																	>
																{:else}
																	<Badge
																		variant="secondary"
																		class="bg-amber-500/10 text-[9px] font-bold text-amber-600 uppercase"
																		>Private</Badge
																	>
																{/if}
															</div>
														</div>
														<div>
															<Card.Title class="text-xl font-bold">{group.name}</Card.Title>
															<p class="mb-1 font-mono text-xs text-muted-foreground">
																@{group.groupname}
															</p>
															<Card.Description
																class="mt-1 line-clamp-2 min-h-[2.5rem] text-sm leading-relaxed"
															>
																{group.description ||
																	'Private discussion group for intelligence sharing and group progress tracking.'}
															</Card.Description>
														</div>
													</div>
												</Card.Header>
												<Card.Footer class="flex gap-4 border-t bg-muted/5 p-4">
													<div
														class="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase"
													>
														<Share2 class="h-3 w-3" />
														Feed
													</div>
													<div
														class="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase"
													>
														<TrendingUp class="h-3 w-3" />
														Stats
													</div>
												</Card.Footer>
											</Card.Root>
										</a>
									{/if}
								</div>
							{/each}
						</div>
					{:else}
						<div
							class="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed bg-muted/20 py-20 text-center"
						>
							<div class="mb-6 rounded-full bg-muted p-6">
								<Users class="h-12 w-12 text-muted-foreground/30" />
							</div>
							<h3 class="text-xl font-bold">No Groups Found</h3>
							<p class="mt-2 max-w-xs text-muted-foreground">
								You haven't joined any groups yet. Start one yourself or use an invite code from a
								peer.
							</p>
						</div>
					{/if}

					<!-- Feature Grid -->
					<div class="grid gap-4 pt-8 sm:grid-cols-3">
						<div class="space-y-2 p-4">
							<Shield class="h-5 w-5 text-primary" />
							<h4 class="text-sm font-bold">Thread Isolation</h4>
							<p class="text-xs text-muted-foreground">
								Private comments only visible to group members.
							</p>
						</div>
						<div class="space-y-2 p-4">
							<Share2 class="h-5 w-5 text-blue-500" />
							<h4 class="text-sm font-bold">Collective Feed</h4>
							<p class="text-xs text-muted-foreground">
								Share blogs and KB items directly into your hub.
							</p>
						</div>
						<div class="space-y-2 p-4">
							<TrendingUp class="h-5 w-5 text-green-500" />
							<h4 class="text-sm font-bold">Group Progress</h4>
							<p class="text-xs text-muted-foreground">
								Compare completion rates across all members.
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Mobile FAB -->
		{#if isMobile}
			<button
				onclick={() => (isRightSidebarOpen = true)}
				class="fixed right-6 bottom-12 z-40 flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all hover:scale-105 active:scale-95 lg:hidden {isRightSidebarOpen
					? 'pointer-events-none scale-0 opacity-0'
					: 'scale-100 opacity-100'}"
				aria-label="Group Actions"
			>
				<Plus class="size-4" />
			</button>
		{/if}
	</main>

	<!-- Right Sidebar -->
	<aside
		class="fixed inset-y-0 right-0 z-50 flex h-full flex-col border-l bg-sidebar transition-[transform,opacity,width] duration-300 ease-in-out lg:relative
        {isRightSidebarOpen || !isMobile
			? 'translate-x-0 opacity-100'
			: 'translate-x-full opacity-0'}
        {isRightSidebarOpen || !isMobile
			? 'w-80'
			: 'lg:w-0 lg:overflow-hidden lg:border-transparent'}"
	>
		<div class="flex h-10 items-center justify-between border-b px-4">
			{#if isMobile}
				<button
					class="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					onclick={() => (isRightSidebarOpen = false)}
				>
					<X class="h-4 w-4" />
				</button>
			{/if}
			<div class="flex flex-1 items-center justify-end gap-2">
				<h2 class="text-[11px] font-bold tracking-tight text-foreground/80 uppercase">
					Group Actions
				</h2>
				<Plus class="h-3.5 w-3.5 text-primary" />
			</div>
		</div>

		<div class="flex-1 space-y-8 overflow-y-auto p-6">
			<div class="space-y-6">
				<div>
					<h3 class="flex items-center gap-2 text-lg font-black tracking-tight">
						<Plus class="h-5 w-5 text-primary" />
						Launch Group
					</h3>
					<p class="mt-1 text-sm text-muted-foreground">Create a new hub for your group.</p>
				</div>
				<div class="space-y-4">
					<div class="space-y-2">
						<Label class="text-[10px] font-black text-muted-foreground uppercase"
							>Display Name</Label
						>
						<Input
							placeholder="e.g. UPSC Batch 2026"
							bind:value={groupName}
							class="h-10 border-2 focus:border-primary/50"
						/>
					</div>
					<div class="space-y-2">
						<Label class="text-[10px] font-black text-muted-foreground uppercase"
							>Group ID (@handle)</Label
						>
						<Input
							placeholder="e.g. upsc-2026"
							bind:value={groupSlug}
							class="h-10 border-2 font-mono focus:border-primary/50"
						/>
					</div>
					<div class="flex items-center justify-between rounded-lg border-2 bg-muted/20 p-3">
						<div class="space-y-0.5">
							<Label class="text-xs font-bold">Public Group</Label>
							<p class="text-[10px] leading-tight text-muted-foreground">
								Anyone can join without approval.
							</p>
						</div>
						<Switch bind:checked={isPublic} />
					</div>
					<Button
						class="h-10 w-full font-bold tracking-wide uppercase"
						disabled={!groupName || !groupSlug || isCreating}
						onclick={handleCreateGroup}
					>
						{isCreating ? 'Creating Hub...' : 'Create New Group'}
					</Button>
				</div>
			</div>

			<Separator />

			<div class="space-y-6">
				<div>
					<h3 class="flex items-center gap-2 text-lg font-black tracking-tight">
						<UserPlus class="h-5 w-5 text-blue-500" />
						Join Group
					</h3>
					<p class="mt-1 text-sm text-muted-foreground">
						Enter an invite code provided by a member.
					</p>
				</div>
				<div class="space-y-4">
					<Input
						placeholder="Invite Code (e.g. CX49P2)"
						bind:value={inviteCode}
						class="h-10 border-2 font-mono uppercase focus:border-blue-500/50"
					/>
					<Button
						variant="secondary"
						class="h-10 w-full font-bold tracking-wide uppercase"
						disabled={!inviteCode || isJoining}
						onclick={() => handleJoinGroup()}
					>
						{isJoining ? 'Verifying...' : 'Join Group'}
					</Button>
				</div>
			</div>

			<div class="rounded-2xl bg-muted/30 p-6">
				<p class="mb-3 text-[10px] font-black tracking-widest text-muted-foreground uppercase">
					Community Security
				</p>
				<p class="text-xs leading-relaxed text-muted-foreground">
					Groups are private by default. Only people with your invite code can see shared content
					and discussions.
				</p>
			</div>
		</div>
	</aside>
</div>
