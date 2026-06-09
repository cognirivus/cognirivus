export interface Frontmatter {
	title?: string;
	description?: string;
	category?: string;
	order?: number;
	icon?: string;
	[key: string]: any;
}

/**
 * Parses frontmatter (YAML-like key-value block wrapped in ---) from the top of a markdown string.
 */
export function parseFrontmatter(content: string): { data: Frontmatter; content: string } {
	const data: Frontmatter = {};
	let markdownContent = content;

	// Normalize line endings to LF
	const normalized = content.replace(/\r\n/g, '\n');

	if (normalized.startsWith('---\n')) {
		const endOfFirstLine = 3; // Length of '---\n'
		const nextDashes = normalized.indexOf('\n---\n', endOfFirstLine);

		if (nextDashes !== -1) {
			const frontmatterText = normalized.substring(endOfFirstLine, nextDashes);
			// content starts after the closing dashes and newline
			markdownContent = normalized.substring(nextDashes + 5);

			// Parse simple YAML lines
			const lines = frontmatterText.split('\n');
			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed || trimmed.startsWith('#')) continue;

				const colonIndex = trimmed.indexOf(':');
				if (colonIndex !== -1) {
					const key = trimmed.substring(0, colonIndex).trim();
					let valText = trimmed.substring(colonIndex + 1).trim();

					// Strip surrounding quotes
					if (
						(valText.startsWith('"') && valText.endsWith('"')) ||
						(valText.startsWith("'") && valText.endsWith("'"))
					) {
						valText = valText.substring(1, valText.length - 1);
					}

					// Convert numbers, booleans, or leave as string
					const num = Number(valText);
					if (!isNaN(num) && valText !== '') {
						data[key] = num;
					} else if (valText === 'true') {
						data[key] = true;
					} else if (valText === 'false') {
						data[key] = false;
					} else {
						data[key] = valText;
					}
				}
			}
		}
	}

	return { data, content: markdownContent.trim() };
}
