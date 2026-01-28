<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
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
		Save,
		X,
		Newspaper,
		Calendar,
		FileText,
		ChevronDown,
		ChevronUp,
		ChevronLeft,
		ChevronRight,
		Upload,
		CheckCircle2,
		AlertCircle,
		Loader2
	} from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	const client = useConvexClient();

	const PAGE_SIZE = 100;

	const urlCursor = $derived(page.url.searchParams.get('cursor'));
	const urlHistory = $derived(page.url.searchParams.get('history'));

	let currentCursor = $state<string | null>(null);
	let cursorHistory = $state<string[]>([]);

	$effect(() => {
		currentCursor = urlCursor;
	});
	$effect(() => {
		cursorHistory = urlHistory ? urlHistory.split(',').filter(Boolean) : [];
	});

	function updateUrl() {
		const params = new URLSearchParams();
		if (currentCursor) params.set('cursor', currentCursor);
		if (cursorHistory.length > 0) params.set('history', cursorHistory.join(','));
		const queryString = params.toString();
		goto(`/admin/news${queryString ? '?' + queryString : ''}`, {
			replaceState: true,
			keepFocus: true
		});
	}

	const newsQuery = useQuery(api.news.listPaginated, () => ({
		paginationOpts: { numItems: PAGE_SIZE, cursor: currentCursor }
	}));

	function nextPage() {
		if (newsQuery.data && !newsQuery.data.isDone) {
			cursorHistory = [...cursorHistory, currentCursor ?? ''];
			currentCursor = newsQuery.data.continueCursor;
			updateUrl();
		}
	}

	function prevPage() {
		if (cursorHistory.length > 0) {
			const prev = cursorHistory[cursorHistory.length - 1];
			cursorHistory = cursorHistory.slice(0, -1);
			currentCursor = prev === '' ? null : prev;
			updateUrl();
		}
	}

	let isEditing = $state(false);
	let editingId = $state<Id<'news'> | null>(null);
	let date = $state('');
	let body = $state('');
	let bodyUrl = $state<string | null>(null);
	let isLoadingFullBody = $state(false);
	let error = $state('');
	let isSaving = $state(false);
	let expandedNewsId = $state<Id<'news'> | null>(null);

	// Bulk Upload States
	let isBulkUploading = $state(false);
	let bulkProgress = $state(0);
	let bulkTotal = $state(0);
	let bulkStats = $state({ success: 0, skipped: 0, failed: 0 });
	let showBulkSummary = $state(false);

	async function hashBody(text: string) {
		const msgBuffer = new TextEncoder().encode(text);
		const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
	}

	async function handleBulkUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		if (!input.files || input.files.length === 0) return;

		const file = input.files[0];
		const text = await file.text();
		const lines = text.split('\n').filter((l) => l.trim());

		isBulkUploading = true;
		showBulkSummary = false;
		bulkTotal = lines.length;
		bulkProgress = 0;
		bulkStats = { success: 0, skipped: 0, failed: 0 };

		// Process in batches of 5
		const batchSize = 5;
		for (let i = 0; i < lines.length; i += batchSize) {
			const batch = lines.slice(i, i + batchSize);
			await Promise.all(
				batch.map(async (line) => {
					try {
						const { date, body } = JSON.parse(line);
						const bodyHash = await hashBody(body);

						// Check for duplicate
						const isDuplicate = await client.query(api.news.checkDuplicate, { bodyHash });

						if (isDuplicate) {
							bulkStats.skipped++;
						} else {
							await client.action(api.news.insert, { date, body, bodyHash });
							bulkStats.success++;
						}
					} catch (e) {
						console.error('Failed to process line:', line, e);
						bulkStats.failed++;
					} finally {
						bulkProgress++;
					}
				})
			);
		}

		isBulkUploading = false;
		showBulkSummary = true;
		input.value = '';
		toast.success('Bulk upload complete!');
	}

	const expandedNewsQuery = useQuery(api.news.getWithContent, () =>
		expandedNewsId ? { id: expandedNewsId } : 'skip'
	);

	function startCreate() {
		isEditing = true;
		editingId = null;
		date = new Date().toISOString().split('T')[0];
		body = '';
		bodyUrl = null;
		error = '';
	}

	function startEdit(item: any) {
		isEditing = true;
		editingId = item._id;
		date = item.date;
		body = item.body;
		bodyUrl = item.bodyUrl || null;
		error = '';
	}

	async function loadFullBody() {
		if (!bodyUrl) return;
		isLoadingFullBody = true;
		try {
			const res = await fetch(bodyUrl);
			if (!res.ok) throw new Error('Failed to fetch from storage');
			body = await res.text();
			toast.success('Full content loaded from R2');
		} catch (e: any) {
			toast.error(e.message || 'Failed to load body');
		} finally {
			isLoadingFullBody = false;
		}
	}

	async function handleSubmit(event: Event) {
		event.preventDefault();
		error = '';
		isSaving = true;

		try {
			const bodyHash = await hashBody(body);
			if (editingId) {
				await client.action(api.news.update, { id: editingId, date, body, bodyHash });
			} else {
				await client.action(api.news.insert, { date, body, bodyHash });
			}
			isEditing = false;
		} catch (e: any) {
			error = e.message || 'An error occurred while saving.';
		} finally {
			isSaving = false;
		}
	}

	async function handleDelete(id: Id<'news'>, contentCount: number) {
		const message =
			contentCount > 0
				? `This news item has ${contentCount} linked content item(s). Deleting will unlink them. Continue?`
				: 'Are you sure you want to delete this news item?';

		if (confirm(message)) {
			try {
				await client.mutation(api.news.remove, { id });
				if (expandedNewsId === id) expandedNewsId = null;
			} catch (e: any) {
				alert(e.message || 'Failed to delete news.');
			}
		}
	}

	function toggleExpand(id: Id<'news'>) {
		expandedNewsId = expandedNewsId === id ? null : id;
	}

	function formatDate(dateStr: string) {
		return new Intl.DateTimeFormat('en-US', {
			weekday: 'short',
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		}).format(new Date(dateStr));
	}

	function truncateText(str: string, maxLen: number = 150) {
		if (str.length <= maxLen) return str;
		return str.slice(0, maxLen) + '...';
	}
</script>

<div class="container mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
	<!-- Header -->
	<div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div class="space-y-2">
			<div class="flex items-center gap-2">
				<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
					<Newspaper class="h-4 w-4 text-primary" />
				</div>
				<h1 class="text-3xl font-semibold tracking-tight">News Management</h1>
			</div>
			<p class="text-muted-foreground">Manage daily news entries and view linked content.</p>
		</div>
		<div class="flex items-center gap-3">
			{#if !isEditing}
				<div class="relative">
					<input
						type="file"
						accept=".jsonl"
						onchange={handleBulkUpload}
						class="absolute inset-0 z-10 cursor-pointer opacity-0"
						disabled={isBulkUploading}
					/>
					<Button variant="outline" class="gap-2 font-medium" disabled={isBulkUploading}>
						{#if isBulkUploading}
							<Loader2 class="h-4 w-4 animate-spin" />
							Uploading...
						{:else}
							<Upload class="h-4 w-4" />
							Bulk JSONL
						{/if}
					</Button>
				</div>
				<Button onclick={startCreate} class="gap-2 font-medium shadow-sm">
					<Plus class="h-4 w-4" />
					Add News
				</Button>
			{/if}
		</div>
	</div>

	{#if isBulkUploading}
		<div class="mb-8 rounded-xl border border-primary/20 bg-primary/5 p-6 shadow-sm">
			<div class="flex flex-col gap-4">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2">
						<Loader2 class="h-5 w-5 animate-spin text-primary" />
						<span class="font-semibold">Ingesting Data... ({bulkProgress} / {bulkTotal})</span>
					</div>
					<Badge variant="outline" class="bg-background font-mono tabular-nums"
						>{Math.round((bulkProgress / bulkTotal) * 100)}%</Badge
					>
				</div>
				<div class="h-2 overflow-hidden rounded-full bg-primary/10">
					<div
						class="h-full bg-primary transition-all duration-300 ease-out"
						style="width: {(bulkProgress / bulkTotal) * 100}%"
					></div>
				</div>
				<div class="flex items-center gap-4 text-xs font-medium text-muted-foreground">
					<span class="flex items-center gap-1.5"
						><span class="h-2 w-2 rounded-full bg-green-500"></span>
						{bulkStats.success} Success</span
					>
					<span class="flex items-center gap-1.5"
						><span class="h-2 w-2 rounded-full bg-yellow-500"></span>
						{bulkStats.skipped} Duplicates</span
					>
					<span class="flex items-center gap-1.5"
						><span class="h-2 w-2 rounded-full bg-red-500"></span> {bulkStats.failed} Errors</span
					>
				</div>
			</div>
		</div>
	{/if}

	{#if showBulkSummary}
		<div
			class="mb-8 overflow-hidden rounded-xl border border-green-500/20 bg-green-500/5 shadow-sm"
		>
			<div class="flex items-center justify-between border-b border-green-500/10 px-6 py-4">
				<h3 class="flex items-center gap-2 font-semibold text-green-700 dark:text-green-400">
					<CheckCircle2 class="h-5 w-5" />
					Upload Complete
				</h3>
				<Button
					variant="ghost"
					size="icon"
					onclick={() => (showBulkSummary = false)}
					class="h-8 w-8 text-green-700 hover:bg-green-500/10 hover:text-green-800"
				>
					<X class="h-4 w-4" />
				</Button>
			</div>
			<div class="p-6">
				<p class="mb-4 text-sm text-muted-foreground">
					Successfully processed {bulkTotal} lines from the JSONL file.
				</p>
				<div class="grid grid-cols-3 gap-4">
					<div class="rounded-lg border bg-card p-4 text-center shadow-sm">
						<div class="text-3xl font-bold text-green-600 tabular-nums">{bulkStats.success}</div>
						<div class="mt-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">
							Saved
						</div>
					</div>
					<div class="rounded-lg border bg-card p-4 text-center shadow-sm">
						<div class="text-3xl font-bold text-yellow-600 tabular-nums">{bulkStats.skipped}</div>
						<div class="mt-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">
							Skipped
						</div>
					</div>
					<div class="rounded-lg border bg-card p-4 text-center shadow-sm">
						<div class="text-3xl font-bold text-red-600 tabular-nums">{bulkStats.failed}</div>
						<div class="mt-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">
							Errors
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}

	{#if isEditing}
		<div class="overflow-hidden rounded-xl border bg-card shadow-sm">
			<div class="border-b bg-muted/30 px-6 py-4">
				<div class="flex items-center justify-between">
					<div>
						<h2 class="text-lg font-semibold">{editingId ? 'Edit News' : 'Add News Entry'}</h2>
						<p class="mt-0.5 text-sm text-muted-foreground">
							{editingId ? 'Update the news details below.' : 'Add a new daily news entry.'}
						</p>
					</div>
					<Button
						variant="ghost"
						size="icon"
						onclick={() => (isEditing = false)}
						class="h-8 w-8 rounded-full"
					>
						<X class="h-4 w-4" />
					</Button>
				</div>
			</div>

			<div class="p-6">
				<form onsubmit={handleSubmit} class="space-y-6">
					<div class="space-y-2">
						<label for="date" class="text-sm font-medium">Date</label>
						<Input type="date" id="date" bind:value={date} required class="max-w-xs" />
					</div>

					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<label for="body" class="text-sm font-medium">News Content</label>
							{#if editingId && bodyUrl && body.length < 600}
								<Button
									type="button"
									variant="outline"
									size="sm"
									onclick={loadFullBody}
									disabled={isLoadingFullBody}
									class="h-7 gap-1.5 text-xs font-medium"
								>
									{#if isLoadingFullBody}
										<Loader2 class="h-3 w-3 animate-spin" />
									{:else}
										<Upload class="h-3 w-3" />
									{/if}
									Load Full Body
								</Button>
							{/if}
						</div>
						<Textarea
							id="body"
							bind:value={body}
							required
							rows={15}
							placeholder="Enter the full news content for this date..."
							class="min-h-[300px] p-4 font-mono text-sm leading-relaxed"
						/>
					</div>

					{#if error}
						<div
							class="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm font-medium text-destructive"
						>
							{error}
						</div>
					{/if}

					<div class="flex flex-col-reverse justify-end gap-3 border-t pt-6 sm:flex-row">
						<Button
							variant="outline"
							onclick={() => (isEditing = false)}
							disabled={isSaving}
							class="w-full sm:w-auto"
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={isSaving}
							class="w-full gap-2 font-medium shadow-sm sm:w-auto"
						>
							{#if isSaving}
								<Loader variant="circular" size="sm" />
								Saving...
							{:else}
								<Save class="h-4 w-4" />
								{editingId ? 'Update News' : 'Save News'}
							{/if}
						</Button>
					</div>
				</form>
			</div>
		</div>
	{:else if newsQuery.isLoading}
		<div class="grid gap-4">
			{#each Array(3) as _}
				<div class="rounded-xl border bg-card p-6">
					<div class="flex items-center justify-between">
						<div class="space-y-2">
							<Skeleton class="h-6 w-[200px]" />
							<Skeleton class="h-4 w-[400px]" />
						</div>
						<div class="flex gap-2">
							<Skeleton class="h-9 w-9 rounded-md" />
							<Skeleton class="h-9 w-9 rounded-md" />
						</div>
					</div>
				</div>
			{/each}
		</div>
	{:else if newsQuery.error}
		<div class="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
			<p class="font-medium text-destructive">Failed to load news</p>
			<p class="mt-1 text-sm text-muted-foreground">Please try refreshing the page.</p>
		</div>
	{:else if newsQuery.data}
		<div class="space-y-4">
			{#each newsQuery.data.page as item}
				{@const isExpanded = expandedNewsId === item._id}
				<div
					class="overflow-hidden rounded-xl border bg-card shadow-sm transition-all hover:shadow-md"
				>
					<div class="flex items-start justify-between gap-4 p-5">
						<div class="min-w-0 flex-1">
							<div class="mb-2 flex items-center gap-3">
								<div class="flex items-center gap-1.5 text-sm font-semibold text-foreground">
									<Calendar class="h-4 w-4 text-primary" />
									{formatDate(item.date)}
								</div>
								{#if item.contentCount > 0}
									<Badge variant="secondary" class="gap-1 px-2 py-0.5 text-[10px] font-medium">
										<FileText class="h-3 w-3 opacity-70" />
										{item.contentCount} item{item.contentCount !== 1 ? 's' : ''}
									</Badge>
								{/if}
							</div>
							<p class="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
								{truncateText(item.body)}
							</p>
						</div>
						<div class="flex shrink-0 items-center gap-1">
							{#if item.contentCount > 0}
								<Button
									variant="ghost"
									size="icon-sm"
									title={isExpanded ? 'Collapse' : 'Show linked content'}
									onclick={() => toggleExpand(item._id)}
									class="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
								>
									{#if isExpanded}
										<ChevronUp class="h-4 w-4" />
									{:else}
										<ChevronDown class="h-4 w-4" />
									{/if}
								</Button>
							{/if}
							<Button
								variant="ghost"
								size="icon-sm"
								title="Edit"
								onclick={() => startEdit(item)}
								class="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
							>
								<Pencil class="h-4 w-4" />
							</Button>
							<Button
								variant="ghost"
								size="icon-sm"
								title="Delete"
								class="h-8 w-8 rounded-full text-destructive/80 hover:bg-destructive/10 hover:text-destructive"
								onclick={() => handleDelete(item._id, item.contentCount)}
							>
								<Trash2 class="h-4 w-4" />
							</Button>
						</div>
					</div>

					{#if isExpanded}
						<div class="animate-in border-t bg-muted/30 px-5 py-4 duration-200 slide-in-from-top-2">
							<h4 class="mb-3 text-xs font-bold tracking-wider text-muted-foreground uppercase">
								Linked Content
							</h4>
							{#if expandedNewsQuery.isLoading}
								<div class="space-y-3">
									<Skeleton class="h-12 w-full rounded-lg" />
									<Skeleton class="h-12 w-full rounded-lg" />
								</div>
							{:else if expandedNewsQuery.data?.content}
								<div class="space-y-2">
									{#each expandedNewsQuery.data.content as contentItem}
										<div
											class="flex items-center justify-between rounded-lg border bg-background p-3 transition-colors hover:border-primary/30"
										>
											<div class="min-w-0 flex-1 pr-4">
												<div class="mb-1 flex items-center gap-2">
													<span class="truncate text-sm font-semibold">{contentItem.title}</span>
													<Badge variant="outline" class="h-5 px-1.5 py-0 text-[10px]"
														>{contentItem.topic}</Badge
													>
													{#if contentItem.subject}
														<Badge variant="secondary" class="h-5 px-1.5 py-0 text-[10px]"
															>{contentItem.subject.name}</Badge
														>
													{/if}
												</div>
												<p class="line-clamp-1 text-xs text-muted-foreground">
													{truncateText(contentItem.body, 100)}
												</p>
											</div>
											<a
												href="/admin/content?q={encodeURIComponent(contentItem.title)}"
												class="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
											>
												View
												<ChevronRight class="h-3 w-3" />
											</a>
										</div>
									{:else}
										<p class="text-sm text-muted-foreground italic">
											No content linked to this news.
										</p>
									{/each}
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{:else}
				<div
					class="flex flex-col items-center justify-center py-16 text-center border rounded-xl border-dashed"
				>
					<div class="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
						<Newspaper class="h-6 w-6 text-muted-foreground/50" />
					</div>
					<h3 class="font-semibold text-foreground">No news entries yet</h3>
					<p class="text-sm text-muted-foreground max-w-xs mx-auto mt-1">
						Start by adding your first news entry.
					</p>
					<Button variant="outline" size="sm" onclick={startCreate} class="mt-4">Add News</Button>
				</div>
			{/each}
		</div>

		{#if newsQuery.data.page.length > 0}
			<div class="mt-6 flex items-center justify-between px-2">
				<div class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
					Page {cursorHistory.length + 1} · {newsQuery.data.page.length} entries
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
						disabled={newsQuery.data.isDone}
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
