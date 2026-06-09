import { parseFrontmatter, type Frontmatter } from '$lib/utils/frontmatter';
import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

export interface Doc {
	slug: string;
	title: string;
	description: string;
	category: string;
	order: number;
	icon: string;
	html: string;
	markdown: string;
	headings: { id: string; text: string; depth: number }[];
}

export interface Category {
	name: string;
	docs: Doc[];
}

/**
 * Helper to inject unique IDs into h2/h3 headings and extract them for TOC.
 */
function addHeadingIds(html: string): {
	html: string;
	headings: { id: string; text: string; depth: number }[];
} {
	const headings: { id: string; text: string; depth: number }[] = [];
	const headingRegex = /<h(2|3)([^>]*)>([\s\S]*?)<\/h\1>/gi;

	const processedHtml = html.replace(headingRegex, (match, depthStr, attrs, text) => {
		const cleanText = text.replace(/<[^>]*>/g, '').trim();
		const id = cleanText
			.toLowerCase()
			.replace(/[^\w\s-]/g, '')
			.replace(/[\s_-]+/g, '-')
			.replace(/^-+|-+$/g, '');

		headings.push({ id, text: cleanText, depth: parseInt(depthStr) });

		if (attrs.includes('id=')) {
			return match;
		}

		return `<h${depthStr} id="${id}"${attrs}>${text}</h${depthStr}>`;
	});

	return { html: processedHtml, headings };
}

// Load all markdown files in the content folder eagerly at build time
const rawDocs = import.meta.glob('./content/**/*.md', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

const docs: Doc[] = [];

// Parse and render all documents
for (const [path, rawContent] of Object.entries(rawDocs)) {
	const slug = path.replace(/^\.\/content\//, '').replace(/\.md$/, '');

	const { data, content } = parseFrontmatter(rawContent);

	const title = data.title || slug.split('/').pop() || 'Untitled';
	const description = data.description || '';
	const category = data.category || 'General';
	const order = typeof data.order === 'number' ? data.order : 99;
	const icon = data.icon || 'FileText';

	// Render Markdown to HTML and sanitize it
	const rawHtml = marked.parse(content) as string;
	const cleanHtml = DOMPurify.sanitize(rawHtml);

	const { html, headings } = addHeadingIds(cleanHtml);

	docs.push({
		slug,
		title,
		description,
		category,
		order,
		icon,
		html,
		markdown: content,
		headings
	});
}

// Sort docs: first by category order, then by doc order, then by title
const CATEGORY_ORDER = ['Getting Started', 'Features', 'FAQ', 'Support'];

docs.sort((a, b) => {
	const catAIdx = CATEGORY_ORDER.indexOf(a.category);
	const catBIdx = CATEGORY_ORDER.indexOf(b.category);
	const catA = catAIdx === -1 ? 99 : catAIdx;
	const catB = catBIdx === -1 ? 99 : catBIdx;

	if (catA !== catB) {
		return catA - catB;
	}

	if (a.order !== b.order) {
		return a.order - b.order;
	}

	return a.title.localeCompare(b.title);
});

// Categories grouping
export const categories: Category[] = [];
for (const doc of docs) {
	let cat = categories.find((c) => c.name === doc.category);
	if (!cat) {
		cat = { name: doc.category, docs: [] };
		categories.push(cat);
	}
	cat.docs.push(doc);
}

// Sort the categories array itself by the predefined order
categories.sort((a, b) => {
	const idxA = CATEGORY_ORDER.indexOf(a.name);
	const idxB = CATEGORY_ORDER.indexOf(b.name);
	const valA = idxA === -1 ? 99 : idxA;
	const valB = idxB === -1 ? 99 : idxB;
	return valA - valB;
});

// Helper functions
export function getAllDocs(): Doc[] {
	return docs;
}

export function getDocBySlug(slug: string): Doc | undefined {
	return docs.find((d) => d.slug === slug);
}

export function getPrevAndNextDoc(slug: string): { prev?: Doc; next?: Doc } {
	const idx = docs.findIndex((d) => d.slug === slug);
	if (idx === -1) return {};

	const prev = idx > 0 ? docs[idx - 1] : undefined;
	const next = idx < docs.length - 1 ? docs[idx + 1] : undefined;

	// Only return prev/next if they make sense (optional: restrict to same category or keep global navigation flow)
	// For standard sequential reading flow across docs, global flow is great.
	return { prev, next };
}

export function searchDocs(query: string): Doc[] {
	if (!query) return [];
	const q = query.toLowerCase().trim();
	return docs.filter(
		(d) =>
			d.title.toLowerCase().includes(q) ||
			d.description.toLowerCase().includes(q) ||
			d.markdown.toLowerCase().includes(q)
	);
}
