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
			class="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/10 py-24 text-center"
		>
			<div class="mb-5 rounded-full bg-muted p-5">
				<Share2 class="h-10 w-10 text-muted-foreground/40" />
			</div>
			<h3 class="text-lg font-semibold">No items found</h3>
			<p class="mt-2 max-w-sm text-sm text-muted-foreground">
				{q || selectedType !== 'all' || sharedBy !== 'all'
					? 'Try adjusting your filters to find what you are looking for.'
					: 'Shared content from the knowledge base will appear here for group discussion.'}
			</p>
			{#if !q && selectedType === 'all' && sharedBy === 'all'}
				<Button href="/content" variant="outline" class="mt-6">Explore Knowledge Base</Button>
			{/if}
		</div>
	{:else}
		<div class="mx-auto max-w-4xl space-y-6">
			<div class="grid gap-6">
				{#each sharedContent as item}
					{@const Icon = getTypeIcon(item)}
					<div
						class="group overflow-hidden rounded-xl border bg-card shadow-sm transition-all hover:border-primary/20 hover:shadow-md"
					>
						<div class="flex flex-col sm:flex-row">
							<div class="flex-1 p-6">
								<div class="mb-4 flex flex-wrap items-center gap-3">
									<Badge
										variant="secondary"
										class="gap-1.5 px-2.5 py-1 text-xs font-medium uppercase"
									>
										<Icon class="h-3.5 w-3.5 opacity-70" />
										{getTypeLabel(item)}
									</Badge>
									<div
										class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase"
									>
										<Calendar class="h-3.5 w-3.5" />
										{new Date(item.sharedAt).toLocaleDateString()}
									</div>
									<div class="flex items-center gap-1.5 text-xs font-bold text-primary uppercase">
										<User class="h-3.5 w-3.5" />
										{item.sharedByName}
									</div>
								</div>

								<h3 class="mb-2 text-xl font-bold tracking-tight text-foreground">
									{item.details?.title || 'Shared Content'}
								</h3>

								{#if item.details?.body}
									<p class="mb-5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
										{item.details.body}
									</p>
								{/if}

								<div class="flex flex-wrap items-center gap-3">
									{#if item.contentId}
										<Button
											variant="default"
											size="sm"
											class="h-9 gap-2 px-4 font-semibold shadow-sm"
											href="/groups/{groupId}/content/{item.contentId}"
										>
											<MessageSquare class="h-4 w-4" />
											Discuss in Group
										</Button>
									{:else if item.blogId}
										<Button
											variant="default"
											size="sm"
											class="h-9 gap-2 px-4 font-semibold shadow-sm"
											href="/groups/{groupId}/blog/{item.blogId}"
										>
											<MessageSquare class="h-4 w-4" />
											Discuss in Group
										</Button>
									{/if}

									<Button
										variant="outline"
										size="sm"
										class="h-9 gap-2 px-4 font-medium text-muted-foreground hover:text-foreground"
										href={item.contentId ? `/content/${item.contentId}` : `/blog/${item.blogId}`}
									>
										<ExternalLink class="h-4 w-4" />
										Public View
									</Button>

									{#if item.sharedById === currentUserId || group?.ownerId === currentUserId}
										<Button
											variant="ghost"
											size="sm"
											class="h-9 gap-2 px-3 text-destructive opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10"
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
					</div>
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
