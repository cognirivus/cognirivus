<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Loader } from '$lib/components/prompt-kit/loader';
	import { GROUP_POST_LIMITS, validateGroupPostInput } from '$lib/utils/groupPostValidation';
	import { ArrowLeft, Save } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	const client = useConvexClient();
	const groupId = $derived(page.params.id as Id<'groups'>);
	const postId = $derived(page.params.postId as Id<'group_posts'>);

	const postQuery = useQuery((api as any).group_posts.get, () =>
		postId ? { groupId, postId } : 'skip'
	);
	const post = $derived(postQuery.data);

	let hydratedPostId = $state<Id<'group_posts'> | null>(null);
	let bodyFetchToken = 0;

	let title = $state('');
	let body = $state('');
	let tagsInput = $state('');
	let isHydratingBody = $state(false);
	let isSaving = $state(false);
	let error = $state('');
	const validation = $derived(validateGroupPostInput({ title, body, tagsInput }));
	const titleLength = $derived(title.trim().length);
	const bodyLength = $derived(body.trim().length);
	const canSubmit = $derived(
		!isSaving && !isHydratingBody && !!post?.canDelete && validation.isValid
	);

	$effect(() => {
		const currentPost = post;
		if (!currentPost || hydratedPostId === currentPost._id) return;

		hydratedPostId = currentPost._id;
		title = currentPost.title;
		body = currentPost.snippet ?? '';
		tagsInput = currentPost.tags.join(', ');
		isHydratingBody = false;

		if (!browser || !currentPost.bodyUrl) return;

		const fetchToken = ++bodyFetchToken;
		isHydratingBody = true;

		void (async () => {
			try {
				const response = await fetch(currentPost.bodyUrl!);
				if (!response.ok) {
					throw new Error(`Failed to fetch post body (${response.status})`);
				}

				const fullBody = await response.text();
				if (fetchToken === bodyFetchToken && fullBody.trim().length > 0) {
					body = fullBody;
				}
			} catch (e) {
				console.error('Failed to load full post body for edit:', e);
			} finally {
				if (fetchToken === bodyFetchToken) {
					isHydratingBody = false;
				}
			}
		})();
	});

	async function handleSubmit(event: Event) {
		event.preventDefault();
		if (isSaving || !post?.canDelete) return;

		const validated = validateGroupPostInput({ title, body, tagsInput });
		if (!validated.isValid) {
			return;
		}

		error = '';
		isSaving = true;

		try {
			await client.action((api as any).group_posts.update, {
				groupId,
				postId,
				title: validated.title,
				body: validated.body,
				tags: validated.tags
			});

			toast.success('Post updated');
			goto(resolve(`/groups/${groupId}/post/${postId}`));
		} catch (e: any) {
			const message = e?.message || 'Failed to update post';
			error = message;
			toast.error(message);
		} finally {
			isSaving = false;
		}
	}
</script>

<svelte:head>
	<title>Edit Post - Group</title>
</svelte:head>

<div class="mx-auto max-w-4xl px-4 py-8 sm:px-6">
	<div class="mb-6">
		<Button
			variant="ghost"
			size="sm"
			class="h-9 gap-2 px-3"
			href={resolve(`/groups/${groupId}/post/${postId}`)}
		>
			<ArrowLeft class="h-4 w-4" />
			Back to Post
		</Button>
	</div>

	{#if postQuery.isLoading}
		<div class="flex h-[35vh] items-center justify-center">
			<Loader variant="circular" size="lg" />
		</div>
	{:else if !post}
		<div class="rounded-xl border bg-card p-8 text-center">
			<h2 class="text-xl font-semibold">Post not found</h2>
			<p class="mt-2 text-sm text-muted-foreground">This group post no longer exists.</p>
		</div>
	{:else if !post.canDelete}
		<div class="rounded-xl border bg-card p-8 text-center">
			<h2 class="text-xl font-semibold">You cannot edit this post</h2>
			<p class="mt-2 text-sm text-muted-foreground">
				Only the author or group moderators can edit it.
			</p>
		</div>
	{:else}
		<div class="overflow-hidden rounded-xl border bg-card shadow-sm">
			<div class="border-b bg-muted/30 px-6 py-4">
				<h1 class="text-lg font-semibold">Edit Group Post</h1>
				<p class="text-xs text-muted-foreground">Update markdown content and tags.</p>
			</div>

			<div class="p-6">
				<form class="space-y-6" onsubmit={handleSubmit}>
					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<label for="title" class="text-sm font-medium">Post title</label>
							<span
								class="text-xs {titleLength > GROUP_POST_LIMITS.TITLE_MAX
									? 'text-destructive'
									: 'text-muted-foreground'}"
							>
								{titleLength}/{GROUP_POST_LIMITS.TITLE_MAX}
							</span>
						</div>
						<Input
							id="title"
							bind:value={title}
							placeholder="Enter a clear title..."
							class="h-11 text-base font-medium"
							maxlength={GROUP_POST_LIMITS.TITLE_MAX}
							required
						/>
						{#if validation.fieldErrors.title}
							<p class="text-xs text-destructive">{validation.fieldErrors.title}</p>
						{/if}
					</div>

					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<label for="body" class="text-sm font-medium">Body (Markdown)</label>
							<div class="flex items-center gap-2">
								<Badge variant="outline" class="text-[10px] font-medium uppercase">Markdown</Badge>
								<span
									class="text-xs {bodyLength > GROUP_POST_LIMITS.BODY_MAX
										? 'text-destructive'
										: 'text-muted-foreground'}"
								>
									{bodyLength}/{GROUP_POST_LIMITS.BODY_MAX}
								</span>
							</div>
						</div>
						<Textarea
							id="body"
							bind:value={body}
							rows={14}
							placeholder="Write your markdown post..."
							class="min-h-[360px] resize-y p-4 font-mono text-sm leading-relaxed"
							maxlength={GROUP_POST_LIMITS.BODY_MAX}
							required
						/>
						{#if isHydratingBody}
							<p class="text-xs text-muted-foreground">Loading full post content from storage...</p>
						{/if}
						{#if validation.fieldErrors.body}
							<p class="text-xs text-destructive">{validation.fieldErrors.body}</p>
						{/if}
					</div>

					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<label for="tags" class="text-sm font-medium">Tags (comma separated)</label>
							<span class="text-xs text-muted-foreground">
								{validation.tags.length}/{GROUP_POST_LIMITS.TAGS_MAX}
							</span>
						</div>
						<Input
							id="tags"
							bind:value={tagsInput}
							placeholder="polity, economy, prelims"
							class="h-11"
						/>
						<p class="text-xs text-muted-foreground">
							Use letters, numbers, spaces, and hyphens only. Max
							{GROUP_POST_LIMITS.TAG_MAX_LENGTH} characters per tag.
						</p>
						{#if validation.fieldErrors.tags}
							<p class="text-xs text-destructive">{validation.fieldErrors.tags}</p>
						{/if}
					</div>

					{#if error}
						<div
							class="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
						>
							{error}
						</div>
					{/if}

					<div class="flex flex-col-reverse justify-end gap-3 border-t pt-6 sm:flex-row">
						<Button
							type="button"
							variant="outline"
							onclick={() => goto(resolve(`/groups/${groupId}/post/${postId}`))}
							disabled={isSaving}
							class="w-full sm:w-auto"
						>
							Cancel
						</Button>
						<Button type="submit" disabled={!canSubmit} class="w-full gap-2 sm:w-auto">
							{#if isSaving}
								<Loader variant="circular" size="sm" />
								Saving...
							{:else}
								<Save class="h-4 w-4" />
								Save Changes
							{/if}
						</Button>
					</div>
				</form>
			</div>
		</div>
	{/if}
</div>
