<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import {
		MapPin,
		Search,
		ArrowLeft,
		Globe,
		Tag,
		Users,
		Building2,
		Briefcase,
		X
	} from '@lucide/svelte';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';
	import { page } from '$app/state';

	let searchInput = $state('');
	let searchQuery = $state('');
	let sortBy = $state<'alphabet' | 'count'>('alphabet');

	const type = $derived((page.params as any).type);
	const entitiesQuery = useQuery((api as any).content.listEntities, () => ({ type }));
	const entities = $derived(entitiesQuery.data || []);

	const filteredEntities = $derived(
		entities
			.filter((ent: any) => ent.name.toLowerCase().includes(searchQuery.toLowerCase()))
			.sort((a: any, b: any) => {
				if (sortBy === 'alphabet') {
					return a.name.localeCompare(b.name);
				} else {
					return b.count - a.count;
				}
			})
	);

	const typeMeta = $derived.by(() => {
		const t = type.toLowerCase();
		if (t === 'location')
			return {
				label: 'Geography',
				title: 'Geographical Index',
				icon: Globe,
				desc: 'Explore news analysis and intelligence by physical location.'
			};
		if (t === 'person')
			return {
				label: 'People',
				title: 'People Index',
				icon: Users,
				desc: 'Track key personalities and their impact on current affairs.'
			};
		if (t === 'organization')
			return {
				label: 'Organizations',
				title: 'Organization Index',
				icon: Building2,
				desc: 'Analyze roles of national and international bodies.'
			};
		if (t === 'legislation')
			return {
				label: 'Legislations',
				title: 'Bills & Acts',
				icon: Briefcase,
				desc: 'Examine constitutional developments, bills, and legal acts.'
			};
		return {
			label: 'Entities',
			title: `${type.charAt(0).toUpperCase() + type.slice(1)} Index`,
			icon: Tag,
			desc: `Browse and analyze ${type} based intelligence.`
		};
	});

	function handleSearch() {
		searchQuery = searchInput;
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			handleSearch();
		}
	}

	function clearSearch() {
		searchInput = '';
		searchQuery = '';
	}
</script>

<svelte:head>
	<title>Browse {typeMeta.label} - Knowledge Base</title>
</svelte:head>

<div class="container mx-auto max-w-6xl px-4 py-8">
	<div class="mb-8">
		<Button variant="ghost" size="sm" href="/content/entity" class="gap-2 text-muted-foreground">
			<ArrowLeft class="h-4 w-4" />
			Back to Entity Explorer
		</Button>
	</div>

	<div class="mb-12 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
		<div class="space-y-1">
			<div class="flex items-center gap-2 text-primary">
				<typeMeta.icon class="h-6 w-6" />
				<span class="text-sm font-bold tracking-widest uppercase">{typeMeta.label}</span>
			</div>
			<h1 class="text-4xl font-extrabold tracking-tight">{typeMeta.title}</h1>
			<p class="text-lg text-muted-foreground">
				{typeMeta.desc}
			</p>
		</div>

		<div class="flex w-full max-w-md flex-col gap-2 sm:flex-row sm:items-center">
			<div class="relative flex-1">
				<Search class="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
				<Input
					type="search"
					placeholder="Filter {typeMeta.label.toLowerCase()}..."
					bind:value={searchInput}
					onkeydown={handleKeyDown}
					class="h-11 w-full pl-9"
				/>
			</div>
			<Button onclick={handleSearch} size="lg" class="w-full sm:w-auto">Filter</Button>
		</div>
	</div>

	{#if searchQuery}
		<div class="mb-8 flex">
			<Badge variant="secondary" class="flex items-center gap-2 px-3 py-1.5 text-sm">
				<span>Filter: <span class="font-bold text-primary">{searchQuery}</span></span>
				<button
					onclick={clearSearch}
					class="rounded-full p-0.5 transition-colors hover:bg-muted"
					aria-label="Clear filter"
				>
					<X class="h-3.5 w-3.5" />
				</button>
			</Badge>
		</div>
	{/if}

	<!-- Sort Controls -->
	<div class="mb-8 flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-center">
		<span class="text-xs font-bold text-muted-foreground uppercase">Sort By:</span>
		<div class="flex flex-wrap gap-2">
			<Button
				variant={sortBy === 'alphabet' ? 'default' : 'outline'}
				size="sm"
				class="h-8 rounded-full px-4"
				onclick={() => (sortBy = 'alphabet')}
			>
				Alphabet (A-Z)
			</Button>
			<Button
				variant={sortBy === 'count' ? 'default' : 'outline'}
				size="sm"
				class="h-8 rounded-full px-4"
				onclick={() => (sortBy = 'count')}
			>
				Number of Entries
			</Button>
		</div>
	</div>

	{#if entitiesQuery.isLoading}
		<div class="flex h-[40vh] items-center justify-center">
			<Loader variant="circular" size="lg" />
		</div>
	{:else if filteredEntities.length === 0}
		<div class="flex flex-col items-center justify-center py-20 text-center">
			<div class="mb-4 rounded-full bg-muted p-4">
				<typeMeta.icon class="h-8 w-8 text-muted-foreground" />
			</div>
			<p class="text-lg font-medium">No {typeMeta.label.toLowerCase()} found</p>
			<p class="text-muted-foreground">Try adjusting your filter or check back later.</p>
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
			{#each filteredEntities as ent}
				<a
					href="/content/entity/{type}/{ent.slug}"
					class="group flex items-center justify-between rounded-xl border bg-card p-5 transition-all hover:border-primary/50 hover:bg-primary/5 hover:shadow-md"
				>
					<div class="flex items-center gap-3">
						<div
							class="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"
						>
							<typeMeta.icon class="h-5 w-5" />
						</div>
						<span
							class="font-bold tracking-tight text-foreground transition-colors group-hover:text-primary"
						>
							{ent.name}
						</span>
					</div>
					<Badge
						variant="secondary"
						class="h-6 px-2 text-[10px] font-bold transition-colors group-hover:bg-primary group-hover:text-primary-foreground"
					>
						{ent.count}
					</Badge>
				</a>
			{/each}
		</div>
	{/if}
</div>
