import { ConvexError } from 'convex/values';
import { toast } from 'svelte-sonner';

/**
 * Handles errors from Convex mutations and queries.
 * Specifically detects rate limit errors and shows descriptive toasts.
 */
export function handleConvexError(error: unknown) {
	if (error instanceof ConvexError) {
		const data = error.data as any;

		// Check for rate limit error from @convex-dev/rate-limiter
		if (data?.kind === 'RateLimitError') {
			const retryAfter = data.retryAfter;
			const seconds = Math.ceil(retryAfter / 1000);
			const waitMessage = seconds > 0 ? ` Please wait ${seconds}s.` : '';

			toast.error('Slow down!', {
				description: `You've reached the rate limit.${waitMessage}`,
				duration: 5000
			});
			return;
		}

		// Handle other ConvexErrors with data.message or the string directly
		const message = typeof data === 'string' ? data : data?.message || error.message;
		toast.error(message);
		return;
	}

	if (error instanceof Error) {
		// Log internal errors but show a generic message to user if preferred
		// For now, showing the error message
		toast.error(error.message);
		return;
	}

	toast.error('An unexpected error occurred');
}
