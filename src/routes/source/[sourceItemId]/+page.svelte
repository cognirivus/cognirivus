<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { useAppAuth } from '$lib/auth.svelte';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import SaveSourceToCollectionDialog from '$lib/components/collections/SaveSourceToCollectionDialog.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { decodeHtmlEntities, sanitizeDisplayText } from '$lib/utils';
	import { marked } from 'marked';
	import {
		ArrowLeft,
		BookMarked,
		Calendar,
		ExternalLink,
		Globe,
		Loader2,
		Lock,
		NotebookText,
		RefreshCcw,
		Trash2,
		Users
	} from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	type SourceShare = {
		postId: Id<'posts'>;
		visibility: 'public' | 'private';
		communityId?: Id<'communities'>;
	};

	const auth = useAppAuth();
	const client = useConvexClient();
	const sourceItemId = $derived(page.params.sourceItemId as Id<'source_items'>);
	const detailsQuery = useQuery((api as any).sources.getSourceItem, () =>
		sourceItemId ? { sourceItemId } : 'skip'
	);
	const synthesisJobQuery = useQuery((api as any).knowledgeNotes.getSourceItemJob, () =>
		auth.isAuthenticated && sourceItemId ? { sourceItemId } : 'skip'
	);
	const communitiesQuery = useQuery((api as any).communities.listPostable, { limit: 100 });

	let shareCommunityId = $state('');
	let fullBody = $state('');
	let loadingBody = $state(false);
	let actionLoading = $state(false);
	let knowledgeLoading = $state(false);
	let shareCommunityDialogOpen = $state(false);
	let saveToCollectionDialogOpen = $state(false);
	let deleteShareDialogOpen = $state(false);
	let pendingDeleteSharePostId = $state<Id<'posts'> | null>(null);
	const bodyText = $derived(fullBody || decodeHtmlEntities(detailsQuery.data?.body ?? ''));
	const renderedHtml = $derived(marked.parse(bodyText) as string);
	const synthesisJob = $derived(synthesisJobQuery.data);
	const synthesisStatusLabel = $derived.by(() => {
		if (!synthesisJob) return 'Not processed';
		if (synthesisJob.status === 'ready_for_review') return 'Ready for review';
		if (synthesisJob.status === 'failed') return 'Failed';
		if (synthesisJob.status === 'skipped') return 'Skipped';
		if (synthesisJob.status === 'queued') return 'Queued';
		if (synthesisJob.status === 'running') return 'Processing';
		return 'Cancelled';
	});

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
			if (!response.ok) {
				throw new Error('Failed to fetch content');
			}
			fullBody = sanitizeDisplayText(decodeHtmlEntities(await response.text()));
		} catch {
			toast.error('Failed to load full content');
		} finally {
			loadingBody = false;
		}
	}

	async function useForKnowledge() {
		if (!auth.isAuthenticated) {
			toast.error('Sign in required');
			return;
		}
		knowledgeLoading = true;
		try {
			await client.mutation((api as any).knowledgeNotes.markSourceItemConsumed, {
				sourceItemId,
				contributionType: 'manual'
			});
			toast.success('Queued for note analysis');
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to queue note analysis');
		} finally {
			knowledgeLoading = false;
		}
	}

	async function retryKnowledgeJob() {
		if (!synthesisJob) {
			return;
		}
		knowledgeLoading = true;
		try {
			await client.mutation((api as any).knowledgeNotes.retrySynthesisJob, {
				jobId: synthesisJob._id
			});
			toast.success('Retry queued');
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to retry note analysis');
		} finally {
			knowledgeLoading = false;
		}
	}

	async function shareAsPost(visibility: 'public', communityId?: string): Promise<boolean> {
		if (!auth.isAuthenticated) {
			toast.error('Sign in required');
			return false;
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
			return true;
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to share source item');
			return false;
		} finally {
			actionLoading = false;
		}
	}

	async function shareToSelectedCommunity() {
		if (!shareCommunityId) {
			return;
		}
		const existingPostId = getCommunitySharePostId(shareCommunityId);
		if (existingPostId) {
			const unshared = await unsharePost(existingPostId, 'Unshared from community');
			if (unshared) {
				shareCommunityDialogOpen = false;
			}
			return;
		}
		const shared = await shareAsPost('public', shareCommunityId);
		if (shared) {
			shareCommunityDialogOpen = false;
		}
	}

	function getSharePostId(visibility: 'private' | 'public') {
		const shares = (detailsQuery.data?.shares ?? []) as Array<SourceShare>;
		const share = shares.find(
			(candidate) =>
				candidate.visibility === visibility && (visibility === 'private' || !candidate.communityId)
		);
		return share?.postId;
	}

	function getCommunitySharePostId(communityId: string) {
		const shares = (detailsQuery.data?.shares ?? []) as Array<SourceShare>;
		const share = shares.find(
			(candidate) => candidate.visibility === 'public' && candidate.communityId === communityId
		);
		return share?.postId;
	}

	async function unsharePost(postId: Id<'posts'>, successMessage = 'Share removed') {
		actionLoading = true;
		try {
			await client.mutation((api as any).posts.deletePost, { postId });
			toast.success(successMessage);
			return true;
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to remove share');
			return false;
		} finally {
			actionLoading = false;
		}
	}

	async function togglePublicShare() {
		const publicPostId = getSharePostId('public');
		if (publicPostId) {
			await unsharePost(publicPostId, 'Unshared from public');
			return;
		}
		await shareAsPost('public');
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
		await unsharePost(postId, 'Unshared from community');
	}

	async function deleteShare(postId: Id<'posts'>) {
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

	function requestDeleteShare(postId: Id<'posts'>) {
		pendingDeleteSharePostId = postId;
		deleteShareDialogOpen = true;
	}

	async function confirmDeleteShare() {
		if (!pendingDeleteSharePostId) return;
		const postId = pendingDeleteSharePostId;
		deleteShareDialogOpen = false;
		pendingDeleteSharePostId = null;
		await deleteShare(postId);
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
		<Card class="mb-4 overflow-hidden border-border/80 shadow-sm">
			<CardContent class="py-0">
				<section class="space-y-5 py-6 sm:py-7">
					<div class="flex flex-wrap items-center gap-2">
						<Badge variant="outline" class="uppercase">{detailsQuery.data.sourceType}</Badge>
						<Badge variant="outline" class="gap-1">
							<Globe class="size-3.5" />
							{decodeHtmlEntities(detailsQuery.data.sourceTitle)}
						</Badge>
					</div>
					<div class="space-y-3">
						<h2 class="max-w-4xl text-2xl font-semibold tracking-tight">
							{decodeHtmlEntities(detailsQuery.data.title)}
						</h2>
						<p class="max-w-3xl text-sm leading-7 text-muted-foreground">
							{decodeHtmlEntities(detailsQuery.data.snippet)}
						</p>
					</div>
					<div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
						<span class="inline-flex items-center gap-1.5">
							<Calendar class="size-3.5" />
							Published {new Date(detailsQuery.data.publishedAt).toLocaleString()}
						</span>
						<span class="inline-flex items-center gap-1.5">
							<NotebookText class="size-3.5" />
							Extracted reading view
						</span>
					</div>
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
				</section>

				{#if detailsQuery.data.body || detailsQuery.data.bodyUrl}
					<section class="border-t border-border/70 py-6 sm:py-7">
						<div class="mb-5 flex flex-wrap items-center justify-between gap-3">
							<div>
								<h3 class="text-sm font-semibold tracking-wide text-foreground">Reading View</h3>
								<p class="text-sm text-muted-foreground">
									Cleaned article text from the source, formatted for reading.
								</p>
							</div>
							{#if !bodyText && detailsQuery.data.bodyUrl}
								<Button variant="outline" size="sm" onclick={loadBody} disabled={loadingBody}>
									{#if loadingBody}
										<Loader2 class="mr-2 size-4 animate-spin" />
										Loading...
									{:else}
										Load Full Content
									{/if}
								</Button>
							{/if}
						</div>

						{#if loadingBody}
							<p class="text-sm text-muted-foreground">Loading extracted content...</p>
						{:else if renderedHtml}
							<article class="source-prose mx-auto max-w-3xl">
								{@html renderedHtml}
							</article>
						{/if}
					</section>
				{/if}
			</CardContent>
		</Card>

		<Card class="mb-4">
			<CardContent class="space-y-4 py-5">
				<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div class="space-y-1">
						<div class="flex flex-wrap items-center gap-2">
							<h3 class="text-base font-semibold">Knowledge Processing</h3>
							<Badge variant={synthesisJob?.status === 'failed' ? 'destructive' : 'outline'}>
								{synthesisStatusLabel}
							</Badge>
						</div>
						<p class="text-sm text-muted-foreground">
							{synthesisJob?.progressMessage ??
								'Send this item for AI-powered knowledge synthesis.'}
						</p>
						{#if synthesisJob?.errorMessage}
							<p class="text-sm text-destructive">{synthesisJob.errorMessage}</p>
						{/if}
					</div>
					<div class="flex flex-wrap gap-2">
						{#if synthesisJob?.status === 'ready_for_review'}
							<Button size="sm" href="/knowledge">
								<NotebookText class="mr-1 size-4" />
								Review Suggestion
							</Button>
						{:else if synthesisJob?.status === 'failed'}
							<Button
								size="sm"
								variant="outline"
								disabled={knowledgeLoading}
								onclick={retryKnowledgeJob}
							>
								{#if knowledgeLoading}
									<Loader2 class="mr-1 size-4 animate-spin" />
								{:else}
									<RefreshCcw class="mr-1 size-4" />
								{/if}
								Retry
							</Button>
						{:else}
							<Button
								size="sm"
								variant="outline"
								disabled={knowledgeLoading ||
									synthesisJob?.status === 'queued' ||
									synthesisJob?.status === 'running'}
								onclick={useForKnowledge}
							>
								{#if knowledgeLoading || synthesisJob?.status === 'running'}
									<Loader2 class="mr-1 size-4 animate-spin" />
								{:else}
									<NotebookText class="mr-1 size-4" />
								{/if}
								{synthesisJob?.status === 'queued' || synthesisJob?.status === 'running'
									? 'Processing'
									: 'Use for Knowledge'}
							</Button>
						{/if}
					</div>
				</div>
			</CardContent>
		</Card>

		<Card class="mb-4">
			<CardContent class="space-y-3 py-5">
				<h3 class="text-base font-semibold">Share</h3>
				{@const publicPostId = getSharePostId('public')}
				<div class="flex flex-wrap items-center gap-2">
					<Button
						size="sm"
						variant="outline"
						disabled={!auth.isAuthenticated}
						onclick={() => (saveToCollectionDialogOpen = true)}
					>
						<BookMarked class="mr-1 size-4" />
						Save to Collection
					</Button>
					<Button size="sm" variant="outline" disabled={actionLoading} onclick={togglePublicShare}>
						<Globe class="mr-1 size-4" />
						{publicPostId ? 'Unshare Public' : 'Share Public'}
					</Button>
					{#if (communitiesQuery.data?.length ?? 0) > 0}
						<Button
							size="sm"
							variant="outline"
							disabled={actionLoading}
							onclick={() => (shareCommunityDialogOpen = true)}
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
										onclick={() => requestDeleteShare(share.postId)}
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

<Dialog.Root bind:open={shareCommunityDialogOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Share to Community</Dialog.Title>
			<Dialog.Description>Select a community to publish this item in.</Dialog.Description>
		</Dialog.Header>
		{#if (communitiesQuery.data?.length ?? 0) === 0}
			<p class="text-sm text-muted-foreground">Join a community to share posts there.</p>
		{:else}
			<div class="max-h-64 space-y-2 overflow-y-auto">
				{#each communitiesQuery.data ?? [] as c (c._id)}
					{@const existingSharePostId = getCommunitySharePostId(c._id)}
					<button
						type="button"
						class={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
							shareCommunityId === c._id
								? 'border-primary bg-primary/10 text-foreground'
								: 'border-border hover:bg-muted/50'
						}`}
						onclick={() => (shareCommunityId = c._id)}
					>
						<div class="flex items-center gap-2 font-medium">
							{c.name}
							{#if c.visibility === 'private'}
								<Badge variant="outline" class="gap-1 border-muted-foreground/30 bg-muted/20">
									<Lock class="size-3" />
									private
								</Badge>
							{/if}
						</div>
						<div class="text-xs text-muted-foreground">
							c/{c.slug}
							{#if existingSharePostId}
								<span class="ml-1 font-medium text-foreground">- Shared</span>
							{/if}
						</div>
					</button>
				{/each}
			</div>
		{/if}
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (shareCommunityDialogOpen = false)}>Cancel</Button>
			<Button
				disabled={actionLoading || !shareCommunityId || (communitiesQuery.data?.length ?? 0) === 0}
				onclick={shareToSelectedCommunity}
			>
				{getCommunitySharePostId(shareCommunityId) ? 'Unshare' : 'Share'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

{#if detailsQuery.data}
	<SaveSourceToCollectionDialog
		bind:open={saveToCollectionDialogOpen}
		sourceId={detailsQuery.data.sourceId}
		sourceItemId={detailsQuery.data._id}
		sourceTitle={decodeHtmlEntities(detailsQuery.data.title)}
	/>
{/if}

<Dialog.Root
	open={deleteShareDialogOpen}
	onOpenChange={(open) => {
		deleteShareDialogOpen = open;
		if (!open) {
			pendingDeleteSharePostId = null;
		}
	}}
>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Delete Share</Dialog.Title>
			<Dialog.Description>Delete this shared post?</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (deleteShareDialogOpen = false)}>Cancel</Button>
			<Button variant="destructive" disabled={actionLoading} onclick={confirmDeleteShare}>
				Delete
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
