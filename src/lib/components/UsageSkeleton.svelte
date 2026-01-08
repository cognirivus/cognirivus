<div class="flex h-full animate-pulse flex-col overflow-y-auto p-6 pt-4 md:pt-12">
	<div class="mx-auto flex w-full max-w-6xl flex-col gap-8">
		<!-- Header Skeleton -->
		<div class="flex flex-col gap-2">
			<div class="h-8 w-48 rounded-lg bg-zinc-200 dark:bg-zinc-800"></div>
			<div class="h-4 w-64 rounded-lg bg-zinc-100 dark:bg-zinc-900"></div>
		</div>

		<!-- Summary Cards Skeleton -->
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{#each Array(4) as _}
				<div
					class="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
				>
					<div class="flex items-center gap-3">
						<div class="h-9 w-9 rounded-lg bg-zinc-100 dark:bg-zinc-800"></div>
						<div class="h-4 w-20 rounded bg-zinc-100 dark:bg-zinc-800"></div>
					</div>
					<div class="mt-4 space-y-2">
						<div class="h-8 w-24 rounded bg-zinc-200 dark:bg-zinc-800"></div>
						<div class="h-3 w-32 rounded bg-zinc-100 dark:bg-zinc-900"></div>
					</div>
				</div>
			{/each}
		</div>

		<!-- Charts Skeleton -->
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
			<!-- Model Breakdown Skeleton -->
			<div
				class="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
			>
				<div class="mb-6 h-6 w-32 rounded bg-zinc-200 dark:bg-zinc-800"></div>
				<div class="space-y-6">
					{#each Array(3) as _}
						<div class="space-y-2">
							<div class="flex justify-between">
								<div class="h-4 w-24 rounded bg-zinc-100 dark:bg-zinc-800"></div>
								<div class="h-4 w-12 rounded bg-zinc-100 dark:bg-zinc-800"></div>
							</div>
							<div class="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800"></div>
							<div class="flex justify-between">
								<div class="h-3 w-16 rounded bg-zinc-50 dark:bg-zinc-900"></div>
								<div class="h-3 w-16 rounded bg-zinc-50 dark:bg-zinc-900"></div>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Daily Activity Skeleton -->
			<div
				class="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
			>
				<div class="mb-6 h-6 w-32 rounded bg-zinc-200 dark:bg-zinc-800"></div>
				<div class="flex h-48 items-end gap-2 px-2">
					{#each Array(15) as _, i}
						<div
							class="flex-1 rounded-t-sm bg-zinc-100 dark:bg-zinc-800"
							style="height: {Math.random() * 60 + 20}%"
						></div>
					{/each}
				</div>
				<div class="mt-4 flex justify-between">
					<div class="h-3 w-20 rounded bg-zinc-100 dark:bg-zinc-900"></div>
					<div class="h-3 w-20 rounded bg-zinc-100 dark:bg-zinc-900"></div>
				</div>
			</div>
		</div>
	</div>
</div>
