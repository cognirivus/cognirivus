<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Button } from '$lib/components/ui/button';

	const meQuery = useQuery(api.auth.getCurrentUser, {});
	const profileQuery = useQuery((api as any).profiles.getMyProfile, {});
</script>

<main class="mx-auto max-w-3xl px-4 py-6 sm:px-6">
	<h1 class="text-2xl font-semibold tracking-tight">Settings</h1>
	<p class="mt-1 text-sm text-muted-foreground">Manage your account settings for the social pivot.</p>

	{#if meQuery.isLoading}
		<p class="mt-4 text-sm text-muted-foreground">Loading account...</p>
	{:else if !meQuery.data}
		<p class="mt-4 text-sm text-destructive">You must sign in.</p>
	{:else}
		<div class="mt-5 rounded-lg border border-border bg-card p-4">
			<p class="text-sm"><span class="text-muted-foreground">Name:</span> {meQuery.data.name}</p>
			<p class="text-sm"><span class="text-muted-foreground">Email:</span> {meQuery.data.email}</p>
			<p class="text-sm"><span class="text-muted-foreground">Username:</span> {meQuery.data.username ?? 'not set'}</p>
			<div class="mt-4 flex gap-2">
				<Button href="/settings/username">{meQuery.data.username ? 'View Username' : 'Set Username'}</Button>
				<Button variant="outline" href="/u/{meQuery.data.username ?? 'unknown'}" disabled={!meQuery.data.username}>Open Profile</Button>
			</div>
		</div>
	{/if}

	{#if profileQuery.data?.bio}
		<div class="mt-4 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
			{profileQuery.data.bio}
		</div>
	{/if}
</main>
