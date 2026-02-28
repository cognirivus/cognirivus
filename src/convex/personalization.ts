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
			message: 'FYP personalization is deferred and will be enabled post-launch.'
		};
	}
});
