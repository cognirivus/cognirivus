<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import {
		Shield,
		ShieldAlert,
		ShieldCheck,
		UserMinus,
		UserCheck,
		Search,
		RefreshCw,
		X
	} from '@lucide/svelte';

	interface Props {
		data: {
			user: any;
		};
	}

	let { data }: Props = $props();
	let users = $state<any[]>([]);
	let loading = $state(true);
	let searchTerm = $state('');
	let appliedSearch = $state('');

	async function fetchUsers() {
		loading = true;
		appliedSearch = searchTerm;
		// @ts-ignore - Better Auth types can be tricky with plugins
		const { data, error } = await authClient.admin.listUsers({
			query: {
				limit: 100,
				searchValue: searchTerm,
				searchField: 'email'
			}
		});
		if (data) {
			users = data.users;
		}
		loading = false;
	}

	function clearSearch() {
		searchTerm = '';
		fetchUsers();
	}

	async function toggleBan(userId: string, isBanned: boolean) {
		if (isBanned) {
			await authClient.admin.unbanUser({ userId });
		} else {
			await authClient.admin.banUser({ userId });
		}
		await fetchUsers();
	}

	async function toggleRole(userId: string, currentRole: string) {
		const newRole = currentRole === 'admin' ? 'regular' : 'admin';
		await authClient.admin.setRole({ userId, role: newRole as any });
		await fetchUsers();
	}

	$effect(() => {
		fetchUsers();
	});
</script>

<div class="container mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
	<!-- Header -->
	<div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div class="space-y-2">
			<h1 class="text-3xl font-semibold tracking-tight">User Management</h1>
			<p class="text-muted-foreground">
				Monitor and manage application users and their permissions.
			</p>
		</div>
		<Button
			variant="outline"
			size="sm"
			onclick={fetchUsers}
			disabled={loading}
			class="gap-2 font-medium"
		>
			<RefreshCw class="h-4 w-4 {loading ? 'animate-spin' : ''}" />
			Refresh
		</Button>
	</div>

	<!-- Filters -->
	<div class="mb-8 rounded-xl border bg-card p-5 shadow-sm">
		<div class="flex flex-col gap-4 sm:flex-row">
			<div class="relative flex-1">
				<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					type="text"
					placeholder="Search users by email..."
					bind:value={searchTerm}
					onkeydown={(e) => e.key === 'Enter' && fetchUsers()}
					class="h-10 bg-background pl-9"
				/>
			</div>
			<Button onclick={fetchUsers} disabled={loading} class="h-10 px-6 font-semibold">Search</Button
			>
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

	<!-- Users Table -->
	<div class="overflow-hidden rounded-xl border bg-card shadow-sm">
		<div class="overflow-x-auto">
			<table class="w-full text-left text-sm">
				<thead>
					<tr class="border-b bg-muted/40 transition-colors">
						<th class="h-12 px-6 align-middle font-medium text-muted-foreground">User</th>
						<th class="h-12 px-6 align-middle font-medium text-muted-foreground">Role</th>
						<th class="h-12 px-6 align-middle font-medium text-muted-foreground">Status</th>
						<th class="h-12 px-6 text-right align-middle font-medium text-muted-foreground"
							>Actions</th
						>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#if loading && users.length === 0}
						{#each Array(5) as _}
							<tr>
								<td class="p-6"><Skeleton class="h-10 w-[200px]" /></td>
								<td class="p-6"><Skeleton class="h-6 w-[80px] rounded-full" /></td>
								<td class="p-6"><Skeleton class="h-6 w-[80px] rounded-full" /></td>
								<td class="p-6 text-right"><Skeleton class="ml-auto h-8 w-[100px]" /></td>
							</tr>
						{/each}
					{:else if users.length === 0}
						<tr>
							<td colspan="4" class="p-12 text-center text-muted-foreground">
								No users found matching your search.
							</td>
						</tr>
					{:else}
						{#each users as user}
							<tr class="transition-colors hover:bg-muted/30">
								<td class="px-6 py-4">
									<div class="flex flex-col">
										<span class="font-medium text-foreground">{user.name || 'Anonymous'}</span>
										<span class="text-xs text-muted-foreground">{user.email}</span>
									</div>
								</td>
								<td class="px-6 py-4">
									<Badge
										variant={user.role === 'admin' ? 'default' : 'secondary'}
										class="font-medium capitalize"
									>
										{user.role || 'regular'}
									</Badge>
								</td>
								<td class="px-6 py-4">
									{#if user.banned}
										<Badge variant="destructive" class="gap-1.5 font-medium">
											<ShieldAlert class="h-3 w-3" />
											Banned
										</Badge>
									{:else}
										<Badge
											variant="outline"
											class="gap-1.5 border-emerald-500/20 bg-emerald-500/5 font-medium text-emerald-600 dark:text-emerald-400"
										>
											<ShieldCheck class="h-3 w-3" />
											Active
										</Badge>
									{/if}
								</td>
								<td class="px-6 py-4 text-right">
									<div class="flex justify-end gap-2">
										<Button
											variant="ghost"
											size="icon"
											onclick={() => toggleRole(user.id, user.role)}
											title={user.role === 'admin' ? 'Remove Admin' : 'Make Admin'}
											class="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
										>
											<Shield class="h-4 w-4" />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											onclick={() => toggleBan(user.id, user.banned)}
											class="h-8 w-8 rounded-full {user.banned
												? 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700'
												: 'text-destructive/80 hover:bg-destructive/10 hover:text-destructive'}"
											title={user.banned ? 'Unban User' : 'Ban User'}
										>
											{#if user.banned}
												<UserCheck class="h-4 w-4" />
											{:else}
												<UserMinus class="h-4 w-4" />
											{/if}
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
</div>
