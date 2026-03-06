<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import {
		Calendar,
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
		X
	} from '@lucide/svelte';
	import { api } from '$convex/_generated/api';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { toast } from 'svelte-sonner';
	import TagMultiSelect from '$lib/components/TagMultiSelect.svelte';
	import { decodeHtmlEntities, sanitizeDisplayText } from '$lib/utils';

	type FeedTab = 'new' | 'top' | 'discussed';
	type FeedWindow = 'all' | '24h' | '7d' | '30d';
	type FeedScope = 'you' | 'public' | 'community';

	const auth = useAuth();
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
			title: 'My Private Feed',
			description: 'Your link collection and private notes.'
		},
		public: {
			label: 'Public',
			title: 'Public Feed',
			description: 'Knowledge posts ranked by new, top, and discussed.'
		},
		community: {
			label: 'Community',
			title: 'Community Feed',
			description: 'Posts from communities you follow, tuned for discovery.'
		}
	};

	let searchInput = $state('');

	// Sync input with URL search param
	$effect(() => {
		searchInput = search;
	});

	const feedQuery = useQuery((api as any).feed.listGlobal, () => {
		const s = search;
		const ts = selectedTags;
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
			tags: ts.length > 0 ? ts : undefined
		};
	});
	const communitiesQuery = useQuery((api as any).communities.listPublic, { limit: 100 });
	let shareCommunityId = $state('');
	let communityShareDialogOpen = $state(false);
	let pendingCommunityShareState = $state<{
		sourceItemId: string;
		communityShares: Array<{ communityId: string; postId: string }>;
	} | null>(null);

	$effect(() => {
		if (!shareCommunityId && (communitiesQuery.data?.length ?? 0) > 0) {
			shareCommunityId = communitiesQuery.data![0]._id;
		}
	});

	function updateParams(next: {
		scope?: FeedScope;
		tab?: FeedTab;
		window?: FeedWindow;
		search?: string | null;
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
		if (next.tags !== undefined) {
			if (next.tags === null || next.tags.length === 0) delete params.tags;
			else params.tags = next.tags.join(',');
			delete params.cursor;
		}
		if (next.cursor) params.cursor = next.cursor;
		else if (next.cursor === null) delete params.cursor;

		const queryString = new URLSearchParams(params).toString();
		const target = queryString.length > 0 ? `/feed?${queryString}` : '/feed';
		goto(target, { noScroll: true, keepFocus: true });
	}

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

	async function toggleSavedSourceItem(
		sourceItemId: string,
		isSaved: boolean,
		savedBookmarkItemId?: string,
		legacySavedPostId?: string
	) {
		if (savedBookmarkItemId) {
			try {
				await client.mutation((api as any).sources.unsaveBookmarkItem, {
					bookmarkItemId: savedBookmarkItemId
				});
				toast.success('Unsaved');
			} catch (error: any) {
				toast.error(error?.message ?? 'Failed to unsave link');
			}
			return;
		}
		if (legacySavedPostId) {
			await unshareSourcePost(legacySavedPostId);
			return;
		}
		if (!isSaved) {
			try {
				await client.mutation((api as any).sources.saveSourceItemToBookmarks, { sourceItemId });
				toast.success('Saved');
			} catch (error: any) {
				toast.error(error?.message ?? 'Failed to save link');
			}
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

<main class="mx-auto w-full max-w-6xl overflow-x-hidden px-4 py-6 sm:px-6">
	<div class="mb-5 flex flex-col items-center gap-3 text-center">
		<div
			class="inline-flex items-center gap-1 overflow-hidden rounded-lg border border-border bg-muted/30 p-1"
		>
			{#each scopeOptions as s (s)}
				<Button
					variant={scope === s ? 'secondary' : 'ghost'}
					size="sm"
					class="h-8 rounded-md px-3 text-xs"
					onclick={() => selectScope(s)}
				>
					{scopeMeta[s].label}
				</Button>
			{/each}
		</div>
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">{scopeMeta[scope].title}</h1>
			<p class="text-sm text-muted-foreground">{scopeMeta[scope].description}</p>
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

	<div class="mb-4 flex items-center gap-1.5 overflow-x-auto sm:gap-2">
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

		<TagMultiSelect
			availableTags={Array.from(
				new Set((feedQuery.data?.page ?? []).flatMap((p: any) => p.tags ?? []))
			)}
			{selectedTags}
			onSelect={(tags: string[]) => updateParams({ tags: tags, cursor: null })}
		/>
	</div>

	{#if feedQuery.isLoading}
		<p class="text-sm text-muted-foreground">Loading feed...</p>
	{:else if feedQuery.error}
		<p class="text-sm text-destructive">Failed to load feed.</p>
	{:else if (feedQuery.data?.page?.length ?? 0) === 0}
		<p class="text-sm text-muted-foreground">No feed items yet.</p>
	{:else}
		<div class="space-y-3">
			{#each feedQuery.data?.page ?? [] as item (item._id)}
				<Card class="gap-0 py-4">
					<CardContent>
						{#if item.kind === 'post'}
							<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
								<div class="min-w-0 flex-1">
									<div class="flex items-start justify-between gap-3">
										<div class="flex items-center gap-2">
											<a
												href="/post/{item._id}"
												class="line-clamp-2 text-base font-medium hover:underline"
											>
												{sanitizeDisplayText(item.title)}
											</a>
											{#if item.visibility === 'private'}
												<Lock class="size-3.5 text-muted-foreground" />
											{/if}
											{#if item.type === 'link' && item.url}
												<a
													href={item.url}
													target="_blank"
													rel="noopener noreferrer"
													class="text-muted-foreground hover:text-foreground"
												>
													<ExternalLink class="size-3.5" />
												</a>
											{/if}
										</div>
										<span
											class="hidden shrink-0 items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground sm:inline-flex"
										>
											<Calendar class="size-3.5" />
											{new Date(item.createdAt).toLocaleString()}
										</span>
									</div>
									<p class="mt-1 line-clamp-2 text-sm text-muted-foreground">
										{sanitizeDisplayText(item.snippet)}
									</p>
									<span
										class="mt-2 inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground sm:hidden"
									>
										<Calendar class="size-3.5" />
										{new Date(item.createdAt).toLocaleString()}
									</span>
									<div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
										{#if item.authorUsername}
											<Badge href="/u/{item.authorUsername}" variant="outline" class="gap-1">
												<User class="size-3.5" />
												<span class="font-semibold">u/{item.authorUsername}</span>
											</Badge>
										{:else}
											<Badge variant="outline" class="gap-1">
												<User class="size-3.5" />
												<span class="font-semibold">{item.authorName}</span>
											</Badge>
										{/if}
										{#if item.communitySlug}
											<Badge href="/c/{item.communitySlug}" variant="outline" class="gap-1">
												<Users class="size-3.5" />
												<span class="font-semibold">c/{item.communitySlug}</span>
											</Badge>
										{:else if item.visibility === 'private'}
											<Badge variant="outline" class="gap-1 border-muted-foreground/30 bg-muted/20">
												<Lock class="size-3.5" />
												<span class="font-semibold text-muted-foreground">Private</span>
											</Badge>
										{:else}
											<Badge variant="outline" class="gap-1">
												<Globe class="size-3.5" />
												<span class="font-semibold">Public</span>
											</Badge>
										{/if}
										{#if (item.tags?.length ?? 0) > 0}
											{#each item.tags as tag (tag)}
												<Badge variant="secondary" class="gap-1 bg-secondary/50">
													<Tag class="size-3" />
													{tag}
												</Badge>
											{/each}
										{/if}
										{#if item.sourceType}
											<Badge variant="outline" class="gap-1 border-dashed bg-muted/30">
												<Archive class="size-3" />
												{item.sourceType}
											</Badge>
										{/if}
									</div>
								</div>
							</div>
							<div class="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
								<div class="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
									<span class="inline-flex items-center gap-1">
										<MessageSquare class="size-3.5" />
										{item.commentCount} comments
									</span>
									<span class="inline-flex items-center gap-1">
										<ThumbsUp class="size-3.5" />
										{item.likes}
									</span>
									<span class="inline-flex items-center gap-1">
										<ThumbsDown class="size-3.5" />
										{item.dislikes}
									</span>
									<span>score {item.score}</span>
								</div>
								<div class="flex shrink-0 items-center gap-2 self-end sm:self-auto">
									<Button
										size="icon-sm"
										variant={item.userVote === 1 ? 'secondary' : 'outline'}
										class={item.userVote === 1
											? 'border-primary/40 text-primary [&_svg_path]:fill-current!'
											: ''}
										disabled={!auth.isAuthenticated}
										onclick={() => vote(item._id, 1)}
										aria-label="Like post"
									>
										<ThumbsUp class="size-4" />
									</Button>
									<Button
										size="icon-sm"
										variant={item.userVote === -1 ? 'secondary' : 'outline'}
										class={item.userVote === -1
											? 'border-destructive/40 text-destructive [&_svg_path]:fill-current!'
											: ''}
										disabled={!auth.isAuthenticated}
										onclick={() => vote(item._id, -1)}
										aria-label="Dislike post"
									>
										<ThumbsDown class="size-4" />
									</Button>
								</div>
							</div>
						{:else}
							<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2">
										<a
											href="/source/{item._id}"
											class="line-clamp-2 text-base font-medium hover:underline"
										>
											{decodeHtmlEntities(item.title)}
										</a>
										<a
											href={item.url}
											target="_blank"
											rel="noopener noreferrer"
											class="text-muted-foreground hover:text-foreground"
										>
											<ExternalLink class="size-3.5" />
										</a>
									</div>
									<p class="mt-1 line-clamp-2 text-sm text-muted-foreground">
										{decodeHtmlEntities(item.snippet)}
									</p>
									<div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
										<Badge variant="outline" class="gap-1">
											<Archive class="size-3.5" />
											{item.sourceType}
										</Badge>
										<Badge variant="outline" class="gap-1">
											<Globe class="size-3.5" />
											{decodeHtmlEntities(item.sourceTitle)}
										</Badge>
										{#if item.shareCount > 0}
											<Badge variant="secondary" class="gap-1">
												<MessageSquare class="size-3.5" />
												Shared {item.shareCount}
											</Badge>
										{/if}
										<span
											class="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground"
										>
											<Calendar class="size-3.5" />
											{new Date(item.publishedAt).toLocaleString()}
										</span>
									</div>
								</div>
							</div>
							{#if scope === 'you'}
								<div class="mt-3 flex flex-wrap items-center gap-2">
									<Button
										size="sm"
										variant="outline"
										disabled={!auth.isAuthenticated}
										onclick={() =>
											toggleSavedSourceItem(
												item._id,
												item.isSaved,
												item.savedBookmarkItemId,
												item.legacySavedPostId
											)}
									>
										{item.isSaved ? 'Unsave' : 'Save'}
									</Button>
									<Button
										size="sm"
										variant="outline"
										disabled={!auth.isAuthenticated}
										onclick={() => togglePublicSourceItem(item._id, item.publicPostId)}
									>
										{item.publicPostId ? 'Unshare Public' : 'Share Public'}
									</Button>
									{#if (communitiesQuery.data?.length ?? 0) > 0}
										<Button
											size="sm"
											variant="outline"
											disabled={!auth.isAuthenticated}
											onclick={() => openCommunityShareDialog(item._id, item.communityShares ?? [])}
										>
											Share to Community
										</Button>
									{/if}
								</div>
							{/if}
						{/if}
					</CardContent>
				</Card>
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
