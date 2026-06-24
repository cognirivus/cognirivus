<script lang="ts">
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Globe, Loader2, Plus, Trash2 } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	const client = useConvexClient();
	const domainsQuery = useQuery((api as any).knowledge.listDomains, {});
	const domains = $derived((domainsQuery.data ?? []) as any[]);

	let showCreate = $state(false);
	let name = $state('');
	let description = $state('');
	let loading = $state(false);
	let deletingId = $state<string | null>(null);

	async function create() {
		if (!name.trim()) return;
		loading = true;
		try {
			await client.mutation((api as any).knowledge.createDomain, {
				name: name.trim(),
				description: description.trim() || undefined
			});
			toast.success('Domain created');
			name = '';
			description = '';
			showCreate = false;
		} catch (e: any) {
			toast.error(e?.message ?? 'Failed');
		} finally {
			loading = false;
		}
	}

	async function remove(id: Id<'knowledge_domains'>) {
		deletingId = id;
		try {
			await client.mutation((api as any).knowledge.deleteDomain, { domainId: id });
			toast.success('Deleted');
		} catch (e: any) {
			toast.error(e?.message ?? 'Failed');
		} finally {
			deletingId = null;
		}
	}
</script>

<main class="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
	<div class="mb-6 flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Domains</h1>
			<p class="mt-1 text-sm text-muted-foreground">High-level knowledge domains.</p>
		</div>
		<Button onclick={() => (showCreate = !showCreate)}><Plus class="mr-1 size-4" />New</Button>
	</div>

	{#if showCreate}
		<Card class="mb-6">
			<CardContent class="space-y-3 py-4">
				<Input placeholder="Domain name" bind:value={name} />
				<Textarea placeholder="Description" bind:value={description} rows={2} />
				<div class="flex gap-2">
					<Button disabled={loading || !name.trim()} onclick={create}>
						{#if loading}<Loader2 class="mr-1 size-4 animate-spin" />{/if}Create
					</Button>
					<Button variant="outline" onclick={() => (showCreate = false)}>Cancel</Button>
				</div>
			</CardContent>
		</Card>
	{/if}

	{#if domainsQuery.isLoading}
		<div class="flex justify-center py-12">
			<Loader2 class="size-6 animate-spin text-muted-foreground" />
		</div>
	{:else if domainsQuery.error}
		<Card
			><CardContent class="py-12 text-center text-sm text-destructive">
				Failed to load domains. Please try again.
			</CardContent></Card
		>
	{:else if domains.length === 0}
		<Card
			><CardContent class="py-12 text-center text-sm text-muted-foreground">
				<Globe class="mx-auto mb-3 size-8" />No domains yet.
			</CardContent></Card
		>
	{:else}
		<div class="grid gap-3 md:grid-cols-2">
			{#each domains as d (d._id)}
				<div class="flex items-start justify-between rounded-md border p-4">
					<div>
						<h3 class="font-medium">{d.name}</h3>
						{#if d.description}<p class="mt-1 text-sm text-muted-foreground">
								{d.description}
							</p>{/if}
					</div>
					<Button variant="ghost" size="sm" disabled={deletingId === d._id} onclick={() => remove(d._id)}>
						{#if deletingId === d._id}
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
