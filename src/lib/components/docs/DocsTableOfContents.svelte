<script lang="ts">
	let { headings = [], scrollContainerId = '' } = $props<{
		headings: { id: string; text: string; depth: number }[];
		scrollContainerId?: string;
	}>();

	let activeId = $state('');

	$effect(() => {
		if (headings.length === 0) return;

		const scrollRoot = scrollContainerId
			? document.getElementById(scrollContainerId)
			: null;

		const observer = new IntersectionObserver(
			(entries) => {
				const visible = entries.filter((entry) => entry.isIntersecting);
				if (visible.length > 0) {
					visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
					activeId = visible[0].target.id;
				}
			},
			{
				root: scrollRoot,
				rootMargin: '-50px 0px -60% 0px',
				threshold: 0
			}
		);

		headings.forEach((heading: { id: string; text: string; depth: number }) => {
			const el = document.getElementById(heading.id);
			if (el) observer.observe(el);
		});

		return () => observer.disconnect();
	});

	function handleHeadingClick(e: MouseEvent, id: string) {
		e.preventDefault();
		const el = document.getElementById(id);
		if (!el) return;

		const scrollContainer = scrollContainerId
			? document.getElementById(scrollContainerId)
			: null;

		if (scrollContainer) {
			// Scroll within the container
			const containerRect = scrollContainer.getBoundingClientRect();
			const elRect = el.getBoundingClientRect();
			const offset = elRect.top - containerRect.top + scrollContainer.scrollTop - 72;
			scrollContainer.scrollTo({ top: offset, behavior: 'smooth' });
		} else {
			el.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}

		history.pushState(null, '', `#${id}`);
		activeId = id;
	}
</script>

{#if headings.length > 0}
	<div class="flex flex-col gap-3">
		<h5 class="text-xs font-semibold tracking-wider text-muted-foreground/80 uppercase">
			On This Page
		</h5>
		<ul class="flex flex-col gap-2 border-l border-border/40 pl-0">
			{#each headings as heading}
				<li class={heading.depth === 3 ? 'pl-4' : 'pl-0'}>
					<a
						href="#{heading.id}"
						onclick={(e) => handleHeadingClick(e, heading.id)}
						class="-ml-[2px] block border-l-2 pl-3 text-xs font-medium transition-all duration-200
							{activeId === heading.id
							? 'border-foreground font-semibold text-foreground'
							: 'border-transparent text-muted-foreground/80 hover:text-foreground'}"
					>
						{heading.text}
					</a>
				</li>
			{/each}
		</ul>
	</div>
{/if}
