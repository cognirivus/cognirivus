<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import type { Id } from '../../../convex/_generated/dataModel';
	import { Loader } from '$lib/components/prompt-kit/loader/index.js';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import {
		Plus,
		Pencil,
		Trash2,
		Save,
		X,
		BookOpen,
		Tag,
		FileText,
		ChevronDown,
		ChevronUp
	} from '@lucide/svelte';

	const client = useConvexClient();

	const syllabusQuery = useQuery(api.syllabus.list, {});
	const subjectsQuery = useQuery(api.subjects.list, {});

	let isEditing = $state(false);
	let editingId = $state<Id<'syllabus'> | null>(null);
	let title = $state('');
	let body = $state('');
	let subjectId = $state<Id<'subjects'> | null>(null);
	let topic = $state('');
	let examsText = $state('');
	let error = $state('');
	let isSaving = $state(false);

	function startCreate() {
		isEditing = true;
		editingId = null;
		title = '';
		body = '';
		subjectId = subjectsQuery.data?.[0]?._id ?? null;
		topic = '';
		examsText = 'UPSC';
		error = '';
	}

	function startEdit(item: any) {
		isEditing = true;
		editingId = item._id;
		title = item.title;
		body = item.body;
		subjectId = item.subjectId;
		topic = item.topic;
		examsText = item.exams.join(', ');
		error = '';
	}

	async function handleSubmit(event: Event) {
		event.preventDefault();
		if (!subjectId) {
			error = 'Please select a subject';
			return;
		}
		error = '';
		isSaving = true;

		const exams = examsText
			.split(',')
			.map((e) => e.trim())
			.filter(Boolean);

		try {
			if (editingId) {
				await client.action(api.syllabus.update, {
					id: editingId,
					title,
					body,
					subjectId,
					topic,
					exams
				});
			} else {
				await client.action(api.syllabus.insert, {
					title,
					body,
					subjectId,
					topic,
					exams
				});
			}
			isEditing = false;
		} catch (e: any) {
			error = e.message || 'An error occurred while saving.';
		} finally {
			isSaving = false;
		}
	}

	async function handleDelete(id: Id<'syllabus'>) {
		if (confirm('Are you sure you want to delete this syllabus item?')) {
			try {
				await client.mutation(api.syllabus.remove, { id });
			} catch (e: any) {
				alert(e.message || 'Failed to delete syllabus.');
			}
		}
	}

	function truncateText(str: string, maxLen: number = 150) {
		if (str.length <= maxLen) return str;
		return str.slice(0, maxLen) + '...';
	}
</script>

<div class="container mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
	<!-- Header -->
	<div class="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
		<div class="space-y-2">
			<div class="flex items-center gap-2">
				<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
					<BookOpen class="h-4 w-4 text-primary" />
				</div>
				<h1 class="text-3xl font-semibold tracking-tight">Syllabus Management</h1>
			</div>
			<p class="text-muted-foreground">Manage raw syllabus materials for extraction.</p>
		</div>
		{#if !isEditing}
			<Button onclick={startCreate} class="gap-2 font-medium shadow-sm">
				<Plus class="h-4 w-4" />
				Add Syllabus
			</Button>
		{/if}
	</div>

	{#if isEditing}
		<div class="overflow-hidden rounded-xl border bg-card shadow-sm">
			<div class="border-b bg-muted/30 px-6 py-4">
				<div class="flex items-center justify-between">
					<div>
						<h2 class="text-lg font-semibold">
							{editingId ? 'Edit Syllabus' : 'Add Syllabus Entry'}
						</h2>
						<p class="mt-0.5 text-sm text-muted-foreground">
							{editingId ? 'Update the syllabus details below.' : 'Add a new syllabus material.'}
						</p>
					</div>
					<Button
						variant="ghost"
						size="icon"
						onclick={() => (isEditing = false)}
						class="h-8 w-8 rounded-full"
					>
						<X class="h-4 w-4" />
					</Button>
				</div>
			</div>

			<div class="p-6">
				<form onsubmit={handleSubmit} class="space-y-6">
					<div class="grid gap-6 sm:grid-cols-2">
						<div class="space-y-2">
							<label for="title" class="text-sm font-medium">Title</label>
							<Input
								id="title"
								bind:value={title}
								placeholder="e.g. Preamble to the Constitution"
								required
								class="h-10"
							/>
						</div>

						<div class="space-y-2">
							<label for="subject" class="text-sm font-medium">Subject</label>
							<div class="relative">
								<select
									id="subject"
									bind:value={subjectId}
									class="flex h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
									required
								>
									<option value="" disabled>Select a subject</option>
									{#if subjectsQuery.data}
										{#each subjectsQuery.data as subject}
											<option value={subject._id}>{subject.name} (GS {subject.gsPaper})</option>
										{/each}
									{/if}
								</select>
								<ChevronDown
									class="pointer-events-none absolute top-3 right-3 h-4 w-4 text-muted-foreground"
								/>
							</div>
						</div>

						<div class="space-y-2">
							<label for="topic" class="text-sm font-medium">Topic</label>
							<Input
								id="topic"
								bind:value={topic}
								placeholder="e.g. Indian Polity"
								required
								class="h-10"
							/>
						</div>

						<div class="space-y-2">
							<label for="exams" class="text-sm font-medium">Exams (comma separated)</label>
							<Input
								id="exams"
								bind:value={examsText}
								placeholder="e.g. UPSC, SSC"
								required
								class="h-10"
							/>
						</div>
					</div>

					<div class="space-y-2">
						<label for="body" class="text-sm font-medium">Syllabus Content (Markdown)</label>
						<Textarea
							id="body"
							bind:value={body}
							required
							rows={15}
							placeholder="Paste the markdown content here..."
							class="min-h-[300px] p-4 font-mono text-sm leading-relaxed"
						/>
					</div>

					{#if error}
						<div
							class="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm font-medium text-destructive"
						>
							{error}
						</div>
					{/if}

					<div class="flex flex-col-reverse justify-end gap-3 border-t pt-6 sm:flex-row">
						<Button
							variant="outline"
							onclick={() => (isEditing = false)}
							disabled={isSaving}
							class="w-full sm:w-auto"
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={isSaving}
							class="w-full gap-2 font-medium shadow-sm sm:w-auto"
						>
							{#if isSaving}
								<Loader variant="circular" size="sm" />
								Saving...
							{:else}
								<Save class="h-4 w-4" />
								{editingId ? 'Update Syllabus' : 'Save Syllabus'}
							{/if}
						</Button>
					</div>
				</form>
			</div>
		</div>
	{:else if syllabusQuery.isLoading}
		<div class="grid gap-4">
			{#each Array(5) as _}
				<div class="rounded-xl border bg-card p-6">
					<div class="flex items-center justify-between">
						<div class="space-y-2">
							<Skeleton class="h-6 w-[200px]" />
							<Skeleton class="h-4 w-[400px]" />
						</div>
						<div class="flex gap-2">
							<Skeleton class="h-9 w-9 rounded-md" />
							<Skeleton class="h-9 w-9 rounded-md" />
						</div>
					</div>
				</div>
			{/each}
		</div>
	{:else if syllabusQuery.error}
		<div class="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
			<p class="font-medium text-destructive">Failed to load syllabus</p>
			<p class="mt-1 text-sm text-muted-foreground">Please try refreshing the page.</p>
		</div>
	{:else if syllabusQuery.data}
		<div class="space-y-4">
			{#each syllabusQuery.data as item}
				<div
					class="overflow-hidden rounded-xl border bg-card shadow-sm transition-all hover:shadow-md"
				>
					<div class="flex items-start justify-between gap-4 p-5">
						<div class="min-w-0 flex-1">
							<div class="mb-2 flex items-center gap-2">
								<BookOpen class="h-4 w-4 text-primary" />
								<span class="font-semibold text-foreground">{item.title}</span>
								{#if item.subject}
									<Badge
										variant="secondary"
										class="h-5 px-1.5 text-[10px] font-bold tracking-wider uppercase"
									>
										{item.subject.name}
									</Badge>
								{/if}
								<Badge variant="outline" class="h-5 px-1.5 text-[10px] font-medium uppercase"
									>{item.topic}</Badge
								>
							</div>

							<div class="mb-3 flex flex-wrap gap-1.5">
								{#each item.exams as exam}
									<Badge
										variant="outline"
										class="border-primary/10 bg-primary/5 text-[9px] font-bold tracking-wider text-primary uppercase"
									>
										{exam}
									</Badge>
								{/each}
							</div>

							<p class="line-clamp-2 text-sm text-muted-foreground">
								{truncateText(item.body)}
							</p>
						</div>

						<div class="flex shrink-0 items-center gap-1">
							<Button
								variant="ghost"
								size="icon-sm"
								title="Edit"
								onclick={() => startEdit(item)}
								class="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
							>
								<Pencil class="h-4 w-4" />
							</Button>
							<Button
								variant="ghost"
								size="icon-sm"
								title="Delete"
								class="h-8 w-8 rounded-full text-destructive/80 hover:bg-destructive/10 hover:text-destructive"
								onclick={() => handleDelete(item._id)}
							>
								<Trash2 class="h-4 w-4" />
							</Button>
						</div>
					</div>
				</div>
			{:else}
				<div
					class="flex flex-col items-center justify-center py-16 text-center border rounded-xl border-dashed"
				>
					<div class="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
						<BookOpen class="h-6 w-6 text-muted-foreground/50" />
					</div>
					<h3 class="font-semibold text-foreground">No syllabus entries yet</h3>
					<p class="text-sm text-muted-foreground max-w-xs mx-auto mt-1">
						Start by adding your first syllabus material.
					</p>
					<Button variant="outline" size="sm" onclick={startCreate} class="mt-4">
						Add Syllabus
					</Button>
				</div>
			{/each}
		</div>
	{/if}
</div>
