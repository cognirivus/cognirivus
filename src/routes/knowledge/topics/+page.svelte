<script lang="ts">
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
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
	import { FolderOpen, Loader2, Plus, Trash2 } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	const client = useConvexClient();
	const topicsQuery = useQuery((api as any).knowledge.listTopics, {});

	const topics = $derived((topicsQuery.data ?? []) as any[]);

	let showCreateForm = $state(false);
	let newTopicName = $state('');
	let newTopicDescription = $state('');
	let createLoading = $state(false);
	let deleteLoadingId = $state<string | null>(null);

	async function createTopic() {
		if (!newTopicName.trim()) return;
		createLoading = true;
		try {
			await client.mutation((api as any).knowledge.createTopic, {
				name: newTopicName.trim(),
				description: newTopicDescription.trim() || undefined
			});
			toast.success('Topic created');
			newTopicName = '';
			newTopicDescription = '';
			showCreateForm = false;
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to create topic');
		} finally {
			createLoading = false;
		}
	}

	async function deleteTopic(topicId: Id<'knowledge_cell_topics'>) {
		deleteLoadingId = topicId;
		try {
			await client.mutation((api as any).knowledge.deleteTopic, { topicId });
			toast.success('Topic deleted');
		} catch (error: any) {
			toast.error(error?.message ?? 'Failed to delete topic');
		} finally {
			deleteLoadingId = null;
		}
	}
</script>

<main class="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
	<div class="mb-6 flex items-center justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Topics</h1>
			<p class="mt-1 text-sm text-muted-foreground">
				Organize knowledge cells into hierarchical topics.
			</p>
		</div>
		<Button onclick={() => (showCreateForm = !showCreateForm)}>
			<Plus class="mr-1 size-4" />
			New Topic
		</Button>
	</div>

	{#if showCreateForm}
		<Card class="mb-6">
			<CardHeader>
				<CardTitle>Create Topic</CardTitle>
			</CardHeader>
			<CardContent class="space-y-3">
				<Input placeholder="Topic name" bind:value={newTopicName} />
				<Textarea placeholder="Description (optional)" bind:value={newTopicDescription} rows={2} />
				<div class="flex gap-2">
					<Button disabled={createLoading || !newTopicName.trim()} onclick={createTopic}>
						{#if createLoading}
							<Loader2 class="mr-1 size-4 animate-spin" />
						{/if}
						Create
					</Button>
					<Button variant="outline" onclick={() => (showCreateForm = false)}>Cancel</Button>
				</div>
			</CardContent>
		</Card>
	{/if}

	{#if topicsQuery.isLoading}
		<div class="flex items-center justify-center py-12">
			<Loader2 class="size-6 animate-spin text-muted-foreground" />
		</div>
	{:else if topics.length === 0}
		<Card>
			<CardContent class="py-12 text-center">
				<FolderOpen class="mx-auto size-8 text-muted-foreground" />
				<p class="mt-3 text-sm text-muted-foreground">
					No topics yet. Create your first topic to organize knowledge cells.
				</p>
			</CardContent>
		</Card>
	{:else}
		<div class="grid gap-3 md:grid-cols-2">
			{#each topics as topic (topic._id)}
				<div class="flex items-start justify-between gap-3 rounded-md border border-border p-4">
					<div class="min-w-0 flex-1">
						<h3 class="font-medium">{topic.name}</h3>
						{#if topic.description}
							<p class="mt-1 text-sm text-muted-foreground">{topic.description}</p>
						{/if}
						<p class="mt-1 text-xs text-muted-foreground">
							{new Date(topic.updatedAt).toLocaleDateString()}
						</p>
					</div>
					<Button
						variant="ghost"
						size="sm"
						disabled={deleteLoadingId === topic._id}
						onclick={() => deleteTopic(topic._id)}
					>
						{#if deleteLoadingId === topic._id}
							<Loader2 class="size-4 animate-spin" />
						{:else}
							<Trash2 class="size-4 text-muted-foreground" />
						{/if}
					</Button>
				</div>
			{/each}
		</div>
	{/if}
</main>
