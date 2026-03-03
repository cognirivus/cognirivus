<script lang="ts">
	import { Badge } from '$lib/components/ui/badge'
	import { Button } from '$lib/components/ui/button'
	import { Separator } from '$lib/components/ui/separator'
	import {
		ArrowLeft,
		Globe,
		MessageSquare,
		Settings,
		ShieldCheck,
		Users
	} from '@lucide/svelte'

	type CommunityData = {
		community: {
			_id: string
			slug: string
			description: string
			memberCount: number
			visibility: string
		}
		membershipStatus: string
		canRead: boolean
		canPost: boolean
		isManager: boolean
	}

	let {
		communityData,
		activeNav = ''
	}: {
		communityData: CommunityData
		activeNav?: 'feed' | 'members' | 'chat' | 'manage' | ''
	} = $props()

	const community = $derived(communityData.community)

	const AVATAR_COLORS = [
		'bg-rose-500',
		'bg-blue-500',
		'bg-emerald-500',
		'bg-amber-500',
		'bg-violet-500',
		'bg-cyan-500',
		'bg-pink-500',
		'bg-indigo-500'
	]

	function slugToColor(s: string): string {
		let hash = 0
		for (let i = 0; i < s.length; i++) {
			hash = s.charCodeAt(i) + ((hash << 5) - hash)
		}
		return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
	}

	const navItems = $derived.by(() => {
		const items: Array<{ value: string; label: string; href: string; icon: any }> = [
			{ value: 'feed', label: 'Feed', href: `/c/${community.slug}`, icon: ArrowLeft }
		]
		items.push({
			value: 'members',
			label: 'Members',
			href: `/c/${community.slug}/members`,
			icon: Users
		})
		if (communityData.canRead) {
			items.push({
				value: 'chat',
				label: 'Chat',
				href: `/c/${community.slug}/chat`,
				icon: MessageSquare
			})
		}
		if (communityData.isManager) {
			items.push({
				value: 'manage',
				label: 'Manage',
				href: `/c/${community.slug}/manage`,
				icon: Settings
			})
		}
		return items
	})
</script>

<div class="overflow-hidden rounded-xl border bg-card">
	<!-- Compact header -->
	<div class="flex items-center gap-3 px-4 py-3 sm:gap-4 sm:px-5 sm:py-4">
		<div
			class="{slugToColor(community.slug)} flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white sm:size-10 sm:text-sm"
		>
			{community.slug.charAt(0).toUpperCase()}
		</div>
		<div class="min-w-0 flex-1">
			<div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
				<a
					href="/c/{community.slug}"
					class="truncate text-base font-semibold tracking-tight hover:underline sm:text-lg"
				>
					c/{community.slug}
				</a>
				<Badge variant="secondary" class="hidden gap-1 text-[11px] sm:inline-flex">
					<Users class="size-3" />
					{community.memberCount}
				</Badge>
				<Badge variant="outline" class="hidden gap-1 text-[11px] sm:inline-flex">
					{#if community.visibility === 'public'}
						<Globe class="size-3" />
					{:else}
						<ShieldCheck class="size-3" />
					{/if}
					{community.visibility}
				</Badge>
			</div>
			{#if community.description}
				<p class="mt-0.5 hidden line-clamp-1 text-sm text-muted-foreground sm:block">
					{community.description}
				</p>
			{/if}
		</div>
	</div>

	<!-- Navigation -->
	<Separator />
	<nav class="-mb-px flex items-center gap-0.5 overflow-x-auto px-3 py-1.5 sm:gap-1 sm:px-5">
		{#each navItems as item (item.value)}
			{@const isActive = activeNav === item.value}
			<a
				href={item.href}
				class="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors sm:px-3
					{isActive
					? 'bg-muted text-foreground'
					: 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'}"
			>
				<item.icon class="size-4" />
				{item.label}
			</a>
		{/each}
	</nav>
</div>
