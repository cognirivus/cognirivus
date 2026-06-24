<script lang="ts">
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Loader2, Plus, Target, Trash2 } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import type { Id } from '$convex/_generated/dataModel';

	const client = useConvexClient();
	const goalsQuery = useQuery((api as any).knowledge.listLearningGoals, {});
	const goals = $derived((goalsQuery.data ?? []) as any[]);

	let showCreate = $state(false);
	let title = $state('');
	let description = $state('');
	let goalType = $state<'course' | 'curriculum' | 'training' | 'self_study'>('self_study');
	let loading = $state(false);

	const statusColors: Record<string, string> = {
		active: 'bg-green-100 text-green-800',
		completed: 'bg-blue-100 text-blue-800',
		paused: 'bg-amber-100 text-amber-800',
		abandoned: 'bg-gray-100 text-gray-800'
	};

	async function create() {
		if (!title.trim()) return;
		loading = true;
		try {
			await client.mutation((api as any).knowledge.createLearningGoal, {
				title: title.trim(),
				description: description.trim() || undefined,
				goalType
			});
			toast.success('Goal created');
			title = '';
			description = '';
			showCreate = false;
		} catch (e: any) {
			toast.error(e?.message ?? 'Failed');
		} finally {
			loading = false;
		}
	}
</script>

<main class="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
	<div class="mb-6 flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Learning Goals</h1>
			<p class="mt-1 text-sm text-muted-foreground">
				Set objectives and track your learning progress.
			</p>
		</div>
		<Button onclick={() => (showCreate = !showCreate)}><Plus class="mr-1 size-4" />New Goal</Button>
	</div>

	{#if showCreate}
		<Card class="mb-6">
			<CardContent class="space-y-3 py-4">
				<Input placeholder="Goal title" bind:value={title} />
				<Textarea placeholder="Description" bind:value={description} rows={2} />
				<select
					bind:value={goalType}
					class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
				>
					<option value="self_study">Self Study</option>
					<option value="course">Course</option>
					<option value="curriculum">Curriculum</option>
					<option value="training">Training</option>
				</select>
				<div class="flex gap-2">
					<Button disabled={loading || !title.trim()} onclick={create}>
						{#if loading}<Loader2 class="mr-1 size-4 animate-spin" />{/if}Create
					</Button>
					<Button variant="outline" onclick={() => (showCreate = false)}>Cancel</Button>
				</div>
			</CardContent>
		</Card>
	{/if}

	{#if goalsQuery.isLoading}
		<div class="flex justify-center py-12">
			<Loader2 class="size-6 animate-spin text-muted-foreground" />
		</div>
	{:else if goals.length === 0}
		<Card
			><CardContent class="py-12 text-center text-sm text-muted-foreground">
				<Target class="mx-auto mb-3 size-8" />No learning goals yet. Create your first goal.
			</CardContent></Card
		>
	{:else}
		<div class="grid gap-3 md:grid-cols-2">
			{#each goals as goal (goal._id)}
				<div class="rounded-md border border-border p-4">
					<div class="flex items-start justify-between gap-2">
						<h3 class="font-medium">{goal.title}</h3>
						<Badge class={statusColors[goal.status]}>{goal.status}</Badge>
					</div>
					{#if goal.description}
						<p class="mt-1 text-sm text-muted-foreground">{goal.description}</p>
					{/if}
					<div class="mt-3">
						<div class="mb-1 flex items-center justify-between text-xs text-muted-foreground">
							<span>Progress</span>
							<span>{Math.round(goal.progress * 100)}%</span>
						</div>
						<div class="h-1.5 w-full rounded-full bg-muted">
							<div
								class="h-1.5 rounded-full bg-primary"
								style="width: {goal.progress * 100}%"
							></div>
						</div>
					</div>
					<p class="mt-2 text-xs text-muted-foreground">
						{goal.goalType.replace('_', ' ')} · {new Date(goal.createdAt).toLocaleDateString()}
					</p>
				</div>
			{/each}
		</div>
	{/if}
</main>
