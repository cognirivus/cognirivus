<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Textarea } from '$lib/components/ui/textarea';
	import { decodeHtmlEntities, sanitizeDisplayText } from '$lib/utils';
	import { ArrowLeft, ExternalLink, Globe, Loader2, Lock, Trash2, Users } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	const auth = useAuth();
	const client = useConvexClient();
	const sourceItemId = $derived(page.params.sourceItemId as Id<'source_items'>);
	const detailsQuery = useQuery((api as any).sources.getSourceItem, () =>
		sourceItemId ? { sourceItemId } : 'skip'
	);
	const communitiesQuery = useQuery((api as any).communities.listPublic, { limit: 100 });

	let shareCommunityId = $state('');
	let fullBody = $state('');
	let loadingBody = $state(false);
	let actionLoading = $state(false);

	$effect(() => {
		if (!shareCommunityId && (communitiesQuery.data?.length ?? 0) > 0) {
			shareCommunityId = communitiesQuery.data![0]._id;
		}
	});

	async function loadBody() {
		if (!detailsQuery.data?.bodyUrl || fullBody || loadingBody) {
			return;
		}
		loadingBody = true;
		try {
			const response = await fetch(detailsQuery.data.bodyUrl);
			fullBody = sanitizeDisplayText(decodeHtmlEntities(await response.text()));
		} catch {
			toast.error('Failed to load full content');
		} finally {
			loadingBody = false;
		}
	}

	async function shareAsPost(visibility: 'private' | 'public', communityId?: string) {
		if (!auth.isAuthenticated) {
			toast.error('Sign in required');
			return;
		}
		actionLoading = true;
		try {
			const postId = await client.action((api as any).posts.shareSourceItemAsPost, {
				sourceItemId,
				visibility,
				communityId: visibility === 'public' ? communityId : undefined
			});
			toast.success('Shared as post');
			goto(`/post/${postId}`);
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to share source item');
		} finally {
			actionLoading = false;
		}
	}

	async function toggleShare(postId: Id<'posts'>, currentVisibility: 'public' | 'private') {
		actionLoading = true;
		try {
			await client.mutation((api as any).posts.setVisibility, {
				postId,
				visibility: currentVisibility === 'public' ? 'private' : 'public'
			});
			toast.success(currentVisibility === 'public' ? 'Set to private' : 'Set to public');
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to update visibility');
		} finally {
			actionLoading = false;
		}
	}

	async function unshareFromCommunity(postId: Id<'posts'>) {
		actionLoading = true;
		try {
			await client.mutation((api as any).posts.setVisibility, {
				postId,
				visibility: 'public'
			});
			toast.success('Removed from community (kept as public share)');
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to unshare from community');
		} finally {
			actionLoading = false;
		}
	}

	async function deleteShare(postId: Id<'posts'>) {
		if (!confirm('Delete this shared post?')) {
			return;
		}
		actionLoading = true;
		try {
			await client.mutation((api as any).posts.deletePost, { postId });
			toast.success('Share deleted');
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to delete share');
		} finally {
			actionLoading = false;
		}
	}
</script>

<main class="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
	<div class="mb-5 flex items-center gap-3">
		<Button variant="ghost" size="icon" href="/feed?scope=you">
			<ArrowLeft class="size-5" />
		</Button>
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Source Item</h1>
			<p class="text-sm text-muted-foreground">Inspect content and manage shared posts.</p>
		</div>
	</div>

	{#if detailsQuery.isLoading}
		<p class="text-sm text-muted-foreground">Loading source item...</p>
	{:else if !detailsQuery.data}
		<Card class="border-destructive/20 bg-destructive/5 text-destructive">
			<CardContent class="py-8 text-sm">
				Source item not found or unavailable for your account.
			</CardContent>
		</Card>
	{:else}
		<Card class="mb-4">
			<CardContent class="space-y-3 py-5">
				<div class="flex flex-wrap items-center gap-2">
					<Badge variant="outline" class="uppercase">{detailsQuery.data.sourceType}</Badge>
					<Badge variant="outline" class="gap-1">
						<Globe class="size-3.5" />
						{decodeHtmlEntities(detailsQuery.data.sourceTitle)}
					</Badge>
				</div>
				<h2 class="text-xl font-semibold">{decodeHtmlEntities(detailsQuery.data.title)}</h2>
				<p class="text-sm text-muted-foreground">{decodeHtmlEntities(detailsQuery.data.snippet)}</p>
				<div class="flex flex-wrap items-center gap-2">
					<Button variant="outline" size="sm" href={detailsQuery.data.url} target="_blank">
						<ExternalLink class="mr-1 size-4" />
						Open Original
					</Button>
					<Button
						variant="ghost"
						size="sm"
						href={detailsQuery.data.sourceCanonicalUrl}
						target="_blank"
					>
						Visit Source
					</Button>
				</div>
				{#if detailsQuery.data.body}
					<Textarea value={decodeHtmlEntities(detailsQuery.data.body)} readonly rows={8} />
				{:else if detailsQuery.data.bodyUrl}
					<div class="space-y-2">
						<Button variant="outline" size="sm" onclick={loadBody} disabled={loadingBody}>
							{#if loadingBody}
								<Loader2 class="mr-2 size-4 animate-spin" />
								Loading...
							{:else}
								Load Full Content
							{/if}
						</Button>
						{#if fullBody}
							<Textarea value={fullBody} readonly rows={10} />
						{/if}
					</div>
				{/if}
			</CardContent>
		</Card>

		<Card class="mb-4">
			<CardContent class="space-y-3 py-5">
				<h3 class="text-base font-semibold">Share This Item</h3>
				<div class="flex flex-wrap items-center gap-2">
					<Button
						size="sm"
						variant="outline"
						disabled={actionLoading}
						onclick={() => shareAsPost('private')}
					>
						<Lock class="mr-1 size-4" />
						Share Private
					</Button>
					<Button
						size="sm"
						variant="outline"
						disabled={actionLoading}
						onclick={() => shareAsPost('public')}
					>
						<Globe class="mr-1 size-4" />
						Share Public
					</Button>
					{#if (communitiesQuery.data?.length ?? 0) > 0}
						<select
							class="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
							bind:value={shareCommunityId}
						>
							{#each communitiesQuery.data ?? [] as c (c._id)}
								<option value={c._id}>{c.name}</option>
							{/each}
						</select>
						<Button
							size="sm"
							variant="outline"
							disabled={actionLoading || !shareCommunityId}
							onclick={() => shareAsPost('public', shareCommunityId)}
						>
							<Users class="mr-1 size-4" />
							Share to Community
						</Button>
					{/if}
				</div>
			</CardContent>
		</Card>

		<Card>
			<CardContent class="space-y-3 py-5">
				<h3 class="text-base font-semibold">Your Shares</h3>
				{#if detailsQuery.data.shares.length === 0}
					<p class="text-sm text-muted-foreground">You have not shared this item yet.</p>
				{:else}
					<div class="space-y-2">
						{#each detailsQuery.data.shares as share (share.postId)}
							<div
								class="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
							>
								<div>
									<a class="font-medium hover:underline" href="/post/{share.postId}"
										>{share.title}</a
									>
									<div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
										{#if share.communitySlug}
											<Badge variant="outline">c/{share.communitySlug}</Badge>
										{:else if share.visibility === 'private'}
											<Badge variant="outline">private</Badge>
										{:else}
											<Badge variant="outline">public</Badge>
										{/if}
										<span>{new Date(share.createdAt).toLocaleString()}</span>
									</div>
								</div>
								<div class="flex flex-wrap items-center gap-1.5">
									{#if share.communityId}
										<Button
											size="sm"
											variant="outline"
											disabled={actionLoading}
											onclick={() => unshareFromCommunity(share.postId)}
										>
											Unshare From Community
										</Button>
									{:else}
										<Button
											size="sm"
											variant="outline"
											disabled={actionLoading}
											onclick={() => toggleShare(share.postId, share.visibility)}
										>
											{share.visibility === 'public' ? 'Make Private' : 'Make Public'}
										</Button>
									{/if}
									<Button
										size="sm"
										variant="destructive"
										disabled={actionLoading}
										onclick={() => deleteShare(share.postId)}
									>
										<Trash2 class="mr-1 size-4" />
										Delete Share
									</Button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</CardContent>
		</Card>
	{/if}
</main>
