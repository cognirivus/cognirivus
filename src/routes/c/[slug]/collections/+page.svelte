<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import CommunitySubpageHeader from '$lib/components/community/CommunitySubpageHeader.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { BookMarked, Globe, Lock, Plus } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	const client = useConvexClient();
	const slug = $derived(page.params.slug);
	const communityQuery = useQuery((api as any).communities.getBySlug, () => ({ slug }));
	const collectionsQuery = useQuery((api as any).collections.listCommunity, () => {
		const communityId = communityQuery.data?.community._id;
		return communityId ? { communityId } : 'skip';
	});

	let title = $state('');
	let description = $state('');
	let tagsInput = $state('');
	let visibility = $state<'public' | 'private'>('public');
	let creating = $state(false);

	async function createCollection(event: Event) {
		event.preventDefault();
		if (!communityQuery.data?.community?._id) {
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
					.filter(Boolean),
				ownerCommunityId: communityQuery.data.community._id
			});
			toast.success('Community collection created');
			title = '';
			description = '';
			tagsInput = '';
			visibility = 'public';
			goto(resolve(`/collections/${result.slug}`));
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to create community collection');
		} finally {
			creating = false;
		}
	}
</script>

<main class="mx-auto w-full max-w-6xl overflow-x-hidden px-4 py-6 sm:px-6">
	{#if communityQuery.isLoading}
		<p class="text-sm text-muted-foreground">Loading community...</p>
	{:else if !communityQuery.data}
		<p class="text-sm text-destructive">Community not found.</p>
	{:else}
		<CommunitySubpageHeader communityData={communityQuery.data} activeNav="collections" />

		{#if !communityQuery.data.canRead}
			<p class="mt-6 text-sm text-muted-foreground">
				You must be a member to view collections for this private community.
			</p>
		{:else}
			<div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,420px)]">
				<Card>
					<CardHeader>
						<CardTitle class="flex items-center gap-2 text-lg">
							<BookMarked class="size-5" />
							Community Collections
						</CardTitle>
					</CardHeader>
					<CardContent>
						{#if (collectionsQuery.data?.length ?? 0) === 0}
							<p class="text-sm text-muted-foreground">
								No collections yet. Curated source items and source lists will appear here.
							</p>
						{:else}
							<div class="space-y-3">
								{#each collectionsQuery.data ?? [] as collection (collection._id)}
									<a
										href={resolve(`/collections/${collection.slug}`)}
										class="block rounded-lg border border-border p-4 transition hover:bg-muted/30"
									>
										<div class="flex flex-wrap items-start justify-between gap-3">
											<div class="min-w-0">
												<div class="flex flex-wrap items-center gap-2">
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

				{#if communityQuery.data.isManager}
					<Card class="h-fit">
						<CardHeader>
							<CardTitle class="flex items-center gap-2 text-lg">
								<Plus class="size-5" />
								New Community Collection
							</CardTitle>
						</CardHeader>
						<CardContent>
							<form class="space-y-4" onsubmit={createCollection}>
								<div class="space-y-2">
									<Label for="community-collection-title">Title</Label>
									<Input
										id="community-collection-title"
										bind:value={title}
										required
										maxlength={120}
									/>
								</div>
								<div class="space-y-2">
									<Label for="community-collection-description">Description</Label>
									<Textarea
										id="community-collection-description"
										bind:value={description}
										rows={4}
										maxlength={400}
									/>
								</div>
								<div class="space-y-2">
									<Label for="community-collection-tags">Tags</Label>
									<Input
										id="community-collection-tags"
										bind:value={tagsInput}
										placeholder="postgres, curation, indie-web"
									/>
								</div>
								<div class="space-y-2">
									<Label>Visibility</Label>
									<div class="grid grid-cols-2 gap-2">
										<Button
											type="button"
											variant={visibility === 'public' ? 'default' : 'outline'}
											onclick={() => (visibility = 'public')}
										>
											<Globe class="size-4" />
											Public
										</Button>
										<Button
											type="button"
											variant={visibility === 'private' ? 'default' : 'outline'}
											onclick={() => (visibility = 'private')}
										>
											<Lock class="size-4" />
											Private
										</Button>
									</div>
								</div>
								<Button type="submit" disabled={creating || !title.trim()} class="w-full">
									{creating ? 'Creating...' : 'Create Community Collection'}
								</Button>
							</form>
						</CardContent>
					</Card>
				{/if}
			</div>
		{/if}
	{/if}
</main>
