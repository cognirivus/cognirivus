<script lang="ts">
	import '../layout.css';
	import { page } from '$app/state';
	import { ModeWatcher } from 'mode-watcher';
	import ThemeToggle from '$lib/components/theme-toggle.svelte';
	import DocsSidebar from '$lib/components/docs/DocsSidebar.svelte';
	import DocsSearch from '$lib/components/docs/DocsSearch.svelte';
	import DocsTableOfContents from '$lib/components/docs/DocsTableOfContents.svelte';
	import { Sparkles, Search, Menu, X, ChevronRight, List } from '@lucide/svelte';
	import Toaster from '$lib/components/ui/sonner/sonner.svelte';

	let { children } = $props();

	let searchOpen = $state(false);
	let mobileMenuOpen = $state(false);
	let mobileTocOpen = $state(false);

	const SCROLL_ID = 'docs-scroll-container';

	const currentSlug = $derived(page.params.slug || '');
	const headings = $derived((page.data as any).headings || []);

	// Active segment for breadcrumbs
	const category = $derived((page.data as any).doc?.category || '');
	const title = $derived((page.data as any).doc?.title || '');
</script>

<svelte:head>
	<title>{title ? `${title} — Cognirivus Docs` : 'Cognirivus Documentation'}</title>
	<meta name="description" content="Explore Cognirivus guides, features, and developer docs." />
</svelte:head>

<ModeWatcher />
<Toaster />

<div class="flex h-screen flex-col overflow-hidden bg-background text-foreground selection:bg-accent selection:text-foreground">
	<!-- Top Navigation Bar (naturally fixed above the scroll container) -->
	<header class="h-14 w-full shrink-0 border-b border-border bg-background/80 backdrop-blur-md">
		<div
			class="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"
		>
			<!-- Logo -->
			<div class="flex items-center gap-6">
				<a href="/" class="group flex items-center gap-2.5">
					<div
						class="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background transition-transform duration-200 group-hover:scale-105"
					>
						<Sparkles class="h-4.5 w-4.5" />
					</div>
					<span class="text-lg font-semibold tracking-tight">Cognirivus</span>
				</a>
				<div
					class="hidden items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase sm:flex"
				>
					Docs
				</div>
			</div>

			<!-- Search & Actions -->
			<div class="flex items-center gap-3">
				<button
					onclick={() => (searchOpen = true)}
					class="flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-2 text-left text-xs font-medium text-muted-foreground transition-all duration-200 hover:bg-muted/40 hover:text-foreground sm:w-48 sm:px-3 sm:py-1.5"
				>
					<Search class="h-3.5 w-3.5 opacity-60" />
					<span class="hidden sm:inline">Search...</span>
					<kbd
						class="ml-auto hidden rounded bg-muted px-1 font-mono text-[10px] opacity-50 sm:inline-block"
						>⌘K</kbd
					>
				</button>

				<ThemeToggle />

				<!-- Mobile Menu Toggle -->
				<button
					onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
					class="rounded-lg border border-border bg-muted/20 p-2 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground md:hidden"
					aria-label="Toggle menu"
				>
					{#if mobileMenuOpen}
						<X class="h-4 w-4" />
					{:else}
						<Menu class="h-4 w-4" />
					{/if}
				</button>
			</div>
		</div>
	</header>

	<!-- Main Body Wrapper (fixed height layout, nested scroll) -->
	<div class="mx-auto flex w-full max-w-7xl flex-1 min-h-0 px-4 sm:px-6 lg:px-8">
		<!-- Sidebar for Desktop (naturally fixed since it doesn't scroll with content) -->
		<aside
			class="hidden h-full w-60 shrink-0 overflow-y-auto border-r border-border/50 pr-4 pt-4 md:block"
		>
			<DocsSidebar {currentSlug} />
		</aside>

		<!-- Mobile Navigation Drawer Overlay -->
		{#if mobileMenuOpen}
			<div
				role="presentation"
				onclick={() => (mobileMenuOpen = false)}
				class="fixed inset-0 top-14 z-30 bg-background/80 backdrop-blur-sm md:hidden"
			></div>
			<aside
				class="fixed top-14 bottom-0 left-0 z-30 w-64 overflow-y-auto border-r border-border bg-background p-4 shadow-xl transition-all duration-300 md:hidden"
			>
				<DocsSidebar {currentSlug} onSelectPage={() => (mobileMenuOpen = false)} />
			</aside>
		{/if}

		<!-- Content Scroll Area (the container that actually scrolls) -->
		<div id={SCROLL_ID} class="flex-1 overflow-y-auto flex min-h-0 w-full justify-center">
			<div class="flex w-full max-w-3xl flex-col py-8 px-4 sm:px-6 xl:max-w-none">
				<!-- Content Area -->
				<main class="min-w-0 flex-1">
					<!-- Breadcrumbs -->
					{#if category && title}
						<div class="mb-6 flex items-center gap-1.5 text-xs font-medium text-muted-foreground/80">
							<a href="/docs" class="transition-colors hover:text-foreground">Docs</a>
							<ChevronRight class="h-3 w-3 opacity-60" />
							<span>{category}</span>
							<ChevronRight class="h-3 w-3 opacity-60" />
							<span class="font-semibold text-foreground">{title}</span>
						</div>
					{/if}

					<!-- Mobile TOC (shown below breadcrumbs, hidden on xl where sidebar TOC exists) -->
					{#if headings.length > 0}
						<div class="mb-6 rounded-xl border border-border/50 bg-muted/20 xl:hidden">
							<button
								onclick={() => (mobileTocOpen = !mobileTocOpen)}
								class="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground"
							>
								<span class="flex items-center gap-2">
									<List class="h-4 w-4 opacity-70" />
									On this page
								</span>
								<ChevronRight
									class="h-4 w-4 opacity-60 transition-transform duration-200 {mobileTocOpen ? 'rotate-90' : ''}"
								/>
							</button>
							{#if mobileTocOpen}
								<div class="border-t border-border/40 px-4 py-3">
									<DocsTableOfContents {headings} scrollContainerId={SCROLL_ID} />
								</div>
							{/if}
						</div>
					{/if}

					<!-- Article Body -->
					<article class="min-w-0 flex-1">
						{@render children()}
					</article>
				</main>
			</div>
		</div>

		<!-- Table of Contents for Desktop (naturally fixed, sibling of content scroll container) -->
		{#if headings.length > 0}
			<aside
				class="hidden h-full w-52 shrink-0 overflow-y-auto border-l border-border/50 pl-6 pt-8 xl:block"
			>
				<DocsTableOfContents {headings} scrollContainerId={SCROLL_ID} />
			</aside>
		{/if}
	</div>
</div>

<DocsSearch bind:open={searchOpen} />
