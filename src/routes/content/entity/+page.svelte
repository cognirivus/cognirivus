<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import {
		Globe,
		Users,
		Building2,
		Briefcase,
		Tag,
		ArrowLeft,
		ChevronRight,
		Fingerprint,
		MapPin,
		FileText,
		Shield
	} from '@lucide/svelte';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';

	const entityTypesQuery = useQuery((api as any).content.listEntityTypes, {
		excludeType: 'Current Affairs'
	});
	const entityTypes = $derived(entityTypesQuery.data || []);

	const typeMetaMap: Record<string, any> = {
		location: {
			label: 'Geography',
			icon: Globe,
			color: 'text-blue-500',
			bgColor: 'bg-blue-500/10',
			desc: 'Physical locations, regions, and geographical entities.'
		},
		person: {
			label: 'People',
			icon: Users,
			color: 'text-orange-500',
			bgColor: 'bg-orange-500/10',
			desc: 'Key personalities, leaders, and influential individuals.'
		},
		organization: {
			label: 'Organizations',
			icon: Building2,
			color: 'text-purple-500',
			bgColor: 'bg-purple-500/10',
			desc: 'National and international bodies, companies, and groups.'
		},
		legislation: {
			label: 'Legislations',
			icon: Briefcase,
			color: 'text-emerald-500',
			bgColor: 'bg-emerald-500/10',
			desc: 'Bills, acts, constitutional provisions, and legal frameworks.'
		}
	};

	function getTypeMeta(type: string) {
		const t = type.toLowerCase();
		return (
			typeMetaMap[t] || {
				label: type.charAt(0).toUpperCase() + type.slice(1),
				icon: Tag,
				color: 'text-slate-500',
				bgColor: 'bg-slate-500/10',
				desc: `Explore and analyze intelligence categorized under ${type}.`
			}
		);
	}
</script>

<svelte:head>
	<title>Entity Explorer - Knowledge Base</title>
</svelte:head>

<div class="container mx-auto max-w-6xl px-4 py-8">
	<div class="mb-8">
		<Button variant="ghost" size="sm" href="/content" class="gap-2 text-muted-foreground">
			<ArrowLeft class="h-4 w-4" />
			Back to Knowledge Base
		</Button>
	</div>

	<div class="mb-12 space-y-2">
		<h1 class="text-4xl font-extrabold tracking-tight">Entity Explorer</h1>
		<p class="max-w-2xl text-lg text-muted-foreground">
			Navigate through our knowledge base by different entity types to discover interconnected
			intelligence and deep insights.
		</p>
	</div>

	{#if entityTypesQuery.isLoading}
		<div class="flex h-[40vh] items-center justify-center">
			<Loader variant="circular" size="lg" />
		</div>
	{:else if entityTypes.length === 0}
		<div class="flex flex-col items-center justify-center py-20 text-center">
			<div class="mb-4 rounded-full bg-muted p-4">
				<Fingerprint class="h-8 w-8 text-muted-foreground" />
			</div>
			<p class="text-lg font-medium">No entities found</p>
			<p class="text-muted-foreground">The knowledge base is currently being populated.</p>
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
			{#each entityTypes as { type, count }}
				{@const meta = getTypeMeta(type)}
				<a href="/content/entity/{type}" class="group block">
					<Card
						class="h-full transition-all duration-300 group-hover:border-primary/50 group-hover:shadow-lg"
					>
						<CardHeader class="pb-4">
							<div class="flex items-start justify-between">
								<div class="rounded-xl p-3 {meta.bgColor} {meta.color}">
									<meta.icon class="h-6 w-6" />
								</div>
								<Badge variant="secondary" class="font-bold">
									{count} Entries
								</Badge>
							</div>
							<CardTitle class="mt-4 text-2xl transition-colors group-hover:text-primary">
								{meta.label}
							</CardTitle>
							<CardDescription class="line-clamp-2">
								{meta.desc}
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div
								class="flex items-center gap-2 text-sm font-bold text-primary opacity-0 transition-all duration-300 group-hover:translate-x-1 group-hover:opacity-100"
							>
								Explore Index
								<ChevronRight class="h-4 w-4" />
							</div>
						</CardContent>
					</Card>
				</a>
			{/each}
		</div>
	{/if}
</div>
