<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import type { Id } from '$convex/_generated/dataModel';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { ErrorState } from '$lib/components/ui/error-state';
	import { toast } from 'svelte-sonner';
	import IntentRuleModal from './IntentRuleModal.svelte';
	import {
		Route,
		ArrowLeft,
		Plus,
		RefreshCw,
		Sparkles,
		Target,
		ArrowUpDown,
		Trash2,
		Search,
		X,
		Play,
		Wand2
	} from '@lucide/svelte';

	const client = useConvexClient();

	// Queries
	const rulesQuery = useQuery(api.agents.intent_rules.listIntentRules, {});
	const agentsQuery = useQuery(api.agents.queries.list, {});

	// State
	let editingRule = $state<any>(null);
	let isEditModalOpen = $state(false);
	let isAddingNew = $state(false);
	let searchTerm = $state('');
	let appliedSearch = $state('');
	let testQuery = $state('');
	let testResults = $state<any[] | null>(null);
	let isTesting = $state(false);

	// Filter rules based on search
	let filteredRules = $derived.by(() => {
		if (!rulesQuery.data) return [];
		if (!appliedSearch) return rulesQuery.data;

		const term = appliedSearch.toLowerCase();
		return rulesQuery.data.filter(
			(rule) =>
				rule.pattern.toLowerCase().includes(term) || rule.agentName.toLowerCase().includes(term)
		);
	});

	function openEditModal(rule: any) {
		editingRule = rule;
		isAddingNew = false;
		isEditModalOpen = true;
	}

	function openAddModal() {
		editingRule = null;
		isAddingNew = true;
		isEditModalOpen = true;
	}

	function closeEditModal() {
		isEditModalOpen = false;
		editingRule = null;
		isAddingNew = false;
	}

	async function handleSaveRule(ruleData: any) {
		try {
			if (isAddingNew) {
				await client.mutation(api.agents.intent_rules.createIntentRule, ruleData);
				toast.success('Intent rule created successfully');
			} else if (editingRule) {
				await client.mutation(api.agents.intent_rules.updateIntentRule, {
					id: editingRule._id,
					updates: ruleData
				});
				toast.success('Intent rule updated successfully');
			}
			closeEditModal();
		} catch (e: any) {
			toast.error(e.message || 'Failed to save intent rule');
		}
	}

	async function handleDeleteRule(id: Id<'intent_rules'>) {
		if (!confirm('Are you sure you want to delete this intent rule?')) {
			return;
		}

		try {
			await client.mutation(api.agents.intent_rules.deleteIntentRule, { id });
			toast.success('Intent rule deleted successfully');
		} catch (e: any) {
			toast.error(e.message || 'Failed to delete intent rule');
		}
	}

	async function toggleRuleEnabled(id: Id<'intent_rules'>, currentStatus: boolean) {
		try {
			await client.mutation(api.agents.intent_rules.updateIntentRule, {
				id,
				updates: { isEnabled: !currentStatus }
			});
			toast.success(`Rule ${currentStatus ? 'disabled' : 'enabled'} successfully`);
		} catch (e: any) {
			toast.error(e.message || 'Failed to toggle rule status');
		}
	}

	async function runTest() {
		if (!testQuery.trim()) {
			toast.error('Please enter a test query');
			return;
		}

		isTesting = true;
		testResults = null;

		try {
			const results = await client.query(api.agents.intent_rules.testIntentDetection, {
				query: testQuery
			});
			testResults = results;
		} catch (e: any) {
			toast.error(e.message || 'Failed to test intent detection');
		} finally {
			isTesting = false;
		}
	}

	function applySearch() {
		appliedSearch = searchTerm;
	}

	function clearSearch() {
		searchTerm = '';
		appliedSearch = '';
	}

	function getAgentDisplayName(agentName: string) {
		if (!agentsQuery.data) return agentName;
		const agent = agentsQuery.data.find((a) => a.name === agentName);
		return agent?.displayName || agentName;
	}
</script>

<div class="container mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
	<!-- Header -->
	<div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div class="space-y-2">
			<div class="flex items-center gap-2">
				<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
					<Route class="h-4 w-4 text-primary" />
				</div>
				<h1 class="text-3xl font-semibold tracking-tight">Intent Rules</h1>
			</div>
			<p class="text-muted-foreground">
				Configure pattern-based routing rules to direct user queries to appropriate agents.
			</p>
		</div>
		<div class="flex gap-2">
			<Button href="/admin/agents" variant="outline" size="sm" class="gap-2">
				<ArrowLeft class="h-4 w-4" />
				Back to Agents
			</Button>
			<Button onclick={() => {}} variant="outline" size="sm" class="gap-2">
				<RefreshCw class="h-4 w-4" />
				Refresh
			</Button>
			<Button onclick={openAddModal} size="sm" class="gap-2">
				<Plus class="h-4 w-4" />
				Add Rule
			</Button>
		</div>
	</div>

	<!-- Test Intent Detection -->
	<div class="mb-8 rounded-xl border bg-card p-5 shadow-sm">
		<div class="mb-4 flex items-center gap-2">
			<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
				<Wand2 class="h-4 w-4 text-violet-500" />
			</div>
			<div>
				<h3 class="font-semibold text-foreground">Test Intent Detection</h3>
				<p class="text-xs text-muted-foreground">
					Enter a sample query to see which rules would match
				</p>
			</div>
		</div>

		<div class="flex flex-col gap-3 sm:flex-row">
			<div class="relative flex-1">
				<Sparkles class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					type="text"
					placeholder="Enter a test query (e.g., 'Create flashcards about photosynthesis')..."
					bind:value={testQuery}
					onkeydown={(e) => e.key === 'Enter' && runTest()}
					class="h-11 bg-background pl-10"
				/>
			</div>
			<Button onclick={runTest} disabled={isTesting} class="h-11 gap-2">
				{#if isTesting}
					<RefreshCw class="h-4 w-4 animate-spin" />
					Testing...
				{:else}
					<Play class="h-4 w-4" />
					Test
				{/if}
			</Button>
		</div>

		{#if testResults !== null}
			<div class="mt-4 rounded-lg border bg-muted/30 p-4">
				{#if testResults.length === 0}
					<div class="flex items-center gap-2 text-muted-foreground">
						<Target class="h-4 w-4" />
						<span>No matching rules found for this query</span>
					</div>
				{:else}
					<div class="space-y-2">
						<p class="text-sm font-medium text-foreground">
							Matched {testResults.length} rule{testResults.length > 1 ? 's' : ''}:
						</p>
						<div class="flex flex-wrap gap-2">
							{#each testResults.slice(0, 5) as result, i}
								{@const agentName = getAgentDisplayName(result.agentName)}
								<Badge variant={i === 0 ? 'default' : 'secondary'} class="gap-1.5 text-xs">
									{#if i === 0}
										<Target class="h-3 w-3" />
									{/if}
									{result.pattern}
									<span class="text-muted-foreground">→</span>
									{agentName}
									<span class="tabular-nums">({(result.matchScore * 100).toFixed(0)}%)</span>
								</Badge>
							{/each}
							{#if testResults.length > 5}
								<Badge variant="outline" class="text-xs">
									+{testResults.length - 5} more
								</Badge>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Search -->
	<div class="mb-6 rounded-xl border bg-card p-4 shadow-sm">
		<div class="flex flex-col gap-3 sm:flex-row">
			<div class="relative flex-1">
				<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<input
					type="text"
					placeholder="Search rules by pattern or agent name..."
					bind:value={searchTerm}
					onkeydown={(e) => e.key === 'Enter' && applySearch()}
					class="h-10 w-full rounded-md border border-input bg-background pr-3 pl-9 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				/>
			</div>
			<Button onclick={applySearch} size="sm" class="h-10">Search</Button>
		</div>

		{#if appliedSearch}
			<div class="mt-3 flex">
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

	<!-- Rules Table -->
	<div class="overflow-hidden rounded-xl border bg-card shadow-sm">
		<div class="overflow-x-auto">
			<table class="w-full text-left text-sm">
				<thead>
					<tr class="border-b bg-muted/40 transition-colors">
						<th class="h-12 px-6 align-middle font-medium text-muted-foreground">Pattern</th>
						<th class="h-12 px-6 align-middle font-medium text-muted-foreground">Target Agent</th>
						<th class="h-12 px-6 align-middle font-medium text-muted-foreground">
							<div class="flex items-center gap-1">
								<ArrowUpDown class="h-3.5 w-3.5" />
								Priority
							</div>
						</th>
						<th class="h-12 px-6 align-middle font-medium text-muted-foreground">Confidence</th>
						<th class="h-12 px-6 align-middle font-medium text-muted-foreground">Status</th>
						<th class="h-12 px-6 text-right align-middle font-medium text-muted-foreground"
							>Actions</th
						>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#if rulesQuery.isLoading}
						{#each Array(5) as _}
							<tr>
								<td class="p-6"><Skeleton class="h-6 w-[180px]" /></td>
								<td class="p-6"><Skeleton class="h-6 w-[120px] rounded-full" /></td>
								<td class="p-6"><Skeleton class="h-6 w-[60px]" /></td>
								<td class="p-6"><Skeleton class="h-6 w-[80px] rounded-full" /></td>
								<td class="p-6"><Skeleton class="h-6 w-[60px] rounded-full" /></td>
								<td class="p-6 text-right"><Skeleton class="ml-auto h-8 w-[80px]" /></td>
							</tr>
						{/each}
					{:else if rulesQuery.error}
						<tr>
							<td colspan="6" class="p-6">
								<ErrorState
									message={rulesQuery.error.message || 'Failed to load intent rules'}
									title="Error loading rules"
								/>
							</td>
						</tr>
					{:else if filteredRules.length === 0}
						<tr>
							<td colspan="6" class="p-12 text-center text-muted-foreground">
								{#if appliedSearch}
									No rules found matching your search.
								{:else}
									<div class="flex flex-col items-center gap-3">
										<Route class="h-10 w-10 text-muted-foreground/30" />
										<p class="font-medium">No intent rules configured yet</p>
										<p class="text-sm text-muted-foreground/70">
											Click "Add Rule" to create your first routing rule
										</p>
									</div>
								{/if}
							</td>
						</tr>
					{:else}
						{#each filteredRules as rule}
							<tr class="transition-colors hover:bg-muted/30">
								<td class="px-6 py-4">
									<div class="flex items-center gap-2">
										<code class="rounded bg-muted px-2 py-1 font-mono text-sm">
											{rule.pattern}
										</code>
									</div>
								</td>
								<td class="px-6 py-4">
									<Badge variant="outline" class="text-xs">
										{getAgentDisplayName(rule.agentName)}
									</Badge>
								</td>
								<td class="px-6 py-4">
									<span class="font-mono text-sm tabular-nums">{rule.priority}</span>
								</td>
								<td class="px-6 py-4">
									<Badge
										variant="outline"
										class="text-xs tabular-nums {rule.confidence * 100 >= 80
											? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600'
											: rule.confidence * 100 >= 50
												? 'border-yellow-500/20 bg-yellow-500/10 text-yellow-600'
												: 'border-red-500/20 bg-red-500/10 text-red-600'}"
									>
										{(rule.confidence * 100).toFixed(0)}%
									</Badge>
								</td>
								<td class="px-6 py-4">
									<div class="flex items-center gap-3">
										<Switch
											checked={rule.isEnabled}
											onCheckedChange={() => toggleRuleEnabled(rule._id, rule.isEnabled)}
										/>
										<Badge
											variant={rule.isEnabled ? 'outline' : 'secondary'}
											class={rule.isEnabled
												? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600'
												: 'text-muted-foreground'}
										>
											{rule.isEnabled ? 'Active' : 'Inactive'}
										</Badge>
									</div>
								</td>
								<td class="px-6 py-4 text-right">
									<div class="flex justify-end gap-2">
										<Button
											variant="ghost"
											size="sm"
											onclick={() => openEditModal(rule)}
											class="h-8 text-muted-foreground hover:text-foreground"
										>
											Edit
										</Button>
										<Button
											variant="ghost"
											size="icon"
											onclick={() => handleDeleteRule(rule._id)}
											aria-label="Delete rule for pattern {rule.pattern}"
											class="h-8 w-8 text-muted-foreground hover:text-destructive"
										>
											<Trash2 class="h-4 w-4" />
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
	{#if rulesQuery.data}
		<div class="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
			<div class="rounded-xl border border-muted bg-card p-4 shadow-sm">
				<div class="text-2xl font-bold text-primary tabular-nums">{rulesQuery.data.length}</div>
				<div class="text-xs font-medium text-muted-foreground">Total Rules</div>
			</div>
			<div class="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 shadow-sm">
				<div class="text-2xl font-bold text-emerald-600 tabular-nums">
					{rulesQuery.data.filter((r) => r.isEnabled).length}
				</div>
				<div class="text-xs font-medium text-muted-foreground">Active</div>
			</div>
			<div class="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 shadow-sm">
				<div class="text-2xl font-bold text-violet-600 tabular-nums">
					{agentsQuery.data ? new Set(rulesQuery.data.map((r) => r.agentName)).size : 0}
				</div>
				<div class="text-xs font-medium text-muted-foreground">Agents Covered</div>
			</div>
			<div class="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 shadow-sm">
				<div class="text-2xl font-bold text-blue-600 tabular-nums">
					{rulesQuery.data.length > 0 ? Math.max(...rulesQuery.data.map((r) => r.priority)) : 0}
				</div>
				<div class="text-xs font-medium text-muted-foreground">Highest Priority</div>
			</div>
		</div>
	{/if}
</div>

<!-- Edit Modal -->
<IntentRuleModal
	open={isEditModalOpen}
	rule={editingRule}
	isNew={isAddingNew}
	agents={agentsQuery.data || []}
	onClose={closeEditModal}
	onSave={handleSaveRule}
/>
