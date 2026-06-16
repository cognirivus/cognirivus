<script lang="ts">
	import { goto } from '$app/navigation';
	import * as Dialog from '$lib/components/ui/dialog';
	import { searchDocs, type Doc } from '../../../docs/registry';
	import { Search, FileText } from '@lucide/svelte';

	let { open = $bindable(false) } = $props<{ open: boolean }>();

	let query = $state('');
	let selectedIndex = $state(0);

	// Get search results reactively
	const results = $derived(query.trim() ? searchDocs(query).slice(0, 8) : []);

	// Handle selection reset
	$effect(() => {
		// Reset selectedIndex whenever the query or results change
		query;
		selectedIndex = 0;
	});

	// Register keyboard shortcuts
	$effect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				open = !open;
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	});

	function handleInputKeyDown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selectedIndex = (selectedIndex + 1) % Math.max(1, results.length);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selectedIndex = (selectedIndex - 1 + results.length) % Math.max(1, results.length);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (results[selectedIndex]) {
				selectDoc(results[selectedIndex]);
			}
		}
	}

	function selectDoc(doc: Doc) {
		open = false;
		query = '';
		goto(`/docs/${doc.slug}`);
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="overflow-hidden p-0 sm:max-w-xl">
		<div class="flex items-center border-b border-border/50 px-4 py-3">
			<Search class="mr-2 h-4 w-4 shrink-0 text-muted-foreground opacity-60" />
			<!-- svelte-ignore a11y_autofocus -->
			<input
				type="text"
				bind:value={query}
				onkeydown={handleInputKeyDown}
				placeholder="Search documentation... (Esc to exit)"
				class="h-9 w-full bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
				autofocus
			/>
		</div>

		<div class="max-h-[300px] overflow-y-auto px-2 py-3">
			{#if !query.trim()}
				<p class="px-3 py-2 text-xs font-medium text-muted-foreground">
					Search for features, developer guides, or API references...
				</p>
			{:else}
				<ul class="flex flex-col gap-0.5">
					{#each results as doc, index}
						<li>
							<button
								type="button"
								onclick={() => selectDoc(doc)}
								class="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors
									{index === selectedIndex
									? 'bg-accent text-foreground'
									: 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}"
							>
								<div class="flex items-center gap-3 truncate">
									<FileText class="h-4 w-4 shrink-0 opacity-60" />
									<div class="truncate">
										<p class="font-medium text-foreground">{doc.title}</p>
										<p class="truncate text-xs text-muted-foreground">{doc.description}</p>
									</div>
								</div>
								<span
									class="ml-4 shrink-0 text-xs font-medium tracking-wider text-muted-foreground/50 uppercase"
								>
									{doc.category}
								</span>
							</button>
						</li>
					{:else}
						<li class="px-4 py-8 text-center text-sm text-muted-foreground">
							No documentation found matching "{query}"
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
