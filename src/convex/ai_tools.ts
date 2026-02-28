import { query } from './_generated/server';
import { v } from 'convex/values';

export const status = query({
	args: {},
	returns: v.object({
		enabled: v.boolean(),
		message: v.string()
	}),
	handler: async () => {
		return {
			enabled: false,
			message: 'AI summaries are deferred and will be implemented in a later phase.'
		};
	}
});
