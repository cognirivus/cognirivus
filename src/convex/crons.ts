import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

crons.cron(
	'nightly-source-refresh',
	'0 0 * * *',
	(internal as any).sources.runNightlySourceRefreshBatch,
	{
		cursor: null
	}
);

crons.cron('r2-orphan-sweeper', '0 1 * * *', (internal as any).admin.runR2OrphanSweeper, {
	phase: 'source_items',
	cursor: null,
	sourceItemsScanned: 0,
	sourceItemsMissing: 0,
	postsScanned: 0,
	postsMissing: 0,
	metadataScanned: 0,
	metadataOrphansDeleted: 0
});

crons.cron('aggregate-parity-check', '0 2 * * *', (internal as any).admin.runAggregateParityCheck, {
	cursor: null,
	checked: 0,
	mismatches: 0
});

crons.cron(
	'similar-links-cache-cleanup',
	'30 2 * * *',
	(internal as any).similar_links.runCacheCleanup,
	{}
);

export default crons;
