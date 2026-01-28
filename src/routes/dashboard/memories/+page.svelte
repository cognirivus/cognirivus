<script lang="ts">
	import MemoryManager from '$lib/components/MemoryManager.svelte';
	import { Brain } from '@lucide/svelte';
</script>

<svelte:head>
	<title>Memories | Cognirivus Chat</title>
</svelte:head>

<div class="p-6 lg:p-8">
	<div class="mx-auto max-w-5xl">
		<header class="mb-8 space-y-2">
			<div class="flex items-center gap-2.5">
				<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-pink-500/10">
					<Brain class="h-4 w-4 text-pink-600" />
				</div>
				<span class="text-xs font-bold tracking-widest text-muted-foreground uppercase">
					Personalization
				</span>
			</div>
			<h1 class="text-2xl font-semibold tracking-tight">Chat Memories</h1>
			<p class="text-sm text-muted-foreground">
				These are facts the AI has learned about you from your conversations to provide a more
				personalized experience.
			</p>
		</header>

		<MemoryManager />
	</div>
</div>
