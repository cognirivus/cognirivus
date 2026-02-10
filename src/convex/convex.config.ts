import { defineApp } from 'convex/server';
import betterAuth from './betterAuth/convex.config';
import aggregate from '@convex-dev/aggregate/convex.config.js';
import rag from '@convex-dev/rag/convex.config';
import r2 from '@convex-dev/r2/convex.config.js';
import presence from '@convex-dev/presence/convex.config.js';

const app = defineApp();
app.use(betterAuth);
app.use(presence);
app.use(aggregate, { name: 'aggregateLikes' });
app.use(aggregate, { name: 'aggregateDislikes' });
app.use(aggregate, { name: 'aggregateComments' });
app.use(aggregate, { name: 'aggregateCommentLikes' });
app.use(aggregate, { name: 'aggregateCommentDislikes' });
app.use(aggregate, { name: 'aggregateContentLikes' });
app.use(aggregate, { name: 'aggregateContentDislikes' });
app.use(aggregate, { name: 'aggregateContentComments' });
app.use(aggregate, { name: 'aggregateContentCommentLikes' });
app.use(aggregate, { name: 'aggregateContentCommentDislikes' });
app.use(rag);
app.use(r2);

export default app;
