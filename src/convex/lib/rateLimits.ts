import { DAY, HOUR, MINUTE, RateLimiter } from '@convex-dev/rate-limiter';
import { components } from '../_generated/api';

export const rateLimiter = new RateLimiter(components.rateLimiter, {
	setUsername: { kind: 'fixed window', rate: 5, period: HOUR },
	createCommunity: { kind: 'fixed window', rate: 5, period: HOUR },
	requestJoin: { kind: 'token bucket', rate: 20, period: HOUR, capacity: 5 },
	moderateJoin: { kind: 'token bucket', rate: 30, period: HOUR, capacity: 10 },
	createPost: { kind: 'token bucket', rate: 20, period: HOUR, capacity: 5 },
	deletePost: { kind: 'token bucket', rate: 20, period: HOUR, capacity: 5 },
	createComment: { kind: 'token bucket', rate: 60, period: HOUR, capacity: 10 },
	votePost: { kind: 'token bucket', rate: 200, period: HOUR, capacity: 40 },
	voteComment: { kind: 'token bucket', rate: 200, period: HOUR, capacity: 40 },
	bookmarkImport: { kind: 'token bucket', rate: 40, period: HOUR, capacity: 5 },
	addSource: { kind: 'token bucket', rate: 60, period: HOUR, capacity: 10 },
	addSourcePerNormalizedKey: {
		kind: 'fixed window',
		rate: 3,
		period: DAY,
		capacity: 3,
		start: 0
	},
	addSourcePerSession: { kind: 'token bucket', rate: 40, period: HOUR, capacity: 10 },
	addSourcePerIp: { kind: 'token bucket', rate: 120, period: HOUR, capacity: 30 },
	addSourceNewAccount: {
		kind: 'fixed window',
		rate: 10,
		period: DAY,
		capacity: 10,
		start: 0
	},
	manualSimilarLinksRefresh: {
		kind: 'fixed window',
		rate: 8,
		period: DAY,
		capacity: 8,
		start: 0
	},
	manualSourceRefresh: {
		kind: 'fixed window',
		rate: 3,
		period: DAY,
		capacity: 3,
		start: 0
	},
	manualSourceRefreshPerSource: {
		kind: 'fixed window',
		rate: 2,
		period: DAY,
		capacity: 2,
		start: 0
	},
	manualSourceRefreshPerSession: {
		kind: 'fixed window',
		rate: 3,
		period: DAY,
		capacity: 3,
		start: 0
	},
	manualSourceRefreshPerIp: {
		kind: 'fixed window',
		rate: 20,
		period: DAY,
		capacity: 20,
		start: 0
	},
	manualSourceRefreshNewAccount: {
		kind: 'fixed window',
		rate: 1,
		period: DAY,
		capacity: 1,
		start: 0
	},
	unsubscribeSource: { kind: 'token bucket', rate: 60, period: HOUR, capacity: 10 },
	followUser: { kind: 'token bucket', rate: 120, period: HOUR, capacity: 30 },
	followCommunity: { kind: 'token bucket', rate: 120, period: HOUR, capacity: 30 },
	feedRefresh: { kind: 'token bucket', rate: 240, period: MINUTE, capacity: 80 },
	communityChatMessage: { kind: 'token bucket', rate: 60, period: HOUR, capacity: 10 },
	communityChatReaction: { kind: 'token bucket', rate: 200, period: HOUR, capacity: 40 },
	dmMessage: { kind: 'token bucket', rate: 60, period: HOUR, capacity: 10 },
	dmReaction: { kind: 'token bucket', rate: 200, period: HOUR, capacity: 40 },
	presenceHeartbeat: { kind: 'token bucket', rate: 120, period: MINUTE, capacity: 20 }
});
