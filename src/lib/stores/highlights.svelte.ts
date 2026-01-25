import { browser } from '$app/environment';

export type SelectionContext = {
	top: number;
	left: number;
	range: Range;
	text: string;
};

class HighlightStore {
	enabled = $state(browser ? localStorage.getItem('highlights-enabled') !== 'false' : true);
	activeColor = $state<string | null>(null);
	selectionContext = $state<SelectionContext | null>(null);
	isStickyMode = $state(false);
	hiddenAuthorIds = $state<Set<string>>(new Set());

	constructor() {
		if (browser) {
			$effect.root(() => {
				$effect(() => {
					localStorage.setItem('highlights-enabled', String(this.enabled));
				});
			});
		}
	}

	toggleAuthorVisibility(userId: string) {
		const newSet = new Set(this.hiddenAuthorIds);
		if (newSet.has(userId)) {
			newSet.delete(userId);
		} else {
			newSet.add(userId);
		}
		this.hiddenAuthorIds = newSet;
	}

	clearSelection() {
		this.selectionContext = null;
		if (browser) {
			window.getSelection()?.removeAllRanges();
		}
	}
}

export const highlightStore = new HighlightStore();
