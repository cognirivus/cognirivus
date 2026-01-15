<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '../../convex/_generated/api';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Calendar, User, ArrowRight } from '@lucide/svelte';

	const blogsQuery = useQuery(api.blogs.list, { onlyPublished: true });

	function formatDate(date: number) {
		return new Intl.DateTimeFormat('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		}).format(date);
	}
</script>

<div class="min-h-screen bg-background p-6">
	<div class="mx-auto max-w-4xl">
		<header class="mb-12">
			<h1 class="text-4xl font-bold tracking-tight text-foreground">Blog</h1>
			<p class="mt-2 text-lg text-muted-foreground">
				Latest updates, news, and insights from the Cognirivus team.
			</p>
		</header>

		{#if blogsQuery.isLoading}
			<div class="flex h-64 items-center justify-center">
				<Loader variant="circular" size="lg" />
			</div>
		{:else if blogsQuery.error}
			<div class="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-destructive">
				Failed to load blogs. Please try again later.
			</div>
		{:else if blogsQuery.data}
			<div class="grid gap-8">
				{#each blogsQuery.data as blog}
					<article
						class="group relative flex flex-col items-start rounded-2xl border border-border bg-card p-6 transition-all hover:shadow-md"
					>
						<div class="flex items-center gap-4 text-xs text-muted-foreground">
							<div class="flex items-center gap-1">
								<Calendar class="h-3 w-3" />
								{formatDate(blog.createdAt)}
							</div>
						</div>
						<h2 class="mt-4 text-2xl font-bold text-foreground group-hover:text-primary">
							<a href="/blog/{blog._id}">
								{blog.title}
							</a>
						</h2>
						<p class="mt-4 line-clamp-3 text-muted-foreground">
							{blog.content.substring(0, 200)}...
						</p>
						<div class="mt-6">
							<Button
								variant="ghost"
								size="sm"
								class="gap-2 px-0 hover:bg-transparent hover:text-primary"
								href="/blog/{blog._id}"
							>
								Read more
								<ArrowRight class="h-4 w-4" />
							</Button>
						</div>
					</article>
				{:else}
					<div class="flex h-32 items-center justify-center text-muted-foreground">
						No blog posts yet.
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
