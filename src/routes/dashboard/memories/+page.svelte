<script lang="ts">
	import MemoryManager from '$lib/components/MemoryManager.svelte';
</script>

<svelte:head>
	<title>Memories | Cognirivus Chat</title>
</svelte:head>

<div class="p-6">
	<div class="mx-auto max-w-6xl">
		<header class="mb-8">
			<h1 class="text-2xl font-bold tracking-tight text-foreground">Chat Memories</h1>
			<p class="mt-2 text-sm text-muted-foreground">
				These are facts the AI has learned about you from your conversations to provide a more
				personalized experience.
			</p>
		</header>

		<MemoryManager />
	</div>
</div>
