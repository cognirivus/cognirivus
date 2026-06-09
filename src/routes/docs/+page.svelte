<script lang="ts">
	import { categories } from '../../docs/registry';
	import * as Icons from '@lucide/svelte';
	import { Sparkles, ArrowRight, Search } from '@lucide/svelte';

	// Helper for Lucide icons
	function getIconComponent(name: string) {
		const IconComp = (Icons as any)[name];
		return IconComp || Icons.FileText;
	}

	// Calculate total docs
	const totalDocs = categories.reduce((acc, cat) => acc + cat.docs.length, 0);
</script>

<svelte:head>
	<title>Cognirivus Documentation Hub</title>
	<meta
		name="description"
		content="Guides and feature docs for Cognirivus, your personal knowledge network."
	/>
</svelte:head>

<div class="flex flex-col gap-12 pb-16">
	<!-- Hero Section -->
	<section
		class="relative flex flex-col items-center gap-6 overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-b from-card/30 to-card/5 px-6 py-12 text-center sm:px-12 sm:py-20"
	>
		<div
			class="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] bg-[size:4rem_4rem] opacity-[0.03]"
		></div>

		<!-- Sparks/Brand Icon -->
		<div
			class="flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground text-background shadow-lg"
		>
			<Sparkles class="h-7 w-7" />
		</div>

		<div class="flex max-w-2xl flex-col gap-2">
			<h1 class="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
				Cognirivus Documentation
			</h1>
			<p class="text-lg leading-relaxed text-muted-foreground">
				Everything you need to get started, explore features, and make the most of your personal
				knowledge network.
			</p>
		</div>

		<div
			class="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-semibold tracking-widest text-muted-foreground uppercase"
		>
			{totalDocs} articles across {categories.length} categories
		</div>
	</section>

	<!-- Categories Grid -->
	<section class="flex flex-col gap-6">
		<h2 class="border-b border-border/50 pb-3 text-2xl font-bold tracking-tight text-foreground">
			Browse Categories
		</h2>
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
			{#each categories as category}
				{@const Icon = getIconComponent(category.docs[0]?.icon || 'Folder')}
				<div
					class="group flex flex-col justify-between gap-6 rounded-2xl border border-border/50 bg-card/40 p-6 transition-all duration-200 hover:border-border hover:bg-card"
				>
					<div class="flex flex-col gap-4">
						<div class="flex items-center gap-3">
							<div class="rounded-xl border border-border/30 bg-muted p-2.5 text-foreground">
								<Icon class="h-5 w-5 opacity-90" />
							</div>
							<h3 class="text-xl font-semibold text-foreground group-hover:text-foreground/90">
								{category.name}
							</h3>
						</div>

						<!-- List of docs in this category -->
						<ul class="mt-2 flex flex-col gap-2.5 pl-0">
							{#each category.docs.slice(0, 5) as doc}
								<li>
									<a
										href="/docs/{doc.slug}"
										class="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
									>
										<span class="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40"></span>
										<span class="truncate">{doc.title}</span>
									</a>
								</li>
							{/each}
							{#if category.docs.length > 5}
								<li class="pl-3.5 text-xs text-muted-foreground/60 italic">
									+ {category.docs.length - 5} more articles
								</li>
							{/if}
						</ul>
					</div>

					<!-- Link to the first article in the category -->
					{#if category.docs[0]}
						<a
							href="/docs/{category.docs[0].slug}"
							class="group/link mt-2 flex items-center gap-1.5 self-start text-xs font-semibold tracking-wider text-muted-foreground uppercase transition-colors hover:text-foreground"
						>
							<span>Get Started</span>
							<ArrowRight
								class="h-3.5 w-3.5 transition-transform duration-200 group-hover/link:translate-x-0.5"
							/>
						</a>
					{/if}
				</div>
			{/each}
		</div>
	</section>
</div>
