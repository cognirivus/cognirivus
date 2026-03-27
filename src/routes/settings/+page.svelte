<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import {
		Card,
		CardContent,
		CardHeader,
		CardTitle,
		CardDescription
	} from '$lib/components/ui/card';
	import { ExternalLink, LockKeyhole, ShieldCheck, UserRound } from '@lucide/svelte';

	const meQuery = useQuery(api.auth.getCurrentUser, {});
	const profileQuery = useQuery((api as any).profiles.getMyProfile, {});
	const publicProfileHref = $derived(
		meQuery.data?.username ? `/u/${meQuery.data.username}` : '/profile'
	);
</script>

<main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
	<div class="max-w-3xl">
		<div class="flex items-center gap-3">
			<div class="rounded-xl border border-border bg-muted/40 p-2.5">
				<UserRound class="size-5 text-foreground" />
			</div>
			<div>
				<h1 class="text-2xl font-semibold tracking-tight">Settings</h1>
				<p class="mt-1 text-sm text-muted-foreground">Account details.</p>
			</div>
		</div>
	</div>

	{#if meQuery.isLoading}
		<Card class="mx-auto mt-6 max-w-3xl">
			<CardContent class="py-8 text-sm text-muted-foreground">Loading account...</CardContent>
		</Card>
	{:else if !meQuery.data}
		<Card class="mx-auto mt-6 max-w-3xl border-destructive/30 bg-destructive/5">
			<CardContent class="py-8 text-sm text-destructive">You must sign in.</CardContent>
		</Card>
	{:else}
		<div class="mx-auto mt-6 max-w-3xl space-y-4">
			<Card class="overflow-hidden">
				<CardHeader class="gap-3">
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div>
							<CardTitle>Account Overview</CardTitle>
							<CardDescription>
								Your identity comes from WorkOS. Username is permanent once claimed.
							</CardDescription>
						</div>
						<Badge variant="outline" class="gap-1.5">
							<ShieldCheck class="size-3.5" />
							WorkOS Linked
						</Badge>
					</div>
				</CardHeader>
				<CardContent class="space-y-5">
					<div class="grid gap-4 sm:grid-cols-3">
						<div class="space-y-1 rounded-xl border border-border/70 bg-muted/20 p-4">
							<p class="text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
								Name
							</p>
							<p class="text-sm font-medium text-foreground">{meQuery.data.name}</p>
						</div>
						<div class="space-y-1 rounded-xl border border-border/70 bg-muted/20 p-4 sm:col-span-2">
							<p class="text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
								Email
							</p>
							<p class="text-sm font-medium text-foreground">{meQuery.data.email}</p>
						</div>
					</div>

					<Separator />

					<div class="rounded-2xl border border-border/70 bg-card p-4">
						<div class="flex flex-wrap items-start justify-between gap-3">
							<div class="space-y-1">
								<div class="flex items-center gap-2">
									<p class="text-sm font-medium text-foreground">Username</p>
									<Badge variant={meQuery.data.username ? 'outline' : 'secondary'} class="gap-1.5">
										<LockKeyhole class="size-3.5" />
										{meQuery.data.username ? 'Locked' : 'Required'}
									</Badge>
								</div>
								<p class="text-lg font-semibold tracking-tight text-foreground">
									{meQuery.data.username ?? 'Not set yet'}
								</p>
								<p class="text-sm text-muted-foreground">
									{#if meQuery.data.username}
										This is your permanent public handle and cannot be changed.
									{:else}
										You need to finish setup before the rest of the app is available.
									{/if}
								</p>
							</div>
							<Button href={publicProfileHref} class="gap-2">
								{meQuery.data.username ? 'Open Public Profile' : 'Finish Profile'}
								<ExternalLink class="size-4" />
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	{/if}

	{#if profileQuery.data?.bio}
		<div
			class="mx-auto mt-4 max-w-3xl rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground"
		>
			{profileQuery.data.bio}
		</div>
	{/if}
</main>
