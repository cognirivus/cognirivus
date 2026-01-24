<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import { Users, LoaderCircle, MessageSquare, ChevronRight } from '@lucide/svelte';
	import type { Id } from '$convex/_generated/dataModel';

	let { contentId, blogId } = $props<{ contentId?: Id<'content'>; blogId?: Id<'blogs'> }>();

	const groupsQuery = useQuery((api as any).groups.list, {});
	const groups = $derived(groupsQuery.data ?? []);
	const client = useConvexClient();

	let isProcessing = $state(false);

	async function handleSelectGroup(groupId: Id<'groups'>) {
		isProcessing = true;
		try {
			await client.mutation((api as any).groups.shareContent, {
				groupId,
				contentId,
				blogId
			});
			if (contentId) {
				window.location.href = `/groups/${groupId}/content/${contentId}`;
			} else if (blogId) {
				window.location.href = `/groups/${groupId}/blog/${blogId}`;
			}
		} catch (e) {
			console.error('Failed to prepare group discussion:', e);
		} finally {
			isProcessing = false;
		}
	}
</script>

<div class="py-4">
	{#if groupsQuery.isLoading}
		<div class="flex justify-center py-8">
			<LoaderCircle class="h-6 w-6 animate-spin text-muted-foreground" />
		</div>
	{:else if groups.length === 0}
		<div
			class="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 py-12 text-center"
		>
			<Users class="mb-3 h-12 w-12 text-muted-foreground/30" />
			<h3 class="text-lg font-medium">No Groups Yet</h3>
			<p class="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
				Join or create a group to start private group discussions about this content.
			</p>
			<Button href="/groups" variant="outline" size="sm" class="mt-4">Explore Groups</Button>
		</div>
	{:else}
		<div class="grid gap-3">
			<p class="mb-1 text-xs font-bold tracking-wider text-muted-foreground uppercase">
				Select a Group to Discuss In
			</p>
			{#each groups as group}
				<button
					class="group flex w-full items-center justify-between rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/50 hover:bg-primary/5 disabled:opacity-50"
					disabled={isProcessing}
					onclick={() => handleSelectGroup(group._id)}
				>
					<div class="flex items-center gap-4">
						<div
							class="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-bold text-primary"
						>
							{group.name.charAt(0).toUpperCase()}
						</div>
						<div>
							<p class="leading-tight font-bold">{group.name}</p>
							<p class="line-clamp-1 text-xs text-muted-foreground">
								{group.description || 'Private Group'}
							</p>
						</div>
					</div>
					<div
						class="flex -translate-x-2 items-center gap-2 text-primary opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
					>
						<span class="text-xs font-bold uppercase">Discuss</span>
						<ChevronRight class="h-4 w-4" />
					</div>
				</button>
			{/each}
		</div>
	{/if}
</div>
