const FAILURE_CODE_PREFIX = /^\[([A-Z0-9_]+)\]\s*/;

export const JOB_FAILURE_CODE = {
	SOURCE_SYNC_FAILED: 'SOURCE_SYNC_FAILED',
	SOURCE_SYNC_NOT_FOUND: 'SOURCE_SYNC_NOT_FOUND',
	SOURCE_SYNC_BLOCKED_HOST: 'SOURCE_SYNC_BLOCKED_HOST',
	SOURCE_SYNC_ACCESS_DENIED: 'SOURCE_SYNC_ACCESS_DENIED',
	SOURCE_SYNC_FETCH_FAILED: 'SOURCE_SYNC_FETCH_FAILED',
	SOURCE_BULK_UNSUBSCRIBE_FAILED: 'SOURCE_BULK_UNSUBSCRIBE_FAILED',
	SOURCE_RESUBSCRIBE_BACKFILL_FAILED: 'SOURCE_RESUBSCRIBE_BACKFILL_FAILED',
	SOURCE_NIGHTLY_REFRESH_FAILED: 'SOURCE_NIGHTLY_REFRESH_FAILED',
	ADMIN_DELETE_SOURCE_FAILED: 'ADMIN_DELETE_SOURCE_FAILED',
	ADMIN_DELETE_SOURCE_ITEM_FAILED: 'ADMIN_DELETE_SOURCE_ITEM_FAILED',
	ADMIN_DELETE_POST_FAILED: 'ADMIN_DELETE_POST_FAILED',
	R2_DELETE_FAILED: 'R2_DELETE_FAILED',
	JOB_INVALID_TRANSITION: 'JOB_INVALID_TRANSITION'
} as const;

export type JobFailureCode = (typeof JOB_FAILURE_CODE)[keyof typeof JOB_FAILURE_CODE];

const toPlainMessage = (error: unknown, fallback: string) => {
	if (typeof error === 'string' && error.trim()) {
		return error.trim();
	}
	if (error instanceof Error && error.message.trim()) {
		return error.message.trim();
	}
	return fallback;
};

const normalizeMessage = (value: string) =>
	value.replace(FAILURE_CODE_PREFIX, '').replace(/\s+/g, ' ').trim();

export const toFailureMessage = (
	code: JobFailureCode,
	error: unknown,
	fallback: string,
	limit = 1000
) => {
	const message = normalizeMessage(toPlainMessage(error, fallback));
	const encoded = `[${code}] ${message || fallback}`;
	return encoded.slice(0, limit);
};

export const extractFailureCode = (value?: string | null): JobFailureCode | null => {
	if (!value) {
		return null;
	}
	const match = value.match(FAILURE_CODE_PREFIX);
	if (!match) {
		return null;
	}
	const code = match[1];
	const allowed = new Set<string>(Object.values(JOB_FAILURE_CODE));
	return allowed.has(code) ? (code as JobFailureCode) : null;
};

export const classifySourceSyncFailureCode = (error: unknown): JobFailureCode => {
	const message = toPlainMessage(error, '').toLowerCase();
	if (message.includes('not found')) {
		return JOB_FAILURE_CODE.SOURCE_SYNC_NOT_FOUND;
	}
	if (message.includes('blocked for safety') || message.includes('blocked address')) {
		return JOB_FAILURE_CODE.SOURCE_SYNC_BLOCKED_HOST;
	}
	if (
		message.includes('access denied') ||
		message.includes('forbidden') ||
		message.includes('(401)') ||
		message.includes('(403)')
	) {
		return JOB_FAILURE_CODE.SOURCE_SYNC_ACCESS_DENIED;
	}
	if (
		message.includes('fetch') ||
		message.includes('timeout') ||
		message.includes('network') ||
		message.includes('dns')
	) {
		return JOB_FAILURE_CODE.SOURCE_SYNC_FETCH_FAILED;
	}
	return JOB_FAILURE_CODE.SOURCE_SYNC_FAILED;
};
