<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
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

	async function save(event: Event) {
		event.preventDefault();
		saving = true;
		try {
			const result = await client.mutation((api as any).profiles.setUsername, { username });
			toast.success(`Username set: ${result.username}`);
			goto(resolve('/'));
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to set username');
		} finally {
			saving = false;
		}
	}
</script>

<main
	class="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-6xl items-center px-4 py-6 sm:px-6"
>
	<section class="mx-auto w-full max-w-3xl rounded-2xl border border-border bg-card p-6 shadow-sm">
		<h1 class="text-2xl font-semibold tracking-tight">Finish your profile</h1>
		<p class="mt-2 text-sm text-muted-foreground">
			Choose a username to continue. It is immutable once set. Allowed format:
			<code>[a-z0-9_]&#123;3,20&#125;</code>
		</p>

		{#if profileQuery.isLoading}
			<p class="mt-4 text-sm text-muted-foreground">Loading profile...</p>
		{:else}
			<form class="mt-6 space-y-4" onsubmit={save}>
				<div class="space-y-2">
					<Label for="username">Username</Label>
					<Input
						id="username"
						value={profileQuery.data?.username ?? username}
						oninput={(event) => {
							username = event.currentTarget.value;
						}}
						required
						minlength={3}
						maxlength={20}
						disabled={!!profileQuery.data?.username}
						autocomplete="off"
					/>
				</div>
				<Button type="submit" disabled={saving || !!profileQuery.data?.username}>
					{profileQuery.data?.username ? 'Username Locked' : saving ? 'Saving...' : 'Set Username'}
				</Button>
			</form>
		{/if}
	</section>
</main>
