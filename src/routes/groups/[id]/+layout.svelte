<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import {
		Search,
		ChevronRight,
		ChevronDown,
		Check,
		X,
		Filter,
		RotateCcw,
		Users,
		FileText,
		BookOpen,
		PanelLeft,
		PanelRight,
		Info,
		Zap,
		LayoutDashboard,
		MessageSquare,
		Share2,
		ArrowLeft,
		Settings,
		Copy,
		Clock,
		ShieldCheck
	} from '@lucide/svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Separator } from '$lib/components/ui/separator';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';
	import { browser } from '$app/environment';
	import type { Id } from '$convex/_generated/dataModel';
	import { toast } from 'svelte-sonner';

	let { children } = $props();

	const groupId = $derived(page.params.id as Id<'groups'>);

	// Sidebar state
	let isSidebarOpen = $state(true);
	let isRightSidebarOpen = $state(false);
	let isMobile = $state(false);

	$effect(() => {
		if (browser) {
			const checkMobile = () => {
				const mobile = window.innerWidth < 1024;
				if (mobile !== isMobile) {
					isMobile = mobile;
					isSidebarOpen = !mobile;
					isRightSidebarOpen = !mobile;
				}
			};
			checkMobile();
			window.addEventListener('resize', checkMobile);
			return () => window.removeEventListener('resize', checkMobile);
		}
	});

	const groupQuery = useQuery((api as any).groups.get, () => (groupId ? { groupId } : 'skip'));
	const group = $derived(groupQuery.data);

	const analyticsQuery = useQuery((api as any).groups.getMemberAnalytics, () =>
		groupId ? { groupId } : 'skip'
	);
	const analytics = $derived(analyticsQuery.data);

	const pendingMembersQuery = useQuery((api as any).groups.getPendingMembers, () =>
		groupId && group?.membershipRole === 'admin' ? { groupId } : 'skip'
	);
	const pendingCount = $derived(pendingMembersQuery.data?.length ?? 0);

	const currentUserId = $derived(
		(page.data.currentUser as any)?.id ?? (page.data.currentUser as any)?._id
	);

	// Filter state from URL
	const selectedType = $derived(page.url.searchParams.get('type') || 'all');
	const sharedBy = $derived(page.url.searchParams.get('sharedBy') || 'all');
	const search = $derived(page.url.searchParams.get('q') || '');

	let searchInput = $state('');
	$effect(() => {
		searchInput = search;
	});

	function updateParams(newParams: Record<string, string | null>) {
		const params = new URLSearchParams(page.url.searchParams);
		Object.entries(newParams).forEach(([key, value]) => {
			if (value === null || value === 'all') params.delete(key);
			else params.set(key, value);
		});
		goto(`/groups/${groupId}?${params.toString()}`, { noScroll: true, keepFocus: true });
		if (isMobile) {
			isSidebarOpen = false;
			isRightSidebarOpen = false;
		}
	}

	function handleSearch() {
		updateParams({ q: searchInput || null });
	}

	function copyInviteCode() {
		if (group?.inviteCode) {
			navigator.clipboard.writeText(group.inviteCode);
			toast.success('Invite code copied to clipboard!');
		}
	}

	const isPending = $derived(group?.membershipStatus === 'pending');

	function navigate(path: string) {
		goto(`/groups/${groupId}${path}`, { noScroll: true });
		if (isMobile) {
			isSidebarOpen = false;
			isRightSidebarOpen = false;
		}
	}
</script>

<div class="flex h-[calc(100vh-40px)] w-full max-w-full overflow-hidden bg-background">
	{#if (isSidebarOpen || isRightSidebarOpen) && isMobile}
		<button
			type="button"
			aria-label="Close sidebars"
			onclick={() => {
				isSidebarOpen = false;
				isRightSidebarOpen = false;
			}}
			class="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm transition-opacity duration-300 lg:hidden"
		></button>
	{/if}

	<!-- Left Sidebar -->
	<aside
		class="fixed inset-y-0 left-0 z-50 flex h-full flex-col border-r bg-sidebar transition-[transform,opacity,width] duration-300 ease-in-out lg:relative
        {isSidebarOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0'}
        {isSidebarOpen ? 'w-72' : 'lg:w-0 lg:overflow-hidden lg:border-transparent'}"
	>
		<div class="flex h-10 items-center justify-between border-b px-4">
			<div class="flex items-center gap-2">
				<Users class="h-3.5 w-3.5 text-primary" />
				<h2 class="truncate text-[11px] font-bold tracking-tight text-foreground/80 uppercase">
					{group?.name || 'Group'}
				</h2>
			</div>
			<button
				class="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				onclick={() => (isSidebarOpen = false)}
			>
				<PanelLeft class="h-4 w-4" />
			</button>
		</div>

		<div class="flex-1 space-y-6 overflow-y-auto p-4">
			<!-- Quick Navigation -->
			<div class="space-y-1">
				<h3 class="px-2 text-[10px] font-black tracking-widest text-muted-foreground uppercase">
					Group Hub
				</h3>
				<button
					onclick={() => navigate('')}
					class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-xs font-bold transition-all hover:bg-accent
                    {page.url.pathname === `/groups/${groupId}`
						? 'bg-accent text-primary'
						: 'text-muted-foreground'}"
				>
					<Share2 class="h-4 w-4" />
					Feed
				</button>
				<button
					onclick={() => navigate('/dashboard')}
					class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-xs font-bold transition-all hover:bg-accent
                    {page.url.pathname.includes('/dashboard')
						? 'bg-accent text-primary'
						: 'text-muted-foreground'}"
				>
					<LayoutDashboard class="h-4 w-4" />
					Dashboard
				</button>
				{#if group?.membershipRole === 'admin' || group?.ownerId === currentUserId}
					<button
						onclick={() => navigate('/settings')}
						class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-xs font-bold transition-all hover:bg-accent
                        {page.url.pathname.includes('/settings')
							? 'bg-accent text-primary'
							: 'text-muted-foreground'}"
					>
						<div class="relative">
							<Settings class="h-4 w-4" />
							{#if pendingCount > 0}
								<span class="absolute -top-1 -right-1 flex h-2 w-2">
									<span
										class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"
									></span>
									<span class="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
								</span>
							{/if}
						</div>
						Settings
						{#if pendingCount > 0}
							<Badge class="ml-auto bg-red-500 px-1.5 py-0 text-[9px] hover:bg-red-600"
								>{pendingCount}</Badge
							>
						{/if}
					</button>
				{/if}
			</div>

			{#if !isPending}
				<Separator class="opacity-50" />

				<!-- Type Filters -->
				<div class="space-y-3">
					<h3 class="px-2 text-[10px] font-black tracking-widest text-muted-foreground uppercase">
						Content Type
					</h3>
					<div class="space-y-1">
						{#each [{ id: 'all', name: 'All Shared', icon: Share2 }, { id: 'content', name: 'Knowledge Base', icon: BookOpen }, { id: 'blog', name: 'Blogs', icon: FileText }, { id: 'news', name: 'News Updates', icon: Zap }] as type}
							<button
								onclick={() => updateParams({ type: type.id })}
								class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-xs font-bold transition-all hover:bg-accent
								{selectedType === type.id ? 'bg-accent text-primary' : 'text-muted-foreground'}"
							>
								<type.icon class="h-4 w-4" />
								{type.name}
								{#if selectedType === type.id}
									<div class="ml-auto h-1.5 w-1.5 rounded-full bg-primary"></div>
								{/if}
							</button>
						{/each}
					</div>
				</div>

				<Separator class="opacity-50" />

				<!-- Shared By Filters -->
				<div class="space-y-3">
					<h3 class="px-2 text-[10px] font-black tracking-widest text-muted-foreground uppercase">
						Shared By
					</h3>
					<div class="space-y-1">
						<button
							onclick={() => updateParams({ sharedBy: 'all' })}
							class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-xs font-bold transition-all hover:bg-accent
							{sharedBy === 'all' ? 'bg-accent text-primary' : 'text-muted-foreground'}"
						>
							<Users class="h-4 w-4" />
							Everyone
						</button>
						{#if analytics}
							{#each analytics.memberStats as member}
								<button
									onclick={() => updateParams({ sharedBy: member.userId })}
									class="flex w-full items-center gap-3 rounded-md px-3 py-2 text-xs font-bold transition-all hover:bg-accent
									{sharedBy === member.userId ? 'bg-accent text-primary' : 'text-muted-foreground'}"
								>
									<div
										class="flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-[8px]"
									>
										{member.name.charAt(0)}
									</div>
									<span class="truncate">{member.name}</span>
								</button>
							{/each}
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</aside>

	<!-- Main Content -->
	<main class="relative flex flex-1 flex-col overflow-hidden">
		{#if !isSidebarOpen}
			<button
				onclick={() => (isSidebarOpen = true)}
				class="absolute top-0 left-0 z-50 flex h-10 w-10 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
			>
				<PanelLeft class="h-4 w-4" />
			</button>
		{/if}

		{#if isPending}
			<div class="flex flex-1 flex-col items-center justify-center bg-muted/30 p-8 text-center">
				<div class="mb-6 rounded-full bg-amber-500/10 p-6 text-amber-600">
					<Clock class="h-16 w-16" />
				</div>
				<h2 class="text-3xl font-black tracking-tight">Membership Pending</h2>
				<p class="mx-auto mt-4 max-w-md text-lg leading-relaxed text-muted-foreground">
					Your request to join <span class="font-bold text-foreground">{group?.name}</span> is waiting
					for admin approval. You'll get access to the intelligence feed once you're accepted.
				</p>
				<div class="mt-10 flex gap-4">
					<Button variant="outline" href="/groups">Back to Groups</Button>
					<Button
						variant="ghost"
						class="text-muted-foreground"
						onclick={() => window.location.reload()}
					>
						Check Status
					</Button>
				</div>
			</div>
		{:else}
			<!-- Header / Search -->
			{#if page.url.pathname === `/groups/${groupId}`}
				<header
					class="flex h-10 shrink-0 items-center justify-center border-b bg-background px-4 {isSidebarOpen
						? ''
						: 'pl-12'}"
				>
					<div class="flex w-full max-w-xl items-center gap-2">
						<div class="relative flex-1">
							<Search
								class="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
							/>
							<input
								type="text"
								placeholder="Search in group..."
								bind:value={searchInput}
								onkeydown={(e) => e.key === 'Enter' && handleSearch()}
								class="h-7 w-full border-none bg-muted/30 pr-8 pl-9 text-xs focus-visible:ring-primary/20"
							/>
							{#if searchInput}
								<button
									onclick={() => {
										searchInput = '';
										handleSearch();
									}}
									class="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:bg-muted"
								>
									<X class="h-3 w-3" />
								</button>
							{/if}
						</div>
						<Button size="sm" class="h-7 px-3 text-xs" onclick={handleSearch}>Search</Button>
					</div>
				</header>
			{:else if !page.url.pathname.includes('/content/')}
				<header
					class="flex h-10 shrink-0 items-center justify-between border-b bg-background px-4 {isSidebarOpen
						? ''
						: 'pl-12'}"
				>
					<div
						class="flex items-center gap-2 text-[10px] font-black tracking-widest text-muted-foreground uppercase"
					>
						{page.url.pathname.includes('/dashboard') ? 'Group Analytics' : 'Group Management'}
					</div>
				</header>
			{/if}

			<div class="flex-1 overflow-y-auto">
				{@render children()}
			</div>

			<!-- Right Sidebar FAB for Mobile -->
			{#if isMobile}
				<button
					onclick={() => (isRightSidebarOpen = true)}
					class="fixed right-6 bottom-12 z-40 flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all hover:scale-105 active:scale-95 lg:hidden {isRightSidebarOpen
						? 'pointer-events-none scale-0 opacity-0'
						: 'scale-100 opacity-100'}"
					aria-label="View Details"
				>
					<Info class="size-4" />
				</button>
			{/if}
		{/if}
	</main>

	<!-- Right Sidebar -->
	<aside
		class="fixed inset-y-0 right-0 z-50 flex h-full flex-col border-l bg-sidebar transition-[transform,opacity,width] duration-300 ease-in-out lg:relative
        {isRightSidebarOpen || !isMobile
			? 'translate-x-0 opacity-100'
			: 'translate-x-full opacity-0'}
        {isRightSidebarOpen || !isMobile
			? 'w-72'
			: 'lg:w-0 lg:overflow-hidden lg:border-transparent'}"
	>
		<div class="flex h-10 items-center justify-between border-b px-4">
			{#if isMobile}
				<button
					class="rounded-md p-1 text-muted-foreground hover:bg-accent"
					onclick={() => (isRightSidebarOpen = false)}
				>
					<PanelRight class="h-4 w-4" />
				</button>
			{/if}
			<div class="flex flex-1 items-center justify-end gap-2">
				<h2 class="text-[11px] font-bold tracking-tight text-foreground/80 uppercase">
					Group Details
				</h2>
				<Info class="h-3.5 w-3.5 text-primary" />
			</div>
		</div>

		<div class="flex-1 space-y-6 overflow-y-auto p-6">
			{#if group}
				<div class="space-y-6">
					<div>
						<h3 class="mb-1 text-[10px] font-black tracking-widest text-muted-foreground uppercase">
							Description
						</h3>
						<p class="text-xs leading-relaxed text-muted-foreground">
							{group.description || 'No description provided for this group.'}
						</p>
					</div>

					<div class="flex items-center justify-between rounded-xl border bg-muted/10 p-3">
						<div class="flex items-center gap-2">
							{#if group.isPublic}
								<Users class="h-3.5 w-3.5 text-green-500" />
								<span class="text-[10px] font-bold text-green-600 uppercase">Public Group</span>
							{:else}
								<ShieldCheck class="h-3.5 w-3.5 text-amber-500" />
								<span class="text-[10px] font-bold text-amber-600 uppercase">Private Group</span>
							{/if}
						</div>
					</div>

					<Separator />

					<div class="rounded-xl border bg-primary/5 p-4 text-center">
						<Users class="mx-auto mb-2 h-8 w-8 text-primary/40" />
						<p class="text-xs font-medium">Ready to collaborate?</p>
						<p class="mt-1 text-[10px] text-muted-foreground">
							Share content from the knowledge base to start a discussion.
						</p>
						<Button
							href="/content"
							variant="outline"
							size="sm"
							class="mt-3 h-7 w-full text-[10px] font-bold uppercase">Explore Content</Button
						>
					</div>
				</div>
			{:else}
				<div class="flex h-full flex-col items-center justify-center text-center opacity-50">
					<Loader variant="circular" size="sm" />
				</div>
			{/if}
		</div>
	</aside>
</div>


