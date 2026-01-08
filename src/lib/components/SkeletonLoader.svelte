<script lang="ts">
	let { count = 3 } = $props();
</script>

<div class="mx-auto flex w-full max-w-3xl flex-col space-y-8 pt-8 md:pt-20">
	{#each Array(count) as _}
		<div class="flex w-full animate-pulse justify-start">
			<div class="flex max-w-[80%] flex-col gap-2">
				<div class="h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-800"></div>
				<div class="space-y-2">
					<div class="h-10 w-full rounded-2xl bg-zinc-100 sm:w-[400px] dark:bg-zinc-900"></div>
					<div class="h-10 w-[70%] rounded-2xl bg-zinc-100 dark:bg-zinc-900"></div>
				</div>
			</div>
		</div>
		<div class="flex w-full animate-pulse justify-end">
			<div class="flex max-w-[80%] flex-col items-end gap-2">
				<div class="h-4 w-16 rounded bg-zinc-200 dark:bg-zinc-800"></div>
				<div class="h-10 w-full rounded-2xl bg-zinc-200 sm:w-[300px] dark:bg-zinc-800"></div>
			</div>
		</div>
	{/each}
</div>
