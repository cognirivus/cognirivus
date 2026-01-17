import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

// Periodically clean up RAG entries and ensure synchronization
// Runs daily at 3:00 AM
crons.daily('cleanup-rag-orphans', { hourUTC: 3, minuteUTC: 0 }, internal.blogs.cleanupRag);

export default crons;
