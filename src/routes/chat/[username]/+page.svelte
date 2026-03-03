<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { toast } from 'svelte-sonner';

	const username = $derived(page.params.username);
	const client = useConvexClient();
	const meQuery = useQuery(api.auth.getCurrentUser, {});
	const redirectTo = $derived(encodeURIComponent(page.url.pathname + page.url.search));
	let isStarting = $state(false);

	const profileQuery = useQuery((api as any).profiles.getByUsername, () =>
		meQuery.data ? { username } : 'skip'
	);

	$effect(() => {
		if (!meQuery.isLoading && !meQuery.data) {
			goto(`/signin?redirectTo=${redirectTo}`);
			return;
		}
		if (isStarting) return;
		const profile = profileQuery.data;
		if (profile === null) {
			toast.error('User not found');
			goto('/chat');
			return;
		}
		if (!profile) return; // still loading

		isStarting = true;

		// Create or get conversation and redirect
		client
			.mutation((api as any).dm.createOrGetConversation, {
				targetAuthId: profile.authId
			})
			.then((conversationId) => {
				goto(`/chat?active=${conversationId}`);
			})
			.catch((err: any) => {
				isStarting = false;
				toast.error(err?.message ?? 'Failed to start conversation');
				goto('/chat');
			});
	});
</script>

<main class="flex h-full items-center justify-center">
	<p class="text-sm text-muted-foreground">Opening chat with {username}...</p>
</main>
