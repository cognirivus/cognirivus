<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import type { Id } from '../../../convex/_generated/dataModel';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import {
		Plus,
		Pencil,
		Trash2,
		Eye,
		Save,
		X,
		Search,
		FileText,
		Sparkles,
		ChevronLeft,
		ChevronRight,
		Tag
	} from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { Markdown } from '$lib/components/prompt-kit/markdown/index.js';

	const client = useConvexClient();

	const PAGE_SIZE = 50;
	let currentCursor = $state<string | null>(null);
	let cursorHistory = $state<string[]>([]);
	let searchQuery = $state('');
	let selectedType = $state('');
	let onlyGenerated = $state(true);

	const entitiesQuery = useQuery((api as any).content.listAllEntities, () => ({
		paginationOpts: { numItems: PAGE_SIZE, cursor: currentCursor },
		type: selectedType || undefined,
		onlyGenerated: onlyGenerated
	}));

	const typesQuery = useQuery(api.content.listEntityTypes, {});

	function nextPage() {
		if (entitiesQuery.data && !entitiesQuery.data.isDone) {
			cursorHistory = [...cursorHistory, currentCursor ?? ''];
			currentCursor = entitiesQuery.data.continueCursor;
		}
	}

	function prevPage() {
		if (cursorHistory.length > 0) {
			const prev = cursorHistory[cursorHistory.length - 1];
			cursorHistory = cursorHistory.slice(0, -1);
			currentCursor = prev === '' ? null : prev;
		}
	}

	function resetPagination() {
		currentCursor = null;
		cursorHistory = [];
	}

	function applyFilters() {
		resetPagination();
	}

	let isEditing = $state(false);
	let editingEntity = $state<any>(null);
	let articleContent = $state('');
	let isSaving = $state(false);
	let isGenerating = $state(false);
	let showPreview = $state(false);

	function startEdit(entity: any) {
		isEditing = true;
		editingEntity = entity;
		articleContent = entity.article || '';
		showPreview = false;
	}

	async function handleSave() {
		if (!editingEntity) return;
		isSaving = true;
		try {
			await client.mutation((api as any).content.updateEntityArticle, {
				id: editingEntity._id,
				article: articleContent
			});
			toast.success('Article updated successfully');
			isEditing = false;
		} catch (e: any) {
			toast.error(e.message || 'Failed to save article');
		} finally {
			isSaving = false;
		}
	}

	async function handleGenerate() {
		if (!editingEntity) return;
		isGenerating = true;
		try {
			await client.action((api as any).synthesizer.generateArticle, {
				entityId: editingEntity._id
			});
			toast.success('Article generated successfully');
			// Refresh content
			const updated = await client.query((api as any).content.getEntity, { id: editingEntity._id });
			if (updated) {
				editingEntity = updated;
				articleContent = updated.article || '';
			}
		} catch (e: any) {
			toast.error(e.message || 'Failed to generate article');
		} finally {
			isGenerating = false;
		}
	}

	async function handleDeleteArticle(id: Id<'entities'>) {
		if (
			confirm(
				'Are you sure you want to remove this article? This will archive the current version.'
			)
		) {
			try {
				await client.mutation((api as any).content.removeEntityArticle, { id });
				toast.success('Article removed');
			} catch (e: any) {
				toast.error(e.message || 'Failed to remove article');
			}
		}
	}

	function formatDate(date: number | undefined) {
		if (!date) return 'Never';
		return new Intl.DateTimeFormat('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		}).format(date);
	}
</script>

<div class="container mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
	<div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div class="space-y-1">
			<h1 class="text-3xl font-bold tracking-tight">Article Management</h1>
			<p class="text-muted-foreground">Manage AI-synthesized articles for entities.</p>
		</div>
	</div>

	{#if isEditing}
		<div class="space-y-6">
			<Card.Root class="overflow-hidden border-primary/10 shadow-lg">
				<Card.Header class="bg-muted/30 pb-4">
					<div class="flex items-center justify-between">
						<div>
							<Card.Title>Edit Article: {editingEntity.name}</Card.Title>
							<Card.Description>
								{editingEntity.type} • {editingEntity.segmentCount} segments linked
							</Card.Description>
						</div>
						<div class="flex gap-2">
							<Button
								variant="outline"
								size="sm"
								onclick={handleGenerate}
								disabled={isGenerating}
								class="gap-2"
							>
								{#if isGenerating}
									<Loader variant="circular" size="sm" />
									Generating...
								{:else}
									<Sparkles class="h-4 w-4" />
									Regenerate with AI
								{/if}
							</Button>
							<Button
								variant="ghost"
								size="icon"
								onclick={() => (isEditing = false)}
								class="rounded-full"
							>
								<X class="h-4 w-4" />
							</Button>
						</div>
					</div>
				</Card.Header>
				<Separator />
				<Card.Content class="pt-6">
					<div class="mb-4 flex items-center gap-2">
						<Button
							variant={showPreview ? 'outline' : 'default'}
							size="sm"
							onclick={() => (showPreview = false)}
						>
							Edit
						</Button>
						<Button
							variant={showPreview ? 'default' : 'outline'}
							size="sm"
							onclick={() => (showPreview = true)}
						>
							Preview
						</Button>
					</div>

					{#if showPreview}
						<div
							class="prose prose-zinc dark:prose-invert min-h-[400px] max-w-none rounded-md border p-6"
						>
							<Markdown content={articleContent} />
						</div>
					{:else}
						<Textarea
							bind:value={articleContent}
							placeholder="Article content in Markdown..."
							class="min-h-[500px] font-mono text-sm leading-relaxed"
						/>
					{/if}

					<div class="mt-6 flex justify-end gap-3">
						<Button variant="outline" onclick={() => (isEditing = false)}>Cancel</Button>
						<Button onclick={handleSave} disabled={isSaving} class="gap-2">
							{#if isSaving}
								<Loader variant="circular" size="sm" />
								Saving...
							{:else}
								<Save class="h-4 w-4" />
								Save Changes
							{/if}
						</Button>
					</div>
				</Card.Content>
			</Card.Root>
		</div>
	{:else}
		<Card.Root class="mb-6">
			<Card.Header class="pb-4">
				<Card.Title>Filters</Card.Title>
			</Card.Header>
			<Card.Content>
				<div class="flex flex-col gap-4 sm:flex-row">
					<div class="relative flex-1">
						<Search
							class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
						/>
						<Input
							type="text"
							placeholder="Search entities (local)..."
							bind:value={searchQuery}
							class="pl-10"
						/>
					</div>
					<select
						bind:value={selectedType}
						onchange={applyFilters}
						class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none sm:w-[200px]"
					>
						<option value="">All Types</option>
						{#if typesQuery.data}
							{#each typesQuery.data as t}
								<option value={t.type}>{t.type}</option>
							{/each}
						{/if}
					</select>

					<div class="flex items-center gap-2 px-2">
						<input
							type="checkbox"
							id="onlyGenerated"
							bind:checked={onlyGenerated}
							onchange={applyFilters}
							class="h-4 w-4 rounded border-input"
						/>
						<label for="onlyGenerated" class="text-sm font-medium whitespace-nowrap">
							Generated Only
						</label>
					</div>
				</div>
			</Card.Content>
		</Card.Root>

		{#if entitiesQuery.isLoading}
			<div class="grid gap-4">
				{#each Array(5) as _}
					<Skeleton class="h-24 w-full rounded-xl" />
				{/each}
			</div>
		{:else if entitiesQuery.data}
			{@const filtered = entitiesQuery.data.page.filter(
				(e: any) => !searchQuery || e.name.toLowerCase().includes(searchQuery.toLowerCase())
			)}
			<Card.Root>
				<Card.Content class="p-0">
					<div class="overflow-x-auto">
						<table class="w-full text-left text-sm">
							<thead>
								<tr class="border-b bg-muted/50">
									<th class="h-12 px-4 font-medium text-muted-foreground">Entity Name</th>
									<th class="h-12 px-4 font-medium text-muted-foreground">Type</th>
									<th class="h-12 px-4 font-medium text-muted-foreground">Segments</th>
									<th class="h-12 px-4 font-medium text-muted-foreground">Status</th>
									<th class="h-12 px-4 font-medium text-muted-foreground">Last Updated</th>
									<th class="h-12 px-4 text-right font-medium text-muted-foreground">Actions</th>
								</tr>
							</thead>
							<tbody class="divide-y">
								{#each filtered as entity}
									<tr class="transition-colors hover:bg-muted/30">
										<td class="px-4 py-3 font-semibold">{entity.name}</td>
										<td class="px-4 py-3">
											<Badge variant="outline" class="capitalize">{entity.type}</Badge>
										</td>
										<td class="px-4 py-3 text-muted-foreground">{entity.segmentCount}</td>
										<td class="px-4 py-3">
											{#if entity.article}
												<Badge
													variant="secondary"
													class="gap-1 border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
												>
													<FileText class="h-3 w-3" />
													Generated
												</Badge>
											{:else}
												<Badge variant="outline" class="text-muted-foreground opacity-50"
													>None</Badge
												>
											{/if}
										</td>
										<td class="px-4 py-3 text-xs text-muted-foreground">
											{formatDate(entity.articleGeneratedAt)}
										</td>
										<td class="px-4 py-3 text-right">
											<div class="flex justify-end gap-1">
												<Button
													variant="ghost"
													size="icon-sm"
													title="Edit Article"
													onclick={() => startEdit(entity)}
													class="rounded-full"
												>
													<Pencil class="h-4 w-4" />
												</Button>
												{#if entity.article}
													<Button
														variant="ghost"
														size="icon-sm"
														title="Remove Article"
														class="rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
														onclick={() => handleDeleteArticle(entity._id)}
													>
														<Trash2 class="h-4 w-4" />
													</Button>
												{/if}
											</div>
										</td>
									</tr>
								{:else}
									<tr>
										<td colspan="6" class="px-6 py-12 text-center">
											<div class="flex flex-col items-center gap-2">
												<Tag class="h-12 w-12 text-muted-foreground/20" />
												<h3 class="font-semibold text-foreground">No entities found</h3>
												<p class="text-sm text-muted-foreground">
													Try adjusting your search or filters.
												</p>
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</Card.Content>
			</Card.Root>

			<div class="mt-4 flex items-center justify-between px-2">
				<div class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
					Page {cursorHistory.length + 1} · {entitiesQuery.data.page.length} items
				</div>
				<div class="flex items-center gap-1.5">
					<Button
						variant="outline"
						size="sm"
						onclick={prevPage}
						disabled={cursorHistory.length === 0}
						class="h-7 gap-1 px-2 text-[10px] font-bold tracking-tight uppercase"
					>
						<ChevronLeft class="h-3.5 w-3.5" />
						Previous
					</Button>
					<Button
						variant="outline"
						size="sm"
						onclick={nextPage}
						disabled={entitiesQuery.data.isDone}
						class="h-7 gap-1 px-2 text-[10px] font-bold tracking-tight uppercase"
					>
						Next
						<ChevronRight class="h-3.5 w-3.5" />
					</Button>
				</div>
			</div>
		{/if}
	{/if}
</div>
