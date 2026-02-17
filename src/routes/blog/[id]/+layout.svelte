<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import { Calendar, ThumbsUp, ThumbsDown, MessageCircle } from '@lucide/svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';

	let { children } = $props();
	const skeletonRows = [0, 1, 2];

	const blogsQuery = useQuery(api.blogs.list, { onlyPublished: true, limit: 30 });
	const currentId = $derived(page.params.id);
	const otherBlogs = $derived(
		blogsQuery.data?.filter((b) => b._id !== currentId).slice(0, 5) ?? []
	);

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
		<div class="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_300px]">
			<main>
				{@render children()}
			</main>

			<aside class="sticky top-20 self-start lg:block">
				<h3 class="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
					<span
						class="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary"
					>
						<Calendar class="h-3.5 w-3.5" />
					</span>
					Recent Posts
				</h3>
				<div class="space-y-1">
					{#if blogsQuery.isLoading}
						{#each skeletonRows as row (row)}
							<Skeleton class="h-20 w-full rounded-lg" />
						{/each}
					{:else}
						{#each otherBlogs as other (other._id)}
							<a
								href={resolve(`/blog/${other._id}`)}
								class="group flex flex-col gap-2 rounded-lg p-3 transition-colors hover:bg-muted/50 {currentId ===
								other._id
									? 'bg-muted'
									: ''}"
							>
								<h4
									class="line-clamp-2 text-sm leading-snug font-medium text-foreground transition-colors group-hover:text-primary"
								>
									{other.title}
								</h4>

								<div class="flex items-center justify-between">
									<span class="text-[11px] text-muted-foreground">
										{formatDate(other.createdAt)}
									</span>

									<div class="flex items-center gap-3 text-muted-foreground">
										<span class="flex items-center gap-1" title="Likes">
											<ThumbsUp class="h-3 w-3" />
											<span class="text-[10px]">{other.likes}</span>
										</span>
										<span class="flex items-center gap-1" title="Dislikes">
											<ThumbsDown class="h-3 w-3" />
											<span class="text-[10px]">{other.dislikes}</span>
										</span>
										<span class="flex items-center gap-1" title="Comments">
											<MessageCircle class="h-3 w-3" />
											<span class="text-[10px]">{other.commentCount}</span>
										</span>
									</div>
								</div>
							</a>
						{:else}
							<p class="py-4 text-center text-sm text-muted-foreground">No other posts yet.</p>
						{/each}
					{/if}
				</div>
			</aside>
		</div>
	</div>
</div>
