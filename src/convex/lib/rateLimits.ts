import { RateLimiter, MINUTE, HOUR } from '@convex-dev/rate-limiter';
import { components } from '../_generated/api';

/**
 * Centralized rate limit definitions for the entire application.
 *
 * All rate limits are per-user (keyed by userId) unless noted otherwise.
 * Use `throws: true` in limit() calls to auto-throw ConvexError on violation.
 */
export const rateLimiter = new RateLimiter(components.rateLimiter, {
	// ── Chat / AI ──
	sendMessage: { kind: 'token bucket', rate: 20, period: MINUTE, capacity: 5 },
	aiGenerate: { kind: 'token bucket', rate: 10, period: MINUTE, capacity: 3 },

	// ── Threads ──
	createThread: { kind: 'token bucket', rate: 10, period: MINUTE, capacity: 3 },
	deleteAllThreads: { kind: 'fixed window', rate: 1, period: HOUR },

	// ── Blogs ──
	createBlog: { kind: 'fixed window', rate: 5, period: HOUR },
	blogReaction: { kind: 'token bucket', rate: 30, period: MINUTE, capacity: 5 },
	blogComment: { kind: 'token bucket', rate: 10, period: MINUTE, capacity: 3 },

	// ── Content ──
	contentReaction: { kind: 'token bucket', rate: 30, period: MINUTE, capacity: 5 },
	contentComment: { kind: 'token bucket', rate: 10, period: MINUTE, capacity: 3 },

	// ── Groups ──
	createGroup: { kind: 'fixed window', rate: 3, period: HOUR },
	joinGroup: { kind: 'fixed window', rate: 10, period: HOUR },
	groupChatMessage: { kind: 'token bucket', rate: 20, period: MINUTE, capacity: 5 },
	groupChatReaction: { kind: 'token bucket', rate: 30, period: MINUTE, capacity: 5 },
	shareContent: { kind: 'token bucket', rate: 20, period: MINUTE, capacity: 5 },
	groupPostCreate: { kind: 'token bucket', rate: 10, period: MINUTE, capacity: 3 },
	groupPostReaction: { kind: 'token bucket', rate: 30, period: MINUTE, capacity: 5 },
	groupPostComment: { kind: 'token bucket', rate: 10, period: MINUTE, capacity: 3 },

	// ── Highlights ──
	createHighlight: { kind: 'token bucket', rate: 20, period: MINUTE, capacity: 5 },
	inlineComment: { kind: 'token bucket', rate: 10, period: MINUTE, capacity: 3 },

	// ── Flashcards ──
	flashcardReview: { kind: 'token bucket', rate: 60, period: MINUTE, capacity: 10 },
	flashcardGenerate: { kind: 'fixed window', rate: 5, period: HOUR }
});
