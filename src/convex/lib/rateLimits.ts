import { HOUR, MINUTE, RateLimiter } from '@convex-dev/rate-limiter';
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
