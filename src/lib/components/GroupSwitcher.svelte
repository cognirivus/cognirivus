<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';

	let { selectedGroupId = $bindable(undefined) } = $props<{ selectedGroupId?: string }>();

	const groupsQuery = useQuery((api as any).groups.list, {});
	const groups = $derived(groupsQuery.data ?? []);

	function handleChange(e: Event) {
		const target = e.target as HTMLSelectElement;
		selectedGroupId = target.value === 'public' ? undefined : target.value;
	}
</script>

<div class="flex items-center gap-2">
	<span class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
		>Discussion</span
	>
	<select
		class="h-8 rounded border border-input bg-background px-2 text-xs font-medium outline-none focus:ring-1 focus:ring-primary"
		value={selectedGroupId ?? 'public'}
		onchange={handleChange}
	>
		<option value="public">🌎 Public Feed</option>
		{#if groups.length > 0}
			{#each groups as group}
				<option value={group._id}>👥 {group.name}</option>
			{/each}
		{/if}
	</select>
</div>
