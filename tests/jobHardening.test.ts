import { describe, expect, it } from 'vitest';
import {
	classifySourceSyncFailureCode,
	extractFailureCode,
	JOB_FAILURE_CODE,
	toFailureMessage
} from '../src/convex/lib/jobFailure';
import {
	assertDeletionJobTransition,
	assertNightlyRunTransition,
	assertR2RetryJobTransition,
	assertSourceJobTransition
} from '../src/convex/lib/jobTransitions';

describe('jobFailure taxonomy', () => {
	it('formats coded failure messages and strips nested prefixes', () => {
		const formatted = toFailureMessage(
			JOB_FAILURE_CODE.SOURCE_SYNC_FAILED,
			'[SOURCE_SYNC_FETCH_FAILED] RSS fetch failed.',
			'Fallback message'
		);
		expect(formatted).toBe('[SOURCE_SYNC_FAILED] RSS fetch failed.');
		expect(extractFailureCode(formatted)).toBe(JOB_FAILURE_CODE.SOURCE_SYNC_FAILED);
	});

	it('classifies common source sync failures', () => {
		expect(classifySourceSyncFailureCode(new Error('Source not found.'))).toBe(
			JOB_FAILURE_CODE.SOURCE_SYNC_NOT_FOUND
		);
		expect(classifySourceSyncFailureCode(new Error('Source host is blocked for safety.'))).toBe(
			JOB_FAILURE_CODE.SOURCE_SYNC_BLOCKED_HOST
		);
		expect(classifySourceSyncFailureCode(new Error('RSS fetch failed (403).'))).toBe(
			JOB_FAILURE_CODE.SOURCE_SYNC_ACCESS_DENIED
		);
		expect(classifySourceSyncFailureCode(new Error('Network fetch failed.'))).toBe(
			JOB_FAILURE_CODE.SOURCE_SYNC_FETCH_FAILED
		);
	});
});

describe('job status transition guards', () => {
	it('allows valid source and nightly transitions', () => {
		expect(() => assertSourceJobTransition('queued', 'running')).not.toThrow();
		expect(() => assertSourceJobTransition('running', 'done')).not.toThrow();
		expect(() => assertNightlyRunTransition('running', 'failed')).not.toThrow();
	});

	it('rejects invalid source transitions', () => {
		expect(() => assertSourceJobTransition('done', 'running')).toThrow(
			`[${JOB_FAILURE_CODE.JOB_INVALID_TRANSITION}]`
		);
	});

	it('supports deletion and r2 retry retries only on allowed states', () => {
		expect(() => assertDeletionJobTransition('failed', 'running')).not.toThrow();
		expect(() => assertR2RetryJobTransition('failed', 'queued')).not.toThrow();
		expect(() => assertDeletionJobTransition('done', 'running')).toThrow(
			`[${JOB_FAILURE_CODE.JOB_INVALID_TRANSITION}]`
		);
		expect(() => assertR2RetryJobTransition('done', 'running')).toThrow(
			`[${JOB_FAILURE_CODE.JOB_INVALID_TRANSITION}]`
		);
	});
});
