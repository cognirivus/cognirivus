<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '../../convex/_generated/api';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Calendar, ArrowRight, ThumbsUp, ThumbsDown, MessageCircle } from '@lucide/svelte';
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

<div class="min-h-screen bg-background p-6">
	<div class="mx-auto max-w-4xl">
		<header class="mb-12 space-y-4">
			<div>
				<h1 class="text-4xl font-bold tracking-tight text-foreground">Blog</h1>
				<p class="mt-2 text-lg text-muted-foreground">
					Latest updates, news, and insights from the Cognirivus team.
				</p>
			</div>
			<Separator />
		</header>

		{#if blogsQuery.isLoading}
			<div class="grid gap-8">
				{#each Array(3) as _}
					<Card.Root>
						<Card.Header>
							<Skeleton class="h-6 w-32" />
							<Skeleton class="mt-2 h-8 w-3/4" />
						</Card.Header>
						<Card.Content>
							<Skeleton class="h-4 w-full" />
							<Skeleton class="mt-2 h-4 w-full" />
							<Skeleton class="mt-2 h-4 w-2/3" />
						</Card.Content>
						<Card.Footer class="flex justify-between">
							<Skeleton class="h-4 w-32" />
							<Skeleton class="h-4 w-20" />
						</Card.Footer>
					</Card.Root>
				{/each}
			</div>
		{:else if blogsQuery.error}
			<div class="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-destructive">
				Failed to load blogs. Please try again later.
			</div>
		{:else if blogsQuery.data}
			<div class="grid gap-8">
				{#each blogsQuery.data as blog}
					<Card.Root class="group transition-all hover:shadow-md">
						<Card.Header>
							<div class="flex items-center gap-2">
								<Badge variant="secondary" class="gap-1">
									<Calendar class="h-3 w-3" />
									{formatDate(blog.createdAt)}
								</Badge>
							</div>
							<Card.Title class="text-2xl group-hover:text-primary">
								<a href="/blog/{blog._id}">
									{blog.title}
								</a>
							</Card.Title>
						</Card.Header>
						<Card.Content>
							<Card.Description class="line-clamp-3 text-base">
								{blog.body.substring(0, 200)}...
							</Card.Description>
						</Card.Content>
						<Card.Footer class="flex items-center justify-between">
							<div class="flex items-center gap-4 text-xs text-muted-foreground">
								<div class="flex items-center gap-1">
									<ThumbsUp class="h-3 w-3" />
									{blog.likes}
								</div>
								<div class="flex items-center gap-1">
									<ThumbsDown class="h-3 w-3" />
									{blog.dislikes}
								</div>
								<div class="flex items-center gap-1">
									<MessageCircle class="h-3 w-3" />
									{blog.commentCount}
								</div>
							</div>
							<Button
								variant="ghost"
								size="sm"
								class="gap-2 px-0 hover:bg-transparent hover:text-primary"
								href="/blog/{blog._id}"
							>
								Read more
								<ArrowRight class="h-4 w-4" />
							</Button>
						</Card.Footer>
					</Card.Root>
				{:else}
					<div class="flex h-32 items-center justify-center text-muted-foreground">
						No blog posts yet.
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
