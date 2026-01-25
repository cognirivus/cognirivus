import { browser } from '$app/environment';

export type SelectionContext = {
	top: number;
	left: number;
	range: Range;
	text: string;
};

class HighlightStore {
	#enabled = $state(browser ? localStorage.getItem('highlights-enabled') !== 'false' : true);
	#activeColor = $state<string | null>(null);
	#selectionContext = $state<SelectionContext | null>(null);
	#isStickyMode = $state(false);
	#visibleAuthorIds = $state<Set<string>>(new Set());

	get enabled() {
		return this.#enabled;
	}

	set enabled(value: boolean) {
		console.log('HighlightStore: toggling enabled to', value);
		this.#enabled = value;
		if (browser) {
			localStorage.setItem('highlights-enabled', String(value));
		}
	}

	get activeColor() {
		return this.#activeColor;
	}

	set activeColor(value: string | null) {
		this.#activeColor = value;
	}

	get selectionContext() {
		return this.#selectionContext;
	}

	set selectionContext(value: SelectionContext | null) {
		console.log('HighlightStore: setting selectionContext', value ? value.text : 'null');
		this.#selectionContext = value;
	}

	get isStickyMode() {
		return this.#isStickyMode;
	}

	set isStickyMode(value: boolean) {
		this.#isStickyMode = value;
	}

	get visibleAuthorIds() {
		return this.#visibleAuthorIds;
	}

	set visibleAuthorIds(value: Set<string>) {
		this.#visibleAuthorIds = value;
	}

	toggleAuthorVisibility(userId: string) {
		const newSet = new Set(this.#visibleAuthorIds);
		if (newSet.has(userId)) {
			newSet.delete(userId);
		} else {
			newSet.add(userId);
		}
		this.#visibleAuthorIds = newSet;
	}

	clearSelection() {
		this.#selectionContext = null;
		if (browser) {
			window.getSelection()?.removeAllRanges();
		}
	}
}

export const highlightStore = new HighlightStore();
