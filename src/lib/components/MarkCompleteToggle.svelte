<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { Button } from '$lib/components/ui/button';
	import { Check, Circle } from '@lucide/svelte';
	import { cn } from '$lib/utils';

	interface Props {
		contentId: Id<'content'>;
		class?: string;
		variant?: 'button' | 'icon';
	}

	let { contentId, class: className, variant = 'button' }: Props = $props();

	import { page } from '$app/state';
	const client = useConvexClient();
	const currentUser = $derived(page.data.currentUser);
	const isAuthenticated = $derived(!!currentUser);

	const isCompletedQuery = useQuery(api.content.isCompleted, () =>
		isAuthenticated ? { contentId } : 'skip'
	);

	const isCompleted = $derived(isCompletedQuery.data ?? false);
	let isLoading = $state(false);

	async function toggle() {
		isLoading = true;
		try {
			await client.mutation(api.content.toggleComplete, { contentId });
		} finally {
			isLoading = false;
		}
	}
</script>

{#if variant === 'icon'}
	<button
		onclick={toggle}
		disabled={!isAuthenticated || isLoading || isCompletedQuery.isLoading}
		class={cn(
			'inline-flex items-center justify-center rounded-full p-1.5 transition-colors',
			isCompleted
				? 'bg-green-100 text-green-600 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50'
				: 'bg-muted text-muted-foreground hover:bg-muted/80',
			className
		)}
		title={isCompleted ? 'Mark as incomplete' : 'Mark as complete'}
	>
		{#if isCompleted}
			<Check class="h-4 w-4" />
		{:else}
			<Circle class="h-4 w-4" />
		{/if}
	</button>
{:else}
	<Button
		onclick={toggle}
		disabled={!isAuthenticated || isLoading || isCompletedQuery.isLoading}
		variant={isCompleted ? 'default' : 'outline'}
		title={!isAuthenticated ? 'Sign in to track progress' : ''}
		size="sm"
		class={cn(
			isCompleted && 'bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800',
			className
		)}
	>
		{#if isCompleted}
			<Check class="mr-1.5 h-4 w-4" />
			Completed
		{:else}
			<Circle class="mr-1.5 h-4 w-4" />
			Mark Complete
		{/if}
	</Button>
{/if}
