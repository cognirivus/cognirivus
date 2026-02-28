<script lang="ts">
	import { goto } from '$app/navigation';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { toast } from 'svelte-sonner';

	const client = useConvexClient();
	const profileQuery = useQuery((api as any).profiles.getMyProfile, {});

	let username = $state('');
	let saving = $state(false);

	$effect(() => {
		if (profileQuery.data?.username && username === '') {
			username = profileQuery.data.username;
		}
	});

	async function save(event: Event) {
		event.preventDefault();
		saving = true;
		try {
			const result = await client.mutation((api as any).profiles.setUsername, { username });
			toast.success(`Username set: ${result.username}`);
			goto(`/u/${result.username}`);
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to set username');
		} finally {
			saving = false;
		}
	}
</script>

<main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
	<h1 class="text-2xl font-semibold tracking-tight">Username Setup</h1>
	<p class="mt-1 text-sm text-muted-foreground">
		Username is immutable once set. Allowed format: <code>[a-z0-9_]&#123;3,20&#125;</code>
	</p>

	{#if profileQuery.isLoading}
		<p class="mt-4 text-sm text-muted-foreground">Loading profile...</p>
	{:else}
		<form class="mx-auto mt-5 max-w-3xl space-y-3 rounded-xl border border-border bg-card p-5" onsubmit={save}>
			<div class="space-y-2">
				<Label for="username">Username</Label>
				<Input id="username" bind:value={username} required minlength={3} maxlength={20} disabled={!!profileQuery.data?.username} />
			</div>
			<div class="flex gap-2">
				<Button type="submit" disabled={saving || !!profileQuery.data?.username}>
					{profileQuery.data?.username ? 'Username Locked' : saving ? 'Saving...' : 'Set Username'}
				</Button>
				<Button type="button" variant="outline" href="/settings">Back</Button>
			</div>
		</form>
	{/if}
</main>

