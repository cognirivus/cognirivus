<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { useAppAuth } from '$lib/auth.svelte';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import {
		Calendar,
		BookMarked,
		ChevronDown,
		Globe,
		MessageSquare,
		ThumbsDown,
		ThumbsUp,
		User,
		Users,
		Lock,
		ExternalLink,
		Tag,
		Archive,
		Search,
		X,
		LayoutGrid,
		List
	} from '@lucide/svelte';
	import { api } from '$convex/_generated/api';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import SaveSourceToCollectionDialog from '$lib/components/collections/SaveSourceToCollectionDialog.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuLabel,
		DropdownMenuRadioGroup,
		DropdownMenuRadioItem,
		DropdownMenuSeparator,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import { Input } from '$lib/components/ui/input';
	import { toast } from 'svelte-sonner';
	import TagMultiSelect from '$lib/components/TagMultiSelect.svelte';
	import { decodeHtmlEntities, sanitizeDisplayText } from '$lib/utils';

	type FeedTab = 'new' | 'top' | 'discussed';
	type FeedWindow = 'all' | '24h' | '7d' | '30d';
	type FeedScope = 'you' | 'public' | 'community';
	type SourceFilter = 'all' | 'posts' | 'source_updates' | 'website' | 'rss' | 'youtube';
	type VisibilityFilter = 'all' | 'private' | 'public' | 'community';

	const auth = useAppAuth();
	const client = useConvexClient();

	const tab = $derived((page.url.searchParams.get('tab') as FeedTab | null) ?? 'new');
	const windowBucket = $derived(
		(page.url.searchParams.get('window') as FeedWindow | null) ?? '24h'
	);
	const scope = $derived(
		(page.url.searchParams.get('scope') as FeedScope | null) ??
			(auth.isAuthenticated ? 'you' : 'public')
	);
	const search = $derived(page.url.searchParams.get('search') ?? '');
	const sourceFilter = $derived(
		(page.url.searchParams.get('source') as SourceFilter | null) ?? 'all'
	);
	const selectedSourceId = $derived(page.url.searchParams.get('sourceId'));
	const visibilityFilter = $derived(
		(page.url.searchParams.get('visibility') as VisibilityFilter | null) ??
			(scope === 'you' ? 'private' : 'all')
	);
	const selectedTags = $derived(
		page.url.searchParams.get('tags')?.split(',').filter(Boolean) ?? []
	);
	const cursor = $derived(page.url.searchParams.get('cursor'));
	const SCOPE_ORDER: FeedScope[] = ['you', 'public', 'community'];
	const GUEST_SCOPE_ORDER: FeedScope[] = ['public', 'community'];
	const scopeOptions = $derived(auth.isAuthenticated ? SCOPE_ORDER : GUEST_SCOPE_ORDER);
	const scopeMeta: Record<FeedScope, { label: string; title: string; description: string }> = {
		you: {
			label: 'You',
			title: 'My Feed',
			description: 'Your trusted sources, collections, and communities'
		},
		public: {
			label: 'Public',
			title: 'Public Feed',
			description: 'Public posts from across Cognirivus'
		},
		community: {
			label: 'Community',
			title: 'Community Feed',
			description: 'Posts shared into communities'
		}
	};
	const sourceFilterMeta: Record<SourceFilter, { label: string }> = {
		all: { label: 'All' },
		posts: { label: 'Posts' },
		source_updates: { label: 'Source updates' },
		website: { label: 'Website' },
		rss: { label: 'RSS' },
		youtube: { label: 'YouTube' }
	};
	const visibilityFilterMeta: Record<VisibilityFilter, { label: string }> = {
		all: { label: 'All' },
		private: { label: 'Private' },
		public: { label: 'Public' },
		community: { label: 'Community' }
	};
	const PRIVATE_SOURCE_OPTIONS: SourceFilter[] = [
		'all',
		'posts',
		'source_updates',
		'website',
		'rss',
		'youtube'
	];
	const SHARED_SOURCE_OPTIONS: SourceFilter[] = ['all', 'posts', 'website', 'rss', 'youtube'];
	const VISIBILITY_OPTIONS: VisibilityFilter[] = ['private', 'all', 'public', 'community'];
	const sourceFilterOptions = $derived(
		scope === 'you' ? PRIVATE_SOURCE_OPTIONS : SHARED_SOURCE_OPTIONS
	);
	const showVisibilityFilter = $derived(scope === 'you');

	let searchInput = $state('');
	let layoutMode = $state<'bento' | 'list'>(
		(typeof localStorage !== 'undefined' && (localStorage.getItem('feedLayoutMode') as 'bento' | 'list')) || 'bento'
	);

	// Sync input with URL search param
	$effect(() => {
		searchInput = search;
	});

	// Persist layout mode to localStorage
	$effect(() => {
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('feedLayoutMode', layoutMode);
		}
	});

	const feedQuery = useQuery((api as any).feed.listGlobal, () => {
		const s = search;
		const ts = selectedTags;
		const sf = sourceFilter;
		const vf = visibilityFilter;
		const base = {
			paginationOpts: {
				numItems: 20,
				cursor
			}
		};
		return {
			...base,
			tab,
			scope,
			window: windowBucket,
			search: s || undefined,
			tags: ts.length > 0 ? ts : undefined,
			source: sf === 'all' ? undefined : sf,
			sourceId: selectedSourceId || undefined,
			visibility: scope === 'you' && vf !== 'private' ? vf : undefined
		};
	});
	const communitiesQuery = useQuery((api as any).communities.listPublic, { limit: 100 });
	let shareCommunityId = $state('');
	let communityShareDialogOpen = $state(false);
	let saveToCollectionDialogOpen = $state(false);
	let pendingCollectionSource = $state<{
		sourceId: string;
		sourceItemId?: string;
		sourceTitle: string;
	} | null>(null);
	let pendingCommunityShareState = $state<{
		sourceItemId: string;
		communityShares: Array<{ communityId: string; postId: string }>;
	} | null>(null);

	$effect(() => {
		if (!shareCommunityId && (communitiesQuery.data?.length ?? 0) > 0) {
			shareCommunityId = communitiesQuery.data![0]._id;
		}
	});

	$effect(() => {
		if (!saveToCollectionDialogOpen) {
			pendingCollectionSource = null;
		}
	});

	function updateParams(next: {
		scope?: FeedScope;
		tab?: FeedTab;
		window?: FeedWindow;
		search?: string | null;
		source?: SourceFilter | null;
		sourceId?: string | null;
		visibility?: VisibilityFilter | null;
		tags?: string[] | null;
		cursor?: string | null;
	}) {
		const params = Object.fromEntries(page.url.searchParams.entries()) as Record<string, string>;
		if (next.scope) {
			params.scope = next.scope;
			delete params.cursor;
		}
		if (next.tab) {
			params.tab = next.tab;
			delete params.cursor;
		}
		if (next.window) {
			params.window = next.window;
			delete params.cursor;
		}
		if (next.search !== undefined) {
			if (next.search === null || next.search === '') delete params.search;
			else params.search = next.search;
			delete params.cursor;
		}
		if (next.source !== undefined) {
			if (next.source === null || next.source === 'all') delete params.source;
			else params.source = next.source;
			delete params.cursor;
		}
		if (next.sourceId !== undefined) {
			if (next.sourceId === null || next.sourceId === '') delete params.sourceId;
			else params.sourceId = next.sourceId;
			delete params.cursor;
		}
		if (next.visibility !== undefined) {
			const activeScope = (next.scope ??
				(params.scope as FeedScope | undefined) ??
				scope) as FeedScope;
			const defaultVisibility = activeScope === 'you' ? 'private' : 'all';
			if (next.visibility === null || next.visibility === defaultVisibility) {
				delete params.visibility;
			} else {
				params.visibility = next.visibility;
			}
			delete params.cursor;
		}
		if (next.tags !== undefined) {
			if (next.tags === null || next.tags.length === 0) delete params.tags;
			else params.tags = next.tags.join(',');
			delete params.cursor;
		}
		if (next.cursor) params.cursor = next.cursor;
		else if (next.cursor === null) delete params.cursor;

		const activeScope = (params.scope as FeedScope | undefined) ?? scope;
		const activeSource = (params.source as SourceFilter | undefined) ?? 'all';
		if (next.scope !== undefined) {
			delete params.sourceId;
		}
		if (activeScope !== 'you') {
			delete params.visibility;
			if (activeSource === 'source_updates') {
				delete params.source;
			}
		}
		const queryString = new URLSearchParams(params).toString();
		const target = queryString.length > 0 ? `/feed?${queryString}` : '/feed';
		goto(target, { noScroll: true, keepFocus: true });
	}

	const availableSpecificSources = $derived.by(() => {
		const sourceMap: Record<string, { id: string; label: string }> = {};
		for (const item of feedQuery.data?.page ?? []) {
			if (item.kind === 'source_item') {
				if (!sourceMap[item.sourceId]) {
					sourceMap[item.sourceId] = {
						id: item.sourceId,
						label: decodeHtmlEntities(item.sourceTitle)
					};
				}
				continue;
			}
			if (item.sourceId && item.sourceTitleSnapshot && !sourceMap[item.sourceId]) {
				sourceMap[item.sourceId] = {
					id: item.sourceId,
					label: sanitizeDisplayText(item.sourceTitleSnapshot)
				};
			}
		}
		return Object.values(sourceMap).sort((a, b) => a.label.localeCompare(b.label));
	});

	const currentSpecificSourceLabel = $derived(
		availableSpecificSources.find((source) => source.id === selectedSourceId)?.label ??
			(selectedSourceId ? 'Selected source' : 'All sources')
	);

	const showSpecificSourceFilter = $derived(
		availableSpecificSources.length > 0 || selectedSourceId !== null
	);

	function selectScope(nextScope: FeedScope) {
		if (nextScope === scope) {
			return;
		}
		updateParams({ scope: nextScope, cursor: null });
	}

	async function vote(postId: string, value: 1 | -1) {
		if (!auth.isAuthenticated) {
			return;
		}
		try {
			await client.mutation((api as any).posts.vote, { postId, value });
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to vote');
		}
	}

	async function shareSourceItem(
		sourceItemId: string,
		visibility: 'public',
		communityId?: string
	): Promise<boolean> {
		if (!auth.isAuthenticated) {
			toast.error('Sign in required');
			return false;
		}
		try {
			const postId = await client.action((api as any).posts.shareSourceItemAsPost, {
				sourceItemId,
				visibility,
				communityId: visibility === 'public' ? communityId : undefined
			});
			toast.success('Shared as post');
			goto(`/post/${postId}`);
			return true;
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to share source item');
			return false;
		}
	}

	async function unshareSourcePost(postId: string): Promise<boolean> {
		if (!auth.isAuthenticated) {
			toast.error('Sign in required');
			return false;
		}
		try {
			await client.mutation((api as any).posts.deletePost, { postId });
			toast.success('Share removed');
			return true;
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to remove share');
			return false;
		}
	}

	async function togglePublicSourceItem(sourceItemId: string, publicPostId?: string) {
		if (publicPostId) {
			await unshareSourcePost(publicPostId);
			return;
		}
		await shareSourceItem(sourceItemId, 'public');
	}

	function openCommunityShareDialog(
		sourceItemId: string,
		communityShares: Array<{ communityId: string; postId: string }>
	) {
		if (!auth.isAuthenticated) {
			toast.error('Sign in required');
			return;
		}
		pendingCommunityShareState = { sourceItemId, communityShares };
		communityShareDialogOpen = true;
	}

	function openSaveToCollectionDialog(
		sourceId: string,
		sourceTitle: string,
		sourceItemId?: string
	) {
		if (!auth.isAuthenticated) {
			toast.error('Sign in required');
			return;
		}
		pendingCollectionSource = { sourceId, sourceItemId, sourceTitle };
		saveToCollectionDialogOpen = true;
	}

	function getPendingCommunitySharePostId() {
		if (!pendingCommunityShareState || !shareCommunityId) {
			return null;
		}
		const existingShare = pendingCommunityShareState.communityShares.find(
			(share) => share.communityId === shareCommunityId
		);
		return existingShare?.postId ?? null;
	}

	async function sharePendingSourceToCommunity() {
		if (!pendingCommunityShareState || !shareCommunityId) {
			return;
		}
		const existingSharePostId = getPendingCommunitySharePostId();
		if (existingSharePostId) {
			const unshared = await unshareSourcePost(existingSharePostId);
			if (unshared) {
				communityShareDialogOpen = false;
				pendingCommunityShareState = null;
			}
			return;
		}
		const shared = await shareSourceItem(
			pendingCommunityShareState.sourceItemId,
			'public',
			shareCommunityId
		);
		if (shared) {
			communityShareDialogOpen = false;
			pendingCommunityShareState = null;
		}
	}
</script>

<main class="mx-auto w-full max-w-6xl overflow-x-hidden px-4 py-4 sm:px-6 sm:py-5">
	<div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
		<div class="min-w-0 space-y-1">
			<h1 class="text-xl font-semibold tracking-tight sm:text-2xl">{scopeMeta[scope].title}</h1>
		</div>
		<div
			class="inline-flex items-center gap-1 self-start overflow-hidden rounded-lg border border-border bg-muted/30 p-1"
		>
			{#each scopeOptions as s (s)}
				<Button
					variant={scope === s ? 'secondary' : 'ghost'}
					size="sm"
					class="h-7 rounded-md px-2.5 text-xs sm:h-8 sm:px-3"
					onclick={() => selectScope(s)}
				>
					{scopeMeta[s].label}
				</Button>
			{/each}
		</div>
	</div>

	{#if !auth.isAuthenticated && scope === 'you'}
		<Card class="mb-4 gap-0 py-3">
			<CardContent class="text-xs text-muted-foreground">
				Sign in to view your private feed.
				<a
					class="ml-2 font-medium underline"
					href={`/signin?redirectTo=${encodeURIComponent(page.url.pathname + page.url.search)}`}
				>
					Sign in
				</a>
			</CardContent>
		</Card>
	{:else if !auth.isAuthenticated}
		<Card class="mb-4 gap-0 py-3">
			<CardContent class="text-xs text-muted-foreground">
				Sign in to vote and comment.
				<a
					class="ml-2 font-medium underline"
					href={`/signin?redirectTo=${encodeURIComponent(page.url.pathname + page.url.search)}`}
				>
					Sign in
				</a>
			</CardContent>
		</Card>
	{/if}

	<div class="mb-4 flex items-center justify-between gap-4">
		<div class="flex items-center gap-1.5 overflow-x-auto sm:gap-2">
			{#each ['new', 'top', 'discussed'] as t (t)}
				<Button
					variant={tab === t ? 'default' : 'outline'}
					size="sm"
					class="h-8 shrink-0"
					onclick={() => updateParams({ tab: t as FeedTab, cursor: null })}
				>
					{t}
				</Button>
			{/each}
			<div class="mx-0.5 h-4 w-px shrink-0 bg-border sm:mx-1"></div>
			{#each ['all', '24h', '7d', '30d'] as w (w)}
				<Button
					variant={windowBucket === w ? 'secondary' : 'ghost'}
					size="sm"
					class="h-8 shrink-0"
					onclick={() => updateParams({ window: w as FeedWindow, cursor: null })}
				>
					{w === 'all' ? 'All' : w}
				</Button>
			{/each}
		</div>
		<div class="flex shrink-0 items-center gap-1">
			<Button
				variant={layoutMode === 'bento' ? 'secondary' : 'ghost'}
				size="sm"
				class="h-8 shrink-0"
				onclick={() => (layoutMode = 'bento')}
				aria-label="Bento layout"
			>
				<LayoutGrid class="size-4" />
			</Button>
			<Button
				variant={layoutMode === 'list' ? 'secondary' : 'ghost'}
				size="sm"
				class="h-8 shrink-0"
				onclick={() => (layoutMode = 'list')}
				aria-label="List layout"
			>
				<List class="size-4" />
			</Button>
		</div>
	</div>

	<div class="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center">
		<div class="relative flex-1">
			<Search class="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
			<Input
				placeholder="Search feed..."
				class="pr-9 pl-9"
				bind:value={searchInput}
				onkeydown={(e) => {
					if (e.key === 'Enter') {
						const nextSearch = searchInput.trim();
						updateParams({
							search: nextSearch,
							window: nextSearch.length > 0 ? 'all' : undefined,
							cursor: null
						});
					}
				}}
			/>
			{#if searchInput}
				<button
					class="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
					onclick={() => {
						searchInput = '';
						updateParams({ search: '', cursor: null });
					}}
				>
					<X class="size-4" />
				</button>
			{/if}
		</div>

		<div class="flex flex-wrap items-center gap-2 sm:justify-end">
			{#if showSpecificSourceFilter}
				<DropdownMenu>
					<DropdownMenuTrigger>
						<Button variant="outline" size="sm" class="h-9 gap-2">
							<Globe class="size-4 text-muted-foreground" />
							<span class="text-xs">Source: {currentSpecificSourceLabel}</span>
							<ChevronDown class="size-4 text-muted-foreground" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" class="w-56">
						<DropdownMenuLabel>Source</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuRadioGroup value={selectedSourceId ?? ''}>
							<DropdownMenuRadioItem
								value=""
								onclick={() => updateParams({ sourceId: null, cursor: null })}
							>
								All sources
							</DropdownMenuRadioItem>
							{#each availableSpecificSources as sourceOption (sourceOption.id)}
								<DropdownMenuRadioItem
									value={sourceOption.id}
									onclick={() => updateParams({ sourceId: sourceOption.id, cursor: null })}
								>
									{sourceOption.label}
								</DropdownMenuRadioItem>
							{/each}
						</DropdownMenuRadioGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			{/if}

			<DropdownMenu>
				<DropdownMenuTrigger>
					<Button variant="outline" size="sm" class="h-9 gap-2">
						<Archive class="size-4 text-muted-foreground" />
						<span class="text-xs">Source Type: {sourceFilterMeta[sourceFilter].label}</span>
						<ChevronDown class="size-4 text-muted-foreground" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" class="w-52">
					<DropdownMenuLabel>Source Type</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuRadioGroup value={sourceFilter}>
						{#each sourceFilterOptions as option (option)}
							<DropdownMenuRadioItem
								value={option}
								onclick={() => updateParams({ source: option, cursor: null })}
							>
								{sourceFilterMeta[option].label}
							</DropdownMenuRadioItem>
						{/each}
					</DropdownMenuRadioGroup>
				</DropdownMenuContent>
			</DropdownMenu>

			{#if showVisibilityFilter}
				<DropdownMenu>
					<DropdownMenuTrigger>
						<Button variant="outline" size="sm" class="h-9 gap-2">
							<Lock class="size-4 text-muted-foreground" />
							<span class="text-xs">Visibility: {visibilityFilterMeta[visibilityFilter].label}</span
							>
							<ChevronDown class="size-4 text-muted-foreground" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" class="w-52">
						<DropdownMenuLabel>Visibility</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuRadioGroup value={visibilityFilter}>
							{#each VISIBILITY_OPTIONS as option (option)}
								<DropdownMenuRadioItem
									value={option}
									onclick={() => updateParams({ visibility: option, cursor: null })}
								>
									{visibilityFilterMeta[option].label}
								</DropdownMenuRadioItem>
							{/each}
						</DropdownMenuRadioGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			{/if}

			<TagMultiSelect
				availableTags={Array.from(
					new Set((feedQuery.data?.page ?? []).flatMap((p: any) => p.tags ?? []))
				)}
				{selectedTags}
				onSelect={(tags: string[]) => updateParams({ tags: tags, cursor: null })}
			/>
		</div>
	</div>

	{#if feedQuery.isLoading}
		<p class="text-sm text-muted-foreground">Loading feed...</p>
	{:else if feedQuery.error}
		<p class="text-sm text-destructive">Failed to load feed.</p>
	{:else if (feedQuery.data?.page?.length ?? 0) === 0}
		<p class="text-sm text-muted-foreground">No feed items yet.</p>
	{:else if layoutMode === 'list'}
		<div class="space-y-3">
			{#each feedQuery.data?.page ?? [] as item (item._id)}
				<Card class="gap-0 py-4">
					<CardContent>
						{#if item.kind === 'post'}
							<div class="flex items-start gap-2">
								<a href="/post/{item._id}" class="text-lg font-semibold hover:underline">
									{sanitizeDisplayText(item.title)}
								</a>
								{#if item.visibility === 'private'}
									<Lock class="mt-1 size-4 shrink-0 text-muted-foreground" />
								{/if}
								{#if item.type === 'link' && item.url}
									<a
										href={item.url}
										target="_blank"
										rel="noopener noreferrer"
										class="mt-1 shrink-0 text-muted-foreground hover:text-foreground"
									>
										<ExternalLink class="size-4" />
									</a>
								{/if}
							</div>
							<p class="mt-2 line-clamp-2 text-sm text-muted-foreground">
								{sanitizeDisplayText(item.snippet)}
							</p>
							<div class="mt-3 flex flex-wrap items-center gap-1.5">
								{#if item.authorUsername}
									<Badge href="/u/{item.authorUsername}" variant="outline" class="gap-1">
										<User class="size-3" />
										<span class="text-xs">u/{item.authorUsername}</span>
									</Badge>
								{:else}
									<Badge variant="outline" class="gap-1">
										<User class="size-3" />
										<span class="text-xs">{item.authorName}</span>
									</Badge>
								{/if}
								{#if item.communitySlug}
									<Badge href="/c/{item.communitySlug}" variant="outline" class="gap-1">
										<Users class="size-3" />
										<span class="text-xs">c/{item.communitySlug}</span>
									</Badge>
								{:else if item.visibility === 'private'}
									<Badge variant="outline" class="gap-1 border-muted-foreground/30 bg-muted/20">
										<Lock class="size-3" />
										<span class="text-xs text-muted-foreground">Private</span>
									</Badge>
								{:else}
									<Badge variant="outline" class="gap-1">
										<Globe class="size-3" />
										<span class="text-xs">Public</span>
									</Badge>
								{/if}
								{#if (item.tags?.length ?? 0) > 0}
									{#each item.tags as tag (tag)}
										<Badge variant="secondary" class="gap-1 bg-secondary/50">
											<Tag class="size-3" />
											<span class="text-xs">{tag}</span>
										</Badge>
									{/each}
								{/if}
							</div>
							<div class="mt-3 flex items-center justify-between gap-3">
								<div class="flex items-center gap-3 text-xs text-muted-foreground">
									<span class="inline-flex items-center gap-1">
										<MessageSquare class="size-3.5" />
										{item.commentCount}
									</span>
									<span class="inline-flex items-center gap-1">
										<ThumbsUp class="size-3.5" />
										{item.likes}
									</span>
									<span class="inline-flex items-center gap-1">
										<ThumbsDown class="size-3.5" />
										{item.dislikes}
									</span>
								</div>
								<div class="flex items-center gap-2">
									<Button
										size="icon-sm"
										variant={item.userVote === 1 ? 'secondary' : 'ghost'}
										class={`h-7 w-7 ${item.userVote === 1 ? 'text-primary' : ''}`}
										disabled={!auth.isAuthenticated}
										onclick={() => vote(item._id, 1)}
										aria-label="Like"
									>
										<ThumbsUp class="size-3.5" />
									</Button>
									<Button
										size="icon-sm"
										variant={item.userVote === -1 ? 'secondary' : 'ghost'}
										class={`h-7 w-7 ${item.userVote === -1 ? 'text-destructive' : ''}`}
										disabled={!auth.isAuthenticated}
										onclick={() => vote(item._id, -1)}
										aria-label="Dislike"
									>
										<ThumbsDown class="size-3.5" />
									</Button>
									<a
										href="/post/{item._id}"
										class="ml-2 text-sm font-medium text-primary hover:underline"
									>
										Read more →
									</a>
								</div>
							</div>
						{:else}
							<div class="flex items-start gap-2">
								<a href="/source/{item._id}" class="text-lg font-semibold hover:underline">
									{decodeHtmlEntities(item.title)}
								</a>
								<a
									href={item.url}
									target="_blank"
									rel="noopener noreferrer"
									class="mt-1 shrink-0 text-muted-foreground hover:text-foreground"
								>
									<ExternalLink class="size-4" />
								</a>
							</div>
							<p class="mt-2 line-clamp-2 text-sm text-muted-foreground">
								{decodeHtmlEntities(item.snippet)}
							</p>
							<div class="mt-3 flex flex-wrap items-center gap-1.5">
								<Badge variant="outline" class="gap-1">
									<Archive class="size-3" />
									<span class="text-xs">{item.sourceType}</span>
								</Badge>
								<Badge variant="outline" class="gap-1">
									<Globe class="size-3" />
									<span class="text-xs">{decodeHtmlEntities(item.sourceTitle)}</span>
								</Badge>
								{#if item.shareCount > 0}
									<Badge variant="secondary" class="gap-1">
										<MessageSquare class="size-3" />
										<span class="text-xs">Shared {item.shareCount}</span>
									</Badge>
								{/if}
								{#if item.provenance.kind === 'direct_follow'}
									<Badge variant="secondary" class="gap-1 bg-primary/10 text-primary">
										<BookMarked class="size-3" />
										<span class="text-xs">{item.provenance.label}</span>
									</Badge>
								{:else if item.provenance.collectionSlug}
									<Badge
										href={`/collections/${item.provenance.collectionSlug}`}
										variant="secondary"
										class="gap-1 bg-primary/10 text-primary"
									>
										<BookMarked class="size-3" />
										<span class="text-xs">{item.provenance.label}</span>
									</Badge>
								{:else if item.provenance.communitySlug}
									<Badge
										href={`/c/${item.provenance.communitySlug}/collections`}
										variant="secondary"
										class="gap-1 bg-primary/10 text-primary"
									>
										<Users class="size-3" />
										<span class="text-xs">{item.provenance.label}</span>
									</Badge>
								{:else if item.provenance.username}
									<Badge
										href={`/u/${item.provenance.username}`}
										variant="secondary"
										class="gap-1 bg-primary/10 text-primary"
									>
										<User class="size-3" />
										<span class="text-xs">{item.provenance.label}</span>
									</Badge>
								{:else}
									<Badge variant="secondary" class="gap-1 bg-primary/10 text-primary">
										<BookMarked class="size-3" />
										<span class="text-xs">{item.provenance.label}</span>
									</Badge>
								{/if}
							</div>
							{#if scope === 'you'}
								<div class="mt-3 flex flex-wrap items-center gap-2">
									<Button
										size="sm"
										variant="ghost"
										class="h-8 px-2 text-xs"
										disabled={!auth.isAuthenticated}
										onclick={() => openSaveToCollectionDialog(item.sourceId, item.title, item._id)}
									>
										<BookMarked class="mr-1 size-3.5" />
										Save
									</Button>
									<Button
										size="sm"
										variant="ghost"
										class="h-8 px-2 text-xs"
										disabled={!auth.isAuthenticated}
										onclick={() => togglePublicSourceItem(item._id, item.publicPostId)}
									>
										{item.publicPostId ? 'Unshare' : 'Share'}
									</Button>
									{#if (communitiesQuery.data?.length ?? 0) > 0}
										<Button
											size="sm"
											variant="ghost"
											class="h-8 px-2 text-xs"
											disabled={!auth.isAuthenticated}
											onclick={() => openCommunityShareDialog(item._id, item.communityShares ?? [])}
										>
											Community
										</Button>
									{/if}
								</div>
							{:else}
								<a
									href="/source/{item._id}"
									class="mt-3 inline-flex items-center text-sm font-medium text-primary hover:underline"
								>
									Read more →
								</a>
							{/if}
						{/if}
					</CardContent>
				</Card>
			{/each}
		</div>
	{:else}
		<div
			class="grid auto-rows-auto gap-4 sm:grid-cols-2 lg:grid-cols-3"
			style="grid-auto-flow: dense;"
		>
			{#each feedQuery.data?.page ?? [] as item, index (item._id)}
				{@const isLarge = item.kind === 'post' 
					? (item.score > 30 || item.commentCount > 15)
					: (item.shareCount > 10)}
				{@const isMedium = !isLarge && (item.kind === 'post'
					? (item.score > 10 || item.commentCount > 5)
					: (item.shareCount > 5))}
				<article
					class={`group relative overflow-hidden bg-background transition-colors hover:bg-muted/20 ${
						isLarge ? 'sm:col-span-2 sm:row-span-2' : isMedium ? 'sm:row-span-2' : ''
					}`}
				>
					{#if item.kind === 'post'}
						<div class="flex h-full flex-col p-5">
							<div class="flex-1">
								<div class="flex items-start gap-2">
									<h1
										class={`font-bold leading-tight tracking-tight ${
											isLarge
												? 'text-2xl sm:text-3xl lg:text-4xl'
												: isMedium
													? 'text-xl sm:text-2xl'
													: 'text-lg sm:text-xl'
										}`}
									>
										<a href="/post/{item._id}" class="hover:underline">
											{sanitizeDisplayText(item.title)}
										</a>
									</h1>
									{#if item.visibility === 'private'}
										<Lock class="mt-1 size-4 shrink-0 text-muted-foreground" />
									{/if}
									{#if item.type === 'link' && item.url}
										<a
											href={item.url}
											target="_blank"
											rel="noopener noreferrer"
											class="mt-1 shrink-0 text-muted-foreground hover:text-foreground"
										>
											<ExternalLink class="size-4" />
										</a>
									{/if}
								</div>
								<p
									class={`mt-3 text-muted-foreground ${
										isLarge ? 'line-clamp-6 text-base' : isMedium ? 'line-clamp-4 text-sm' : 'line-clamp-3 text-sm'
									}`}
								>
									{sanitizeDisplayText(item.snippet)}
								</p>
							</div>
							<div class="mt-4 space-y-3">
								<div class="flex flex-wrap items-center gap-1.5">
									{#if item.authorUsername}
										<Badge href="/u/{item.authorUsername}" variant="outline" class="gap-1">
											<User class="size-3" />
											<span class="text-xs">u/{item.authorUsername}</span>
										</Badge>
									{:else}
										<Badge variant="outline" class="gap-1">
											<User class="size-3" />
											<span class="text-xs">{item.authorName}</span>
										</Badge>
									{/if}
									{#if item.communitySlug}
										<Badge href="/c/{item.communitySlug}" variant="outline" class="gap-1">
											<Users class="size-3" />
											<span class="text-xs">c/{item.communitySlug}</span>
										</Badge>
									{:else if item.visibility === 'private'}
										<Badge variant="outline" class="gap-1 border-muted-foreground/30 bg-muted/20">
											<Lock class="size-3" />
											<span class="text-xs text-muted-foreground">Private</span>
										</Badge>
									{:else}
										<Badge variant="outline" class="gap-1">
											<Globe class="size-3" />
											<span class="text-xs">Public</span>
										</Badge>
									{/if}
									{#if (item.tags?.length ?? 0) > 0}
										{#each item.tags as tag (tag)}
											<Badge variant="secondary" class="gap-1 bg-secondary/50">
												<Tag class="size-3" />
												<span class="text-xs">{tag}</span>
											</Badge>
										{/each}
									{/if}
								</div>
								<div class="flex items-center justify-between gap-3 text-xs text-muted-foreground">
									<div class="flex items-center gap-3">
										<span class="inline-flex items-center gap-1">
											<MessageSquare class="size-3.5" />
											{item.commentCount}
										</span>
										<span class="inline-flex items-center gap-1">
											<ThumbsUp class="size-3.5" />
											{item.likes}
										</span>
										<span class="inline-flex items-center gap-1">
											<ThumbsDown class="size-3.5" />
											{item.dislikes}
										</span>
									</div>
									<div class="flex items-center gap-1.5">
										<Button
											size="icon-sm"
											variant={item.userVote === 1 ? 'secondary' : 'ghost'}
											class={`h-7 w-7 ${item.userVote === 1 ? 'text-primary' : ''}`}
											disabled={!auth.isAuthenticated}
											onclick={() => vote(item._id, 1)}
											aria-label="Like"
										>
											<ThumbsUp class="size-3.5" />
										</Button>
										<Button
											size="icon-sm"
											variant={item.userVote === -1 ? 'secondary' : 'ghost'}
											class={`h-7 w-7 ${item.userVote === -1 ? 'text-destructive' : ''}`}
											disabled={!auth.isAuthenticated}
											onclick={() => vote(item._id, -1)}
											aria-label="Dislike"
										>
											<ThumbsDown class="size-3.5" />
										</Button>
									</div>
								</div>
								<a
									href="/post/{item._id}"
									class="inline-flex items-center text-sm font-medium text-primary hover:underline"
								>
									Read more →
								</a>
							</div>
						</div>
					{:else}
						<div class="flex h-full flex-col p-5">
							<div class="flex-1">
								<div class="flex items-start gap-2">
									<h1
										class={`font-bold leading-tight tracking-tight ${
											isLarge
												? 'text-2xl sm:text-3xl lg:text-4xl'
												: isMedium
													? 'text-xl sm:text-2xl'
													: 'text-lg sm:text-xl'
										}`}
									>
										<a href="/source/{item._id}" class="hover:underline">
											{decodeHtmlEntities(item.title)}
										</a>
									</h1>
									<a
										href={item.url}
										target="_blank"
										rel="noopener noreferrer"
										class="mt-1 shrink-0 text-muted-foreground hover:text-foreground"
									>
										<ExternalLink class="size-4" />
									</a>
								</div>
								<p
									class={`mt-3 text-muted-foreground ${
										isLarge ? 'line-clamp-6 text-base' : isMedium ? 'line-clamp-4 text-sm' : 'line-clamp-3 text-sm'
									}`}
								>
									{decodeHtmlEntities(item.snippet)}
								</p>
							</div>
							<div class="mt-4 space-y-3">
								<div class="flex flex-wrap items-center gap-1.5">
									<Badge variant="outline" class="gap-1">
										<Archive class="size-3" />
										<span class="text-xs">{item.sourceType}</span>
									</Badge>
									<Badge variant="outline" class="gap-1">
										<Globe class="size-3" />
										<span class="text-xs">{decodeHtmlEntities(item.sourceTitle)}</span>
									</Badge>
									{#if item.shareCount > 0}
										<Badge variant="secondary" class="gap-1">
											<MessageSquare class="size-3" />
											<span class="text-xs">Shared {item.shareCount}</span>
										</Badge>
									{/if}
									{#if item.provenance.kind === 'direct_follow'}
										<Badge variant="secondary" class="gap-1 bg-primary/10 text-primary">
											<BookMarked class="size-3" />
											<span class="text-xs">{item.provenance.label}</span>
										</Badge>
									{:else if item.provenance.collectionSlug}
										<Badge
											href={`/collections/${item.provenance.collectionSlug}`}
											variant="secondary"
											class="gap-1 bg-primary/10 text-primary"
										>
											<BookMarked class="size-3" />
											<span class="text-xs">{item.provenance.label}</span>
										</Badge>
									{:else if item.provenance.communitySlug}
										<Badge
											href={`/c/${item.provenance.communitySlug}/collections`}
											variant="secondary"
											class="gap-1 bg-primary/10 text-primary"
										>
											<Users class="size-3" />
											<span class="text-xs">{item.provenance.label}</span>
										</Badge>
									{:else if item.provenance.username}
										<Badge
											href={`/u/${item.provenance.username}`}
											variant="secondary"
											class="gap-1 bg-primary/10 text-primary"
										>
											<User class="size-3" />
											<span class="text-xs">{item.provenance.label}</span>
										</Badge>
									{:else}
										<Badge variant="secondary" class="gap-1 bg-primary/10 text-primary">
											<BookMarked class="size-3" />
											<span class="text-xs">{item.provenance.label}</span>
										</Badge>
									{/if}
								</div>
								{#if scope === 'you'}
									<div class="flex flex-wrap items-center gap-2">
										<Button
											size="sm"
											variant="ghost"
											class="h-8 px-2 text-xs"
											disabled={!auth.isAuthenticated}
											onclick={() => openSaveToCollectionDialog(item.sourceId, item.title, item._id)}
										>
											<BookMarked class="mr-1 size-3.5" />
											Save
										</Button>
										<Button
											size="sm"
											variant="ghost"
											class="h-8 px-2 text-xs"
											disabled={!auth.isAuthenticated}
											onclick={() => togglePublicSourceItem(item._id, item.publicPostId)}
										>
											{item.publicPostId ? 'Unshare' : 'Share'}
										</Button>
										{#if (communitiesQuery.data?.length ?? 0) > 0}
											<Button
												size="sm"
												variant="ghost"
												class="h-8 px-2 text-xs"
												disabled={!auth.isAuthenticated}
												onclick={() =>
													openCommunityShareDialog(item._id, item.communityShares ?? [])}
											>
												Community
											</Button>
										{/if}
									</div>
								{:else}
									<a
										href="/source/{item._id}"
										class="inline-flex items-center text-sm font-medium text-primary hover:underline"
									>
										Read more →
									</a>
								{/if}
							</div>
						</div>
					{/if}
				</article>
			{/each}
		</div>

		{#if cursor || !(feedQuery.data?.isDone ?? true)}
			<div class="mt-5 flex items-center justify-between">
				<Button
					variant="outline"
					size="sm"
					disabled={!cursor}
					onclick={() => updateParams({ cursor: null })}
				>
					First Page
				</Button>
				<Button
					variant="outline"
					size="sm"
					disabled={feedQuery.data?.isDone ?? true}
					onclick={() => updateParams({ cursor: feedQuery.data?.continueCursor ?? null })}
				>
					Next Page
				</Button>
			</div>
		{/if}
	{/if}
</main>

<Dialog.Root
	open={communityShareDialogOpen}
	onOpenChange={(open) => {
		communityShareDialogOpen = open;
		if (!open) {
			pendingCommunityShareState = null;
		}
	}}
>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Share to Community</Dialog.Title>
			<Dialog.Description>Select a community to publish this source item in.</Dialog.Description>
		</Dialog.Header>
		{#if (communitiesQuery.data?.length ?? 0) === 0}
			<p class="text-sm text-muted-foreground">No communities available yet.</p>
		{:else}
			<div class="max-h-64 space-y-2 overflow-y-auto">
				{#each communitiesQuery.data ?? [] as c (c._id)}
					{@const existingShare = pendingCommunityShareState?.communityShares.find(
						(share) => share.communityId === c._id
					)}
					<button
						type="button"
						class={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
							shareCommunityId === c._id
								? 'border-primary bg-primary/10 text-foreground'
								: 'border-border hover:bg-muted/50'
						}`}
						onclick={() => (shareCommunityId = c._id)}
					>
						<div class="font-medium">{c.name}</div>
						<div class="text-xs text-muted-foreground">
							c/{c.slug}
							{#if existingShare}
								<span class="ml-1 font-medium text-foreground">- Shared</span>
							{/if}
						</div>
					</button>
				{/each}
			</div>
		{/if}
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (communityShareDialogOpen = false)}>Cancel</Button>
			<Button
				disabled={!auth.isAuthenticated ||
					!pendingCommunityShareState ||
					!shareCommunityId ||
					(communitiesQuery.data?.length ?? 0) === 0}
				onclick={sharePendingSourceToCommunity}
			>
				{getPendingCommunitySharePostId() ? 'Unshare' : 'Share'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

{#if pendingCollectionSource}
	<SaveSourceToCollectionDialog
		bind:open={saveToCollectionDialogOpen}
		sourceId={pendingCollectionSource.sourceId}
		sourceItemId={pendingCollectionSource.sourceItemId}
		sourceTitle={pendingCollectionSource.sourceTitle}
	/>
{/if}
