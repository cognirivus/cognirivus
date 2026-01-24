<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { page } from '$app/state';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as Dialog from '$lib/components/ui/dialog';
	import {
		Share2,
		MessageSquare,
		Calendar,
		ExternalLink,
		Trash2,
		User,
		Tag,
		FileText,
		Zap,
		BookOpen
	} from '@lucide/svelte';
	import type { Id } from '$convex/_generated/dataModel';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';

	const groupId = $derived(page.params.id as Id<'groups'>);
	const client = useConvexClient();

	// Read filters from URL
	const selectedType = $derived(page.url.searchParams.get('type') || 'all');
	const sharedBy = $derived(page.url.searchParams.get('sharedBy') || 'all');
	const q = $derived(page.url.searchParams.get('q') || undefined);

	const groupQuery = useQuery((api as any).groups.get, () => (groupId ? { groupId } : 'skip'));
	const group = $derived(groupQuery.data);

	const sharedContentQuery = useQuery((api as any).groups.getSharedContent, () =>
		groupId
			? {
					groupId,
					type: selectedType === 'all' ? undefined : selectedType,
					sharedBy: sharedBy === 'all' ? undefined : sharedBy,
					search: q
				}
			: 'skip'
	);
	const sharedContent = $derived(sharedContentQuery.data ?? []);

	const currentUserId = $derived(
		(page.data.currentUser as any)?.id ?? (page.data.currentUser as any)?._id
	);

	let itemToUnshare = $state<Id<'group_shared_content'> | null>(null);
	let isUnshareDialogOpen = $state(false);

	async function confirmUnshare() {
		if (!itemToUnshare) return;
		try {
			await client.mutation((api as any).groups.unshareContent, { sharedId: itemToUnshare });
			itemToUnshare = null;
			isUnshareDialogOpen = false;
		} catch (e) {
			console.error('Failed to unshare:', e);
		}
	}

	function getTypeIcon(item: any) {
		if (item.contentId) return BookOpen;
		if (item.blogId) return FileText;
		if (item.newsId) return Zap;
		if (item.entityId) return Tag;
		return Share2;
	}

	function getTypeLabel(item: any) {
		if (item.contentId) return 'Knowledge Base';
		if (item.blogId) return 'Blog Post';
		if (item.newsId) return 'News Update';
		if (item.entityId) return 'Entity Insight';
		return 'Shared Item';
	}
</script>

<div class="p-6">
	{#if sharedContentQuery.isLoading}
		<div class="flex h-[50vh] items-center justify-center">
			<Loader variant="circular" size="lg" />
		</div>
	{:else if sharedContent.length === 0}
		<div
			class="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 p-20 text-center"
		>
			<Share2 class="mb-4 h-12 w-12 text-muted-foreground/30" />
			<h3 class="text-lg font-medium">No items found</h3>
			<p class="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
				{q || selectedType !== 'all' || sharedBy !== 'all'
					? 'Try adjusting your filters to find what you are looking for.'
					: 'Shared content from the knowledge base will appear here for group discussion.'}
			</p>
			{#if !q && selectedType === 'all' && sharedBy === 'all'}
				<Button href="/content" variant="outline" class="mt-6">Explore Knowledge Base</Button>
			{/if}
		</div>
	{:else}
		<div class="mx-auto max-w-4xl space-y-4">
			<div class="grid gap-4">
				{#each sharedContent as item}
					{@const Icon = getTypeIcon(item)}
					<Card.Root class="group overflow-hidden transition-all hover:shadow-md">
						<Card.Content class="p-0">
							<div class="flex flex-col sm:flex-row">
								<div class="flex-1 p-5">
									<div class="mb-3 flex flex-wrap items-center gap-3">
										<Badge variant="secondary" class="h-auto gap-1 text-[10px] uppercase">
											<Icon class="h-3 w-3" />
											{getTypeLabel(item)}
										</Badge>
										<div
											class="flex items-center gap-1 text-[10px] text-muted-foreground uppercase"
										>
											<Calendar class="h-3 w-3" />
											{new Date(item.sharedAt).toLocaleDateString()}
										</div>
										<div
											class="flex items-center gap-1 text-[10px] font-bold text-primary uppercase"
										>
											<User class="h-3 w-3" />
											{item.sharedByName}
										</div>
									</div>

									<h3 class="mb-2 text-xl leading-tight font-bold">
										{item.details?.title || 'Shared Content'}
									</h3>

									{#if item.details?.body}
										<p class="mb-4 line-clamp-2 text-sm text-muted-foreground">
											{item.details.body}
										</p>
									{/if}

									<div class="mt-4 flex flex-wrap items-center gap-3">
										{#if item.contentId}
											<Button
												variant="default"
												size="sm"
												class="h-8 gap-2"
												href="/groups/{groupId}/content/{item.contentId}"
											>
												<MessageSquare class="h-4 w-4" />
												Discuss in Group
											</Button>
										{:else if item.blogId}
											<Button
												variant="default"
												size="sm"
												class="h-8 gap-2"
												href="/groups/{groupId}/blog/{item.blogId}"
											>
												<MessageSquare class="h-4 w-4" />
												Discuss in Group
											</Button>
										{/if}

										<Button
											variant="outline"
											size="sm"
											class="h-8 gap-2 text-muted-foreground"
											href={item.contentId ? `/content/${item.contentId}` : `/blog/${item.blogId}`}
										>
											<ExternalLink class="h-4 w-4" />
											Public View
										</Button>

										{#if item.sharedById === currentUserId || group?.ownerId === currentUserId}
											<Button
												variant="ghost"
												size="sm"
												class="h-8 gap-2 text-destructive opacity-0 transition-opacity group-hover:opacity-100"
												onclick={() => {
													itemToUnshare = item._id;
													isUnshareDialogOpen = true;
												}}
											>
												<Trash2 class="h-4 w-4" />
												Remove
											</Button>
										{/if}
									</div>
								</div>
							</div>
						</Card.Content>
					</Card.Root>
				{/each}
			</div>
		</div>
	{/if}
</div>

<Dialog.Root bind:open={isUnshareDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Remove from Group Feed?</Dialog.Title>
			<Dialog.Description>
				This will remove the item from the group's shared intelligence feed. You can always share it
				again later from the Knowledge Base.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (isUnshareDialogOpen = false)}>Cancel</Button>
			<Button variant="destructive" onclick={confirmUnshare}>Remove Item</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
