<script lang="ts">
	import { highlightStore } from '$lib/stores/highlights.svelte';
	import SelectionPopup from './SelectionPopup.svelte';
	import { onMount, tick } from 'svelte';
	import { MessageSquare } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';
	import {
		serializeRange,
		deserializeRange,
		applyHighlight,
		removeHighlightById
	} from '$lib/utils/selection';
	import { debounce } from '$lib/utils/performance';

	type Props = {
		highlights: any[];
		currentUserId?: string;
		groupId?: string;
		onAddHighlight: (
			color: string,
			serializedRange: string,
			text: string,
			groupId?: string
		) => Promise<string | undefined>;
		onRemoveHighlight: (id: any) => void;
		onAddComment: (highlightId: any) => void;
		children: any;
	};

	let {
		highlights = [],
		currentUserId,
		groupId,
		onAddHighlight,
		onRemoveHighlight,
		onAddComment,
		children
	}: Props = $props();

	let containerEl = $state<HTMLDivElement | null>(null);
	let markerPositions = $state<Array<{ id: string; top: number; color: string }>>([]);
	let isApplying = false;
	let observer: MutationObserver | null = null;

	// Track what is currently applied in the DOM to avoid unnecessary work
	let renderedHighlights = new Set<string>();

	// Initialize visible authors with everyone when highlights load first time
	$effect(() => {
		if (highlights.length > 0 && highlightStore.visibleAuthorIds.size === 0) {
			const authors = new Set(highlights.map((h) => h.userId));
			highlightStore.visibleAuthorIds = authors;
		}
	});

	// Filter highlights based on visibility
	const visibleHighlights = $derived(
		highlights.filter((h) => highlightStore.visibleAuthorIds.has(h.userId))
	);

	function handleSelection(e?: Event) {
		if (!highlightStore.enabled || isApplying) return;

		// If click originated in popup, don't clear context
		const target = e?.target as HTMLElement;
		if (target && target.closest('.highlight-popup')) {
			return;
		}

		const selection = window.getSelection();
		if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
			highlightStore.selectionContext = null;
			return;
		}

		const range = selection.getRangeAt(0);
		if (!containerEl || !containerEl.contains(range.commonAncestorContainer)) {
			highlightStore.selectionContext = null;
			return;
		}

		const rect = range.getBoundingClientRect();
		const containerRect = containerEl.getBoundingClientRect();
		const text = selection.toString().trim();

		if (text.length > 0) {
			// Save context with container-relative coordinates
			highlightStore.selectionContext = {
				top: rect.top - containerRect.top,
				left: rect.left - containerRect.left + rect.width / 2,
				range,
				text
			};

			// Sticky Mode Auto-Highlight
			if (highlightStore.activeColor) {
				const color = highlightStore.activeColor;
				try {
					const serialized = serializeRange(range, containerEl);
					onAddHighlight(color, serialized, text).then(() => {
						highlightStore.clearSelection();
					});
				} catch (err) {
					console.error('Sticky highlight failed:', err);
				}
			}
		}
	}

	async function syncHighlights() {
		if (!containerEl || isApplying) return;
		isApplying = true;

		// Disconnect to avoid loops
		observer?.disconnect();

		try {
			// We only want to render visible highlights
			const targetHighlights = visibleHighlights;
			const targetIds = new Set(targetHighlights.map((h) => h._id));

			// 1. Remove highlights that are no longer in the target set
			for (const id of renderedHighlights) {
				if (!targetIds.has(id)) {
					removeHighlightById(id, containerEl);
					renderedHighlights.delete(id);
				}
			}
			containerEl.normalize();

			// 2. Add new highlights
			const toAdd = targetHighlights.filter((h) => !renderedHighlights.has(h._id));

			for (const h of toAdd) {
				const range = deserializeRange(h.serializedRange, containerEl);
				if (range) {
					try {
						// Logic for "isMine":
						// If viewing in a group, isMine is true if I created it in THIS group.
						// If viewing personally, isMine is true if it has NO groupId.
						let isMine = false;
						if (groupId) {
							isMine = h.userId === currentUserId && h.groupId === groupId;
						} else {
							isMine = h.userId === currentUserId && !h.groupId;
						}

						applyHighlight(range, h.color, h._id, h.userName, isMine);
						renderedHighlights.add(h._id);
					} catch (e) {
						console.error('Highlight error:', h._id, e);
					}
				}
			}

			// 3. Update positions
			updateMarkerPositions();
		} finally {
			isApplying = false;
			if (containerEl && observer) {
				observer.observe(containerEl, { childList: true, subtree: true, characterData: true });
			}
		}
	}

	function updateMarkerPositions() {
		if (!containerEl) return;
		const containerRect = containerEl.getBoundingClientRect();
		const newPositions: typeof markerPositions = [];

		// We only care about highlights that are actually in the list AND visible
		visibleHighlights.forEach((h) => {
			// Find the first mark for this ID to get its position
			const mark = containerEl!.querySelector(`mark[data-highlight-id="${h._id}"]`);
			if (mark) {
				const rect = mark.getBoundingClientRect();
				newPositions.push({
					id: h._id,
					top: rect.top - containerRect.top,
					color: h.color
				});
			}
		});
		markerPositions = newPositions;
	}

	const debouncedSync = debounce(syncHighlights, 100);
	const debouncedUpdatePositions = debounce(updateMarkerPositions, 50);

	// Full nuke and rebuild - essentially the old function, used only for emergencies
	function forceRebuild() {
		if (!containerEl) return;
		renderedHighlights.clear();
		const marks = containerEl.querySelectorAll('mark[data-highlight-id]');
		marks.forEach((m) => {
			const parent = m.parentNode;
			if (parent) {
				while (m.firstChild) parent.insertBefore(m.firstChild, m);
				parent.removeChild(m);
			}
		});
		containerEl.normalize();
		syncHighlights();
	}

	$effect(() => {
		// When highlights prop changes OR visibility set changes, run sync
		// visibleHighlights is derived from both
		if (containerEl && visibleHighlights) {
			syncHighlights();
		}
	});

	onMount(() => {
		if (!containerEl) return;

		const handleGlobalMouseUp = (e: MouseEvent) => {
			handleSelection(e);
		};

		const handleGlobalMouseDown = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			if (
				highlightStore.selectionContext &&
				!containerEl?.contains(target) &&
				!target.closest('.highlight-popup')
			) {
				highlightStore.selectionContext = null;
			}
		};

		window.addEventListener('mouseup', handleGlobalMouseUp);
		window.addEventListener('mousedown', handleGlobalMouseDown);
		window.addEventListener('keyup', (e) => handleSelection(e));
		window.addEventListener('resize', debouncedUpdatePositions); // Just update positions on resize
		window.addEventListener('refresh-highlights', forceRebuild); // Allow manual hard reset

		observer = new MutationObserver((mutations) => {
			if (isApplying) return;
			const isExternal = mutations.some((m) => {
				const nodes = [...Array.from(m.addedNodes), ...Array.from(m.removedNodes)];
				return nodes.some((n) => {
					if (n.nodeType === Node.TEXT_NODE) return true;
					// If a highlight mark was removed externally, we need to know
					if (n.nodeType === Node.ELEMENT_NODE && !(n as HTMLElement).dataset?.highlightId)
						return true;
					return false;
				});
			});
			if (isExternal) debouncedSync();
		});

		observer.observe(containerEl, { childList: true, subtree: true, characterData: true });

		return () => {
			window.removeEventListener('mouseup', handleGlobalMouseUp);
			window.removeEventListener('mousedown', handleGlobalMouseDown);
			window.removeEventListener('keyup', handleSelection as any);
			window.removeEventListener('resize', debouncedUpdatePositions);
			window.removeEventListener('refresh-highlights', forceRebuild);
			observer?.disconnect();
		};
	});
	function handleContainerClick(e: MouseEvent) {
		const target = e.target as HTMLElement;
		const mark = target.closest('mark[data-highlight-id]');
		if (mark) {
			const id = (mark as HTMLElement).dataset.highlightId;
			if (id) {
				onAddComment(id);
			}
		}
	}
</script>

<div
	bind:this={containerEl}
	class="highlight-container relative pr-12"
	onclick={handleContainerClick}
	role="button"
	tabindex="0"
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') handleContainerClick(e as any);
	}}
>
	{@render children()}

	{#if highlightStore.selectionContext}
		<div class="highlight-popup pointer-events-none absolute z-[100]">
			<SelectionPopup
				onHighlight={async (color) => {
					if (highlightStore.selectionContext && containerEl) {
						try {
							const serialized = serializeRange(highlightStore.selectionContext.range, containerEl);
							await onAddHighlight(
								color,
								serialized,
								highlightStore.selectionContext.text,
								groupId
							);
							highlightStore.clearSelection();
						} catch (err) {
							console.error('Highlight failed:', err);
						}
					}
				}}
				onAddComment={async () => {
					if (highlightStore.selectionContext && containerEl) {
						try {
							const serialized = serializeRange(highlightStore.selectionContext.range, containerEl);
							const id = await onAddHighlight(
								'yellow',
								serialized,
								highlightStore.selectionContext.text,
								groupId
							);
							if (id) {
								onAddComment(id);
							}
							highlightStore.clearSelection();
						} catch (err) {
							console.error('Add comment failed:', err);
						}
					}
				}}
			/>
		</div>
	{/if}

	<!-- Margin Icons -->
	<div class="absolute top-0 right-0 bottom-0 z-10 w-12 border-l bg-muted/5">
		{#each markerPositions as pos (pos.id)}
			<div class="absolute right-2 transition-all duration-300" style="top: {pos.top}px;">
				<Button
					variant="ghost"
					size="icon"
					class={cn(
						'h-8 w-8 rounded-full shadow-sm hover:scale-110',
						pos.color === 'yellow' && 'bg-yellow-200 text-yellow-700 hover:bg-yellow-300',
						pos.color === 'green' && 'bg-green-200 text-green-700 hover:bg-green-300',
						pos.color === 'blue' && 'bg-blue-200 text-blue-700 hover:bg-blue-300',
						pos.color === 'pink' && 'bg-pink-200 text-pink-700 hover:bg-pink-300'
					)}
					onclick={() => onAddComment(pos.id)}
				>
					<MessageSquare class="h-4 w-4" />
				</Button>
			</div>
		{/each}
	</div>
</div>

<style>
	:global(.highlight-container mark) {
		cursor: pointer;
		transition: filter 0.2s;
	}
	:global(.highlight-container mark:hover) {
		filter: brightness(0.9);
	}

	.highlight-popup {
		pointer-events: none;
	}
	:global(.highlight-popup > *) {
		pointer-events: auto;
	}
</style>
