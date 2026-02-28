<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import { toast } from 'svelte-sonner';

	const client = useConvexClient();
	const meQuery = useQuery(api.auth.getCurrentUser, {});
	const communitiesQuery = useQuery((api as any).communities.listPublic, { limit: 100 });

	let type = $state<'text' | 'link' | 'media'>('text');
	let title = $state('');
	let body = $state('');
	let url = $state('');
	let communityId = $state('');
	let submitting = $state(false);

	$effect(() => {
		if (!meQuery.isLoading && !meQuery.data) {
			goto(`/signin?redirectTo=${encodeURIComponent(page.url.pathname + page.url.search)}`);
		}
	});

	async function submitPost(event: Event) {
		event.preventDefault();
		submitting = true;
		try {
			const postId = await client.action((api as any).posts.create, {
				type,
				title,
				body: body || undefined,
				url: url || undefined,
				communityId: communityId || undefined
			});
			toast.success('Post created');
			goto(`/post/${postId}`);
		} catch (error: any) {
			const message = error?.message ?? 'Failed to create post';
			if (message.includes('/settings/username')) {
				toast.error('Set your username first');
				goto('/settings/username');
				return;
			}
			toast.error(message);
		} finally {
			submitting = false;
		}
	}
</script>

<main class="mx-auto max-w-3xl px-4 py-6 sm:px-6">
	<h1 class="text-2xl font-semibold tracking-tight">Submit Post</h1>
	<p class="mt-1 text-sm text-muted-foreground">Share a knowledge post to the global feed or a community.</p>

	<form class="mt-6 space-y-4" onsubmit={submitPost}>
		<div class="space-y-2">
			<Label>Post Type</Label>
			<div class="flex gap-2">
				{#each ['text', 'link', 'media'] as t (t)}
					<Button type="button" variant={type === t ? 'default' : 'outline'} onclick={() => (type = t as any)}>{t}</Button>
				{/each}
			</div>
		</div>

		<div class="space-y-2">
			<Label for="title">Title</Label>
			<Input id="title" bind:value={title} required maxlength={220} />
		</div>

		{#if type === 'link'}
			<div class="space-y-2">
				<Label for="url">URL</Label>
				<Input id="url" type="url" bind:value={url} required />
			</div>
		{/if}

		{#if type !== 'link'}
			<div class="space-y-2">
				<Label for="body">Body</Label>
				<Textarea id="body" bind:value={body} rows={10} required />
				<p class="text-xs text-muted-foreground">
					Inline storage up to 1000 chars, larger content is stored in R2 automatically.
				</p>
			</div>
		{/if}

		<div class="space-y-2">
			<Label for="community">Community (optional)</Label>
			<select
				id="community"
				bind:value={communityId}
				class="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"
			>
				<option value="">Global feed only</option>
				{#each communitiesQuery.data ?? [] as c (c._id)}
					<option value={c._id}>{c.name} (c/{c.slug})</option>
				{/each}
			</select>
		</div>

		<div class="flex items-center gap-2">
			<Button type="submit" disabled={submitting}>{submitting ? 'Publishing...' : 'Publish'}</Button>
			<Button type="button" variant="outline" href="/feed">Cancel</Button>
		</div>
	</form>
</main>

