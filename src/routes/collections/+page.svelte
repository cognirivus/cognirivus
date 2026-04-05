<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { BookMarked, Globe, Lock, Plus } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	const client = useConvexClient();
	const meQuery = useQuery(api.auth.getCurrentUser, {});
	const myCollectionsQuery = useQuery((api as any).collections.listMine, {});
	const publicCollectionsQuery = useQuery((api as any).collections.listPublic, { limit: 60 });

	let title = $state('');
	let description = $state('');
	let tagsInput = $state('');
	let visibility = $state<'public' | 'private'>('private');
	let creating = $state(false);

	const visiblePublicCollections = $derived.by(() => {
		const mineIds = new Set(
			(myCollectionsQuery.data ?? []).map((collection: any) => collection._id)
		);
		return (publicCollectionsQuery.data ?? []).filter(
			(collection: any) => !mineIds.has(collection._id)
		);
	});

	async function createCollection(event: Event) {
		event.preventDefault();
		if (!meQuery.data) {
			toast.error('Sign in required');
			return;
		}
		creating = true;
		try {
			const result = await client.mutation((api as any).collections.create, {
				title,
				description: description || undefined,
				visibility,
				tags: tagsInput
					.split(',')
					.map((tag) => tag.trim())
					.filter(Boolean)
			});
			toast.success('Collection created');
			title = '';
			description = '';
			tagsInput = '';
			visibility = 'private';
			goto(resolve(`/collections/${result.slug}`));
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to create collection');
		} finally {
			creating = false;
		}
	}
</script>

<main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
	<div class="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Collections</h1>
			<p class="mt-1 text-sm text-muted-foreground">
				Curate specific source items and trusted sources into public or private reading lists.
			</p>
		</div>
	</div>

	<div class="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,420px)]">
		<div class="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle class="flex items-center gap-2 text-lg">
						<BookMarked class="size-5" />
						My Collections
					</CardTitle>
				</CardHeader>
				<CardContent>
					{#if (myCollectionsQuery.data?.length ?? 0) === 0}
						<p class="text-sm text-muted-foreground">You have not created any collections yet.</p>
					{:else}
						<div class="space-y-3">
							{#each myCollectionsQuery.data ?? [] as collection (collection._id)}
								<a
									href={resolve(`/collections/${collection.slug}`)}
									class="block rounded-lg border border-border p-4 transition hover:bg-muted/30"
								>
									<div class="flex flex-wrap items-start justify-between gap-3">
										<div class="min-w-0">
											<div class="flex items-center gap-2">
												<h2 class="truncate text-base font-medium">{collection.title}</h2>
												<Badge variant="outline" class="gap-1">
													{#if collection.visibility === 'public'}
														<Globe class="size-3" />
													{:else}
														<Lock class="size-3" />
													{/if}
													{collection.visibility}
												</Badge>
											</div>
											{#if collection.description}
												<p class="mt-1 line-clamp-2 text-sm text-muted-foreground">
													{collection.description}
												</p>
											{/if}
										</div>
										<div class="flex shrink-0 gap-2 text-xs text-muted-foreground">
											<span>{collection.itemCount} entries</span>
											<span>{collection.followerCount} followers</span>
										</div>
									</div>
									{#if (collection.tags?.length ?? 0) > 0}
										<div class="mt-3 flex flex-wrap gap-2">
											{#each collection.tags ?? [] as tag (tag)}
												<Badge variant="secondary">{tag}</Badge>
											{/each}
										</div>
									{/if}
								</a>
							{/each}
						</div>
					{/if}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle class="text-lg">Public Collections</CardTitle>
				</CardHeader>
				<CardContent>
					{#if (visiblePublicCollections.length ?? 0) === 0}
						<p class="text-sm text-muted-foreground">No public collections yet.</p>
					{:else}
						<div class="space-y-3">
							{#each visiblePublicCollections as collection (collection._id)}
								<a
									href={resolve(`/collections/${collection.slug}`)}
									class="block rounded-lg border border-border p-4 transition hover:bg-muted/30"
								>
									<div class="flex flex-wrap items-start justify-between gap-3">
										<div class="min-w-0">
											<h2 class="truncate text-base font-medium">{collection.title}</h2>
											<p class="mt-1 text-xs text-muted-foreground">
												{#if collection.ownerKind === 'community' && collection.ownerCommunitySlug}
													c/{collection.ownerCommunitySlug}
												{:else if collection.ownerUsername}
													u/{collection.ownerUsername}
												{:else}
													{collection.ownerName}
												{/if}
											</p>
											{#if collection.description}
												<p class="mt-2 line-clamp-2 text-sm text-muted-foreground">
													{collection.description}
												</p>
											{/if}
										</div>
										<div class="flex shrink-0 gap-2 text-xs text-muted-foreground">
											<span>{collection.itemCount} entries</span>
											<span>{collection.followerCount} followers</span>
										</div>
									</div>
								</a>
							{/each}
						</div>
					{/if}
				</CardContent>
			</Card>
		</div>

		<Card class="h-fit">
			<CardHeader>
				<CardTitle class="flex items-center gap-2 text-lg">
					<Plus class="size-5" />
					New Personal Collection
				</CardTitle>
			</CardHeader>
			<CardContent>
				{#if !meQuery.data}
					<p class="text-sm text-muted-foreground">
						Sign in to create personal collections and follow public ones.
					</p>
				{:else}
					<form class="space-y-4" onsubmit={createCollection}>
						<div class="space-y-2">
							<Label for="collection-title">Title</Label>
							<Input id="collection-title" bind:value={title} required maxlength={120} />
						</div>
						<div class="space-y-2">
							<Label for="collection-description">Description</Label>
							<Textarea
								id="collection-description"
								bind:value={description}
								rows={4}
								maxlength={400}
								placeholder="Why does this collection matter?"
							/>
						</div>
						<div class="space-y-2">
							<Label for="collection-tags">Tags</Label>
							<Input
								id="collection-tags"
								bind:value={tagsInput}
								placeholder="postgres, databases, infra"
							/>
						</div>
						<div class="space-y-2">
							<Label>Visibility</Label>
							<div class="grid grid-cols-2 gap-2">
								<Button
									type="button"
									variant={visibility === 'private' ? 'default' : 'outline'}
									onclick={() => (visibility = 'private')}
								>
									<Lock class="size-4" />
									Private
								</Button>
								<Button
									type="button"
									variant={visibility === 'public' ? 'default' : 'outline'}
									onclick={() => (visibility = 'public')}
								>
									<Globe class="size-4" />
									Public
								</Button>
							</div>
						</div>
						<p class="text-xs text-muted-foreground">
							Community-owned collections are created from community collection pages.
						</p>
						<Button type="submit" disabled={creating || !title.trim()} class="w-full">
							{creating ? 'Creating...' : 'Create Collection'}
						</Button>
					</form>
				{/if}
			</CardContent>
		</Card>
	</div>
</main>
