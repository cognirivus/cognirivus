<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { Button } from '$lib/components/ui/button';
	import {
		Shield,
		ShieldAlert,
		ShieldCheck,
		UserMinus,
		UserCheck,
		Search,
		BookOpen
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
	<div class="mb-8 flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
			<p class="mt-2 text-muted-foreground">Manage users and application settings.</p>
		</div>
		<Button href="/admin/blog" variant="outline" class="gap-2">
			<BookOpen class="h-4 w-4" />
			Manage Blog
		</Button>
	</div>

	<div class="mb-6 flex gap-2">
		<div class="relative flex-1">
			<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
			<input
				type="text"
				placeholder="Search users by email..."
				bind:value={searchTerm}
				onkeydown={(e) => e.key === 'Enter' && fetchUsers()}
				class="w-full rounded-md border border-input bg-background py-2 pr-4 pl-10 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
			/>
		</div>
		<Button onclick={fetchUsers}>Search</Button>
	</div>

	<div class="rounded-lg border bg-card text-card-foreground shadow-sm">
		<div class="overflow-x-auto">
			<table class="w-full text-sm">
				<thead class="border-b bg-muted/50">
					<tr>
						<th class="px-4 py-3 text-left font-medium">User</th>
						<th class="px-4 py-3 text-left font-medium">Role</th>
						<th class="px-4 py-3 text-left font-medium">Status</th>
						<th class="px-4 py-3 text-right font-medium">Actions</th>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#if loading}
						<tr>
							<td colspan="4" class="px-4 py-8 text-center text-muted-foreground">
								Loading users...
							</td>
						</tr>
					{:else if users.length === 0}
						<tr>
							<td colspan="4" class="px-4 py-8 text-center text-muted-foreground">
								No users found.
							</td>
						</tr>
					{:else}
						{#each users as user}
							<tr class="transition-colors hover:bg-muted/30">
								<td class="px-4 py-3">
									<div class="flex flex-col">
										<span class="font-medium">{user.name || 'No Name'}</span>
										<span class="text-xs text-muted-foreground">{user.email}</span>
									</div>
								</td>
								<td class="px-4 py-3">
									<span
										class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {user.role ===
										'admin'
											? 'bg-primary/10 text-primary'
											: 'bg-muted text-muted-foreground'}"
									>
										{user.role || 'regular'}
									</span>
								</td>
								<td class="px-4 py-3">
									{#if user.banned}
										<span
											class="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
										>
											<ShieldAlert class="h-3 w-3" />
											Banned
										</span>
									{:else}
										<span
											class="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600"
										>
											<Shield class="h-3 w-3" />
											Active
										</span>
									{/if}
								</td>
								<td class="px-4 py-3 text-right">
									<div class="flex justify-end gap-2">
										<Button
											variant="outline"
											size="sm"
											onclick={() => toggleRole(user.id, user.role)}
											title={user.role === 'admin' ? 'Remove Admin' : 'Make Admin'}
										>
											<ShieldCheck class="h-4 w-4" />
										</Button>
										<Button
											variant="outline"
											size="sm"
											onclick={() => toggleBan(user.id, user.banned)}
											class={user.banned ? 'text-green-600' : 'text-destructive'}
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
