<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Badge } from '$lib/components/ui/badge';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Separator } from '$lib/components/ui/separator';
	import { Input } from '$lib/components/ui/input';
	import * as Dialog from '$lib/components/ui/dialog';
	import { z } from 'zod/v4';
	import {
		User,
		Mail,
		Calendar,
		Shield,
		ShieldCheck,
		LogOut,
		Clock,
		ArrowLeft,
		ExternalLink,
		Trash2,
		AlertTriangle,
		Pencil,
		Loader2
	} from '@lucide/svelte';
	import { authClient } from '$lib/auth-client';
	import { goto, invalidateAll } from '$app/navigation';
	import { useConvexClient } from 'convex-svelte';
	import { api } from '../../convex/_generated/api';
	import { toast } from 'svelte-sonner';

	interface Props {
		data: {
			currentUser: any;
			authState: any;
		};
	}

	let { data }: Props = $props();
	const session = authClient.useSession();
	const user = $derived($session.data?.user || data.currentUser);
	const client = useConvexClient();

	let editNameOpen = $state(false);
	let editNameValue = $state('');
	let isUpdatingName = $state(false);
	let nameError = $state('');

	const NAME_MAX = 50;

	const nameSchema = z
		.string()
		.trim()
		.min(2, 'Name must be at least 2 characters.')
		.max(NAME_MAX, `Name must be at most ${NAME_MAX} characters.`)
		.regex(/^[a-zA-Z\s.\-']+$/, 'Name can only contain letters, spaces, hyphens, apostrophes, and dots.');

	function validateName(value: string): string {
		const result = nameSchema.safeParse(value);
		return result.success ? '' : result.error.issues[0].message;
	}

	function openEditName() {
		editNameValue = user?.name || '';
		nameError = '';
		editNameOpen = true;
	}

	async function handleUpdateName() {
		const trimmed = editNameValue.trim();
		nameError = validateName(trimmed);
		if (nameError) return;

		if (trimmed === user?.name) {
			editNameOpen = false;
			return;
		}

		isUpdatingName = true;
		try {
			await authClient.updateUser({ name: trimmed });
			toast.success('Name updated successfully.');
			editNameOpen = false;
		} catch (error) {
			console.error('Failed to update name:', error);
			toast.error('Failed to update name. Please try again.');
		} finally {
			isUpdatingName = false;
		}
	}

	async function signOut() {
		await authClient.signOut();
		await invalidateAll();
		goto('/signin');
	}

	async function handleDeleteAllChats() {
		if (
			!confirm(
				'Are you sure you want to delete ALL chat history? This action cannot be undone and will permanently remove all your threads and messages.'
			)
		) {
			return;
		}

		try {
			await client.mutation(api.threads.deleteAll, {});
			toast.success('All chat history has been deleted.');
			await invalidateAll();
		} catch (error) {
			console.error('Failed to delete chats:', error);
			toast.error('Failed to delete chat history. Please try again.');
		}
	}

	const formatDate = (timestamp: any) => {
		if (!timestamp) return 'Unknown';
		const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
		return date.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	};
</script>

<div class="container mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:py-12">
	<!-- Page Header -->
	<div class="mb-10">
		<div class="flex items-center gap-2.5">
			<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
				<User class="h-4 w-4 text-primary" />
			</div>
			<span class="text-xs font-bold tracking-widest text-muted-foreground uppercase">Account</span>
		</div>
		<h1 class="mt-3 text-3xl font-semibold tracking-tight">Your Profile</h1>
		<p class="mt-2 text-muted-foreground">Manage your account details and preferences.</p>
	</div>

	{#if user}
		<div class="grid gap-8 lg:grid-cols-3">
			<!-- Profile Card -->
			<div class="lg:col-span-1">
				<div class="overflow-hidden rounded-xl border bg-card">
					<div class="h-24 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent"></div>
					<div class="relative px-6 pb-6 text-center">
						<div class="absolute -top-28 left-1/2 -translate-x-1/2">
							<Avatar.Root class="h-24 w-24 border-4 border-background shadow-lg">
								<Avatar.Image src={user.image} alt={user.name} />
								<Avatar.Fallback class="bg-muted text-3xl font-semibold">
									{user.name?.charAt(0) || 'U'}
								</Avatar.Fallback>
							</Avatar.Root>
						</div>
						<div class="mt-16">
							<h2 class="truncate text-xl font-semibold" title={user.name}>
								{user.name}
							</h2>
							<p class="mt-1 truncate text-sm text-muted-foreground" title={user.email}>
								{user.email}
							</p>

							<div class="mt-4">
								<Badge
									variant={user.role === 'admin' ? 'default' : 'secondary'}
									class="gap-1.5 px-3 py-1"
								>
									{#if user.role === 'admin'}
										<ShieldCheck class="h-3 w-3" />
									{:else}
										<User class="h-3 w-3" />
									{/if}
									<span class="capitalize">{user.role || 'regular'}</span>
								</Badge>
							</div>
						</div>
					</div>
					<div class="border-t bg-muted/20 p-4">
						<Button variant="destructive" class="w-full gap-2" onclick={signOut}>
							<LogOut class="h-4 w-4" />
							Sign Out
						</Button>
					</div>
				</div>
			</div>

			<!-- Details Section -->
			<div class="space-y-6 lg:col-span-2">
				<div class="rounded-xl border bg-card">
					<div class="border-b px-6 py-4">
						<h3 class="text-sm font-semibold">Account Information</h3>
						<p class="mt-0.5 text-xs text-muted-foreground">
							Your private details used for authentication and identification.
						</p>
					</div>
					<div class="space-y-3 p-6">
						{#if user.role === 'admin'}
							<div
								class="flex items-center gap-4 rounded-xl bg-muted/30 p-4 transition-colors hover:bg-muted/40"
							>
								<div
									class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background shadow-sm"
								>
									<Shield class="h-4 w-4 text-primary" />
								</div>
								<div class="min-w-0 flex-1">
									<p
										class="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase"
									>
										System Identifier
									</p>
									<p class="truncate font-mono text-xs">{user.id}</p>
								</div>
							</div>
						{/if}

						<div
							class="flex items-center gap-4 rounded-xl bg-muted/30 p-4 transition-colors hover:bg-muted/40"
						>
							<div
								class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background shadow-sm"
							>
								<User class="h-4 w-4 text-primary" />
							</div>
							<div class="min-w-0 flex-1">
								<p
									class="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase"
								>
									Display Name
								</p>
								<p class="truncate text-sm font-medium">{user.name || 'Not provided'}</p>
							</div>
							<Button variant="ghost" size="icon" class="shrink-0" onclick={openEditName}>
								<Pencil class="h-4 w-4 text-muted-foreground" />
							</Button>
						</div>

						<div
							class="flex items-center gap-4 rounded-xl bg-muted/30 p-4 transition-colors hover:bg-muted/40"
						>
							<div
								class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background shadow-sm"
							>
								<Mail class="h-4 w-4 text-primary" />
							</div>
							<div class="min-w-0 flex-1">
								<p
									class="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase"
								>
									Verified Email
								</p>
								<p class="truncate text-sm font-medium">{user.email}</p>
							</div>
						</div>

						<Separator class="my-3" />

						<div class="grid gap-3 sm:grid-cols-2">
							<div
								class="flex items-center gap-4 rounded-xl bg-muted/30 p-4 transition-colors hover:bg-muted/40"
							>
								<div
									class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background shadow-sm"
								>
									<Calendar class="h-4 w-4 text-primary" />
								</div>
								<div class="min-w-0 flex-1">
									<p
										class="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase"
									>
										Member Since
									</p>
									<p class="truncate text-sm font-medium">{formatDate(user.createdAt)}</p>
								</div>
							</div>

							<div
								class="flex items-center gap-4 rounded-xl bg-muted/30 p-4 transition-colors hover:bg-muted/40"
							>
								<div
									class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background shadow-sm"
								>
									<Clock class="h-4 w-4 text-primary" />
								</div>
								<div class="min-w-0 flex-1">
									<p
										class="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase"
									>
										Last Modified
									</p>
									<p class="truncate text-sm font-medium">{formatDate(user.updatedAt)}</p>
								</div>
							</div>
						</div>
					</div>
				</div>

				{#if user.role === 'admin'}
					<div class="rounded-xl border border-primary/20 bg-primary/5 p-5">
						<div class="flex items-start gap-4">
							<div
								class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15"
							>
								<ShieldCheck class="h-5 w-5 text-primary" />
							</div>
							<div class="flex-1">
								<h4 class="text-sm font-semibold text-primary">Admin Privileges Active</h4>
								<p class="mt-1 text-xs text-primary/70">
									You have full access to manage the system and its resources.
								</p>
								<Button href="/admin" class="mt-4 gap-2" size="sm">
									<ExternalLink class="h-3.5 w-3.5" />
									Access Control Panel
								</Button>
							</div>
						</div>
					</div>
				{/if}

				<!-- Danger Zone -->
				<div class="rounded-xl border border-destructive/20 bg-destructive/5 p-5">
					<div class="flex items-start gap-4">
						<div
							class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/15"
						>
							<AlertTriangle class="h-5 w-5 text-destructive" />
						</div>
						<div class="flex-1">
							<h4 class="text-sm font-semibold text-destructive">Danger Zone</h4>
							<p class="mt-1 text-xs text-destructive/70">
								Irreversible actions related to your data.
							</p>
							<div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
								<div>
									<p class="text-xs font-medium text-foreground">Delete All Chat History</p>
									<p class="text-[10px] text-muted-foreground">
										Permanently remove all threads and messages.
									</p>
								</div>
								<Button
									variant="destructive"
									size="sm"
									class="gap-2"
									onclick={handleDeleteAllChats}
								>
									<Trash2 class="h-3.5 w-3.5" />
									Delete Everything
								</Button>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	{:else if $session.isPending}
		<div class="grid gap-8 lg:grid-cols-3">
			<div class="lg:col-span-1">
				<div class="overflow-hidden rounded-xl border bg-card">
					<Skeleton class="h-24 w-full" />
					<div class="relative px-6 pb-6 text-center">
						<div class="absolute -top-12 left-1/2 -translate-x-1/2">
							<Skeleton class="h-24 w-24 rounded-full border-4 border-background" />
						</div>
						<div class="mt-16 flex flex-col items-center space-y-2">
							<Skeleton class="h-6 w-32" />
							<Skeleton class="h-4 w-48" />
							<Skeleton class="mt-2 h-6 w-20 rounded-full" />
						</div>
					</div>
				</div>
			</div>
			<div class="lg:col-span-2">
				<div class="rounded-xl border bg-card p-6">
					<Skeleton class="mb-2 h-5 w-40" />
					<Skeleton class="h-4 w-64" />
					<div class="mt-6 space-y-3">
						{#each Array(4) as _}
							<Skeleton class="h-16 w-full rounded-xl" />
						{/each}
					</div>
				</div>
			</div>
		</div>
	{:else}
		<div class="rounded-xl border border-dashed bg-card p-16 text-center">
			<div class="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
				<User class="h-8 w-8 text-muted-foreground" />
			</div>
			<h3 class="text-lg font-semibold">Please sign in</h3>
			<p class="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
				You need to be logged in to view and manage your profile details.
			</p>
			<Button href="/signin" size="lg" class="mt-6">Sign In to Account</Button>
		</div>
	{/if}
</div>

<Dialog.Root bind:open={editNameOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Update Display Name</Dialog.Title>
			<Dialog.Description>
				Enter a new display name for your account. You can only change your name once every 24
				hours.
			</Dialog.Description>
		</Dialog.Header>
		<form
			onsubmit={(e) => {
				e.preventDefault();
				handleUpdateName();
			}}
		>
			<div class="mb-4 space-y-1.5">
				<Input
					bind:value={editNameValue}
					placeholder="Your name"
					maxlength={NAME_MAX}
					disabled={isUpdatingName}
					oninput={() => {
						if (nameError) nameError = validateName(editNameValue);
					}}
					class={nameError ? 'border-destructive' : ''}
				/>
				{#if nameError}
					<p class="text-xs text-destructive">{nameError}</p>
				{/if}
				<p class="text-xs text-muted-foreground">
					{editNameValue.trim().length}/{NAME_MAX} characters
				</p>
			</div>
			<Dialog.Footer>
				<Button variant="outline" type="button" onclick={() => (editNameOpen = false)}>
					Cancel
				</Button>
				<Button type="submit" disabled={isUpdatingName || !editNameValue.trim()}>
					{#if isUpdatingName}
						<Loader2 class="mr-2 h-4 w-4 animate-spin" />
					{/if}
					Save
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
