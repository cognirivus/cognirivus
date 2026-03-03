<script lang="ts">
	import { useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Button } from './ui/button';
	import { toast } from 'svelte-sonner';
	import { FileUp, Loader2, Tag as TagIcon } from '@lucide/svelte';
	import { Checkbox } from './ui/checkbox';
	import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
	import { Badge } from './ui/badge';
	import * as Dialog from './ui/dialog';

	import { Input } from './ui/input';
	import { ArrowUpDown, ArrowUp, ArrowDown, Search, Filter } from '@lucide/svelte';

	interface Bookmark {
		title: string;
		url: string;
		tags: string[];
		createdAt: number;
		selected?: boolean;
	}

	let fileInput: HTMLInputElement;
	let isParsing = $state(false);
	let isImporting = $state(false);
	let parsedBookmarks = $state<Bookmark[]>([]);
	let showPreview = $state(false);

	// Filtering state
	let searchQuery = $state('');
	let selectedTags = $state<string[]>([]);
	let sortColumn = $state<'title' | 'createdAt'>('createdAt');
	let sortDirection = $state<'asc' | 'desc'>('desc');

	const client = useConvexClient();

	// Derived filtering logic
	const availableTags = $derived([...new Set(parsedBookmarks.flatMap((b) => b.tags))].sort());

	const filteredBookmarks = $derived.by(() => {
		let result = [...parsedBookmarks];

		// Apply Search
		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			result = result.filter(
				(b) => b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)
			);
		}

		// Apply Tags
		if (selectedTags.length > 0) {
			result = result.filter((b) => selectedTags.some((t) => b.tags.includes(t)));
		}

		// Apply Sort
		result.sort((a, b) => {
			const valA = a[sortColumn];
			const valB = b[sortColumn];
			const modifier = sortDirection === 'asc' ? 1 : -1;
			if (valA < valB) return -1 * modifier;
			if (valA > valB) return 1 * modifier;
			return 0;
		});

		return result;
	});

	function toggleSort(col: 'title' | 'createdAt') {
		if (sortColumn === col) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortColumn = col;
			sortDirection = 'asc';
		}
	}

	function toggleTag(tag: string) {
		if (selectedTags.includes(tag)) {
			selectedTags = selectedTags.filter((t) => t !== tag);
		} else {
			selectedTags = [...selectedTags, tag];
		}
	}

	function parseBookmarks(htmlContent: string): Bookmark[] {
		// ... (keep current parsing logic)
		const bookmarks: Bookmark[] = [];
		const lines = htmlContent.split(/\r?\n/);
		const tagStack: string[] = [];
		let currentFolderName: string | null = null;

		for (let line of lines) {
			line = line.trim();

			// Detect start of a new folder/list
			if (line.toUpperCase().includes('<DL>')) {
				if (currentFolderName) {
					tagStack.push(currentFolderName);
					currentFolderName = null;
				}
			}
			// Detect end of a folder/list
			else if (line.toUpperCase().includes('</DL>')) {
				tagStack.pop();
			}
			// Detect folder name
			else if (line.match(/<H3[^>]*>([^<]+)<\/H3>/i)) {
				const match = line.match(/<H3[^>]*>([^<]+)<\/H3>/i);
				if (match) {
					currentFolderName = match[1];
				}
			}
			// Detect bookmark link
			else if (line.match(/<A HREF="([^"]+)"/i)) {
				const hrefMatch = line.match(/<A HREF="([^"]+)"/i);
				const titleMatch = line.match(/>([^<]+)<\/A>/i);
				const dateMatch = line.match(/ADD_DATE="(\d+)"/i);

				if (hrefMatch && titleMatch) {
					const url = hrefMatch[1];
					const title = titleMatch[1];
					const addDate = dateMatch ? parseInt(dateMatch[1]) * 1000 : Date.now();

					// Skip local files or about: pages
					if (url.startsWith('http')) {
						bookmarks.push({
							url,
							title,
							createdAt: addDate,
							tags: [...tagStack],
							selected: true
						});
					}
				}
			}
		}
		return bookmarks;
	}

	async function handleFileChange(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;

		if (!file.name.endsWith('.html')) {
			toast.error('Please select an HTML file exported from Chrome.');
			return;
		}

		isParsing = true;
		try {
			const text = await file.text();
			parsedBookmarks = parseBookmarks(text);
			showPreview = true;
		} catch (error: any) {
			console.error(error);
			toast.error(error?.message ?? 'Failed to parse bookmarks.');
		} finally {
			isParsing = false;
			if (fileInput) fileInput.value = '';
		}
	}

	async function confirmImport() {
		const selected = parsedBookmarks.filter((b) => b.selected);
		if (selected.length === 0) {
			toast.error('No bookmarks selected.');
			return;
		}

		isImporting = true;
		try {
			const count = await client.mutation((api as any).bookmarks.importSelectedBookmarks, {
				bookmarks: selected.map(({ selected, ...rest }) => rest)
			});
			toast.success(`Successfully imported ${count} bookmarks.`);
			reset();
		} catch (error: any) {
			console.error(error);
			toast.error(error?.message ?? 'Failed to import bookmarks.');
		} finally {
			isImporting = false;
		}
	}

	function reset() {
		parsedBookmarks = [];
		showPreview = false;
		searchQuery = '';
		selectedTags = [];
	}

	function toggleFiltered(checked: boolean) {
		const filteredIds = new Set(filteredBookmarks.map((b) => b.url)); // Use URL as unique key for selection
		parsedBookmarks = parsedBookmarks.map((b) => {
			if (filteredIds.has(b.url)) {
				return { ...b, selected: checked };
			}
			return b;
		});
	}

	const allFilteredSelected = $derived(
		filteredBookmarks.length > 0 && filteredBookmarks.every((b) => b.selected)
	);
	const someFilteredSelected = $derived(
		filteredBookmarks.some((b) => b.selected) && !filteredBookmarks.every((b) => b.selected)
	);
</script>

<div class="flex items-center gap-2">
	<input
		type="file"
		accept=".html"
		class="hidden"
		bind:this={fileInput}
		onchange={handleFileChange}
	/>
	<Button
		variant="outline"
		size="sm"
		class="gap-2"
		onclick={() => fileInput.click()}
		disabled={isParsing}
	>
		{#if isParsing}
			<Loader2 class="size-4 animate-spin" />
			Parsing...
		{:else}
			<FileUp class="size-4" />
			Import Chrome Bookmarks
		{/if}
	</Button>
</div>

<Dialog.Root bind:open={showPreview} onOpenChange={(open) => !open && reset()}>
	<Dialog.Content class="flex max-h-[90vh] flex-col sm:max-w-6xl">
		<Dialog.Header>
			<div class="flex items-start justify-between gap-4">
				<div class="space-y-1">
					<Dialog.Title>Preview Bookmarks ({parsedBookmarks.length})</Dialog.Title>
					<Dialog.Description>
						Select the bookmarks you want to import into your private feed.
					</Dialog.Description>
				</div>
				<div class="flex shrink-0 gap-2">
					<Button variant="outline" size="sm" onclick={() => toggleFiltered(true)}>
						Select Filtered
					</Button>
					<Button variant="outline" size="sm" onclick={() => toggleFiltered(false)}>
						Deselect Filtered
					</Button>
				</div>
			</div>
		</Dialog.Header>

		<div class="my-2 space-y-4">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
				<div class="relative flex-1">
					<Search class="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
					<Input
						placeholder="Search bookmarks by title or URL..."
						bind:value={searchQuery}
						class="pl-9"
					/>
				</div>
				{#if availableTags.length > 0}
					<div class="flex max-w-[400px] flex-wrap items-center gap-1">
						<Filter class="mr-1 size-3.5 text-muted-foreground" />
						{#each availableTags as tag}
							<Badge
								variant={selectedTags.includes(tag) ? 'default' : 'outline'}
								class="h-6 cursor-pointer text-[10px]"
								onclick={() => toggleTag(tag)}
							>
								{tag}
							</Badge>
						{/each}
						{#if selectedTags.length > 0}
							<Button
								variant="ghost"
								size="sm"
								class="h-6 px-2 text-[10px]"
								onclick={() => (selectedTags = [])}
							>
								Clear
							</Button>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		<div class="my-2 flex-1 overflow-auto rounded-md border border-border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead class="w-[50px]">
							<Checkbox
								checked={allFilteredSelected}
								onCheckedChange={(v) => toggleFiltered(!!v)}
								aria-label="Select all filtered"
							/>
						</TableHead>
						<TableHead>
							<Button
								variant="ghost"
								size="sm"
								class="-ml-3 h-8 gap-1 data-[sort=active]:text-foreground"
								data-sort={sortColumn === 'title' ? 'active' : ''}
								onclick={() => toggleSort('title')}
							>
								Title/URL
								{#if sortColumn === 'title'}
									{sortDirection === 'asc' ? '↑' : '↓'}
								{:else}
									<ArrowUpDown class="size-3" />
								{/if}
							</Button>
						</TableHead>
						<TableHead>Tags</TableHead>
						<TableHead class="text-right">
							<Button
								variant="ghost"
								size="sm"
								class="-mr-3 ml-auto h-8 gap-1 data-[sort=active]:text-foreground"
								data-sort={sortColumn === 'createdAt' ? 'active' : ''}
								onclick={() => toggleSort('createdAt')}
							>
								{#if sortColumn === 'createdAt'}
									{sortDirection === 'asc' ? '↑' : '↓'}
								{:else}
									<ArrowUpDown class="size-3" />
								{/if}
								Date
							</Button>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{#each filteredBookmarks as bookmark}
						<TableRow>
							<TableCell>
								<Checkbox bind:checked={bookmark.selected} aria-label="Select bookmark" />
							</TableCell>
							<TableCell>
								<div class="flex max-w-[500px] flex-col gap-1">
									<span class="truncate font-medium">{bookmark.title}</span>
									<span class="truncate text-xs text-muted-foreground">{bookmark.url}</span>
								</div>
							</TableCell>
							<TableCell>
								<div class="flex flex-wrap gap-1">
									{#each bookmark.tags as tag}
										<Badge variant="secondary" class="h-5 gap-1 px-1.5 text-[10px]">
											<TagIcon class="size-2.5" />
											{tag}
										</Badge>
									{/each}
								</div>
							</TableCell>
							<TableCell class="text-right text-xs whitespace-nowrap text-muted-foreground">
								{new Date(bookmark.createdAt).toLocaleDateString()}
							</TableCell>
						</TableRow>
					{/each}
				</TableBody>
			</Table>
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={reset} disabled={isImporting}>Cancel</Button>
			<Button
				onclick={confirmImport}
				disabled={isImporting || parsedBookmarks.filter((b) => b.selected).length === 0}
			>
				{#if isImporting}
					<Loader2 class="mr-2 size-4 animate-spin" />
					Importing...
				{:else}
					Import Selected ({parsedBookmarks.filter((b) => b.selected).length})
				{/if}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
