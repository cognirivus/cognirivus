<script lang="ts">
	import { page } from '$app/state';
	import { useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import type { Id } from '../../../convex/_generated/dataModel';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';
	import { Markdown } from '$lib/components/prompt-kit/markdown/index.js';
	import { Calendar, ChevronLeft } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';

	const id = $derived(page.params.id as Id<'blogs'>);
	const blogQuery = useQuery(api.blogs.get, () => ({ id }));
	const blogsQuery = useQuery(api.blogs.list, { onlyPublished: true });

	const otherBlogs = $derived(blogsQuery.data?.filter((b) => b._id !== id).slice(0, 5) ?? []);

	function formatDate(date: number) {
		return new Intl.DateTimeFormat('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		}).format(date);
	}
</script>

<div class="min-h-screen bg-background p-6">
	<div class="mx-auto max-w-6xl">
		<div class="mb-8">
			<Button variant="ghost" size="sm" class="gap-2" href="/blog">
				<ChevronLeft class="h-4 w-4" />
				Back to blog
			</Button>
		</div>

		{#if blogQuery.isLoading}
			<div class="flex h-64 items-center justify-center">
				<Loader variant="circular" size="lg" />
			</div>
		{:else if blogQuery.error}
			<div class="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-destructive">
				Failed to load the blog post.
			</div>
		{:else if blogQuery.data}
			{@const blog = blogQuery.data}
			<div class="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_300px]">
				<article>
					<header class="mb-8">
						<div class="flex items-center gap-2 text-sm text-muted-foreground">
							<Calendar class="h-4 w-4" />
							{formatDate(blog.createdAt)}
						</div>
						<h1 class="mt-4 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
							{blog.title}
						</h1>
					</header>

					<div class="prose prose-neutral dark:prose-invert max-w-none">
						<Markdown content={blog.content} />
					</div>
				</article>

				<aside class="space-y-8">
					<div>
						<h3 class="mb-4 text-sm font-bold tracking-wider text-muted-foreground uppercase">
							Recent Posts
						</h3>
						<div class="space-y-6">
							{#each otherBlogs as other}
								<a href="/blog/{other._id}" class="group block space-y-2">
									<p class="text-xs text-muted-foreground">{formatDate(other.createdAt)}</p>
									<h4
										class="text-sm leading-tight font-bold transition-colors group-hover:text-primary"
									>
										{other.title}
									</h4>
								</a>
							{:else}
								<p class="text-sm text-muted-foreground">No other posts yet.</p>
							{/each}
						</div>
					</div>

					<div class="rounded-2xl border border-border bg-card p-6">
						<h3 class="text-sm font-bold">Stay Updated</h3>
						<p class="mt-2 text-xs text-muted-foreground">
							Explore our latest features and platform updates as we build the future of AI chat.
						</p>
					</div>
				</aside>
			</div>
		{:else}
			<div class="flex h-32 items-center justify-center text-muted-foreground">
				Blog post not found.
			</div>
		{/if}
	</div>
</div>
