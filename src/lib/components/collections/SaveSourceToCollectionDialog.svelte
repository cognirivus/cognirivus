<script lang="ts">
	import { resolve } from '$app/paths';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { BookMarked, Users } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	let {
		open = $bindable(false),
		sourceId,
		sourceItemId,
		sourceTitle
	}: {
		open?: boolean;
		sourceId: string;
		sourceItemId?: string;
		sourceTitle: string;
	} = $props();

	const client = useConvexClient();
	const meQuery = useQuery(api.auth.getCurrentUser, {});
	const myCollectionsQuery = useQuery((api as any).collections.listMine, {});
	const communityCollectionsQuery = useQuery(
		(api as any).collections.listSuggestableCommunityCollections,
		{}
	);

	let mode = $state<'personal' | 'community'>('personal');
	let personalCollectionId = $state('');
	let communityCollectionId = $state('');
	let note = $state('');
	let saving = $state(false);
	const isSourceItem = $derived(!!sourceItemId);

	$effect(() => {
		if (!personalCollectionId && (myCollectionsQuery.data?.length ?? 0) > 0) {
			personalCollectionId = myCollectionsQuery.data![0]._id;
		}
	});

	$effect(() => {
		if (!communityCollectionId && (communityCollectionsQuery.data?.length ?? 0) > 0) {
			communityCollectionId = communityCollectionsQuery.data![0]._id;
		}
	});

	$effect(() => {
		if (
			(myCollectionsQuery.data?.length ?? 0) === 0 &&
			(communityCollectionsQuery.data?.length ?? 0) > 0
		) {
			mode = 'community';
		}
		if (
			(communityCollectionsQuery.data?.length ?? 0) === 0 &&
			(myCollectionsQuery.data?.length ?? 0) > 0
		) {
			mode = 'personal';
		}
	});

	async function save() {
		if (!meQuery.data) {
			toast.error('Sign in required');
			return;
		}
		saving = true;
		try {
			if (mode === 'personal') {
				if (!personalCollectionId) {
					throw new Error('Select a collection first.');
				}
				await client.mutation((api as any).collections.addSource, {
					collectionId: personalCollectionId,
					sourceId,
					sourceItemId,
					note: note || undefined
				});
				toast.success(
					isSourceItem ? 'Item added to your collection' : 'Source added to your collection'
				);
			} else {
				if (!communityCollectionId) {
					throw new Error('Select a community collection first.');
				}
				await client.mutation((api as any).collections.submitSuggestion, {
					collectionId: communityCollectionId,
					sourceId,
					sourceItemId,
					note: note || undefined
				});
				toast.success(
					isSourceItem
						? 'Item suggested to community collection'
						: 'Source suggested to community collection'
				);
			}
			note = '';
			open = false;
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to save entry');
		} finally {
			saving = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{isSourceItem ? 'Save Item' : 'Save Source'}</Dialog.Title>
			<Dialog.Description>
				Save <span class="font-medium text-foreground">{sourceTitle}</span>
				{isSourceItem ? ' as an item in one of your collections' : ' to one of your collections'}
				or suggest it to a community collection.
			</Dialog.Description>
		</Dialog.Header>

		{#if !meQuery.data}
			<p class="text-sm text-muted-foreground">Sign in to save entries into collections.</p>
		{:else}
			<div class="space-y-4">
				<div class="grid grid-cols-2 gap-2">
					<Button
						type="button"
						variant={mode === 'personal' ? 'default' : 'outline'}
						onclick={() => (mode = 'personal')}
					>
						<BookMarked class="size-4" />
						My collection
					</Button>
					<Button
						type="button"
						variant={mode === 'community' ? 'default' : 'outline'}
						onclick={() => (mode = 'community')}
					>
						<Users class="size-4" />
						Community
					</Button>
				</div>

				{#if mode === 'personal'}
					{#if (myCollectionsQuery.data?.length ?? 0) === 0}
						<p class="text-sm text-muted-foreground">
							You do not have any personal collections yet.
						</p>
					{:else}
						<div class="space-y-2">
							<Label for="save-personal-collection">Personal Collection</Label>
							<select
								id="save-personal-collection"
								bind:value={personalCollectionId}
								class="h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
							>
								{#each myCollectionsQuery.data ?? [] as collection (collection._id)}
									<option value={collection._id}>{collection.title}</option>
								{/each}
							</select>
						</div>
					{/if}
				{:else if (communityCollectionsQuery.data?.length ?? 0) === 0}
					<p class="text-sm text-muted-foreground">
						No community collections are open for suggestions yet.
					</p>
				{:else}
					<div class="space-y-2">
						<Label for="save-community-collection">Community Collection</Label>
						<select
							id="save-community-collection"
							bind:value={communityCollectionId}
							class="h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
						>
							{#each communityCollectionsQuery.data ?? [] as collection (collection._id)}
								<option value={collection._id}>
									{collection.title}
									{#if collection.ownerCommunitySlug}
										(c/{collection.ownerCommunitySlug})
									{/if}
								</option>
							{/each}
						</select>
					</div>
				{/if}

				<div class="space-y-2">
					<Label for="save-collection-note">Curator Note (optional)</Label>
					<Textarea
						id="save-collection-note"
						bind:value={note}
						rows={3}
						maxlength={280}
						placeholder={isSourceItem
							? 'Why is this item worth keeping?'
							: 'Why is this source worth keeping?'}
					/>
				</div>
			</div>
		{/if}

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
			{#if meQuery.data && (myCollectionsQuery.data?.length ?? 0) === 0 && mode === 'personal'}
				<Button variant="outline" href={resolve('/collections')}>Create Collection</Button>
			{:else}
				<Button
					disabled={!meQuery.data ||
						saving ||
						(mode === 'personal' && !personalCollectionId) ||
						(mode === 'community' && !communityCollectionId)}
					onclick={save}
				>
					{saving ? 'Saving...' : mode === 'personal' ? 'Save' : 'Suggest'}
				</Button>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
