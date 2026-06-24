<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '$convex/_generated/api';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Loader2, Network } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import type { Id } from '$convex/_generated/dataModel';

	type GraphNode = {
		id: string;
		title: string;
		cellType: string;
		summary: string;
		x: number;
		y: number;
		vx: number;
		vy: number;
	};

	type GraphEdge = {
		source: string;
		target: string;
		relationshipType: string;
	};

	const cellsQuery = useQuery((api as any).knowledgeNotes.listCells, { limit: 100 });
	const cells = $derived((cellsQuery.data ?? []) as any[]);

	let canvas: HTMLCanvasElement = $state()!;
	let ctx: CanvasRenderingContext2D | null = $state(null);
	let nodes = $state<GraphNode[]>([]);
	let edges = $state<GraphEdge[]>([]);
	let hoveredNode = $state<GraphNode | null>(null);
	let width = $state(800);
	let height = $state(600);
	let animating = $state(true);

	const typeColors: Record<string, string> = {
		FACT: '#3b82f6',
		CONCEPT: '#22c55e',
		PRINCIPLE: '#a855f7',
		PROCEDURE: '#f59e0b',
		HEURISTIC: '#f43f5e',
		QUESTION: '#06b6d4'
	};

	function initGraph() {
		nodes = cells.map((c, i) => ({
			id: c._id,
			title: c.title,
			cellType: c.cellType,
			summary: c.summary,
			x: width / 2 + (Math.random() - 0.5) * 400,
			y: height / 2 + (Math.random() - 0.5) * 300,
			vx: 0,
			vy: 0
		}));
		edges = [];
		for (let i = 0; i < nodes.length; i++) {
			for (let j = i + 1; j < nodes.length; j++) {
				if (nodes[i].cellType === nodes[j].cellType && Math.random() > 0.7) {
					edges.push({
						source: nodes[i].id,
						target: nodes[j].id,
						relationshipType: 'related_to'
					});
				}
			}
		}
	}

	function simulate() {
		const alpha = 0.3;
		const repulsion = 5000;
		const attraction = 0.005;
		const centerForce = 0.01;

		for (const node of nodes) {
			node.vx *= 0.6;
			node.vy *= 0.6;
			node.vx += (width / 2 - node.x) * centerForce;
			node.vy += (height / 2 - node.y) * centerForce;
		}

		for (let i = 0; i < nodes.length; i++) {
			for (let j = i + 1; j < nodes.length; j++) {
				const dx = nodes[j].x - nodes[i].x;
				const dy = nodes[j].y - nodes[i].y;
				const dist = Math.sqrt(dx * dx + dy * dy) || 1;
				const force = repulsion / (dist * dist);
				const fx = (dx / dist) * force;
				const fy = (dy / dist) * force;
				nodes[i].vx -= fx;
				nodes[i].vy -= fy;
				nodes[j].vx += fx;
				nodes[j].vy += fy;
			}
		}

		for (const edge of edges) {
			const s = nodes.find((n) => n.id === edge.source);
			const t = nodes.find((n) => n.id === edge.target);
			if (!s || !t) continue;
			const dx = t.x - s.x;
			const dy = t.y - s.y;
			const dist = Math.sqrt(dx * dx + dy * dy) || 1;
			const force = (dist - 100) * attraction;
			s.vx += (dx / dist) * force;
			s.vy += (dy / dist) * force;
			t.vx -= (dx / dist) * force;
			t.vy -= (dy / dist) * force;
		}

		for (const node of nodes) {
			node.x += node.vx * alpha;
			node.y += node.vy * alpha;
			node.x = Math.max(30, Math.min(width - 30, node.x));
			node.y = Math.max(30, Math.min(height - 30, node.y));
		}
	}

	function draw() {
		if (!ctx) return;
		ctx.clearRect(0, 0, width, height);

		for (const edge of edges) {
			const s = nodes.find((n) => n.id === edge.source);
			const t = nodes.find((n) => n.id === edge.target);
			if (!s || !t) continue;
			ctx.beginPath();
			ctx.moveTo(s.x, s.y);
			ctx.lineTo(t.x, t.y);
			ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
			ctx.lineWidth = 1;
			ctx.stroke();
		}

		for (const node of nodes) {
			const isHovered = hoveredNode?.id === node.id;
			const r = isHovered ? 10 : 6;
			ctx.beginPath();
			ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
			ctx.fillStyle = typeColors[node.cellType] ?? '#94a3b8';
			ctx.fill();
			if (isHovered) {
				ctx.strokeStyle = '#fff';
				ctx.lineWidth = 2;
				ctx.stroke();
				ctx.fillStyle = '#1e293b';
				ctx.font = '12px system-ui';
				ctx.textAlign = 'center';
				ctx.fillText(node.title.slice(0, 30), node.x, node.y - 14);
			}
		}

		if (animating) {
			simulate();
			requestAnimationFrame(draw);
		}
	}

	function handleMouseMove(e: MouseEvent) {
		const rect = canvas.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;
		hoveredNode =
			nodes.find((n) => {
				const dx = n.x - mx;
				const dy = n.y - my;
				return dx * dx + dy * dy < 100;
			}) ?? null;
	}

	function handleClick() {
		if (hoveredNode) {
			window.location.href = `/knowledge/cells/${hoveredNode.id}`;
		}
	}

	onMount(() => {
		const container = canvas.parentElement;
		if (container) {
			width = container.clientWidth;
			height = Math.max(500, window.innerHeight - 300);
		}
		ctx = canvas.getContext('2d');
		canvas.width = width;
		canvas.height = height;
		initGraph();
		simulate();
		draw();
		return () => {
			animating = false;
		};
	});

	$effect(() => {
		if (cells.length > 0 && nodes.length === 0) {
			if (ctx) {
				initGraph();
				simulate();
				draw();
			}
		}
	});
</script>

<main class="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
	<div class="mb-6">
		<h1 class="text-2xl font-semibold tracking-tight">Knowledge Graph</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			Interactive visualization of knowledge cells and their relationships.
		</p>
	</div>

	<div class="mb-4 flex flex-wrap gap-2">
		{#each Object.entries(typeColors) as [type, color]}
			<span class="flex items-center gap-1 text-xs">
				<span class="inline-block size-3 rounded-full" style="background-color: {color}"></span>
				{type}
			</span>
		{/each}
	</div>

	{#if cellsQuery.isLoading}
		<div class="flex justify-center py-12">
			<Loader2 class="size-6 animate-spin text-muted-foreground" />
		</div>
	{:else if cells.length === 0}
		<Card
			><CardContent class="py-12 text-center text-sm text-muted-foreground">
				<Network class="mx-auto mb-3 size-8" />No cells to visualize yet.
			</CardContent></Card
		>
	{:else}
		<div class="overflow-hidden rounded-lg border border-border">
			<canvas
				bind:this={canvas}
				class="cursor-pointer"
				onmousemove={handleMouseMove}
				onclick={handleClick}
			></canvas>
		</div>
		<p class="mt-2 text-xs text-muted-foreground">Hover to preview, click to open cell.</p>
	{/if}
</main>
