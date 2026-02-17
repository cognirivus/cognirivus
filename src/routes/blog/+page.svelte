<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '../../convex/_generated/api';
	import { Button } from '$lib/components/ui/button/index.js';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import {
		ArrowRight,
		ThumbsUp,
		MessageCircle,
		BookOpen,
		ChevronLeft,
		ChevronRight
	} from '@lucide/svelte';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';

	const currentCursor = $derived(page.url.searchParams.get('cursor') || null);
	const currentIndex = $derived(Number(page.url.searchParams.get('index') || 0));
	const skeletonRows = [0, 1, 2];

	const blogsQuery = useQuery((api as any).blogs.listPaginated, () => ({
		onlyPublished: true,
		paginationOpts: { numItems: 12, cursor: currentCursor }
	}));
	const blogs = $derived(blogsQuery.data?.page || []);
	const hasNextPage = $derived(blogsQuery.data?.isDone === false);
	const hasPrevPage = $derived(currentIndex > 0);

	function goToPage(next: boolean) {
		const params = new SvelteURLSearchParams(page.url.searchParams);
		if (next && blogsQuery.data?.continueCursor) {
			params.set('cursor', blogsQuery.data.continueCursor);
			params.set('index', String(currentIndex + 1));
		} else if (!next && currentIndex > 0) {
			window.history.back();
			return;
		}
		const queryString = params.toString();
		window.location.assign(`${resolve('/blog')}${queryString ? `?${queryString}` : ''}`);
	}

	function formatDate(date: number) {
		return new Intl.DateTimeFormat('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		}).format(date);
	}
</script>

<div class="min-h-screen bg-background">
	<div class="mx-auto max-w-3xl px-6 py-12 lg:py-16">
		<header class="mb-12">
			<div class="mb-4 flex items-center gap-3">
				<div
					class="flex h-10 w-10 items-center justify-center rounded-lg bg-foreground text-background"
				>
					<BookOpen class="h-5 w-5" />
				</div>
				<h1 class="text-3xl font-semibold tracking-tight text-foreground">Blog</h1>
			</div>
			<p class="text-muted-foreground">
				Latest updates, news, and insights from the Cognirivus team.
			</p>
		</header>

		{#if blogsQuery.isLoading}
			<div class="space-y-8">
				{#each skeletonRows as row (row)}
					<article class="border-b border-border/40 pb-8 last:border-0">
						<div class="space-y-3">
							<Skeleton class="h-4 w-24" />
							<Skeleton class="h-7 w-3/4" />
							<div class="space-y-2">
								<Skeleton class="h-4 w-full" />
								<Skeleton class="h-4 w-full" />
								<Skeleton class="h-4 w-2/3" />
							</div>
							<div class="flex items-center gap-4 pt-2">
								<Skeleton class="h-4 w-12" />
								<Skeleton class="h-4 w-12" />
							</div>
						</div>
					</article>
				{/each}
			</div>
		{:else if blogsQuery.error}
			<div
				class="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
			>
				Failed to load blogs. Please try again later.
			</div>
		{:else if blogsQuery.data}
			<div class="space-y-0">
				{#each blogs as blog (blog._id)}
					<article class="group border-b border-border/40 py-8 first:pt-0 last:border-0">
						<a href={resolve(`/blog/${blog._id}`)} class="block space-y-3">
							<div class="flex items-center gap-3 text-sm text-muted-foreground">
								<time datetime={new Date(blog.createdAt).toISOString()}>
									{formatDate(blog.createdAt)}
								</time>
							</div>

							<h2
								class="text-xl font-semibold tracking-tight text-foreground transition-colors group-hover:text-foreground/70"
							>
								{blog.title}
							</h2>

							<p class="line-clamp-2 leading-relaxed text-muted-foreground">
								{blog.body.substring(0, 200)}...
							</p>

							<div class="flex items-center justify-between pt-2">
								<div class="flex items-center gap-4 text-xs text-muted-foreground">
									<span class="flex items-center gap-1.5">
										<ThumbsUp class="h-3.5 w-3.5" />
										{blog.likes}
									</span>
									<span class="flex items-center gap-1.5">
										<MessageCircle class="h-3.5 w-3.5" />
										{blog.commentCount}
									</span>
								</div>
								<span
									class="flex items-center gap-1.5 text-sm font-medium text-foreground opacity-0 transition-opacity group-hover:opacity-100"
								>
									Read more
									<ArrowRight class="h-4 w-4" />
								</span>
							</div>
						</a>
					</article>
				{:else}
					<div class="flex flex-col items-center justify-center py-16 text-center">
						<div class="mb-4 rounded-full bg-muted p-4">
							<BookOpen class="h-8 w-8 text-muted-foreground" />
						</div>
						<p class="text-muted-foreground">No blog posts yet.</p>
					</div>
				{/each}
			</div>
			{#if hasPrevPage || hasNextPage}
				<div class="mt-8 flex items-center justify-end gap-2 border-t border-border/40 pt-6">
					<Button
						variant="outline"
						size="sm"
						onclick={() => goToPage(false)}
						disabled={!hasPrevPage}
					>
						<ChevronLeft class="mr-1 h-4 w-4" />
						Previous
					</Button>
					<Button
						variant="outline"
						size="sm"
						onclick={() => goToPage(true)}
						disabled={!hasNextPage}
					>
						Next
						<ChevronRight class="ml-1 h-4 w-4" />
					</Button>
				</div>
			{/if}
		{/if}
	</div>
</div>
