<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { Lock, Globe, Users, PenLine, FileUp, Loader2, Send } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import ImportBookmarks from '$lib/components/ImportBookmarks.svelte';

	const client = useConvexClient();
	const meQuery = useQuery(api.auth.getCurrentUser, {});
	const communitiesQuery = useQuery((api as any).communities.listPublic, { limit: 100 });

	let activeTab = $state('create');
	let type = $state<'text' | 'link' | 'media'>('text');
	let title = $state('');
	let body = $state('');
	let url = $state('');
	let visibility = $state<'public' | 'private'>('private');
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
				visibility,
				body: body || undefined,
				url: url || undefined,
				communityId: (visibility === 'public' && communityId) || undefined
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

	const visibilityOptions = [
		{ value: 'private', label: 'Private', icon: Lock, description: 'Your feed only' },
		{ value: 'public', label: 'Public', icon: Globe, description: 'Global feed' },
		{ value: 'community', label: 'Community', icon: Users, description: 'A community' }
	] as const;

	const postTypes = [
		{ value: 'text', label: 'Text', description: 'Write a text post' },
		{ value: 'link', label: 'Link', description: 'Share a URL' },
		{ value: 'media', label: 'Media', description: 'Upload media' }
	] as const;

	const activeVisibility = $derived(
		visibility === 'public' && communityId ? 'community' : visibility
	);
</script>

<main class="mx-auto w-full max-w-3xl overflow-x-hidden px-4 py-8 sm:px-6">
	<!-- Header -->
	<div class="mb-6">
		<h1 class="text-2xl font-semibold tracking-tight">Submit</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			Create a post or import bookmarks into your knowledge feed.
		</p>
	</div>

	<!-- Tabs -->
	<Tabs bind:value={activeTab} class="w-full">
		<TabsList class="mb-6 grid w-full grid-cols-2">
			<TabsTrigger value="create" class="gap-2">
				<PenLine class="size-4" />
				Create Post
			</TabsTrigger>
			<TabsTrigger value="import" class="gap-2">
				<FileUp class="size-4" />
				Import Bookmarks
			</TabsTrigger>
		</TabsList>

		<!-- Create Post Tab -->
		<TabsContent value="create">
			<form
				class="space-y-6 rounded-xl border border-border bg-card p-4 sm:p-6"
				onsubmit={submitPost}
			>
				<!-- Visibility -->
				<fieldset class="space-y-3">
					<Label class="text-sm font-medium">Visibility</Label>
					<div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
						{#each visibilityOptions as opt (opt.value)}
							{@const isActive = activeVisibility === opt.value}
							<button
								type="button"
								class="flex flex-col items-center gap-1.5 rounded-lg border-2 px-3 py-3 text-center transition-all
									{isActive
									? 'border-primary bg-primary/5 text-primary'
									: 'border-transparent bg-muted/40 text-muted-foreground hover:border-border hover:bg-muted/60'}"
								onclick={() => {
									if (opt.value === 'private') {
										visibility = 'private';
										communityId = '';
									} else if (opt.value === 'public') {
										visibility = 'public';
										communityId = '';
									} else {
										visibility = 'public';
										if (!communityId && (communitiesQuery.data?.length ?? 0) > 0) {
											communityId = communitiesQuery.data![0]._id;
										}
									}
								}}
							>
								<opt.icon class="size-5" />
								<span class="text-sm font-medium">{opt.label}</span>
								<span class="text-[11px] leading-tight opacity-70">{opt.description}</span>
							</button>
						{/each}
					</div>
				</fieldset>

				<!-- Community selector -->
				{#if activeVisibility === 'community' && (communitiesQuery.data?.length ?? 0) > 0}
					<div class="space-y-2">
						<Label for="community">Community</Label>
						<select
							id="community"
							bind:value={communityId}
							class="h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
						>
							{#each communitiesQuery.data ?? [] as c (c._id)}
								<option value={c._id}>{c.name} (c/{c.slug})</option>
							{/each}
						</select>
					</div>
				{/if}

				<!-- Post Type -->
				<fieldset class="space-y-3">
					<Label class="text-sm font-medium">Post Type</Label>
					<div class="flex gap-2">
						{#each postTypes as pt (pt.value)}
							{@const isActive = type === pt.value}
							<button
								type="button"
								class="rounded-lg px-4 py-2 text-sm font-medium transition-all
									{isActive
									? 'bg-foreground text-background shadow-sm'
									: 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'}"
								onclick={() => (type = pt.value)}
							>
								{pt.label}
							</button>
						{/each}
					</div>
				</fieldset>

				<!-- Title -->
				<div class="space-y-2">
					<Label for="title">Title</Label>
					<Input
						id="title"
						bind:value={title}
						required
						maxlength={220}
						placeholder="Give your post a descriptive title"
					/>
				</div>

				<!-- URL (link type) -->
				{#if type === 'link'}
					<div class="space-y-2">
						<Label for="url">URL</Label>
						<Input
							id="url"
							type="url"
							bind:value={url}
							required
							placeholder="https://example.com/article"
						/>
					</div>
				{/if}

				<!-- Body (text/media types) -->
				{#if type !== 'link'}
					<div class="space-y-2">
						<Label for="body">Body</Label>
						<Textarea
							id="body"
							bind:value={body}
							rows={8}
							required
							placeholder="Write your content here..."
						/>
						<p class="text-xs text-muted-foreground">
							Content up to 1,000 characters is stored inline. Larger content uses R2 storage
							automatically.
						</p>
					</div>
				{/if}

				<!-- Actions -->
				<div class="flex items-center gap-3 border-t border-border pt-5">
					<Button type="submit" disabled={submitting} class="gap-2">
						{#if submitting}
							<Loader2 class="size-4 animate-spin" />
							Publishing...
						{:else}
							<Send class="size-4" />
							Publish
						{/if}
					</Button>
					<Button type="button" variant="ghost" href="/feed">Cancel</Button>
				</div>
			</form>
		</TabsContent>

		<!-- Import Bookmarks Tab -->
		<TabsContent value="import">
			<div class="space-y-5 rounded-xl border border-border bg-card p-4 sm:p-6">
				<div class="space-y-1">
					<h2 class="text-base font-semibold">Import Chrome Bookmarks</h2>
					<p class="text-sm text-muted-foreground">
						Import your Chrome bookmarks directly into your private feed. Export your bookmarks from
						Chrome as an HTML file, then upload it here.
					</p>
				</div>

				<!-- Steps -->
				<div class="grid gap-3 sm:grid-cols-3">
					<div class="rounded-lg bg-muted/40 p-4">
						<div
							class="mb-2 flex size-7 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background"
						>
							1
						</div>
						<p class="text-sm font-medium">Export from Chrome</p>
						<p class="mt-0.5 text-xs text-muted-foreground">
							Open Chrome → Bookmarks → Bookmark Manager → ⋮ → Export bookmarks
						</p>
					</div>
					<div class="rounded-lg bg-muted/40 p-4">
						<div
							class="mb-2 flex size-7 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background"
						>
							2
						</div>
						<p class="text-sm font-medium">Upload HTML file</p>
						<p class="mt-0.5 text-xs text-muted-foreground">
							Select the exported .html file using the button below
						</p>
					</div>
					<div class="rounded-lg bg-muted/40 p-4">
						<div
							class="mb-2 flex size-7 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background"
						>
							3
						</div>
						<p class="text-sm font-medium">Review & import</p>
						<p class="mt-0.5 text-xs text-muted-foreground">
							Preview, filter, and select which bookmarks to import
						</p>
					</div>
				</div>

				<!-- Upload area -->
				<div class="flex flex-col items-center gap-4 rounded-lg border-2 border-dashed border-border bg-muted/20 px-4 py-8 sm:px-6 sm:py-10 text-center">
					<div class="flex size-12 items-center justify-center rounded-full bg-muted">
						<FileUp class="size-6 text-muted-foreground" />
					</div>
					<div class="space-y-1">
						<p class="text-sm font-medium">Upload your bookmarks file</p>
						<p class="text-xs text-muted-foreground">HTML files exported from Chrome, Firefox, or Edge</p>
					</div>
					<ImportBookmarks />
				</div>
			</div>
		</TabsContent>
	</Tabs>
</main>
