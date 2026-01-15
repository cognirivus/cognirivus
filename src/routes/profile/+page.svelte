<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import {
		User,
		Mail,
		Calendar,
		Shield,
		ShieldCheck,
		LogOut,
		Clock,
		ArrowLeft
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

<div class="container mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
	<div class="mb-8">
		<Button variant="ghost" href="/" class="mb-4 gap-2">
			<ArrowLeft class="h-4 w-4" />
			Back to Home
		</Button>
		<h1 class="text-4xl font-extrabold tracking-tight">Your Profile</h1>
		<p class="mt-2 text-muted-foreground">Manage your account details and preferences.</p>
	</div>

	{#if user}
		<div class="grid gap-6 md:grid-cols-3">
			<!-- Profile Card -->
			<div class="md:col-span-1">
				<div class="overflow-hidden rounded-2xl border bg-card shadow-sm">
					<div class="h-24 bg-gradient-to-br from-primary/20 to-primary/5"></div>
					<div class="relative px-6 pb-6 text-center">
						<div class="absolute -top-12 left-1/2 -translate-x-1/2">
							{#if user.image}
								<img
									src={user.image}
									alt={user.name}
									class="h-24 w-24 rounded-full border-4 border-background object-cover shadow-lg"
								/>
							{:else}
								<div
									class="flex h-24 w-24 items-center justify-center rounded-full border-4 border-background bg-muted text-3xl font-bold shadow-lg"
								>
									{user.name?.charAt(0) || 'U'}
								</div>
							{/if}
						</div>
						<div class="mt-14">
							<h2 class="text-xl font-bold">{user.name}</h2>
							<p class="text-sm text-muted-foreground">{user.email}</p>

							<div class="mt-4 flex flex-wrap justify-center gap-2">
								<span
									class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold {user.role ===
									'admin'
										? 'bg-primary/10 text-primary'
										: 'bg-muted text-muted-foreground'}"
								>
									{#if user.role === 'admin'}
										<ShieldCheck class="h-3.5 w-3.5" />
									{:else}
										<User class="h-3.5 w-3.5" />
									{/if}
									{user.role || 'regular'}
								</span>
							</div>
						</div>
					</div>
					<div class="border-t p-4">
						<Button variant="destructive" class="w-full gap-2" onclick={signOut}>
							<LogOut class="h-4 w-4" />
							Sign Out
						</Button>
					</div>
				</div>
			</div>

			<!-- Details Section -->
			<div class="space-y-6 md:col-span-2">
				<div class="rounded-2xl border bg-card p-6 shadow-sm">
					<h3 class="mb-4 text-lg font-semibold">Account Information</h3>
					<div class="space-y-4">
						<div class="flex items-center gap-4 rounded-lg border bg-muted/30 p-4">
							<div
								class="flex h-10 w-10 items-center justify-center rounded-full bg-background shadow-sm"
							>
								<User class="h-5 w-5 text-primary" />
							</div>
							<div class="flex-1">
								<p class="text-xs font-medium tracking-wider text-muted-foreground uppercase">
									User ID
								</p>
								<p class="font-mono text-xs break-all">{user.id}</p>
							</div>
						</div>

						<div class="flex items-center gap-4 rounded-lg border bg-muted/30 p-4">
							<div
								class="flex h-10 w-10 items-center justify-center rounded-full bg-background shadow-sm"
							>
								<User class="h-5 w-5 text-primary" />
							</div>
							<div>
								<p class="text-xs font-medium tracking-wider text-muted-foreground uppercase">
									Full Name
								</p>
								<p class="font-medium">{user.name || 'Not provided'}</p>
							</div>
						</div>

						<div class="flex items-center gap-4 rounded-lg border bg-muted/30 p-4">
							<div
								class="flex h-10 w-10 items-center justify-center rounded-full bg-background shadow-sm"
							>
								<Mail class="h-5 w-5 text-primary" />
							</div>
							<div>
								<p class="text-xs font-medium tracking-wider text-muted-foreground uppercase">
									Email Address
								</p>
								<p class="font-medium">{user.email}</p>
							</div>
						</div>

						<div class="flex items-center gap-4 rounded-lg border bg-muted/30 p-4">
							<div
								class="flex h-10 w-10 items-center justify-center rounded-full bg-background shadow-sm"
							>
								<Shield class="h-5 w-5 text-primary" />
							</div>
							<div>
								<p class="text-xs font-medium tracking-wider text-muted-foreground uppercase">
									Access Level
								</p>
								<p class="font-medium capitalize">{user.role || 'regular'}</p>
							</div>
						</div>

						<div class="grid gap-4 sm:grid-cols-2">
							<div class="flex items-center gap-4 rounded-lg border bg-muted/30 p-4">
								<div
									class="flex h-10 w-10 items-center justify-center rounded-full bg-background shadow-sm"
								>
									<Calendar class="h-5 w-5 text-primary" />
								</div>
								<div>
									<p class="text-xs font-medium tracking-wider text-muted-foreground uppercase">
										Joined
									</p>
									<p class="font-medium">{formatDate(user.createdAt)}</p>
								</div>
							</div>

							<div class="flex items-center gap-4 rounded-lg border bg-muted/30 p-4">
								<div
									class="flex h-10 w-10 items-center justify-center rounded-full bg-background shadow-sm"
								>
									<Clock class="h-5 w-5 text-primary" />
								</div>
								<div>
									<p class="text-xs font-medium tracking-wider text-muted-foreground uppercase">
										Last Updated
									</p>
									<p class="font-medium">{formatDate(user.updatedAt)}</p>
								</div>
							</div>
						</div>
					</div>
				</div>

				{#if user.role === 'admin'}
					<div class="rounded-2xl border border-primary/20 bg-primary/5 p-6 shadow-sm">
						<div class="flex items-center gap-3">
							<ShieldCheck class="h-6 w-6 text-primary" />
							<div>
								<h3 class="font-semibold text-primary">Administrator Privileges</h3>
								<p class="text-sm text-primary/80">
									You have full access to the management console.
								</p>
							</div>
						</div>
						<Button variant="default" href="/admin" class="mt-4 shadow-md shadow-primary/20">
							Go to Admin Dashboard
						</Button>
					</div>
				{/if}
			</div>
		</div>
	{:else if $session.isPending}
		<div class="flex h-64 items-center justify-center">
			<div
				class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"
			></div>
		</div>
	{:else}
		<div
			class="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed text-center"
		>
			<User class="mb-4 h-12 w-12 text-muted-foreground" />
			<h2 class="text-xl font-semibold">Please sign in</h2>
			<p class="mb-6 text-muted-foreground">You need to be logged in to view your profile.</p>
			<Button href="/signin">Sign In</Button>
		</div>
	{/if}
</div>
