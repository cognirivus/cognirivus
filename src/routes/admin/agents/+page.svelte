<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Switch } from '$lib/components/ui/switch';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { ErrorState } from '$lib/components/ui/error-state';
	import { toast } from 'svelte-sonner';
	import AgentEditModal from './AgentEditModal.svelte';
	import { Bot, RefreshCw, Plus, Wrench, Shield, Settings, Search, Route, X } from '@lucide/svelte';

	const client = useConvexClient();

	// Queries
	const agentsQuery = useQuery(api.agents.queries.list, {});

	// State
	let editingAgent = $state<any>(null);
	let isEditModalOpen = $state(false);
	let isAddingNew = $state(false);
	let searchTerm = $state('');
	let appliedSearch = $state('');

	// Filter agents based on search
	let filteredAgents = $derived.by(() => {
		if (!agentsQuery.data) return [];
		if (!appliedSearch) return agentsQuery.data;

		const term = appliedSearch.toLowerCase();
		return agentsQuery.data.filter(
			(agent) =>
				agent.name.toLowerCase().includes(term) ||
				agent.displayName.toLowerCase().includes(term) ||
				agent.description.toLowerCase().includes(term)
		);
	});

	function openEditModal(agent: any) {
		editingAgent = agent;
		isAddingNew = false;
		isEditModalOpen = true;
	}

	function openAddModal() {
		editingAgent = null;
		isAddingNew = true;
		isEditModalOpen = true;
	}

	function closeEditModal() {
		isEditModalOpen = false;
		editingAgent = null;
		isAddingNew = false;
	}

	async function toggleAgentEnabled(name: string, currentStatus: boolean) {
		try {
			await client.mutation(api.agents.admin.toggleAgent, { name });
			toast.success(`Agent ${currentStatus ? 'disabled' : 'enabled'} successfully`);
		} catch (e: any) {
			toast.error(e.message || 'Failed to toggle agent status');
		}
	}

	async function handleSaveAgent(agentData: any) {
		try {
			if (isAddingNew) {
				await client.mutation(api.agents.admin.createAgent, agentData);
				toast.success('Agent created successfully');
			} else if (editingAgent) {
				await client.mutation(api.agents.admin.updateAgent, {
					name: editingAgent.name,
					updates: agentData
				});
				toast.success('Agent updated successfully');
			}
			closeEditModal();
		} catch (e: any) {
			toast.error(e.message || 'Failed to save agent');
		}
	}

	async function handleDeleteAgent(name: string) {
		if (!confirm('Are you sure you want to delete this agent? This action cannot be undone.')) {
			return;
		}

		try {
			await client.mutation(api.agents.admin.deleteAgent, { name });
			toast.success('Agent deleted successfully');
		} catch (e: any) {
			toast.error(e.message || 'Failed to delete agent');
		}
	}

	function applySearch() {
		appliedSearch = searchTerm;
	}

	function clearSearch() {
		searchTerm = '';
		appliedSearch = '';
	}

	function formatModelName(model: string) {
		return model.split('/').pop() || model;
	}

	function formatDate(timestamp: number) {
		return new Date(timestamp).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<div class="container mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
	<!-- Header -->
	<div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div class="space-y-2">
			<div class="flex items-center gap-2">
				<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
					<Bot class="h-4 w-4 text-primary" />
				</div>
				<h1 class="text-3xl font-semibold tracking-tight">Agent Management</h1>
			</div>
			<p class="text-muted-foreground">
				Configure and manage AI agents, their capabilities, and behavior.
			</p>
		</div>
		<div class="flex gap-2">
			<a
				href="/admin/agents/intents"
				class="inline-flex h-10 items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
			>
				<Route class="h-4 w-4" />
				Intent Rules
			</a>
			<Button onclick={() => {}} variant="outline" size="sm" class="gap-2">
				<RefreshCw class="h-4 w-4" />
				Refresh
			</Button>
			<Button onclick={openAddModal} size="sm" class="gap-2">
				<Plus class="h-4 w-4" />
				Add Agent
			</Button>
		</div>
	</div>

	<!-- Search -->
	<div class="mb-8 rounded-xl border bg-card p-5 shadow-sm">
		<div class="flex flex-col gap-4 sm:flex-row">
			<div class="relative flex-1">
				<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<input
					type="text"
					placeholder="Search agents by name, display name, or description..."
					bind:value={searchTerm}
					onkeydown={(e) => e.key === 'Enter' && applySearch()}
					class="h-10 w-full rounded-md border border-input bg-background pr-3 pl-9 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				/>
			</div>
			<Button onclick={applySearch} class="h-10 px-6">Search</Button>
		</div>

		{#if appliedSearch}
			<div class="mt-4 flex">
				<Badge variant="secondary" class="gap-1.5 px-2.5 py-1 text-xs">
					<span class="text-muted-foreground">Search:</span>
					<span class="font-semibold text-primary">{appliedSearch}</span>
					<button
						onclick={clearSearch}
						class="ml-1 rounded-full p-0.5 hover:bg-background/50"
						aria-label="Clear search"
					>
						<X class="h-3 w-3" />
					</button>
				</Badge>
			</div>
		{/if}
	</div>

	<!-- Agents Table -->
	<div class="overflow-hidden rounded-xl border bg-card shadow-sm">
		<div class="overflow-x-auto">
			<table class="w-full text-left text-sm">
				<thead>
					<tr class="border-b bg-muted/40 transition-colors">
						<th class="h-12 px-6 align-middle font-medium text-muted-foreground">Agent</th>
						<th class="h-12 px-6 align-middle font-medium text-muted-foreground">Mode</th>
						<th class="h-12 px-6 align-middle font-medium text-muted-foreground">Model</th>
						<th class="h-12 px-6 align-middle font-medium text-muted-foreground">Tools</th>
						<th class="h-12 px-6 align-middle font-medium text-muted-foreground">Status</th>
						<th class="h-12 px-6 align-middle font-medium text-muted-foreground">Access</th>
						<th class="h-12 px-6 text-right align-middle font-medium text-muted-foreground"
							>Actions</th
						>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#if agentsQuery.isLoading}
						{#each Array(5) as _}
							<tr>
								<td class="p-6"><Skeleton class="h-10 w-[200px]" /></td>
								<td class="p-6"><Skeleton class="h-6 w-[80px] rounded-full" /></td>
								<td class="p-6"><Skeleton class="h-6 w-[120px] rounded-full" /></td>
								<td class="p-6"><Skeleton class="h-6 w-[100px]" /></td>
								<td class="p-6"><Skeleton class="h-6 w-[60px] rounded-full" /></td>
								<td class="p-6"><Skeleton class="h-6 w-[80px] rounded-full" /></td>
								<td class="p-6 text-right"><Skeleton class="ml-auto h-8 w-[100px]" /></td>
							</tr>
						{/each}
					{:else if agentsQuery.error}
						<tr>
							<td colspan="7" class="p-6">
								<ErrorState
									message={agentsQuery.error.message || 'Failed to load agents'}
									title="Error loading agents"
								/>
							</td>
						</tr>
					{:else if filteredAgents.length === 0}
						<tr>
							<td colspan="7" class="p-12 text-center text-muted-foreground">
								{#if appliedSearch}
									No agents found matching your search.
								{:else}
									<div class="flex flex-col items-center gap-3">
										<Bot class="h-10 w-10 text-muted-foreground/30" />
										<p class="font-medium">No agents configured yet</p>
										<p class="text-sm text-muted-foreground/70">
											Click "Add Agent" to create your first agent
										</p>
									</div>
								{/if}
							</td>
						</tr>
					{:else}
						{#each filteredAgents as agent}
							<tr class="transition-colors hover:bg-muted/30">
								<td class="px-6 py-4">
									<div class="flex flex-col gap-1">
										<div class="flex items-center gap-2">
											<span class="font-medium text-foreground">{agent.displayName}</span>
											{#if agent.isAdminOnly}
												<Badge
													variant="outline"
													class="gap-1 border-amber-500/20 bg-amber-500/10 text-amber-600"
												>
													<Shield class="h-3 w-3" />
													Admin
												</Badge>
											{/if}
										</div>
										<span class="font-mono text-xs text-muted-foreground">{agent.name}</span>
										<span class="line-clamp-1 max-w-xs text-xs text-muted-foreground">
											{agent.description}
										</span>
									</div>
								</td>
								<td class="px-6 py-4">
									<Badge
										variant={agent.mode === 'primary' ? 'default' : 'secondary'}
										class="text-xs"
									>
										{agent.mode}
									</Badge>
								</td>
								<td class="px-6 py-4">
									<Badge variant="outline" class="font-mono text-xs">
										{formatModelName(agent.model)}
									</Badge>
								</td>
								<td class="px-6 py-4">
									<div class="flex items-center gap-1.5">
										<Wrench class="h-3.5 w-3.5 text-muted-foreground" />
										<span class="text-sm tabular-nums">{agent.availableTools.length}</span>
										{#if agent.availableTools.length > 0}
											<span class="text-xs text-muted-foreground">
												({agent.availableTools.slice(0, 2).join(', ')}{agent.availableTools.length >
												2
													? ` +${agent.availableTools.length - 2}`
													: ''})
											</span>
										{/if}
									</div>
								</td>
								<td class="px-6 py-4">
									<div class="flex items-center gap-3">
										<Switch
											checked={agent.isEnabled}
											onCheckedChange={() => toggleAgentEnabled(agent.name, agent.isEnabled)}
										/>
										<Badge
											variant={agent.isEnabled ? 'outline' : 'secondary'}
											class={agent.isEnabled
												? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600'
												: 'text-muted-foreground'}
										>
											{agent.isEnabled ? 'Enabled' : 'Disabled'}
										</Badge>
									</div>
								</td>
								<td class="px-6 py-4">
									<Badge
										variant="outline"
										class={agent.isAdminOnly
											? 'border-amber-500/20 bg-amber-500/10 text-amber-600'
											: 'border-blue-500/20 bg-blue-500/10 text-blue-600'}
									>
										{agent.isAdminOnly ? 'Admin Only' : 'All Users'}
									</Badge>
								</td>
								<td class="px-6 py-4 text-right">
									<div class="flex justify-end gap-2">
										<Button
											variant="ghost"
											size="icon"
											onclick={() => openEditModal(agent)}
											aria-label="Edit agent {agent.displayName}"
											class="h-8 w-8 text-muted-foreground hover:text-foreground"
										>
											<Settings class="h-4 w-4" />
										</Button>
									</div>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>

	<!-- Stats -->
	{#if agentsQuery.data}
		<div class="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
			<div class="rounded-xl border border-muted bg-card p-4 shadow-sm">
				<div class="text-2xl font-bold text-primary tabular-nums">{agentsQuery.data.length}</div>
				<div class="text-xs font-medium text-muted-foreground">Total Agents</div>
			</div>
			<div class="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 shadow-sm">
				<div class="text-2xl font-bold text-emerald-600 tabular-nums">
					{agentsQuery.data.filter((a) => a.isEnabled).length}
				</div>
				<div class="text-xs font-medium text-muted-foreground">Enabled</div>
			</div>
			<div class="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 shadow-sm">
				<div class="text-2xl font-bold text-blue-600 tabular-nums">
					{agentsQuery.data.filter((a) => a.mode === 'primary').length}
				</div>
				<div class="text-xs font-medium text-muted-foreground">Primary Agents</div>
			</div>
			<div class="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 shadow-sm">
				<div class="text-2xl font-bold text-amber-600 tabular-nums">
					{agentsQuery.data.filter((a) => a.isAdminOnly).length}
				</div>
				<div class="text-xs font-medium text-muted-foreground">Admin Only</div>
			</div>
		</div>
	{/if}
</div>

<!-- Edit Modal -->
<AgentEditModal
	open={isEditModalOpen}
	agent={editingAgent}
	isNew={isAddingNew}
	onClose={closeEditModal}
	onSave={handleSaveAgent}
/>
