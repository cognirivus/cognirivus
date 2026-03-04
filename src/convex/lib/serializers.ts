import type { Id } from '../_generated/dataModel';

export type SourceJobResponse = {
	_id: Id<'source_jobs'>;
	jobType: 'sync_source' | 'bulk_unsubscribe' | 'resubscribe_backfill';
	status: 'queued' | 'running' | 'done' | 'failed';
	processed: number;
	createdAt: number;
	updatedAt: number;
	userAuthId?: string;
	sourceId?: Id<'sources'>;
	cursor?: string;
	error?: string;
	finishedAt?: number;
};

export const toSourceJobResponse = (job: any): SourceJobResponse => {
	const response: SourceJobResponse = {
		_id: job._id,
		jobType: job.jobType,
		status: job.status,
		processed: job.processed,
		createdAt: job.createdAt,
		updatedAt: job.updatedAt
	};
	if (typeof job.userAuthId === 'string') {
		response.userAuthId = job.userAuthId;
	}
	if (job.sourceId) {
		response.sourceId = job.sourceId;
	}
	if (typeof job.cursor === 'string') {
		response.cursor = job.cursor;
	}
	if (typeof job.error === 'string') {
		response.error = job.error;
	}
	if (typeof job.finishedAt === 'number') {
		response.finishedAt = job.finishedAt;
	}
	return response;
};

export type R2RetryJobResponse = {
	_id: Id<'r2_retry_jobs'>;
	entityType: string;
	entityId: string;
	r2Key: string;
	operation: 'delete';
	stage: 'object_delete' | 'metadata_delete';
	status: 'queued' | 'running' | 'done' | 'failed';
	attemptCount: number;
	nextRunAt: number;
	lastError?: string;
	objectDeletedAt?: number;
	metadataDeletedAt?: number;
	createdAt: number;
	updatedAt: number;
	finishedAt?: number;
};

export const toR2RetryJobResponse = (job: any): R2RetryJobResponse => {
	const response: R2RetryJobResponse = {
		_id: job._id,
		entityType: job.entityType,
		entityId: job.entityId,
		r2Key: job.r2Key,
		operation: 'delete',
		stage: job.stage === 'metadata_delete' ? 'metadata_delete' : 'object_delete',
		status: job.status,
		attemptCount: job.attemptCount,
		nextRunAt: job.nextRunAt,
		createdAt: job.createdAt,
		updatedAt: job.updatedAt
	};
	if (typeof job.lastError === 'string') {
		response.lastError = job.lastError;
	}
	if (typeof job.objectDeletedAt === 'number') {
		response.objectDeletedAt = job.objectDeletedAt;
	}
	if (typeof job.metadataDeletedAt === 'number') {
		response.metadataDeletedAt = job.metadataDeletedAt;
	}
	if (typeof job.finishedAt === 'number') {
		response.finishedAt = job.finishedAt;
	}
	return response;
};
