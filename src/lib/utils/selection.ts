export function serializeRange(range: Range, container: HTMLElement): string {
	const startOffset = getCharOffset(range.startContainer, range.startOffset, container);
	const endOffset = getCharOffset(range.endContainer, range.endOffset, container);
	return `${startOffset}:${endOffset}`;
}

export function deserializeRange(serialized: string, container: HTMLElement): Range | null {
	try {
		const [startOffset, endOffset] = serialized.split(':').map((n) => parseInt(n));
		if (isNaN(startOffset) || isNaN(endOffset) || startOffset < 0) return null;

		const startRes = getNodeAtOffset(startOffset, container);
		const endRes = getNodeAtOffset(endOffset, container);

		if (!startRes || !endRes) return null;

		const range = document.createRange();
		range.setStart(startRes.node, startRes.offset);
		range.setEnd(endRes.node, endRes.offset);
		return range;
	} catch (e) {
		return null;
	}
}

function getCharOffset(node: Node, offset: number, container: HTMLElement): number {
	const range = document.createRange();
	range.setStart(container, 0);
	try {
		// Use setEndBefore if we are at the very start of a node?
		// No, range.setEnd(node, offset) is standard.
		range.setEnd(node, offset);
		return range.toString().length;
	} catch (e) {
		// Fallback manually walking
		let total = 0;
		const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
		while (walker.nextNode()) {
			if (walker.currentNode === node) return total + offset;
			total += walker.currentNode.textContent?.length ?? 0;
		}
		return -1;
	}
}

function getNodeAtOffset(
	offset: number,
	container: HTMLElement
): { node: Node; offset: number } | null {
	let total = 0;
	const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
	while (walker.nextNode()) {
		const textNode = walker.currentNode as Text;
		const len = textNode.length;
		if (total + len >= offset) {
			return { node: textNode, offset: offset - total };
		}
		total += len;
	}
	// Exactly at end
	if (total === offset) {
		// Get last text node
		const walker2 = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
		let last: Node | null = null;
		while (walker2.nextNode()) last = walker2.currentNode;
		if (last) return { node: last, offset: (last as Text).length };
	}
	return null;
}

const colorMap: Record<string, string> = {
	yellow: 'bg-yellow-200 dark:bg-yellow-500/50',
	green: 'bg-green-200 dark:bg-green-500/50',
	blue: 'bg-blue-200 dark:bg-blue-500/50',
	pink: 'bg-pink-200 dark:bg-pink-500/50'
};

const borderMap: Record<string, string> = {
	yellow: 'border-yellow-500',
	green: 'border-green-500',
	blue: 'border-blue-500',
	pink: 'border-pink-500'
};

export function applyHighlight(
	range: Range,
	color: string,
	id: string,
	author: string | undefined,
	isMine: boolean
): HTMLElement[] {
	if (!range || range.collapsed) return [];

	// Cleanup any overlapping marks first to avoid DOM mess
	const existingMarks = getIntersectingMarks(range);
	existingMarks.forEach((m) => {
		const parent = m.parentNode;
		if (parent) {
			while (m.firstChild) parent.insertBefore(m.firstChild, m);
			parent.removeChild(m);
		}
	});

	const mark = document.createElement('mark');
	// Functional container
	mark.className = `hl-id-${id} group relative bg-transparent border-none p-0 m-0`;
	mark.dataset.highlightId = id;
	if (author) {
		mark.dataset.authorName = author;
		mark.title = `Highlighted by ${author}`;
	}

	// Create inner span for the actual highlight visual
	const span = document.createElement('span');
	const borderClass = borderMap[color] || borderMap.yellow;
	const baseClasses = 'box-decoration-clone inline-block py-0.5';

	let className = '';
	if (!isMine) {
		// Dotted colored underline only, no background
		className = `${baseClasses} bg-transparent border-b-2 border-dotted ${borderClass}`;
	} else {
		// Mine: Solid color + Solid underline
		const bgClass = colorMap[color] || colorMap.yellow;
		className = `${baseClasses} ${bgClass} mix-blend-multiply dark:mix-blend-screen border-b-2 border-solid ${borderClass}`;
	}

	span.className = className;

	try {
		const rangeClone = range.cloneRange();
		rangeClone.surroundContents(mark);

		// Move contents into span
		while (mark.firstChild) {
			span.appendChild(mark.firstChild);
		}
		mark.appendChild(span);

		return [mark];
	} catch (e) {
		// Fallback handles nesting correctly via extractContents
		try {
			const fragment = range.extractContents();
			const wrapped = wrapTextNodesRecursive(fragment, color, id, author, isMine);
			range.insertNode(wrapped);

			const root =
				range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
					? (range.commonAncestorContainer as HTMLElement)
					: range.commonAncestorContainer.parentElement!;
			return Array.from(root.querySelectorAll(`mark[data-highlight-id="${id}"]`)) as HTMLElement[];
		} catch (e2) {
			console.error('applyHighlight failed:', e2, id);
			return [];
		}
	}
}

function getIntersectingMarks(range: Range): HTMLElement[] {
	const container = range.commonAncestorContainer;
	const root =
		container.nodeType === Node.ELEMENT_NODE
			? (container as HTMLElement)
			: container.parentElement!;
	if (!root) return [];
	const marks = Array.from(root.querySelectorAll('mark[data-highlight-id]')) as HTMLElement[];
	return marks.filter((m) => {
		try {
			const mRange = document.createRange();
			mRange.selectNode(m);
			return (
				range.compareBoundaryPoints(Range.END_TO_START, mRange) < 0 &&
				range.compareBoundaryPoints(Range.START_TO_END, mRange) > 0
			);
		} catch (err) {
			return false;
		}
	});
}

function wrapTextNodesRecursive(
	node: Node,
	color: string,
	id: string,
	author: string | undefined,
	isMine: boolean
): Node {
	if (node.nodeType === Node.TEXT_NODE) {
		if (!node.textContent?.trim()) return node;
		const mark = document.createElement('mark');
		mark.className = `hl-id-${id} group relative bg-transparent border-none p-0 m-0`;
		mark.dataset.highlightId = id;
		if (author) {
			mark.dataset.authorName = author;
			mark.title = `Highlighted by ${author}`;
		}

		const span = document.createElement('span');
		const borderClass = borderMap[color] || borderMap.yellow;
		const baseClasses = 'box-decoration-clone inline-block py-0.5';

		let className = '';
		if (!isMine) {
			className = `${baseClasses} bg-transparent border-b-2 border-dotted ${borderClass}`;
		} else {
			const bgClass = colorMap[color] || colorMap.yellow;
			className = `${baseClasses} ${bgClass} mix-blend-multiply dark:mix-blend-screen border-b-2 border-solid ${borderClass}`;
		}

		span.className = className;
		span.textContent = node.textContent;

		mark.appendChild(span);
		return mark;
	}

	const children = Array.from(node.childNodes);
	for (const child of children) {
		const result = wrapTextNodesRecursive(child, color, id, author, isMine);
		if (result !== child) node.replaceChild(result, child);
	}
	return node;
}

export function removeHighlightById(id: string, container: HTMLElement) {
	const marks = container.querySelectorAll(`mark[data-highlight-id="${id}"]`);
	marks.forEach((m) => {
		const parent = m.parentNode;
		if (parent) {
			// Unwrap logic: handle nested span structure
			while (m.firstChild) {
				const child = m.firstChild;
				if (
					child instanceof HTMLElement &&
					child.nodeName === 'SPAN' &&
					child.classList.contains('box-decoration-clone')
				) {
					// Unwrap the inner highlight span
					while (child.firstChild) {
						parent.insertBefore(child.firstChild, m);
					}
					m.removeChild(child);
				} else {
					parent.insertBefore(child, m);
				}
			}
			parent.removeChild(m);
		}
	});
}
