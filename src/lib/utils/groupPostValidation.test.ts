import { describe, expect, it } from 'vitest';
import {
	GROUP_POST_LIMITS,
	parseAndValidateTags,
	validateGroupPostInput
} from './groupPostValidation';

describe('groupPostValidation', () => {
	it('accepts valid input and normalizes tags', () => {
		const result = validateGroupPostInput({
			title: '  Test post  ',
			body: '  Body text  ',
			tagsInput: 'Polity, economy, polity'
		});

		expect(result.isValid).toBe(true);
		expect(result.title).toBe('Test post');
		expect(result.body).toBe('Body text');
		expect(result.tags).toEqual(['polity', 'economy']);
	});

	it('rejects tags with invalid characters', () => {
		expect(() => parseAndValidateTags('valid-tag, bad@tag')).toThrow(
			'Tags can only include letters, numbers, spaces, and hyphens'
		);
	});

	it('rejects when tag count exceeds maximum', () => {
		const tags = Array.from({ length: GROUP_POST_LIMITS.TAGS_MAX + 1 }, (_, i) => `tag-${i + 1}`).join(
			', '
		);

		expect(() => parseAndValidateTags(tags)).toThrow(
			`You can add up to ${GROUP_POST_LIMITS.TAGS_MAX} tags`
		);
	});

	it('flags body longer than 32K', () => {
		const result = validateGroupPostInput({
			title: 'Valid title',
			body: 'a'.repeat(GROUP_POST_LIMITS.BODY_MAX + 1),
			tagsInput: 'test'
		});

		expect(result.isValid).toBe(false);
		expect(result.fieldErrors.body).toBe(
			`Body must be ${GROUP_POST_LIMITS.BODY_MAX} characters or fewer`
		);
	});
});
