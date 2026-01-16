<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Badge } from '$lib/components/ui/badge';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Separator } from '$lib/components/ui/separator';
	import {
		User,
		Mail,
		Calendar,
		Shield,
		ShieldCheck,
		LogOut,
		Clock,
		ArrowLeft,
		ExternalLink
	} from '@lucide/svelte';
	import { authClient } from '$lib/auth-client';
	import { goto, invalidateAll } from '$app/navigation';

	interface Props {
		data: {
			currentUser: any;
			authState: any;
		};
	}

	let { data }: Props = $props();
	const session = authClient.useSession();
	const user = $derived($session.data?.user || data.currentUser);

	async function signOut() {
		await authClient.signOut();
		await invalidateAll();
		goto('/signin');
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

<div class="container mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
	<div class="mb-10">
		<h1 class="text-4xl font-extrabold tracking-tight">Your Profile</h1>
		<p class="mt-2 text-muted-foreground">Manage your account details and preferences.</p>
	</div>

	{#if user}
		<div class="grid gap-8 md:grid-cols-3">
			<!-- Profile Card -->
			<div class="md:col-span-1">
				<Card.Root class="overflow-hidden border-none shadow-lg">
					<div class="h-32 bg-linear-to-br from-primary/20 via-primary/10 to-transparent"></div>
					<Card.Content class="relative px-6 pb-6 text-center">
						<div class="absolute -top-16 left-1/2 -translate-x-1/2">
							<Avatar.Root class="h-32 w-32 border-4 border-background shadow-xl">
								<Avatar.Image src={user.image} alt={user.name} />
								<Avatar.Fallback class="bg-muted text-4xl font-bold">
									{user.name?.charAt(0) || 'U'}
								</Avatar.Fallback>
							</Avatar.Root>
						</div>
						<div class="mt-20">
							<h2 class="text-2xl font-bold tracking-tight">{user.name}</h2>
							<p class="text-sm text-muted-foreground">{user.email}</p>

							<div class="mt-4 flex flex-wrap justify-center gap-2">
								<Badge
									variant={user.role === 'admin' ? 'default' : 'secondary'}
									class="gap-1.5 px-3 py-1"
								>
									{#if user.role === 'admin'}
										<ShieldCheck class="h-3.5 w-3.5" />
									{:else}
										<User class="h-3.5 w-3.5" />
									{/if}
									{user.role || 'regular'}
								</Badge>
							</div>
						</div>
					</Card.Content>
					<Separator />
					<div class="bg-muted/50 p-4">
						<Button
							variant="destructive"
							class="w-full gap-2 font-medium transition-all duration-200 hover:shadow-lg hover:shadow-destructive/20 active:scale-95"
							onclick={signOut}
						>
							<LogOut class="h-4 w-4" />
							Sign Out
						</Button>
					</div>
				</Card.Root>
			</div>

			<!-- Details Section -->
			<div class="space-y-6 md:col-span-2">
				<Card.Root>
					<Card.Header>
						<Card.Title>Account Information</Card.Title>
						<Card.Description
							>Your private details used for authentication and identification.</Card.Description
						>
					</Card.Header>
					<Card.Content class="space-y-4">
						{#if user.role === 'admin'}
							<div
								class="flex items-center gap-4 rounded-xl border bg-muted/20 p-4 transition-colors hover:bg-muted/30"
							>
								<div
									class="flex h-10 w-10 items-center justify-center rounded-full bg-background shadow-sm"
								>
									<Shield class="h-5 w-5 text-primary" />
								</div>
								<div class="flex-1 overflow-hidden">
									<p class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
										System Identifier
									</p>
									<p class="truncate font-mono text-xs">{user.id}</p>
								</div>
							</div>
						{/if}

						<div
							class="flex items-center gap-4 rounded-xl border bg-muted/20 p-4 transition-colors hover:bg-muted/30"
						>
							<div
								class="flex h-10 w-10 items-center justify-center rounded-full bg-background shadow-sm"
							>
								<User class="h-5 w-5 text-primary" />
							</div>
							<div class="flex-1">
								<p class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
									Display Name
								</p>
								<p class="font-medium">{user.name || 'Not provided'}</p>
							</div>
						</div>

						<div
							class="flex items-center gap-4 rounded-xl border bg-muted/20 p-4 transition-colors hover:bg-muted/30"
						>
							<div
								class="flex h-10 w-10 items-center justify-center rounded-full bg-background shadow-sm"
							>
								<Mail class="h-5 w-5 text-primary" />
							</div>
							<div class="flex-1">
								<p class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
									Verified Email
								</p>
								<p class="font-medium">{user.email}</p>
							</div>
						</div>

						<Separator class="my-2" />

						<div class="grid gap-4 sm:grid-cols-2">
							<div
								class="flex items-center gap-4 rounded-xl border bg-muted/20 p-4 transition-colors hover:bg-muted/30"
							>
								<div
									class="flex h-10 w-10 items-center justify-center rounded-full bg-background shadow-sm"
								>
									<Calendar class="h-5 w-5 text-primary" />
								</div>
								<div class="flex-1">
									<p class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
										Member Since
									</p>
									<p class="font-medium">{formatDate(user.createdAt)}</p>
								</div>
							</div>

							<div
								class="flex items-center gap-4 rounded-xl border bg-muted/20 p-4 transition-colors hover:bg-muted/30"
							>
								<div
									class="flex h-10 w-10 items-center justify-center rounded-full bg-background shadow-sm"
								>
									<Clock class="h-5 w-5 text-primary" />
								</div>
								<div class="flex-1">
									<p class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
										Last Modified
									</p>
									<p class="font-medium">{formatDate(user.updatedAt)}</p>
								</div>
							</div>
						</div>
					</Card.Content>
				</Card.Root>

				{#if user.role === 'admin'}
					<Card.Root class="border-primary/20 bg-primary/5">
						<Card.Header class="flex flex-row items-center gap-4 space-y-0">
							<div class="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
								<ShieldCheck class="h-6 w-6 text-primary" />
							</div>
							<div class="flex-1">
								<Card.Title class="text-primary">Admin Privileges Active</Card.Title>
								<Card.Description class="text-primary/70">
									You have full access to manage the system and its resources.
								</Card.Description>
							</div>
						</Card.Header>
						<Card.Footer>
							<Button href="/admin" class="w-full gap-2 shadow-md shadow-primary/20 sm:w-auto">
								<ExternalLink class="h-4 w-4" />
								Access Control Panel
							</Button>
						</Card.Footer>
					</Card.Root>
				{/if}
			</div>
		</div>
	{:else if $session.isPending}
		<div class="grid gap-8 md:grid-cols-3">
			<div class="md:col-span-1">
				<Card.Root class="overflow-hidden border-none shadow-lg">
					<Skeleton class="h-32 w-full" />
					<Card.Content class="relative px-6 pb-6 text-center">
						<div class="absolute -top-16 left-1/2 -translate-x-1/2">
							<Skeleton class="h-32 w-32 rounded-full" />
						</div>
						<div class="mt-20 flex flex-col items-center space-y-2">
							<Skeleton class="h-6 w-32" />
							<Skeleton class="h-4 w-48" />
							<Skeleton class="mt-2 h-6 w-20 rounded-full" />
						</div>
					</Card.Content>
				</Card.Root>
			</div>
			<div class="md:col-span-2">
				<Card.Root>
					<Card.Header>
						<Skeleton class="h-6 w-48" />
						<Skeleton class="h-4 w-64" />
					</Card.Header>
					<Card.Content class="space-y-4">
						{#each Array(4) as _}
							<Skeleton class="h-20 w-full rounded-xl" />
						{/each}
					</Card.Content>
				</Card.Root>
			</div>
		</div>
	{:else}
		<Card.Root class="flex flex-col items-center justify-center border-dashed py-12 text-center">
			<Card.Content class="flex flex-col items-center pt-6">
				<div class="mb-4 rounded-full bg-muted p-6 text-muted-foreground/20">
					<User class="h-16 w-16" />
				</div>
				<Card.Title class="text-2xl font-bold">Please sign in</Card.Title>
				<Card.Description class="mt-2 max-w-xs text-balance">
					You need to be logged in to view and manage your profile details.
				</Card.Description>
			</Card.Content>
			<Card.Footer>
				<Button href="/signin" size="lg" class="px-8">Sign In to Account</Button>
			</Card.Footer>
		</Card.Root>
	{/if}
</div>
