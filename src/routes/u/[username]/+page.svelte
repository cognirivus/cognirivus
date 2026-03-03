<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import {
		FileText,
		MessageSquare,
		UserRoundCheck,
		Users,
		Tag,
		Archive,
		Search,
		X
	} from '@lucide/svelte';
	import { api } from '$convex/_generated/api';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { toast } from 'svelte-sonner';
	import TagMultiSelect from '$lib/components/TagMultiSelect.svelte';

	const auth = useAuth();
	const client = useConvexClient();
	const username = $derived(page.params.username);
	const search = $derived(page.url.searchParams.get('search') ?? '');
	const selectedTags = $derived(
		page.url.searchParams.get('tags')?.split(',').filter(Boolean) ?? []
	);
	const cursor = $derived(page.url.searchParams.get('cursor'));

	let searchInput = $state(search);

	// Sync input with URL search param
	$effect(() => {
		searchInput = search;
	});

	const profileQuery = useQuery((api as any).profiles.getByUsername, () => ({ username }));
	const currentUserQuery = useQuery((api as any).auth.getCurrentUser, {});
	const followingQuery = useQuery((api as any).social_graph.listFollowing, {});
	const feedQuery = useQuery((api as any).feed.listUser, () => {
		const s = search;
		const ts = selectedTags;
		return {
			username,
			tab: 'new',
			window: '30d',
			search: s || undefined,
			tags: ts.length > 0 ? ts : undefined,
			paginationOpts: { numItems: 20, cursor }
		};
	});
	let followOverride = $state<boolean | null>(null);
	let followOverrideAuthId = $state<string | null>(null);
	const targetAuthId = $derived(profileQuery.data?.authId ?? null);
	const isFollowing = $derived.by(() => {
		if (!targetAuthId || !auth.isAuthenticated) {
			return false;
		}
		if (followOverrideAuthId === targetAuthId && followOverride !== null) {
			return followOverride;
		}
		return (followingQuery.data?.userIds ?? []).includes(targetAuthId);
	});
	const isOwnProfile = $derived(
		!!targetAuthId && auth.isAuthenticated && currentUserQuery.data?.id === targetAuthId
	);

	function updateParams(next: {
		search?: string | null;
		tags?: string[] | null;
		cursor?: string | null;
	}) {
		const params = Object.fromEntries(page.url.searchParams.entries()) as Record<string, string>;
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
		const target = queryString.length > 0 ? `/u/${username}?${queryString}` : `/u/${username}`;
		goto(target, { noScroll: true, keepFocus: true });
	}

	async function follow() {
		if (!auth.isAuthenticated) {
			goto(`/signin?redirectTo=${encodeURIComponent(page.url.pathname + page.url.search)}`);
			return;
		}
		if (!profileQuery.data) return;
		try {
			const result = await client.mutation((api as any).social_graph.followUser, {
				targetAuthId: profileQuery.data.authId
			});
			followOverrideAuthId = profileQuery.data.authId;
			followOverride = result.following;
			toast.success(result.following ? 'Following user' : 'Unfollowed user');
		} catch (error: any) {
			toast.error(error?.message ?? 'Follow failed');
		}
	}
</script>

<main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
	<div class="mx-auto w-full max-w-4xl">
		{#if profileQuery.isLoading}
			<p class="text-sm text-muted-foreground">Loading profile...</p>
		{:else if !profileQuery.data}
			<p class="text-sm text-destructive">Profile not found.</p>
		{:else}
			<Card class="gap-0 py-5">
				<CardContent>
					<h1 class="text-2xl font-semibold tracking-tight">u/{profileQuery.data.username}</h1>
					<p class="mt-1 text-sm text-muted-foreground">{profileQuery.data.name}</p>
					<div class="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
						<span class="inline-flex items-center gap-1">
							<FileText class="size-3.5" />
							{profileQuery.data.postCount} posts
						</span>
						<a
							class="inline-flex items-center gap-1 hover:text-foreground hover:underline"
							href="/u/{username}/followers"
						>
							<Users class="size-3.5" />
							{profileQuery.data.followerCount} followers
						</a>
						<a
							class="inline-flex items-center gap-1 hover:text-foreground hover:underline"
							href="/u/{username}/following"
						>
							<UserRoundCheck class="size-3.5" />
							{profileQuery.data.followingCount} following
						</a>
					</div>
					<div class="mt-4 flex items-center gap-2">
						<Button
							variant={isFollowing ? 'secondary' : 'outline'}
							disabled={isOwnProfile}
							onclick={follow}
						>
							{isOwnProfile ? 'Your profile' : isFollowing ? 'Unfollow' : 'Follow'}
						</Button>
						{#if isOwnProfile}
							<Button variant="outline" href="/u/{username}/posts/manage">
								<FileText class="mr-2 size-4" />
								Manage Posts
							</Button>
						{/if}
						{#if !isOwnProfile && auth.isAuthenticated}
							<Button variant="outline" onclick={() => goto(`/chat/${username}`)}>
								<MessageSquare class="mr-2 size-4" />
								Message
							</Button>
						{/if}
					</div>
				</CardContent>
			</Card>

			<section class="mt-8">
				<div class="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<h2 class="text-lg font-semibold">Recent Posts</h2>
					<div class="relative w-full max-w-sm">
						<Search class="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							placeholder="Search posts..."
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
				</div>

				<TagMultiSelect
					availableTags={Array.from(
						new Set((feedQuery.data?.page ?? []).flatMap((p: any) => p.tags ?? []))
					)}
					{selectedTags}
					onSelect={(tags) => updateParams({ tags: tags, cursor: null })}
				/>
				{#if (feedQuery.data?.page?.length ?? 0) === 0}
					<p class="text-sm text-muted-foreground">No posts yet.</p>
				{:else}
					<div class="space-y-3">
						{#each feedQuery.data?.page ?? [] as post (post._id)}
							<Card class="gap-0 py-4">
								<CardContent>
									<a href="/post/{post._id}" class="font-medium hover:underline">{post.title}</a>
									<p class="mt-1 line-clamp-2 text-sm text-muted-foreground">{post.snippet}</p>
									<p class="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
										<span>score {post.score} • {post.commentCount} comments</span>
										{#if (post.tags?.length ?? 0) > 0}
											{#each post.tags as tag}
												<Badge variant="secondary" class="-ml-1 scale-90 gap-1 bg-secondary/30">
													<Tag class="size-2.5" />
													{tag}
												</Badge>
											{/each}
										{/if}
										{#if post.sourceType}
											<Badge
												variant="outline"
												class="-ml-1 scale-90 gap-1 border-dashed bg-muted/20"
											>
												<Archive class="size-2.5" />
												{post.sourceType === 'chrome_import' ? 'Chrome Bookmark' : post.sourceType}
											</Badge>
										{/if}
									</p>
								</CardContent>
							</Card>
						{/each}
					</div>
				{/if}
			</section>
		{/if}
	</div>
</main>
