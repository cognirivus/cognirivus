import { JOB_FAILURE_CODE } from './jobFailure';

export type SourceJobStatus = 'queued' | 'running' | 'done' | 'failed';
export type NightlyRunStatus = 'running' | 'done' | 'failed';
export type DeletionJobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
export type R2RetryJobStatus = 'queued' | 'running' | 'done' | 'failed';

type TransitionMap<T extends string> = Record<T, ReadonlyArray<T>>;

const SOURCE_JOB_TRANSITIONS: TransitionMap<SourceJobStatus> = {
	queued: ['running', 'failed'],
	running: ['done', 'failed'],
	done: [],
	failed: []
};

const NIGHTLY_RUN_TRANSITIONS: TransitionMap<NightlyRunStatus> = {
	running: ['done', 'failed'],
	done: [],
	failed: []
};

const DELETION_JOB_TRANSITIONS: TransitionMap<DeletionJobStatus> = {
	queued: ['running', 'failed', 'cancelled'],
	running: ['done', 'failed', 'cancelled'],
	done: [],
	failed: ['running'],
	cancelled: ['running']
};

const R2_RETRY_JOB_TRANSITIONS: TransitionMap<R2RetryJobStatus> = {
	queued: ['running', 'failed'],
	running: ['done', 'failed'],
	done: [],
	failed: ['queued']
};

const assertTransition = <T extends string>(
	map: TransitionMap<T>,
	entity: string,
	current: T,
	next: T
) => {
	if (current === next) {
		return;
	}
	if (map[current].includes(next)) {
		return;
	}
	throw new Error(
		`[${JOB_FAILURE_CODE.JOB_INVALID_TRANSITION}] Invalid ${entity} status transition: ${current} -> ${next}.`
	);
};

export const assertSourceJobTransition = (current: SourceJobStatus, next: SourceJobStatus) =>
	assertTransition(SOURCE_JOB_TRANSITIONS, 'source_job', current, next);

export const assertNightlyRunTransition = (current: NightlyRunStatus, next: NightlyRunStatus) =>
	assertTransition(NIGHTLY_RUN_TRANSITIONS, 'source_nightly_run', current, next);

export const assertDeletionJobTransition = (current: DeletionJobStatus, next: DeletionJobStatus) =>
	assertTransition(DELETION_JOB_TRANSITIONS, 'deletion_job', current, next);

export const assertR2RetryJobTransition = (current: R2RetryJobStatus, next: R2RetryJobStatus) =>
	assertTransition(R2_RETRY_JOB_TRANSITIONS, 'r2_retry_job', current, next);
