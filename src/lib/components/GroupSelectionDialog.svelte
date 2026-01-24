<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Loader } from '$lib/components/prompt-kit/loader';
	import { Users, Share2, MessageSquare, ArrowRight, ShieldCheck, Globe } from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge';

	let {
		open = $bindable(false),
		title = 'Select a Group',
		onSelect
	} = $props<{
		open: boolean;
		title?: string;
		onSelect: (groupId: string) => void;
	}>();

	const groupsQuery = useQuery((api as any).groups.list, {});
	const groups = $derived(groupsQuery.data ?? []);
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-[425px]">
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
			<Dialog.Description>Choose one of your groups to share this content with.</Dialog.Description>
		</Dialog.Header>

		<div class="py-4">
			{#if groupsQuery.isLoading}
				<div class="flex items-center justify-center py-10">
					<Loader variant="circular" size="sm" />
				</div>
			{:else if groups.length === 0}
				<div
					class="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 py-10 text-center"
				>
					<Users class="mb-2 h-10 w-10 text-muted-foreground/30" />
					<p class="text-sm font-medium">No active groups</p>
					<p class="mt-1 px-4 text-xs text-muted-foreground">
						You need to be a member of at least one group to share content.
					</p>
					<Button href="/groups" variant="link" class="mt-2 h-auto p-0 text-xs"
						>Browse Groups</Button
					>
				</div>
			{:else}
				<div class="scrollbar-thin h-[300px] overflow-y-auto pr-4">
					<div class="space-y-2">
						{#each groups as group}
							<button
								onclick={() => onSelect(group._id)}
								class="group flex w-full items-center justify-between rounded-lg border p-3 text-left transition-all hover:border-primary/30 hover:bg-accent"
							>
								<div class="flex min-w-0 items-center gap-3">
									<div
										class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-bold text-primary"
									>
										{group.name.charAt(0).toUpperCase()}
									</div>
									<div class="min-w-0">
										<p class="truncate text-sm font-bold">{group.name}</p>
										<div class="mt-0.5 flex items-center gap-2">
											<p class="font-mono text-[10px] text-muted-foreground">@{group.groupname}</p>
											{#if group.isPublic}
												<Badge
													variant="outline"
													class="h-auto border-green-600/30 px-1 py-0 text-[8px] font-black text-green-600 uppercase"
													>Public</Badge
												>
											{:else}
												<Badge
													variant="outline"
													class="h-auto border-amber-600/30 px-1 py-0 text-[8px] font-black text-amber-600 uppercase"
													>Private</Badge
												>
											{/if}
										</div>
									</div>
								</div>
								<ArrowRight
									class="h-4 w-4 text-muted-foreground opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100"
								/>
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
