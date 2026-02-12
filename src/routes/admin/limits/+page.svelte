<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import {
		ShieldCheck,
		Search,
		User,
		Timer,
		Sparkles,
		AlertCircle,
		ExternalLink,
		ArrowLeft,
		ChevronRight,
		Filter
	} from '@lucide/svelte';
	import * as Card from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';

	let searchQuery = $state('');
	let selectedUserId = $state<string | null>(null);

	// Search for users
	const usersQuery = useQuery(api.users.search, () => ({ query: searchQuery }));

	// Get limits for selected user (or self if none)
	const limitsQuery = useQuery((api as any).rateLimitStats.getStatus, () =>
		selectedUserId ? { userId: selectedUserId as any } : {}
	);

	function getStatusColor(value: number, capacity: number) {
		const ratio = value / capacity;
		if (ratio < 0.2) return 'bg-destructive';
		if (ratio < 0.5) return 'bg-amber-500';
		return 'bg-emerald-500';
	}

	function formatTime(ms: number) {
		const seconds = Math.ceil(ms / 1000);
		if (seconds < 60) return `${seconds}s`;
		const minutes = Math.ceil(seconds / 60);
		if (minutes < 60) return `${minutes}m`;
		return `${Math.ceil(minutes / 60)}h`;
	}

	const categorized = $derived(
		((limitsQuery.data as any) ?? []).reduce((acc: Record<string, any[]>, limit: any) => {
			if (!acc[limit.category]) acc[limit.category] = [];
			acc[limit.category].push(limit);
			return acc;
		}, {})
	);

	const selectedUser = $derived(
		selectedUserId && usersQuery.data
			? (usersQuery.data as any[]).find((u) => (u as any)._id === selectedUserId)
			: null
	);
</script>

<div class="space-y-8 p-6 lg:p-8">
	<!-- Header -->
	<div class="flex flex-col justify-between gap-4 md:flex-row md:items-center">
		<div class="space-y-1">
			<div class="flex items-center gap-2 text-primary">
				<ShieldCheck class="h-5 w-5" />
				<h1 class="text-2xl font-bold tracking-tight">Admin: Rate Limit Control</h1>
			</div>
			<p class="text-sm text-muted-foreground">
				Monitor and audit real-time rate limits for any user in the system.
			</p>
		</div>

		<div class="flex items-center gap-2">
			<div class="relative w-64">
				<Search class="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
				<Input placeholder="Search email..." bind:value={searchQuery} class="h-10 pl-9" />
			</div>
		</div>
	</div>

	<div class="grid grid-cols-1 gap-8 lg:grid-cols-4">
		<!-- Sidebar: User Search Results -->
		<div class="space-y-4 lg:col-span-1">
			<Card.Root>
				<Card.Header class="pb-3">
					<Card.Title class="flex items-center gap-2 text-sm font-semibold">
						<User class="h-4 w-4" />
						User Selection
					</Card.Title>
				</Card.Header>
				<Card.Content class="px-2">
					<div class="flex flex-col gap-1">
						<button
							onclick={() => (selectedUserId = null)}
							class="group flex w-full items-center justify-between rounded-md px-3 py-2 text-left transition-colors {selectedUserId ===
							null
								? 'bg-primary/10 font-medium text-primary'
								: 'hover:bg-accent'}"
						>
							<span class="text-sm">Current Admin (Self)</span>
							{#if selectedUserId === null}
								<ChevronRight class="h-4 w-4" />
							{/if}
						</button>

						<Separator class="my-2" />

						{#if usersQuery.isLoading}
							{#each Array(5) as _}
								<div class="space-y-2 px-3 py-2">
									<Skeleton class="h-3 w-3/4" />
									<Skeleton class="h-2 w-1/2" />
								</div>
							{/each}
						{:else if usersQuery.data && usersQuery.data.length > 0}
							<div class="flex flex-col gap-1">
								{#each usersQuery.data as user}
									<button
										onclick={() => (selectedUserId = (user as any)._id)}
										class="group flex w-full flex-col rounded-md px-3 py-2 text-left transition-colors {selectedUserId ===
										(user as any)._id
											? 'bg-primary/10 font-medium text-primary'
											: 'hover:bg-accent'}"
									>
										<span class="truncate text-sm">{(user as any).name || 'Anonymous'}</span>
										<span class="truncate text-[10px] text-muted-foreground"
											>{(user as any).email}</span
										>
									</button>
								{/each}
							</div>
						{:else if searchQuery}
							<div class="space-y-2 px-3 py-8 text-center text-muted-foreground">
								<p class="text-xs">No users found</p>
							</div>
						{/if}
					</div>
				</Card.Content>
			</Card.Root>
		</div>

		<!-- Main Content: Limits Table -->
		<div class="space-y-6 lg:col-span-3">
			{#if selectedUser || selectedUserId === null}
				<div class="flex items-center justify-between rounded-lg border bg-accent/30 px-4 py-3">
					<div class="flex items-center gap-3">
						<div
							class="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 font-bold text-primary"
						>
							{(selectedUser?.name || 'A')[0]}
						</div>
						<div>
							<h3 class="text-sm font-semibold">{selectedUser?.name || 'Admin Account'}</h3>
							<p class="text-[10px] text-muted-foreground">
								{selectedUser?.email || 'System Administrator'}
							</p>
						</div>
					</div>
					<Badge variant="outline" class="text-[10px]">
						{selectedUser?.role || 'admin'}
					</Badge>
				</div>
			{/if}

			{#if limitsQuery.isLoading}
				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					{#each Array(6) as _}
						<Skeleton class="h-32 w-full rounded-xl" />
					{/each}
				</div>
			{:else if limitsQuery.data}
				{#each Object.entries(categorized) as [category, categoryLimits]}
					<div class="space-y-4">
						<h2 class="flex items-center gap-2 text-sm font-bold tracking-tight">
							<Filter class="h-4 w-4 text-muted-foreground" />
							{category}
						</h2>
						<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
							{#each categoryLimits as any[] as limit}
								<Card.Root
									class="overflow-hidden border-l-4 {limit.isImportant
										? 'border-l-primary'
										: 'border-l-muted'}"
								>
									<Card.Content class="space-y-4 p-4">
										<div class="flex items-center justify-between">
											<div>
												<div class="flex items-center gap-2">
													<span class="text-sm font-bold">{limit.label}</span>
													{#if limit.isImportant}
														<Badge
															variant="secondary"
															class="h-4 border-none bg-primary/10 px-1 text-[8px] tracking-tighter text-primary uppercase"
															>Main</Badge
														>
													{/if}
												</div>
												<p class="font-mono text-[10px] text-muted-foreground">{limit.name}</p>
											</div>
											<div class="text-right">
												<div class="text-xs font-bold tabular-nums">
													{Math.floor(limit.value)} / {limit.capacity}
												</div>
												<p class="text-[9px] text-muted-foreground">Tokens Available</p>
											</div>
										</div>

										<div class="space-y-1.5">
											<div class="h-2 w-full overflow-hidden rounded-full bg-muted">
												<div
													class="h-full transition-all duration-500 {getStatusColor(
														limit.value,
														limit.capacity
													)}"
													style="width: {(limit.value / limit.capacity) * 100}%"
												></div>
											</div>
										</div>

										<div class="flex items-center justify-between border-t border-border/50 pt-1">
											<div class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
												<Timer class="h-3 w-3" />
												{limit.config.rate} every {formatTime(limit.config.period)}
											</div>
											<div class="flex items-center gap-1 text-[10px]">
												{#if limit.config.kind === 'fixed window'}
													<Badge
														variant="outline"
														class="border-blue-500/20 px-1 py-0 text-[9px] text-blue-600"
														>Fixed</Badge
													>
												{:else}
													<Badge
														variant="outline"
														class="border-emerald-500/20 px-1 py-0 text-[9px] text-emerald-600"
														>Bucket</Badge
													>
												{/if}
											</div>
										</div>
									</Card.Content>
								</Card.Root>
							{/each}
						</div>
					</div>
				{/each}
			{:else if limitsQuery.error}
				<div
					class="flex flex-col items-center justify-center space-y-4 rounded-xl border border-destructive/20 bg-destructive/5 py-12 text-center"
				>
					<AlertCircle class="h-10 w-10 text-destructive" />
					<div class="space-y-1">
						<p class="font-semibold text-destructive">Unauthorized Access</p>
						<p class="text-sm text-muted-foreground">
							You do not have permission to view this data.
						</p>
					</div>
					<Button variant="outline" size="sm" onclick={() => (selectedUserId = null)}>
						<ArrowLeft class="mr-2 h-4 w-4" />
						Back to Self
					</Button>
				</div>
			{/if}
		</div>
	</div>
</div>
