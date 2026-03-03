<script lang="ts">
	import { page } from '$app/state';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import {
		Calendar,
		MessageSquare,
		ThumbsDown,
		ThumbsUp,
		User,
		Users,
		Tag,
		Archive,
		Search,
		X,
		Clock,
		TrendingUp,
		Plus,
		Heart,
		Eye,
		Settings,
		Rss
	} from '@lucide/svelte';
	import { api } from '$convex/_generated/api';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Separator } from '$lib/components/ui/separator';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import TagMultiSelect from '$lib/components/TagMultiSelect.svelte';

	type FeedTab = 'new' | 'top' | 'discussed';

	const auth = useAuth();
	const client = useConvexClient();
	const slug = $derived(page.params.slug);
	const tab = $derived((page.url.searchParams.get('tab') as FeedTab | null) ?? 'new');
	const search = $derived(page.url.searchParams.get('search') ?? '');
	const selectedTags = $derived(
		page.url.searchParams.get('tags')?.split(',').filter(Boolean) ?? []
	);
	const cursor = $derived(page.url.searchParams.get('cursor'));

	let searchInput = $state('');

	$effect(() => {
		searchInput = search;
	});
	const signInHref = $derived(
		`/signin?redirectTo=${encodeURIComponent(page.url.pathname + page.url.search)}`
	);

	const communityQuery = useQuery((api as any).communities.getBySlug, () => ({ slug }));
	const followingQuery = useQuery((api as any).social_graph.listFollowing, {});
	const feedQuery = useQuery((api as any).feed.listCommunity, () => {
		const s = search;
		const ts = selectedTags;
		return {
			slug,
			tab,
			window: '24h',
			search: s || undefined,
			tags: ts.length > 0 ? ts : undefined,
			paginationOpts: { numItems: 20, cursor }
		};
	});
	let followOverride = $state<boolean | null>(null);
	let followOverrideCommunityId = $state<string | null>(null);
	const currentCommunityId = $derived(communityQuery.data?.community._id ?? null);
	const isFollowing = $derived.by(() => {
		if (!auth.isAuthenticated || !currentCommunityId) {
			return false;
		}
		if (followOverrideCommunityId === currentCommunityId && followOverride !== null) {
			return followOverride;
		}
		if (communityQuery.data?.membershipStatus === 'active') {
			return true;
		}
		return (followingQuery.data?.communityIds ?? []).includes(currentCommunityId);
	});

	function updateParams(next: {
		tab?: FeedTab;
		search?: string | null;
		tags?: string[] | null;
		cursor?: string | null;
	}) {
		const params = Object.fromEntries(page.url.searchParams.entries()) as Record<string, string>;
		if (next.tab) {
			params.tab = next.tab;
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
		const target = queryString.length > 0 ? `/c/${slug}?${queryString}` : `/c/${slug}`;
		goto(target, { noScroll: true, keepFocus: true });
	}

	async function requestJoin() {
		if (!auth.isAuthenticated) {
			return;
		}
		try {
			if (!communityQuery.data) return;
			const result = await client.mutation((api as any).communities.requestJoin, {
				communityId: communityQuery.data.community._id
			});
			toast.success(result.status === 'active' ? 'Joined community' : 'Join request submitted');
		} catch (error: any) {
			toast.error(error?.message ?? 'Join failed');
		}
	}

	async function followCommunity() {
		if (!auth.isAuthenticated) {
			return;
		}
		try {
			if (!communityQuery.data) return;
			const result = await client.mutation((api as any).social_graph.followCommunity, {
				communityId: communityQuery.data.community._id
			});
			followOverrideCommunityId = communityQuery.data.community._id;
			followOverride = result.following;
			toast.success(result.following ? 'Following community' : 'Unfollowed community');
		} catch (error: any) {
			toast.error(error?.message ?? 'Follow failed');
		}
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

	function avatarColor(s: string): string {
		let hash = 0;
		for (let i = 0; i < s.length; i++) {
			hash = s.charCodeAt(i) + ((hash << 5) - hash);
		}
		const colors = [
			'bg-rose-500',
			'bg-blue-500',
			'bg-emerald-500',
			'bg-amber-500',
			'bg-violet-500',
			'bg-cyan-500',
			'bg-pink-500',
			'bg-indigo-500'
		];
		return colors[Math.abs(hash) % colors.length];
	}
</script>

<main class="mx-auto w-full max-w-6xl overflow-x-hidden px-4 py-6 sm:px-6">
	{#if communityQuery.isLoading}
		<div class="flex items-center justify-center py-20">
			<p class="text-sm text-muted-foreground">Loading community...</p>
		</div>
	{:else if !communityQuery.data}
		<div class="flex items-center justify-center py-20">
			<p class="text-sm text-destructive">Community not found.</p>
		</div>
	{:else}
		{@const community = communityQuery.data.community}
		{@const membershipStatus = communityQuery.data.membershipStatus}
		{@const canRead = communityQuery.data.canRead}
		{@const canPost = communityQuery.data.canPost}
		{@const isManager = communityQuery.data.isManager}

		<!-- Hero Banner -->
		<section
			class="rounded-xl border bg-linear-to-br from-muted/60 via-background to-muted/30 px-4 py-5 sm:px-6 sm:py-8"
		>
			<div class="flex flex-col gap-5 sm:flex-row sm:items-start">
				<!-- Avatar -->
				<div
					class="{avatarColor(community.slug)} flex size-12 shrink-0 items-center justify-center rounded-full text-xl font-bold sm:size-16 sm:text-2xl text-white shadow-md"
				>
					{community.slug.charAt(0).toUpperCase()}
				</div>

				<div class="min-w-0 flex-1">
					<!-- Title & badges -->
					<div class="flex flex-wrap items-center gap-2 sm:gap-3">
						<h1 class="text-xl font-bold tracking-tight sm:text-2xl">c/{community.slug}</h1>
						<Badge variant="secondary" class="gap-1">
							<Users class="size-3" />
							{community.memberCount} members
						</Badge>
						<Badge variant="outline" class="gap-1">
							<Eye class="size-3" />
							{community.visibility}
						</Badge>
						{#if membershipStatus === 'active'}
							<Badge class="gap-1 bg-emerald-600 text-white">Joined</Badge>
						{:else if membershipStatus === 'pending'}
							<Badge variant="secondary" class="gap-1">Pending</Badge>
						{/if}
					</div>

					<!-- Description -->
					<p class="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
						{community.description}
					</p>

					<!-- Action buttons -->
					<div class="mt-4 flex flex-wrap items-center gap-2">
						{#if membershipStatus === 'active'}
							<Button variant="secondary" size="sm" disabled>
								<Users class="size-4" />
								Joined
							</Button>
						{:else if membershipStatus === 'pending'}
							<Button variant="secondary" size="sm" disabled>
								<Clock class="size-4" />
								Request Pending
							</Button>
						{:else}
							<Button
								variant="outline"
								size="sm"
								disabled={!auth.isAuthenticated}
								onclick={requestJoin}
							>
								<Plus class="size-4" />
								Join
							</Button>
						{/if}

						<Button
							variant={isFollowing ? 'secondary' : 'outline'}
							size="sm"
							disabled={!auth.isAuthenticated}
							onclick={followCommunity}
						>
							{#if isFollowing}
								<Heart class="size-4 fill-current" />
								Following
							{:else}
								<Rss class="size-4" />
								Follow
							{/if}
						</Button>

						{#if canRead}
							<Button href="/c/{community.slug}/chat" variant="outline" size="sm">
								<MessageSquare class="size-4" />
								Chat
							</Button>
						{/if}

						{#if canPost}
							<Button href="/submit" size="sm">
								<Plus class="size-4" />
								Submit
							</Button>
						{/if}

						{#if isManager}
							<Button variant="outline" size="sm" href="/c/{community.slug}/manage">
								<Settings class="size-4" />
								Manage
							</Button>
						{/if}
					</div>

					{#if !auth.isAuthenticated}
						<p class="mt-3 text-xs text-muted-foreground">
							Sign in to join or follow this community.
							<a class="ml-1 font-medium underline" href={signInHref}>Sign in →</a>
						</p>
					{/if}
				</div>
			</div>
		</section>

		<!-- Two-column layout -->
		<div class="mt-6 grid gap-6 lg:grid-cols-3">
			<!-- Left column: Feed -->
			<div class="lg:col-span-2">
				<!-- Tab bar -->
				<div class="mb-4 flex items-center overflow-x-auto border-b">
					<button
						class="inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors sm:px-4 sm:py-2.5 {tab === 'new'
							? 'border-primary text-foreground'
							: 'border-transparent text-muted-foreground hover:text-foreground'}"
						onclick={() => updateParams({ tab: 'new', cursor: null })}
					>
						<Clock class="size-4" />
						New
					</button>
					<button
						class="inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors sm:px-4 sm:py-2.5 {tab === 'top'
							? 'border-primary text-foreground'
							: 'border-transparent text-muted-foreground hover:text-foreground'}"
						onclick={() => updateParams({ tab: 'top', cursor: null })}
					>
						<TrendingUp class="size-4" />
						Top
					</button>
					<button
						class="inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors sm:px-4 sm:py-2.5 {tab === 'discussed'
							? 'border-primary text-foreground'
							: 'border-transparent text-muted-foreground hover:text-foreground'}"
						onclick={() => updateParams({ tab: 'discussed', cursor: null })}
					>
						<MessageSquare class="size-4" />
						Discussed
					</button>
				</div>

				<!-- Search & tag filter -->
				<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
					<div class="relative flex-1">
						<Search
							class="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
						/>
						<Input
							placeholder="Search community..."
							class="pr-9 pl-9 text-sm"
							bind:value={searchInput}
							onkeydown={(e) => {
								if (e.key === 'Enter') {
									updateParams({ search: searchInput, cursor: null });
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
						onSelect={(tags) => updateParams({ tags: tags, cursor: null })}
					/>
				</div>

				<!-- Posts -->
				{#if feedQuery.error}
					<p class="py-8 text-center text-sm text-destructive">{feedQuery.error.message}</p>
				{:else if (feedQuery.data?.page?.length ?? 0) === 0}
					<div class="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
						<Archive class="mb-3 size-10 text-muted-foreground/50" />
						<p class="text-sm text-muted-foreground">No posts in this community yet.</p>
					</div>
				{:else}
					<div class="space-y-3">
						{#each feedQuery.data?.page ?? [] as post (post._id)}
							<Card class="gap-0 py-0 transition-shadow hover:shadow-md">
								<CardContent class="p-0">
									<div class="flex">
										<!-- Vote column -->
										<div
											class="flex flex-col items-center gap-0.5 rounded-l-xl border-r bg-muted/30 px-2.5 py-3"
										>
											<Button
												size="icon-sm"
												variant="ghost"
												class="size-7 {post.userVote === 1
													? 'text-primary [&_svg_path]:fill-current!'
													: 'text-muted-foreground hover:text-primary'}"
												disabled={!auth.isAuthenticated}
												onclick={() => vote(post._id, 1)}
												aria-label="Like post"
											>
												<ThumbsUp class="size-4" />
											</Button>
											<span class="text-sm font-bold tabular-nums">{post.score}</span>
											<Button
												size="icon-sm"
												variant="ghost"
												class="size-7 {post.userVote === -1
													? 'text-destructive [&_svg_path]:fill-current!'
													: 'text-muted-foreground hover:text-destructive'}"
												disabled={!auth.isAuthenticated}
												onclick={() => vote(post._id, -1)}
												aria-label="Dislike post"
											>
												<ThumbsDown class="size-4" />
											</Button>
										</div>

										<!-- Post content -->
										<div class="min-w-0 flex-1 px-3 py-3 sm:px-4">
											<a
												href="/post/{post._id}"
												class="line-clamp-2 text-base font-medium leading-snug hover:underline"
											>
												{post.title}
											</a>

											<p class="mt-1 line-clamp-2 text-sm text-muted-foreground">
												{post.snippet}
											</p>

											<!-- Metadata row -->
											<div class="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
												{#if post.authorUsername}
													<Badge
														href="/u/{post.authorUsername}"
														variant="outline"
														class="gap-1"
													>
														<User class="size-3" />
														u/{post.authorUsername}
													</Badge>
												{:else}
													<Badge variant="outline" class="gap-1">
														<User class="size-3" />
														{post.authorName}
													</Badge>
												{/if}

												{#if (post.tags?.length ?? 0) > 0}
													{#each post.tags as tag}
														<Badge variant="secondary" class="gap-1 bg-secondary/50">
															<Tag class="size-3" />
															{tag}
														</Badge>
													{/each}
												{/if}

												{#if post.sourceType}
													<Badge
														variant="outline"
														class="gap-1 border-dashed bg-muted/30"
													>
														<Archive class="size-3" />
														{post.sourceType === 'chrome_import'
															? 'Chrome Bookmark'
															: post.sourceType}
													</Badge>
												{/if}

												<span
													class="inline-flex items-center gap-1 text-muted-foreground sm:ml-auto"
												>
													<Calendar class="size-3" />
													{new Date(post.createdAt).toLocaleDateString()}
												</span>

												<span class="inline-flex items-center gap-1 text-muted-foreground">
													<MessageSquare class="size-3" />
													{post.commentCount}
												</span>
											</div>
										</div>
									</div>
								</CardContent>
							</Card>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Right column: Sidebar -->
			<div class="lg:col-span-1">
				<div class="rounded-xl border bg-card p-4 sm:p-5 lg:sticky lg:top-20">
					<h2 class="text-lg font-semibold">About</h2>
					<p class="mt-2 text-sm leading-relaxed text-muted-foreground">
						{community.description}
					</p>

					<Separator class="my-4" />

					<!-- Stats -->
					<div class="space-y-3 text-sm">
						<div class="flex items-center gap-2 text-muted-foreground">
							<Users class="size-4" />
							<span class="font-medium text-foreground">{community.memberCount}</span>
							members
						</div>
						<div class="flex items-center gap-2 text-muted-foreground">
							<Eye class="size-4" />
							Visibility:
							<span class="font-medium text-foreground">{community.visibility}</span>
						</div>
						{#if membershipStatus}
							<div class="flex items-center gap-2 text-muted-foreground">
								<User class="size-4" />
								Status:
								<span class="font-medium text-foreground">{membershipStatus}</span>
							</div>
						{/if}
					</div>

					<Separator class="my-4" />

					<!-- Quick links -->
					<div class="space-y-2">
						<Button
							href="/c/{slug}/members"
							variant="ghost"
							size="sm"
							class="w-full justify-start"
						>
							<Users class="size-4" />
							Members
						</Button>

						{#if canRead}
							<Button
								href="/c/{community.slug}/chat"
								variant="ghost"
								size="sm"
								class="w-full justify-start"
							>
								<MessageSquare class="size-4" />
								Community Chat
							</Button>
						{/if}

						{#if isManager}
							<Button
								href="/c/{community.slug}/manage"
								variant="ghost"
								size="sm"
								class="w-full justify-start"
							>
								<Settings class="size-4" />
								Manage Requests
							</Button>
						{/if}
					</div>
				</div>
			</div>
		</div>
	{/if}
</main>
