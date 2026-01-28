<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '../../convex/_generated/api';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Calendar, ArrowRight, ThumbsUp, MessageCircle, BookOpen } from '@lucide/svelte';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';

	const blogsQuery = useQuery(api.blogs.list, { onlyPublished: true });

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
				{#each Array(3) as _}
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
				{#each blogsQuery.data as blog, index}
					<article class="group border-b border-border/40 py-8 first:pt-0 last:border-0">
						<a href="/blog/{blog._id}" class="block space-y-3">
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
		{/if}
	</div>
</div>
