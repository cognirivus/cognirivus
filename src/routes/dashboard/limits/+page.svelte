<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import {
		ShieldAlert,
		MessageSquare,
		Sparkles,
		Users,
		Library,
		GraduationCap,
		Timer,
		Activity,
		Info
	} from '@lucide/svelte';
	import * as Card from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Badge } from '$lib/components/ui/badge';
	import { Progress } from '$lib/components/ui/progress';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';

	const limitsQuery = useQuery((api as any).rateLimitStats.getStatus, {});

	function getCategoryIcon(category: string) {
		switch (category) {
			case 'Chat':
				return MessageSquare;
			case 'Community':
				return Users;
			case 'Library':
				return Library;
			case 'Learning':
				return GraduationCap;
			default:
				return Activity;
		}
	}

	function getStatusColor(value: number, capacity: number) {
		const ratio = value / capacity;
		if (ratio < 0.2) return 'bg-destructive';
		if (ratio < 0.5) return 'bg-amber-500';
		return 'bg-emerald-500';
	}

	function formatTime(ms: number) {
		if (ms < 1000) return 'Just now';
		const seconds = Math.ceil(ms / 1000);
		if (seconds < 60) return `${seconds}s`;
		const minutes = Math.ceil(seconds / 60);
		return `${minutes}m`;
	}

	const limits = $derived(((limitsQuery.data as any) ?? []).filter((l: any) => l.isImportant));
	const categorized = $derived(
		limits.reduce((acc: Record<string, any[]>, limit: any) => {
			if (!acc[limit.category]) acc[limit.category] = [];
			acc[limit.category].push(limit);
			return acc;
		}, {})
	);
</script>

<div class="p-6 lg:p-8">
	<div class="mx-auto flex w-full max-w-5xl flex-col gap-8">
		<!-- Header -->
		<div class="space-y-2">
			<div class="flex items-center gap-2.5">
				<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
					<ShieldAlert class="h-4 w-4 text-emerald-600" />
				</div>
				<span class="text-xs font-bold tracking-widest text-muted-foreground uppercase">
					Quotas
				</span>
			</div>
			<h1 class="text-2xl font-semibold tracking-tight">Rate Limits</h1>
			<p class="text-sm text-muted-foreground">View your available actions and cooldown periods.</p>
		</div>

		{#if limitsQuery.isLoading}
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each Array(6) as _}
					<div class="rounded-xl border bg-card p-5">
						<div class="flex items-center gap-3">
							<Skeleton class="h-8 w-8 rounded-lg" />
							<Skeleton class="h-4 w-24" />
						</div>
						<Skeleton class="mt-4 h-2 w-full" />
						<div class="mt-4 flex justify-between">
							<Skeleton class="h-3 w-16" />
							<Skeleton class="h-3 w-16" />
						</div>
					</div>
				{/each}
			</div>
		{:else if limitsQuery.data}
			{#each Object.entries(categorized) as [category, categoryLimits]}
				{@const Icon = getCategoryIcon(category)}
				<div class="space-y-4">
					<h2 class="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
						<Icon class="h-4 w-4" />
						{category} Limits
					</h2>
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{#each categoryLimits as any[] as limit}
							{@const l = limit as any}
							<div
								class="group relative rounded-xl border bg-card p-5 transition-all hover:border-primary/20 hover:shadow-sm"
							>
								<div class="flex items-center justify-between">
									<h3 class="text-sm font-medium">{l.label}</h3>
									{#if l.config.kind === 'fixed window'}
										<Timer
											class="h-4 w-4 text-muted-foreground/50 transition-colors group-hover:text-primary"
										/>
									{:else}
										<Sparkles
											class="h-3.5 w-3.5 text-muted-foreground/50 transition-colors group-hover:text-primary"
										/>
									{/if}
								</div>

								<div class="mt-4 space-y-2">
									<div class="flex justify-between text-[10px] text-muted-foreground">
										<span>Availability</span>
										<span class="font-medium text-foreground">
											{Math.floor(l.value)} / {l.capacity}
										</span>
									</div>
									<div class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
										<div
											class="h-full transition-all duration-500 {getStatusColor(
												l.value,
												l.capacity
											)}"
											style="width: {(l.value / l.capacity) * 100}%"
										></div>
									</div>
								</div>

								<div class="mt-4 flex items-center justify-between border-t border-border/50 pt-3">
									<span class="text-[10px] text-muted-foreground">
										{l.config.rate} every {formatTime(l.config.period)}
									</span>
									{#if l.value < 1}
										<Badge
											variant="outline"
											class="border-amber-500/20 bg-amber-500/5 text-[9px] font-bold text-amber-600 uppercase"
										>
											Refreshing...
										</Badge>
									{:else}
										<Badge
											variant="outline"
											class="border-emerald-500/20 bg-emerald-500/5 text-[9px] font-bold text-emerald-600 uppercase"
										>
											Ready
										</Badge>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		{:else if limitsQuery.error}
			<div class="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
				<p class="text-sm text-destructive">Failed to load rate limits. Please try again.</p>
			</div>
		{/if}

		<!-- Tips -->
		<div class="flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
			<Info class="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
			<div class="space-y-1">
				<h4 class="text-sm font-semibold text-blue-900 dark:text-blue-300">About Rate Limiting</h4>
				<p class="text-xs leading-relaxed text-blue-800/70 dark:text-blue-400/70">
					Rate limits help ensure fair access to resource-intensive features like AI generation and
					community interactions. Tokens refresh automatically over time. If a limit is reached,
					simply wait a few moments for tokens to replenish.
				</p>
			</div>
		</div>
	</div>
</div>
