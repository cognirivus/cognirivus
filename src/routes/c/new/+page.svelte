<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toast } from 'svelte-sonner';
	import { ArrowLeft, Globe, Loader2, Lock, Plus } from '@lucide/svelte';

	const client = useConvexClient();
	const meQuery = useQuery(api.auth.getCurrentUser, {});

	let name = $state('');
	let slug = $state('');
	let description = $state('');
	let visibility = $state<'public' | 'private'>('private');
	let creating = $state(false);

	const normalizeSlug = (value: string) => value.trim().toLowerCase();

	$effect(() => {
		if (!meQuery.isLoading && !meQuery.data) {
			goto(
				`${resolve('/signin')}?redirectTo=${encodeURIComponent(page.url.pathname + page.url.search)}`
			);
		}
	});

	async function createCommunity(event: Event) {
		event.preventDefault();
		creating = true;
		try {
			await client.mutation((api as any).communities.create, {
				name,
				slug: normalizeSlug(slug),
				description: description || undefined,
				visibility
			});
			toast.success('Community created');
			goto(resolve(`/c/${normalizeSlug(slug)}`));
		} catch (error: any) {
			const message = error?.message ?? 'Failed to create community';
			if (message.includes('/profile')) {
				toast.error('Set your username first');
				goto(resolve('/profile'));
				return;
			}
			toast.error(message);
		} finally {
			creating = false;
		}
	}
</script>

<main class="mx-auto w-full max-w-3xl overflow-x-hidden px-4 py-8 sm:px-6">
	<!-- Header -->
	<div class="mb-6">
		<a
			href={resolve('/c')}
			class="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
		>
			<ArrowLeft class="size-4" />
			Back to Communities
		</a>
		<h1 class="text-2xl font-semibold tracking-tight">Create Community</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			Build a focused space for collaborative discussions.
		</p>
	</div>

	<!-- Form -->
	<form
		class="space-y-6 rounded-xl border border-border bg-card p-4 sm:p-6"
		onsubmit={createCommunity}
	>
		<!-- Visibility -->
		<fieldset class="space-y-3">
			<Label class="text-sm font-medium">Visibility</Label>
			<div class="grid grid-cols-2 gap-2">
				<button
					type="button"
					class="flex flex-col items-center gap-1.5 rounded-lg border-2 px-3 py-3 text-center transition-all
						{visibility === 'private'
						? 'border-primary bg-primary/5 text-primary'
						: 'border-transparent bg-muted/40 text-muted-foreground hover:border-border hover:bg-muted/60'}"
					onclick={() => (visibility = 'private')}
				>
					<Lock class="size-5" />
					<span class="text-sm font-medium">Private</span>
					<span class="text-[11px] leading-tight opacity-70">Invite-only access</span>
				</button>
				<button
					type="button"
					class="flex flex-col items-center gap-1.5 rounded-lg border-2 px-3 py-3 text-center transition-all
						{visibility === 'public'
						? 'border-primary bg-primary/5 text-primary'
						: 'border-transparent bg-muted/40 text-muted-foreground hover:border-border hover:bg-muted/60'}"
					onclick={() => (visibility = 'public')}
				>
					<Globe class="size-5" />
					<span class="text-sm font-medium">Public</span>
					<span class="text-[11px] leading-tight opacity-70">Anyone can join</span>
				</button>
			</div>
		</fieldset>

		<!-- Name -->
		<div class="space-y-2">
			<Label for="name">Name</Label>
			<Input
				id="name"
				bind:value={name}
				required
				maxlength={80}
				placeholder="My Awesome Community"
			/>
		</div>

		<!-- Slug -->
		<div class="space-y-2">
			<Label for="slug">Slug</Label>
			<Input
				id="slug"
				bind:value={slug}
				required
				maxlength={32}
				placeholder="my-awesome-community"
			/>
			<p class="text-xs text-muted-foreground">
				This will be your community URL:
				<span class="font-medium text-foreground">
					cognirivus.com/c/{normalizeSlug(slug) || 'your-slug'}
				</span>
			</p>
		</div>

		<!-- Description -->
		<div class="space-y-2">
			<Label for="description">Description</Label>
			<Textarea
				id="description"
				bind:value={description}
				rows={4}
				placeholder="What is this community about?"
			/>
		</div>

		<!-- Actions -->
		<div class="flex items-center gap-3 border-t border-border pt-5">
			<Button type="submit" disabled={creating} class="gap-2">
				{#if creating}
					<Loader2 class="size-4 animate-spin" />
					Creating...
				{:else}
					<Plus class="size-4" />
					Create Community
				{/if}
			</Button>
			<Button type="button" variant="ghost" href="/c">Cancel</Button>
		</div>
	</form>
</main>
