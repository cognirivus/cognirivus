<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Highlighter, Users, FileText, ChevronRight, Trash2 } from '@lucide/svelte';
	import * as Card from '$lib/components/ui/card';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { cn } from '$lib/utils';
	import { toast } from 'svelte-sonner';
	import type { Id } from '$convex/_generated/dataModel';
	import * as Dialog from '$lib/components/ui/dialog';

	const client = useConvexClient();
	const highlightsQuery = useQuery(api.highlights.getAllUserHighlights, {});
	const highlights = $derived(highlightsQuery.data ?? []);

	// Dialog State
	let deleteDialogOpen = $state(false);
	let deleteDialogTitle = $state('');
	let deleteDialogDescription = $state('');
	let deleteDialogAction = $state<(() => Promise<void>) | null>(null);
	let isDeleting = $state(false);

	// Grouping logic
	const groupedByContent = $derived.by(() => {
		const groups = new Map<string, any[]>();
		highlights.forEach((h) => {
			const key = `${h.contentId || h.blogId || 'unknown'}-${h.groupId || 'private'}`;
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key)!.push(h);
		});
		return Array.from(groups.entries()).map(([key, items]) => ({
			key,
			title: items[0].contextTitle,
			groupName: items[0].groupName,
			contentId: items[0].contentId,
			blogId: items[0].blogId,
			groupId: items[0].groupId,
			type: items[0].contentId ? 'content' : 'blog',
			items: items.sort((a, b) => b.createdAt - a.createdAt)
		}));
	});

	const groupedByGroup = $derived.by(() => {
		const groups = new Map<string, any[]>();
		highlights.forEach((h) => {
			const key = h.groupId || 'private';
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key)!.push(h);
		});
		return Array.from(groups.entries()).map(([id, items]) => {
			const contentMap = new Map<
				string,
				{ title: string; contentId?: string; blogId?: string; items: any[] }
			>();
			items.forEach((item) => {
				const cKey = item.contentId || item.blogId;
				if (!contentMap.has(cKey)) {
					contentMap.set(cKey, {
						title: item.contextTitle,
						contentId: item.contentId,
						blogId: item.blogId,
						items: []
					});
				}
				contentMap.get(cKey)!.items.push(item);
			});

			return {
				id: id === 'private' ? undefined : id,
				name: items[0].groupName || 'Private Space',
				contents: Array.from(contentMap.values()),
				totalCount: items.length
			};
		});
	});

	function handleRemoveAll() {
		deleteDialogTitle = 'Clear All Highlights?';
		deleteDialogDescription =
			'Are you sure you want to delete ALL your highlights? This action cannot be undone and will remove all your personal notes and group contributions.';
		deleteDialogAction = async () => {
			await client.mutation(api.highlights.removeAllUserHighlights, {});
			toast.success('All highlights deleted');
		};
		deleteDialogOpen = true;
	}

	function handleRemoveContext(
		contentId?: string,
		blogId?: string,
		groupId?: string,
		title?: string
	) {
		deleteDialogTitle = 'Delete Highlights?';
		deleteDialogDescription = `Delete all highlights for "${title || 'this content'}"? This will remove your notes from this specific context permanently.`;
		deleteDialogAction = async () => {
			await client.mutation(api.highlights.removeHighlightsByContext, {
				contentId: contentId as Id<'content'> | undefined,
				blogId: blogId as Id<'blogs'> | undefined,
				groupId: groupId as Id<'groups'> | undefined
			});
			toast.success('Highlights deleted');
		};
		deleteDialogOpen = true;
	}

	async function confirmDelete() {
		if (!deleteDialogAction || isDeleting) return;
		isDeleting = true;
		try {
			await deleteDialogAction();
			deleteDialogOpen = false;
		} catch (e) {
			toast.error('Failed to delete highlights');
		} finally {
			isDeleting = false;
			deleteDialogAction = null;
		}
	}

	function getHighlightColorClass(color: string) {
		const map: Record<string, string> = {
			yellow: 'bg-yellow-200/50 dark:bg-yellow-500/20 border-yellow-500/50',
			green: 'bg-green-200/50 dark:bg-green-500/20 border-green-500/50',
			blue: 'bg-blue-200/50 dark:bg-blue-500/20 border-blue-500/50',
			pink: 'bg-pink-200/50 dark:bg-pink-500/20 border-pink-500/50'
		};
		return map[color] || map.yellow;
	}

	function getLink(h: any) {
		if (h.groupId) {
			return h.contentId
				? `/groups/${h.groupId}/content/${h.contentId}`
				: `/groups/${h.groupId}/blog/${h.blogId}`;
		}
		return h.contentId ? `/content/${h.contentId}` : `/blog/${h.blogId}`;
	}
</script>

<div class="mx-auto max-w-5xl p-6 lg:p-8">
	<!-- Header -->
	<div class="mb-8 flex items-start justify-between">
		<div class="space-y-2">
			<div class="flex items-center gap-2.5">
				<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
					<Highlighter class="h-4 w-4 text-amber-600" />
				</div>
				<span class="text-xs font-bold tracking-widest text-muted-foreground uppercase">
					Knowledge
				</span>
			</div>
			<h1 class="text-2xl font-semibold tracking-tight">Your Highlights</h1>
			<p class="text-sm text-muted-foreground">
				Manage and review all your text highlights across content and groups.
			</p>
		</div>
		{#if highlights.length > 0}
			<Button
				variant="outline"
				size="sm"
				class="gap-2 text-destructive hover:bg-destructive/10"
				onclick={handleRemoveAll}
			>
				<Trash2 class="h-3.5 w-3.5" />
				Clear All
			</Button>
		{/if}
	</div>

	{#if highlightsQuery.isLoading}
		<div class="space-y-5">
			<Skeleton class="h-10 w-48" />
			<div class="grid gap-4 sm:grid-cols-2">
				{#each Array(4) as _}
					<Skeleton class="h-40 w-full rounded-xl" />
				{/each}
			</div>
		</div>
	{:else if highlights.length === 0}
		<div class="flex flex-col items-center justify-center py-24 text-center">
			<div class="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
				<Highlighter class="h-7 w-7 text-muted-foreground" />
			</div>
			<h2 class="text-lg font-semibold">No highlights yet</h2>
			<p class="mt-2 max-w-sm text-sm text-muted-foreground">
				Start highlighting important sections while reading articles or blogs to see them here.
			</p>
		</div>
	{:else}
		<Tabs.Root value="content" class="space-y-6">
			<Tabs.List>
				<Tabs.Trigger value="content" class="gap-2">
					<FileText class="h-3.5 w-3.5" />
					By Content
				</Tabs.Trigger>
				<Tabs.Trigger value="group" class="gap-2">
					<Users class="h-3.5 w-3.5" />
					By Group
				</Tabs.Trigger>
			</Tabs.List>

			<Tabs.Content value="content" class="space-y-4">
				<div class="grid gap-4">
					{#each groupedByContent as group}
						<div class="rounded-xl border bg-card">
							<div class="flex items-center justify-between border-b px-5 py-4">
								<div>
									<h3 class="text-sm font-semibold">{group.title}</h3>
									<div class="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
										{#if group.groupName}
											<Users class="h-3 w-3" />
											<span class="font-medium text-primary">{group.groupName}</span>
										{:else}
											<FileText class="h-3 w-3" />
											<span>Private Space</span>
										{/if}
									</div>
								</div>
								<div class="flex items-center gap-2">
									<Badge variant="secondary" class="text-[10px] font-semibold">
										{group.items.length} Highlight{group.items.length !== 1 ? 's' : ''}
									</Badge>
									<Button
										variant="ghost"
										size="icon"
										class="h-7 w-7 text-muted-foreground hover:text-destructive"
										onclick={() =>
											handleRemoveContext(
												group.contentId,
												group.blogId,
												group.groupId,
												group.title
											)}
									>
										<Trash2 class="h-3.5 w-3.5" />
									</Button>
								</div>
							</div>
							<div class="space-y-2 p-4">
								{#each group.items as h}
									<a
										href={getLink(h)}
										class="group block rounded-lg border border-transparent p-3 transition-colors hover:border-border hover:bg-accent/50"
									>
										<div class="flex items-start justify-between gap-3">
											<div
												class={cn(
													'flex-1 rounded-lg border-l-4 p-2.5 text-sm italic',
													getHighlightColorClass(h.color)
												)}
											>
												"{h.text}"
											</div>
											<ChevronRight
												class="mt-2 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
											/>
										</div>
									</a>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			</Tabs.Content>

			<Tabs.Content value="group" class="space-y-4">
				<div class="grid gap-4">
					{#each groupedByGroup as group}
						<div class="rounded-xl border bg-card">
							<div class="flex items-center justify-between border-b bg-muted/20 px-5 py-4">
								<div class="flex items-center gap-2.5">
									<Users class="h-4 w-4 text-primary" />
									<h3 class="text-sm font-semibold">{group.name}</h3>
								</div>
								<div class="flex items-center gap-2">
									<Badge variant="secondary" class="text-[10px] font-semibold">
										{group.totalCount} Highlight{group.totalCount !== 1 ? 's' : ''}
									</Badge>
									<Button
										variant="ghost"
										size="icon"
										class="h-7 w-7 text-muted-foreground hover:text-destructive"
										onclick={() => handleRemoveContext(undefined, undefined, group.id, group.name)}
									>
										<Trash2 class="h-3.5 w-3.5" />
									</Button>
								</div>
							</div>
							<div class="space-y-5 p-5">
								{#each group.contents as content}
									<div class="space-y-2.5">
										<div class="flex items-center justify-between px-1">
											<h4
												class="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
											>
												{content.title}
											</h4>
											<Button
												variant="ghost"
												size="icon"
												class="h-5 w-5 text-muted-foreground hover:text-destructive"
												onclick={() =>
													handleRemoveContext(
														content.contentId,
														content.blogId,
														group.id,
														content.title
													)}
											>
												<Trash2 class="h-3 w-3" />
											</Button>
										</div>
										<div class="ml-1 grid gap-2 border-l-2 pl-3">
											{#each content.items as h}
												<a
													href={getLink(h)}
													class="group block rounded-lg p-2.5 transition-colors hover:bg-accent/50"
												>
													<div
														class={cn(
															'rounded-lg border-l-2 p-2.5 text-xs italic',
															getHighlightColorClass(h.color)
														)}
													>
														"{h.text}"
													</div>
												</a>
											{/each}
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			</Tabs.Content>
		</Tabs.Root>
	{/if}
</div>

<Dialog.Root bind:open={deleteDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{deleteDialogTitle}</Dialog.Title>
			<Dialog.Description>{deleteDialogDescription}</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (deleteDialogOpen = false)} disabled={isDeleting}>
				Cancel
			</Button>
			<Button variant="destructive" onclick={confirmDelete} disabled={isDeleting}>
				{#if isDeleting}
					Deleting...
				{:else}
					Delete Permanently
				{/if}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
