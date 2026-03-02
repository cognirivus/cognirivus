<script lang="ts">
	import { page } from '$app/state';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import {
		Lock,
		Globe,
		Users,
		Trash2,
		ExternalLink,
		MessageSquare,
		ThumbsUp,
		Calendar,
		ArrowLeft
	} from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	const auth = useAuth();
	const client = useConvexClient();
	const username = $derived(page.params.username);

	const currentUserQuery = useQuery(api.auth.getCurrentUser, {});
	const isAuthorized = $derived(
		auth.isAuthenticated && currentUserQuery.data?.username === username
	);

	const feedQuery = useQuery(api.feed.listGlobal, () =>
		isAuthorized
			? {
					scope: 'me' as const,
					tab: 'new' as const,
					paginationOpts: { numItems: 50, cursor: null }
				}
			: 'skip'
	);

	async function deletePost(postId: any) {
		if (!confirm('Are you sure you want to delete this post? This action cannot be undone.'))
			return;
		try {
			await client.mutation(api.posts.deletePost, { postId });
			toast.success('Post deleted successfully');
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to delete post');
		}
	}
</script>

<main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
	<div class="mx-auto w-full max-w-4xl">
		<div class="mb-6 flex items-center justify-between">
			<div class="flex items-center gap-4">
				<Button variant="ghost" size="icon" href="/u/{username}">
					<ArrowLeft class="size-5" />
				</Button>
				<div>
					<h1 class="text-2xl font-semibold tracking-tight">Manage Your Posts</h1>
					<p class="text-sm text-muted-foreground">
						Review and delete your content across all visibilities.
					</p>
				</div>
			</div>
		</div>

		{#if !auth.isAuthenticated || (currentUserQuery.data && !isAuthorized)}
			<Card class="border-destructive/20 bg-destructive/5 text-destructive">
				<CardContent class="py-10 text-center">
					<p class="font-medium">You are not authorized to manage these posts.</p>
					<Button variant="outline" class="mt-4" href="/u/{username}">Go back to profile</Button>
				</CardContent>
			</Card>
		{:else if feedQuery.isLoading}
			<div class="flex h-40 items-center justify-center">
				<p class="text-sm text-muted-foreground italic">Loading your posts...</p>
			</div>
		{:else if (feedQuery.data?.page?.length ?? 0) === 0}
			<Card class="bg-muted/30">
				<CardContent class="py-20 text-center">
					<p class="text-muted-foreground italic">You haven't posted anything yet.</p>
					<Button variant="default" class="mt-4" href="/submit">Create your first post</Button>
				</CardContent>
			</Card>
		{:else}
			<div class="space-y-4">
				{#each feedQuery.data?.page ?? [] as post (post._id)}
					<Card class="group transition-all hover:border-primary/30">
						<CardContent class="p-4">
							<div class="flex items-start justify-between gap-4">
								<div class="min-w-0 flex-1">
									<div class="mb-1 flex items-center gap-2">
										{#if post.visibility === 'private'}
											<Badge
												variant="outline"
												class="h-5 gap-1 border-muted-foreground/30 bg-muted/20 text-[10px] text-muted-foreground"
											>
												<Lock class="size-3" />
												Private
											</Badge>
										{:else if post.communitySlug}
											<Badge variant="outline" class="h-5 gap-1 text-[10px]">
												<Users class="size-3" />
												c/{post.communitySlug}
											</Badge>
										{:else}
											<Badge variant="outline" class="h-5 gap-1 text-[10px]">
												<Globe class="size-3" />
												Public
											</Badge>
										{/if}
										<span class="flex items-center gap-1 text-[10px] text-muted-foreground">
											<Calendar class="size-3" />
											{new Date(post.createdAt).toLocaleDateString()}
										</span>
									</div>
									<a
										href="/post/{post._id}"
										class="block truncate text-base font-semibold hover:underline"
									>
										{post.title}
									</a>
									<p class="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
										{post.snippet}
									</p>
									<div class="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
										<span class="flex items-center gap-1">
											<MessageSquare class="size-3.5" />
											{post.commentCount}
										</span>
										<span class="flex items-center gap-1">
											<ThumbsUp class="size-3.5" />
											{post.score}
										</span>
										{#if post.type === 'link' && post.url}
											<a
												href={post.url}
												target="_blank"
												rel="noreferrer"
												class="flex items-center gap-1 hover:text-primary hover:underline"
											>
												<ExternalLink class="size-3.5" />
												Visit Link
											</a>
										{/if}
									</div>
								</div>
								<Button
									variant="ghost"
									size="icon"
									class="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
									onclick={() => deletePost(post._id)}
									title="Delete post"
								>
									<Trash2 class="size-4" />
								</Button>
							</div>
						</CardContent>
					</Card>
				{/each}
			</div>
		{/if}
	</div>
</main>
