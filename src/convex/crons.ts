import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

crons.daily(
	'nightly-source-refresh',
	{
		hourUTC: 0,
		minuteUTC: 0
	},
	(internal as any).sources.runNightlySourceRefreshBatch,
	{
		cursor: null
	}
);

export default crons;
