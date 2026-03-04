import { defineApp } from 'convex/server';
import betterAuth from './betterAuth/convex.config';
import rateLimiter from '@convex-dev/rate-limiter/convex.config';
import r2 from '@convex-dev/r2/convex.config.js';
import presence from '@convex-dev/presence/convex.config.js';
import actionRetrier from '@convex-dev/action-retrier/convex.config';
import aggregate from '@convex-dev/aggregate/convex.config';
import crons from '@convex-dev/crons/convex.config';
import migrations from '@convex-dev/migrations/convex.config';
import workflow from '@convex-dev/workflow/convex.config';
import workpool from '@convex-dev/workpool/convex.config';

const app = defineApp();
app.use(betterAuth);
app.use(presence);
app.use(rateLimiter);
app.use(r2);
app.use(actionRetrier);
app.use(crons);
app.use(aggregate, { name: 'aggregateSourceItemsBySource' });
app.use(aggregate, { name: 'aggregatePostSharesByAuthorSource' });
app.use(migrations);
app.use(workpool, { name: 'sourceSyncWorkpool' });
app.use(workpool, { name: 'sourceCleanupWorkpool' });
app.use(workflow);

export default app;
