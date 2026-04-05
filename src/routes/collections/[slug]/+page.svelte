<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import {
		BookMarked,
		ExternalLink,
		FileText,
		Globe,
		Lock,
		Plus,
		Rss,
		Trash2,
		Users,
		Youtube
	} from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	const client = useConvexClient();
	const slug = $derived(page.params.slug);
	const detailQuery = useQuery((api as any).collections.getBySlug, () => ({ slug }));
	const pendingSuggestionsQuery = useQuery((api as any).collections.listPendingSuggestions, () => {
		const collectionId = detailQuery.data?.collection._id;
		const canEdit = detailQuery.data?.collection.canEdit;
		const ownerKind = detailQuery.data?.collection.ownerKind;
		return collectionId && canEdit && ownerKind === 'community' ? { collectionId } : 'skip';
	});

	let addSourceDialogOpen = $state(false);
	let addingSource = $state(false);
	let deleteDialogOpen = $state(false);
	let deletingCollection = $state(false);
	let sourceType = $state<'website' | 'rss' | 'youtube'>('website');
	let sourceInput = $state('');
	let sourceTitle = $state('');
	let sourceNote = $state('');

	const addMode = $derived.by(() => {
		const collection = detailQuery.data?.collection;
		if (!collection) {
			return null;
		}
		if (collection.canEdit) {
			return 'add';
		}
		if (collection.canSuggest) {
			return 'suggest';
		}
		return null;
	});

	async function toggleFollow() {
		if (!detailQuery.data) {
			return;
		}
		try {
			const result = await client.mutation((api as any).collections.follow, {
				collectionId: detailQuery.data.collection._id
			});
			toast.success(result.following ? 'Following collection' : 'Unfollowed collection');
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to update collection follow');
		}
	}

	async function removeSource(collectionItemId: string) {
		try {
			await client.mutation((api as any).collections.removeSource, { collectionItemId });
			toast.success('Collection entry removed');
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to remove entry');
		}
	}

	async function deleteCollection() {
		if (!detailQuery.data?.collection) {
			return;
		}
		deletingCollection = true;
		try {
			await client.mutation((api as any).collections.remove, {
				collectionId: detailQuery.data.collection._id
			});
			toast.success('Collection deleted');
			deleteDialogOpen = false;
			goto(resolve('/collections'));
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to delete collection');
		} finally {
			deletingCollection = false;
		}
	}

	async function approveSuggestion(suggestionId: string) {
		try {
			await client.mutation((api as any).collections.approveSuggestion, { suggestionId });
			toast.success('Suggestion approved');
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to approve suggestion');
		}
	}

	async function rejectSuggestion(suggestionId: string) {
		try {
			await client.mutation((api as any).collections.rejectSuggestion, { suggestionId });
			toast.success('Suggestion rejected');
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to reject suggestion');
		}
	}

	async function addSourceToCurrentCollection(event: Event) {
		event.preventDefault();
		const collection = detailQuery.data?.collection;
		if (!collection || !addMode) {
			return;
		}
		addingSource = true;
		try {
			const result = await client.action((api as any).sources.addSource, {
				type: sourceType,
				inputUrlOrId: sourceInput,
				title: sourceTitle || undefined,
				targetCollectionId: addMode === 'add' ? collection._id : undefined,
				targetCommunityCollectionId: addMode === 'suggest' ? collection._id : undefined,
				collectionNote: sourceNote || undefined
			});
			const noun = result.sourceItemId ? 'Item' : 'Source';
			toast.success(
				addMode === 'add'
					? result.subscriptionStatus === 'already_subscribed'
						? `${noun} kept in collection`
						: `${noun} added to collection`
					: `${noun} suggested to collection`
			);
			sourceInput = '';
			sourceTitle = '';
			sourceNote = '';
			sourceType = 'website';
			addSourceDialogOpen = false;
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to add entry');
		} finally {
			addingSource = false;
		}
	}
</script>

<main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
	{#if detailQuery.isLoading}
		<p class="text-sm text-muted-foreground">Loading collection...</p>
	{:else if !detailQuery.data}
		<p class="text-sm text-destructive">Collection not found.</p>
	{:else}
		{@const collection = detailQuery.data.collection}
		<div class="mb-6 flex flex-col gap-4 rounded-xl border bg-card p-5">
			<div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div class="min-w-0">
					<div class="flex flex-wrap items-center gap-2">
						<h1 class="text-2xl font-semibold tracking-tight">{collection.title}</h1>
						<Badge variant="outline" class="gap-1">
							{#if collection.visibility === 'public'}
								<Globe class="size-3" />
							{:else}
								<Lock class="size-3" />
							{/if}
							{collection.visibility}
						</Badge>
						{#if collection.ownerKind === 'community'}
							<Badge variant="outline" class="gap-1">
								<Users class="size-3" />
								Community collection
							</Badge>
						{/if}
					</div>
					<p class="mt-2 text-sm text-muted-foreground">
						Owned by
						{#if collection.ownerKind === 'community' && collection.ownerCommunitySlug}
							<a
								class="font-medium underline"
								href={resolve(`/c/${collection.ownerCommunitySlug}/collections`)}
							>
								c/{collection.ownerCommunitySlug}
							</a>
						{:else if collection.ownerUsername}
							<span class="font-medium">u/{collection.ownerUsername}</span>
						{:else}
							<span class="font-medium">{collection.ownerName}</span>
						{/if}
					</p>
					{#if collection.description}
						<p class="mt-3 max-w-3xl text-sm text-muted-foreground">{collection.description}</p>
					{/if}
					{#if (collection.tags?.length ?? 0) > 0}
						<div class="mt-3 flex flex-wrap gap-2">
							{#each collection.tags ?? [] as tag (tag)}
								<Badge variant="secondary">{tag}</Badge>
							{/each}
						</div>
					{/if}
				</div>
				<div class="flex shrink-0 items-center gap-2">
					<Button variant={collection.isFollowing ? 'secondary' : 'outline'} onclick={toggleFollow}>
						{collection.isFollowing ? 'Following' : 'Follow'}
					</Button>
					{#if addMode}
						<Button variant="outline" onclick={() => (addSourceDialogOpen = true)}>
							<Plus class="mr-1 size-4" />
							{addMode === 'add' ? 'Add Entry' : 'Suggest Entry'}
						</Button>
					{/if}
					{#if collection.canEdit}
						<Button variant="outline" onclick={() => (deleteDialogOpen = true)}>
							<Trash2 class="mr-1 size-4" />
							Delete
						</Button>
					{/if}
				</div>
			</div>
			<div class="flex flex-wrap gap-4 text-sm text-muted-foreground">
				<span>{collection.itemCount} curated entries</span>
				<span>{collection.followerCount} followers</span>
			</div>
		</div>

		<div class="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
			<Card>
				<CardHeader>
					<CardTitle class="flex items-center gap-2 text-lg">
						<BookMarked class="size-5" />
						Curated Entries
					</CardTitle>
				</CardHeader>
				<CardContent>
					{#if (detailQuery.data.items?.length ?? 0) === 0}
						<p class="text-sm text-muted-foreground">No entries in this collection yet.</p>
					{:else}
						<div class="space-y-3">
							{#each detailQuery.data.items ?? [] as item (item._id)}
								<div class="rounded-lg border border-border p-4">
									<div class="flex flex-wrap items-start justify-between gap-3">
										<div class="min-w-0">
											<div class="flex flex-wrap items-center gap-2">
												<h2 class="truncate text-base font-medium">
													{item.entryType === 'source_item' ? item.itemTitle : item.sourceTitle}
												</h2>
												<Badge variant="outline">{item.sourceType}</Badge>
												<Badge variant="secondary">
													{item.entryType === 'source_item' ? 'item' : 'source'}
												</Badge>
											</div>
											{#if item.entryType === 'source_item' && item.sourceItemId && item.itemUrl}
												<div
													class="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground"
												>
													<a
														href={resolve(`/source/${item.sourceItemId}`)}
														class="inline-flex items-center gap-1 hover:text-foreground"
													>
														<FileText class="size-3.5" />
														Open saved item
													</a>
													<a
														href={item.itemUrl}
														target="_blank"
														rel="noopener noreferrer"
														class="inline-flex items-center gap-1 hover:text-foreground"
													>
														External article
														<ExternalLink class="size-3.5" />
													</a>
												</div>
												<p class="mt-2 text-sm text-muted-foreground">{item.sourceTitle}</p>
												{#if item.itemSnippet}
													<p class="mt-2 line-clamp-3 text-sm text-muted-foreground">
														{item.itemSnippet}
													</p>
												{/if}
											{:else}
												<a
													href={item.sourceCanonicalUrl}
													target="_blank"
													rel="noopener noreferrer"
													class="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
												>
													<span class="truncate">{item.sourceCanonicalUrl}</span>
													<ExternalLink class="size-3.5" />
												</a>
											{/if}
											{#if item.note}
												<p class="mt-2 text-sm text-muted-foreground">{item.note}</p>
											{/if}
											{#if item.latestPublishedAt}
												<p class="mt-2 text-xs text-muted-foreground">
													{item.entryType === 'source_item' ? 'Published ' : 'Latest update '}
													{new Date(item.latestPublishedAt).toLocaleString()}
												</p>
											{/if}
										</div>
										{#if collection.canEdit}
											<Button
												size="icon-sm"
												variant="ghost"
												onclick={() => removeSource(item._id)}
												aria-label="Remove entry from collection"
											>
												<Trash2 class="size-4" />
											</Button>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</CardContent>
			</Card>

			<div class="space-y-6">
				<Card>
					<CardHeader>
						<CardTitle class="text-lg">Recent Updates</CardTitle>
					</CardHeader>
					<CardContent>
						{#if (detailQuery.data.recentItems?.length ?? 0) === 0}
							<p class="text-sm text-muted-foreground">No recent items yet.</p>
						{:else}
							<div class="space-y-3">
								{#each detailQuery.data.recentItems ?? [] as item (item._id)}
									<a
										href={resolve(`/source/${item._id}`)}
										class="block rounded-lg border border-border p-4 transition hover:bg-muted/30"
									>
										<div class="flex items-start justify-between gap-3">
											<div class="min-w-0">
												<h2 class="line-clamp-2 text-sm font-medium">{item.title}</h2>
												<p class="mt-1 text-xs text-muted-foreground">
													{item.sourceTitle} | {new Date(item.publishedAt).toLocaleString()}
												</p>
												<p class="mt-2 line-clamp-2 text-sm text-muted-foreground">
													{item.snippet}
												</p>
											</div>
											<Badge variant="outline">{item.sourceType}</Badge>
										</div>
									</a>
								{/each}
							</div>
						{/if}
					</CardContent>
				</Card>

				{#if collection.canEdit && collection.ownerKind === 'community'}
					<Card>
						<CardHeader>
							<CardTitle class="text-lg">Pending Suggestions</CardTitle>
						</CardHeader>
						<CardContent>
							{#if (pendingSuggestionsQuery.data?.length ?? 0) === 0}
								<p class="text-sm text-muted-foreground">No pending suggestions.</p>
							{:else}
								<div class="space-y-3">
									{#each pendingSuggestionsQuery.data ?? [] as suggestion (suggestion._id)}
										<div class="rounded-lg border border-border p-4">
											<div class="flex flex-wrap items-start justify-between gap-3">
												<div class="min-w-0">
													<h2 class="text-sm font-medium">
														{suggestion.entryType === 'source_item'
															? suggestion.itemTitle
															: suggestion.sourceTitle}
													</h2>
													<p class="mt-1 text-xs text-muted-foreground">
														Suggested by
														{#if suggestion.suggestedByUsername}
															u/{suggestion.suggestedByUsername}
														{:else}
															{suggestion.suggestedByName}
														{/if}
													</p>
													<p class="mt-2 text-sm text-muted-foreground">
														{suggestion.sourceTitle}
													</p>
													{#if suggestion.note}
														<p class="mt-2 text-sm text-muted-foreground">{suggestion.note}</p>
													{/if}
												</div>
												<div class="flex gap-2">
													<Button size="sm" onclick={() => approveSuggestion(suggestion._id)}>
														Approve
													</Button>
													<Button
														size="sm"
														variant="outline"
														onclick={() => rejectSuggestion(suggestion._id)}
													>
														Reject
													</Button>
												</div>
											</div>
										</div>
									{/each}
								</div>
							{/if}
						</CardContent>
					</Card>
				{/if}
			</div>
		</div>
	{/if}
</main>

<Dialog.Root bind:open={addSourceDialogOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{addMode === 'add' ? 'Add Entry' : 'Suggest Entry'}</Dialog.Title>
			<Dialog.Description>
				{#if detailQuery.data}
					{addMode === 'add'
						? `Website article URLs save specific items. Feeds, channels, and site URLs save sources into ${detailQuery.data.collection.title}.`
						: `Suggest a new item or source for ${detailQuery.data.collection.title}.`}
				{/if}
			</Dialog.Description>
		</Dialog.Header>

		<form class="space-y-4" onsubmit={addSourceToCurrentCollection}>
			<div class="grid grid-cols-3 gap-2">
				<Button
					type="button"
					variant={sourceType === 'website' ? 'default' : 'outline'}
					onclick={() => (sourceType = 'website')}
				>
					<Globe class="size-4" />
					Website
				</Button>
				<Button
					type="button"
					variant={sourceType === 'rss' ? 'default' : 'outline'}
					onclick={() => (sourceType = 'rss')}
				>
					<Rss class="size-4" />
					RSS
				</Button>
				<Button
					type="button"
					variant={sourceType === 'youtube' ? 'default' : 'outline'}
					onclick={() => (sourceType = 'youtube')}
				>
					<Youtube class="size-4" />
					YouTube
				</Button>
			</div>

			<div class="space-y-2">
				<Label for="collection-source-input">URL</Label>
				<Input
					id="collection-source-input"
					bind:value={sourceInput}
					required
					placeholder={sourceType === 'rss'
						? 'https://example.com/feed.xml'
						: sourceType === 'youtube'
							? 'https://www.youtube.com/@channel'
							: 'https://example.com/article'}
				/>
			</div>

			<div class="space-y-2">
				<Label for="collection-source-title">Custom Title (optional)</Label>
				<Input
					id="collection-source-title"
					bind:value={sourceTitle}
					maxlength={220}
					placeholder="Override the detected title"
				/>
			</div>

			<div class="space-y-2">
				<Label for="collection-source-note">Curator Note (optional)</Label>
				<Textarea
					id="collection-source-note"
					bind:value={sourceNote}
					rows={3}
					maxlength={280}
					placeholder="Why is this worth including?"
				/>
			</div>

			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (addSourceDialogOpen = false)}>
					Cancel
				</Button>
				<Button type="submit" disabled={addingSource || !sourceInput.trim()}>
					{addingSource ? 'Saving...' : addMode === 'add' ? 'Add Entry' : 'Suggest Entry'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={deleteDialogOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Delete Collection</Dialog.Title>
			<Dialog.Description>
				This removes the collection, its entries, follows, and pending suggestions. This cannot be
				undone.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button type="button" variant="outline" onclick={() => (deleteDialogOpen = false)}>
				Cancel
			</Button>
			<Button variant="destructive" disabled={deletingCollection} onclick={deleteCollection}>
				{deletingCollection ? 'Deleting...' : 'Delete Collection'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
