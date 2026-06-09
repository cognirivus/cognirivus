<script lang="ts">
	import DocsPrevNext from '$lib/components/docs/DocsPrevNext.svelte';

	let { data } = $props();
	const doc = $derived(data.doc);
</script>

{#if doc}
	<div class="flex flex-col gap-6 pb-16">
		<header class="flex flex-col gap-2 border-b border-border/50 pb-6">
			<h1 class="text-4xl font-bold tracking-tight text-foreground">{doc.title}</h1>
			<p class="text-lg leading-relaxed text-muted-foreground">{doc.description}</p>
		</header>

		<div class="docs-prose pt-4">
			{@html doc.html}
		</div>

		<DocsPrevNext currentSlug={doc.slug} />
	</div>
{/if}
