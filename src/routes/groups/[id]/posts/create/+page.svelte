<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Loader } from '$lib/components/prompt-kit/loader';
	import { GROUP_POST_LIMITS, validateGroupPostInput } from '$lib/utils/groupPostValidation';
	import { ArrowLeft, PenSquare, Save } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	const client = useConvexClient();
	const groupId = $derived(page.params.id as Id<'groups'>);

	let title = $state('');
	let body = $state('');
	let tagsInput = $state('');
	let isSaving = $state(false);
	let error = $state('');

	const validation = $derived(validateGroupPostInput({ title, body, tagsInput }));
	const titleLength = $derived(title.trim().length);
	const bodyLength = $derived(body.trim().length);
	const canSubmit = $derived(!isSaving && validation.isValid);

	async function handleSubmit(event: Event) {
		event.preventDefault();
		if (isSaving) return;

		const validated = validateGroupPostInput({ title, body, tagsInput });
		if (!validated.isValid) {
			return;
		}

		error = '';
		isSaving = true;

		try {
			const postId: Id<'group_posts'> = await client.action((api as any).group_posts.create, {
				groupId,
				title: validated.title,
				body: validated.body,
				tags: validated.tags
			});

			toast.success('Post published');
			goto(resolve(`/groups/${groupId}/post/${postId}`));
		} catch (e: any) {
			const message = e?.message || 'Failed to publish post';
			error = message;
			toast.error(message);
		} finally {
			isSaving = false;
		}
	}
</script>

<svelte:head>
	<title>Create Post - Group</title>
</svelte:head>

<div class="mx-auto max-w-4xl px-4 py-8 sm:px-6">
	<div class="mb-6">
		<Button
			variant="ghost"
			size="sm"
			class="h-9 gap-2 px-3"
			href={resolve(`/groups/${groupId}?view=posts`)}
		>
			<ArrowLeft class="h-4 w-4" />
			Back to Posts
		</Button>
	</div>

	<div class="overflow-hidden rounded-xl border bg-card shadow-sm">
		<div class="border-b bg-muted/30 px-6 py-4">
			<div class="flex items-center gap-3">
				<div class="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
					<PenSquare class="h-4 w-4" />
				</div>
				<div>
					<h1 class="text-lg font-semibold">Create Group Post</h1>
					<p class="text-xs text-muted-foreground">
						Write in markdown and add comma-separated tags.
					</p>
				</div>
			</div>
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
						Use letters, numbers, spaces, and hyphens only. Max {GROUP_POST_LIMITS.TAG_MAX_LENGTH}
						characters per tag.
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
						onclick={() => goto(resolve(`/groups/${groupId}?view=posts`))}
						disabled={isSaving}
						class="w-full sm:w-auto"
					>
						Cancel
					</Button>
					<Button type="submit" disabled={!canSubmit} class="w-full gap-2 sm:w-auto">
						{#if isSaving}
							<Loader variant="circular" size="sm" />
							Publishing...
						{:else}
							<Save class="h-4 w-4" />
							Publish Post
						{/if}
					</Button>
				</div>
			</form>
		</div>
	</div>
</div>
