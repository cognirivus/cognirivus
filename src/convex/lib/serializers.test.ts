import { describe, expect, it } from 'vitest';
import { toR2RetryJobResponse, toSourceJobResponse } from './serializers';

describe('serializers', () => {
	it('serializes source jobs with declared fields only', () => {
		const response = toSourceJobResponse({
			_id: 'source_job_1',
			jobType: 'sync_source',
			status: 'queued',
			processed: 0,
			createdAt: 1,
			updatedAt: 2,
			_creationTime: 3,
			ignored: true
		} as any);

		expect(response).toEqual({
			_id: 'source_job_1',
			jobType: 'sync_source',
			status: 'queued',
			processed: 0,
			createdAt: 1,
			updatedAt: 2
		});
	});

	it('serializes r2 retry jobs with stage fallback', () => {
		const response = toR2RetryJobResponse({
			_id: 'retry_1',
			entityType: 'source',
			entityId: 'source_1',
			r2Key: 'sources/source_1/body.txt',
			operation: 'delete',
			status: 'queued',
			attemptCount: 0,
			nextRunAt: 10,
			createdAt: 5,
			updatedAt: 6
		} as any);

		expect(response.stage).toBe('object_delete');
		expect((response as any)._creationTime).toBeUndefined();
	});
});
