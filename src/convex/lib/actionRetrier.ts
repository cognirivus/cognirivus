import { ActionRetrier } from '@convex-dev/action-retrier';
import { components } from '../_generated/api';

export const actionRetrier = new ActionRetrier((components as any).actionRetrier, {
	initialBackoffMs: 250,
	base: 2,
	maxFailures: 4
});
