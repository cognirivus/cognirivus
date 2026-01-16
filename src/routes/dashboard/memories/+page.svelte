<script lang="ts">
	import MemoryManager from '$lib/components/MemoryManager.svelte';
	import { Separator } from '$lib/components/ui/separator';
</script>

<svelte:head>
	<title>Memories | Cognirivus Chat</title>
</svelte:head>

<div class="p-6">
	<div class="mx-auto max-w-6xl">
		<header class="mb-8 space-y-4">
			<div>
				<h1 class="text-2xl font-bold tracking-tight text-foreground">Chat Memories</h1>
				<p class="mt-2 text-sm text-muted-foreground">
					These are facts the AI has learned about you from your conversations to provide a more
					personalized experience.
				</p>
			</div>
			<Separator />
		</header>

		<MemoryManager />
	</div>
</div>
