/**
 * Types and interfaces for the unified extraction system.
 */

import type { Id } from '../../_generated/dataModel';

// Source types that can be extracted from
export type SourceType = 'news' | 'syllabus' | 'blog' | 'content';

// Available extraction types
// Note: Flashcards are generated separately via flashcards.generateFromContent
export type ExtractionType =
	| 'current_affairs'
	| 'locations'
	| 'concepts'
	| 'questions'
	| 'entities'
	| 'topics';

// Job status
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

// Generic source item (normalized from different tables)
export interface SourceItem {
	_id: string;
	title?: string;
	body: string;
	date?: string;
	subjectId?: Id<'subjects'>;
	topic?: string;
}

// Subject reference
export interface SubjectRef {
	_id: Id<'subjects'>;
	name: string;
	gsPaper: number;
	slug: string;
}

// Context provided to extractors
export interface ExtractionContext {
	sourceType: SourceType;
	extractionType: ExtractionType;
	subjects: SubjectRef[];
	selectedFields: string[];
	config: {
		systemPrompt: string;
		model: string;
	};
}

// Single extracted item output
export interface ExtractedItem {
	title: string;
	body: string;
	subject?: string;
	entityName?: string;
	entityType?: string;
}

// Result from a single extraction
export interface ExtractionResult {
	items: ExtractedItem[];
	tokensUsed: number;
	cost: number;
}

// Extractor interface
export interface Extractor {
	type: ExtractionType;
	name: string;
	description: string;
	defaultPrompt: string;
	jsonSchema: object;
	extract: (sourceItem: SourceItem, context: ExtractionContext) => Promise<ExtractionResult>;
}

// Field definitions per source type
export const SOURCE_FIELDS: Record<SourceType, { key: string; label: string }[]> = {
	news: [
		{ key: 'body', label: 'Content' },
		{ key: 'date', label: 'Date' }
	],
	syllabus: [
		{ key: 'title', label: 'Title' },
		{ key: 'body', label: 'Content' },
		{ key: 'topic', label: 'Topic' },
		{ key: 'exams', label: 'Exams' }
	],
	blog: [
		{ key: 'title', label: 'Title' },
		{ key: 'body', label: 'Content' }
	],
	content: [
		{ key: 'title', label: 'Title' },
		{ key: 'body', label: 'Content' },
		{ key: 'topic', label: 'Topic' }
	]
};

// Default model for extraction
export const DEFAULT_MODEL = 'google/gemini-2.5-flash-lite';
