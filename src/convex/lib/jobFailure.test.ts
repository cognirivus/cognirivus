import { describe, expect, it } from 'vitest';
import { JOB_FAILURE_CODE, classifySourceSyncFailureCode } from './jobFailure';

describe('classifySourceSyncFailureCode', () => {
	it('classifies redirect loop errors', () => {
		expect(classifySourceSyncFailureCode(new Error('Source redirect loop detected.'))).toBe(
			JOB_FAILURE_CODE.SOURCE_SYNC_REDIRECT_LOOP
		);
	});

	it('classifies redirect limit errors', () => {
		expect(classifySourceSyncFailureCode(new Error('Source fetch exceeded 15 redirects.'))).toBe(
			JOB_FAILURE_CODE.SOURCE_SYNC_REDIRECT_LIMIT_EXCEEDED
		);
	});

	it('classifies dns errors', () => {
		expect(classifySourceSyncFailureCode(new Error('Source host DNS resolution failed.'))).toBe(
			JOB_FAILURE_CODE.SOURCE_SYNC_DNS_FAILED
		);
	});

	it('classifies parse errors', () => {
		expect(classifySourceSyncFailureCode(new Error('RSS parse failed for this source.'))).toBe(
			JOB_FAILURE_CODE.SOURCE_SYNC_PARSE_FAILED
		);
	});
});
