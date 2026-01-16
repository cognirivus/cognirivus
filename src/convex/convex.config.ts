import { defineApp } from 'convex/server';
import betterAuth from './betterAuth/convex.config';
import aggregate from '@convex-dev/aggregate/convex.config.js';
import rag from '@convex-dev/rag/convex.config';

const app = defineApp();
app.use(betterAuth);
app.use(aggregate, { name: 'aggregateLikes' });
app.use(aggregate, { name: 'aggregateDislikes' });
app.use(aggregate, { name: 'aggregateComments' });
app.use(aggregate, { name: 'aggregateCommentLikes' });
app.use(aggregate, { name: 'aggregateCommentDislikes' });
app.use(rag);

export default app;
