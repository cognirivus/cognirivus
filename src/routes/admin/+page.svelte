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
		RefreshCw
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

	async function fetchUsers() {
		loading = true;
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
	<div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">User Management</h1>
			<p class="text-muted-foreground">
				Monitor and manage application users and their permissions.
			</p>
		</div>
		<div class="flex items-center gap-2">
			<Button variant="outline" size="sm" onclick={fetchUsers} disabled={loading}>
				<RefreshCw class="mr-2 h-4 w-4 {loading ? 'animate-spin' : ''}" />
				Refresh
			</Button>
		</div>
	</div>

	<Card.Root class="mb-8">
		<Card.Header class="pb-4">
			<Card.Title>Search Filters</Card.Title>
			<Card.Description>Filter users by email address or search terms.</Card.Description>
		</Card.Header>
		<Card.Content>
			<div class="flex flex-col gap-4 sm:flex-row">
				<div class="relative flex-1">
					<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						type="text"
						placeholder="Search users by email..."
						bind:value={searchTerm}
						onkeydown={(e) => e.key === 'Enter' && fetchUsers()}
						class="pl-10"
					/>
				</div>
				<Button onclick={fetchUsers} disabled={loading}>Search</Button>
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Content class="p-0">
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b bg-muted/50 transition-colors hover:bg-muted/50">
							<th class="h-12 px-4 text-left align-middle font-medium text-muted-foreground"
								>User</th
							>
							<th class="h-12 px-4 text-left align-middle font-medium text-muted-foreground"
								>Role</th
							>
							<th class="h-12 px-4 text-left align-middle font-medium text-muted-foreground"
								>Status</th
							>
							<th class="h-12 px-4 text-right align-middle font-medium text-muted-foreground"
								>Actions</th
							>
						</tr>
					</thead>
					<tbody class="divide-y">
						{#if loading && users.length === 0}
							{#each Array(5) as _}
								<tr>
									<td class="p-4"><Skeleton class="h-10 w-[200px]" /></td>
									<td class="p-4"><Skeleton class="h-6 w-[80px] rounded-full" /></td>
									<td class="p-4"><Skeleton class="h-6 w-[80px] rounded-full" /></td>
									<td class="p-4 text-right"><Skeleton class="ml-auto h-8 w-[100px]" /></td>
								</tr>
							{/each}
						{:else if users.length === 0}
							<tr>
								<td colspan="4" class="p-8 text-center text-muted-foreground">
									No users found matching your search.
								</td>
							</tr>
						{:else}
							{#each users as user}
								<tr class="transition-colors hover:bg-muted/30">
									<td class="p-4">
										<div class="flex flex-col">
											<span class="font-medium text-foreground">{user.name || 'Anonymous'}</span>
											<span class="text-xs text-muted-foreground">{user.email}</span>
										</div>
									</td>
									<td class="p-4">
										<Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
											{user.role || 'regular'}
										</Badge>
									</td>
									<td class="p-4">
										{#if user.banned}
											<Badge variant="destructive" class="gap-1">
												<ShieldAlert class="h-3 w-3" />
												Banned
											</Badge>
										{:else}
											<Badge
												variant="outline"
												class="gap-1 border-green-500/50 bg-green-500/10 text-green-600 dark:text-green-400"
											>
												<Shield class="h-3 w-3" />
												Active
											</Badge>
										{/if}
									</td>
									<td class="p-4 text-right">
										<div class="flex justify-end gap-2">
											<Button
												variant="ghost"
												size="icon-sm"
												onclick={() => toggleRole(user.id, user.role)}
												title={user.role === 'admin' ? 'Remove Admin' : 'Make Admin'}
												class="rounded-full"
											>
												<ShieldCheck class="h-4 w-4" />
											</Button>
											<Button
												variant="ghost"
												size="icon-sm"
												onclick={() => toggleBan(user.id, user.banned)}
												class="rounded-full {user.banned
													? 'text-green-600 hover:bg-green-50 hover:text-green-700'
													: 'text-destructive hover:bg-destructive/10 hover:text-destructive'}"
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
		</Card.Content>
	</Card.Root>
</div>
