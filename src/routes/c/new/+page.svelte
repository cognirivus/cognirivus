<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toast } from 'svelte-sonner';

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
			goto(`/signin?redirectTo=${encodeURIComponent(page.url.pathname + page.url.search)}`);
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
			goto(`/c/${normalizeSlug(slug)}`);
		} catch (error: any) {
			const message = error?.message ?? 'Failed to create community';
			if (message.includes('/settings/username')) {
				toast.error('Set your username first');
				goto('/settings/username');
				return;
			}
			toast.error(message);
		} finally {
			creating = false;
		}
	}
</script>

<main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
	<h1 class="text-2xl font-semibold tracking-tight">Create Community</h1>
	<p class="mt-1 text-sm text-muted-foreground">
		Build a focused space for collaborative discussions. Default visibility is private.
	</p>

	<form class="mx-auto mt-6 max-w-3xl space-y-4 rounded-xl border border-border bg-card p-5" onsubmit={createCommunity}>
		<div class="space-y-2">
			<Label for="name">Name</Label>
			<Input id="name" bind:value={name} required maxlength={80} />
		</div>

		<div class="space-y-2">
			<Label for="slug">Slug</Label>
			<Input id="slug" bind:value={slug} required maxlength={32} placeholder="example-community" />
			<p class="text-xs text-muted-foreground">lowercase letters, numbers, and hyphens</p>
		</div>

		<div class="space-y-2">
			<Label for="description">Description</Label>
			<Textarea id="description" bind:value={description} rows={5} />
		</div>

		<div class="space-y-2">
			<Label>Visibility</Label>
			<div class="flex gap-2">
				<Button
					type="button"
					variant={visibility === 'private' ? 'default' : 'outline'}
					onclick={() => (visibility = 'private')}
				>
					Private
				</Button>
				<Button
					type="button"
					variant={visibility === 'public' ? 'default' : 'outline'}
					onclick={() => (visibility = 'public')}
				>
					Public
				</Button>
			</div>
		</div>

		<div class="flex items-center gap-2">
			<Button type="submit" disabled={creating}>
				{creating ? 'Creating...' : 'Create Community'}
			</Button>
			<Button type="button" variant="outline" href="/c">Cancel</Button>
		</div>
	</form>
</main>
