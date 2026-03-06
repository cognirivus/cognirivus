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
	import ImportBookmarks from '$lib/components/ImportBookmarks.svelte';
	import {
		Bookmark,
		Globe,
		Link,
		Loader2,
		Lock,
		PenLine,
		Rss,
		Send,
		Users,
		Youtube,
		FileUp
	} from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

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

	let sourceType = $state<'website' | 'rss' | 'youtube' | 'bookmarks'>('website');
	let sourceInput = $state('');
	let sourceTitle = $state('');
	let addingSource = $state(false);
	let saveUrl = $state('');
	let saveTitle = $state('');
	let savingLink = $state(false);

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

	async function submitSource(event: Event) {
		event.preventDefault();
		if (sourceType === 'bookmarks') {
			return;
		}
		addingSource = true;
		try {
			const result = await client.action((api as any).sources.addSource, {
				type: sourceType,
				inputUrlOrId: sourceInput,
				title: sourceTitle || undefined
			});
			const status = result?.subscriptionStatus as 'active' | 'already_subscribed' | undefined;
			if (status === 'already_subscribed' && result?.savedSeedItemId) {
				toast.success('Source already followed. Article saved to your private links.');
			} else if (status === 'already_subscribed') {
				toast.info('You are already subscribed to this source.');
			} else if (result?.savedSeedItemId) {
				toast.success('Source followed. The pasted article was also saved privately.');
			} else {
				toast.success('Source subscribed. Sync job queued.');
			}
			sourceInput = '';
			sourceTitle = '';
			goto('/feed?scope=you');
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to add source');
		} finally {
			addingSource = false;
		}
	}

	async function saveLink(event: Event) {
		event.preventDefault();
		savingLink = true;
		try {
			const result = await client.mutation((api as any).sources.saveWebsiteLink, {
				url: saveUrl,
				title: saveTitle || undefined
			});
			if (result.alreadySaved) {
				toast.info('This link is already saved.');
			} else {
				toast.success('Link saved to your private feed.');
			}
			saveUrl = '';
			saveTitle = '';
			goto('/feed?scope=you');
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to save link');
		} finally {
			savingLink = false;
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

	const sourceTypes = [
		{ value: 'website', label: 'Website', icon: Globe, description: 'Follow a site or feed' },
		{ value: 'rss', label: 'RSS', icon: Rss, description: 'Track a feed URL' },
		{ value: 'youtube', label: 'YouTube', icon: Youtube, description: 'Track a channel/page URL' },
		{ value: 'bookmarks', label: 'Bookmarks', icon: FileUp, description: 'Import bookmarks file' }
	] as const;

	const activeVisibility = $derived(
		visibility === 'public' && communityId ? 'community' : visibility
	);
</script>

<main class="mx-auto w-full max-w-3xl overflow-x-hidden px-4 py-8 sm:px-6">
	<div class="mb-6">
		<h1 class="text-2xl font-semibold tracking-tight">Submit</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			Create a post, save a link privately, or follow a source for future updates.
		</p>
	</div>

	<Tabs bind:value={activeTab} class="w-full">
		<TabsList class="mb-6 grid w-full grid-cols-3">
			<TabsTrigger value="create" class="gap-2">
				<PenLine class="size-4" />
				Create Post
			</TabsTrigger>
			<TabsTrigger value="save" class="gap-2">
				<Bookmark class="size-4" />
				Save Link
			</TabsTrigger>
			<TabsTrigger value="source" class="gap-2">
				<Link class="size-4" />
				Add Source
			</TabsTrigger>
		</TabsList>

		<TabsContent value="create">
			<form
				class="space-y-6 rounded-xl border border-border bg-card p-4 sm:p-6"
				onsubmit={submitPost}
			>
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

		<TabsContent value="save">
			<form
				class="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6"
				onsubmit={saveLink}
			>
				<div class="space-y-1">
					<h2 class="text-base font-semibold">Save a Website Link</h2>
					<p class="text-sm text-muted-foreground">
						Store the exact page privately. This does not create a post.
					</p>
				</div>

				<div class="space-y-2">
					<Label for="saveUrl">Link URL</Label>
					<Input
						id="saveUrl"
						type="url"
						bind:value={saveUrl}
						required
						placeholder="https://example.com/article"
					/>
				</div>

				<div class="space-y-2">
					<Label for="saveTitle">Custom Title (optional)</Label>
					<Input
						id="saveTitle"
						bind:value={saveTitle}
						maxlength={220}
						placeholder="Override the saved title"
					/>
				</div>

				<div class="flex items-center gap-3 border-t border-border pt-4">
					<Button type="submit" disabled={savingLink} class="gap-2">
						{#if savingLink}
							<Loader2 class="size-4 animate-spin" />
							Saving...
						{:else}
							<Bookmark class="size-4" />
							Save Link
						{/if}
					</Button>
					<Button type="button" variant="ghost" href="/feed?scope=you">Go to My Feed</Button>
				</div>
			</form>
		</TabsContent>

		<TabsContent value="source">
			<div class="space-y-5 rounded-xl border border-border bg-card p-4 sm:p-6">
				<div class="space-y-1">
					<h2 class="text-base font-semibold">Add a Source</h2>
					<p class="text-sm text-muted-foreground">
						Follow websites, feeds, or channels for future updates. Pasting an article URL follows
						the site and saves that article privately.
					</p>
				</div>

				<fieldset class="space-y-3">
					<Label class="text-sm font-medium">Source Type</Label>
					<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
						{#each sourceTypes as st (st.value)}
							{@const isActive = sourceType === st.value}
							<button
								type="button"
								class="flex items-center gap-3 rounded-lg border px-3 py-3 text-left transition-all
									{isActive ? 'border-primary bg-primary/5' : 'border-border bg-muted/20 hover:bg-muted/40'}"
								onclick={() => (sourceType = st.value)}
							>
								<st.icon class="size-4 shrink-0" />
								<div>
									<p class="text-sm font-medium">{st.label}</p>
									<p class="text-xs text-muted-foreground">{st.description}</p>
								</div>
							</button>
						{/each}
					</div>
				</fieldset>

				{#if sourceType === 'bookmarks'}
					<div class="rounded-lg border border-dashed border-border bg-muted/20 p-4">
						<p class="mb-3 text-sm text-muted-foreground">
							Import your browser bookmarks as source items. This no longer creates posts directly.
						</p>
						<ImportBookmarks />
					</div>
				{:else}
					<form class="space-y-4" onsubmit={submitSource}>
						<div class="space-y-2">
							<Label for="sourceInput">Source URL</Label>
							<Input
								id="sourceInput"
								bind:value={sourceInput}
								required
								placeholder={sourceType === 'rss'
									? 'https://example.com/feed.xml'
									: sourceType === 'youtube'
										? 'https://www.youtube.com/@channel'
										: 'https://example.com/article'}
							/>
						</div>
						<div class="space-y-2">
							<Label for="sourceTitle">Custom Title (optional)</Label>
							<Input
								id="sourceTitle"
								bind:value={sourceTitle}
								maxlength={220}
								placeholder="Override displayed source title"
							/>
						</div>
						<div class="flex items-center gap-3 border-t border-border pt-4">
							<Button type="submit" disabled={addingSource} class="gap-2">
								{#if addingSource}
									<Loader2 class="size-4 animate-spin" />
									Adding...
								{:else}
									<Link class="size-4" />
									Subscribe Source
								{/if}
							</Button>
							<Button type="button" variant="ghost" href="/feed?scope=you">Go to My Feed</Button>
						</div>
					</form>
				{/if}
			</div>
		</TabsContent>
	</Tabs>
</main>
