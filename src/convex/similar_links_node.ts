'use node';

import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { internal } from './_generated/api';
import {
	EXA_FIND_SIMILAR_ENDPOINT,
	EXA_MAX_HIGHLIGHT_CHARACTERS,
	EXA_MAX_RESULTS,
	EXA_TIMEOUT_MS,
	normalizeExaResults
} from './lib/similarLinks';

const toErrorMessage = (status: number, payload: any) => {
	const payloadError = payload?.error;
	if (typeof payloadError === 'string' && payloadError.trim()) {
		return payloadError.trim();
	}
	if (typeof payloadError?.message === 'string' && payloadError.message.trim()) {
		return payloadError.message.trim();
	}
	return `Exa request failed (${status}).`;
};

type ExaRefreshResponse = {
	sourceUrl: string;
	status: 'ready' | 'empty' | 'error';
};

export const refreshFromExa = internalAction({
	args: {
		normalizedUrl: v.string(),
		sourceHost: v.string()
	},
	returns: v.object({
		sourceUrl: v.string(),
		status: v.union(v.literal('ready'), v.literal('empty'), v.literal('error'))
	}),
	handler: async (ctx, args): Promise<ExaRefreshResponse> => {
		const now = Date.now();
		const exaApiKey = process.env.EXA_API_KEY?.trim();
		if (!exaApiKey) {
			await ctx.runMutation((internal as any).similar_links.applyRefreshError, {
				normalizedUrl: args.normalizedUrl,
				sourceHost: args.sourceHost,
				now,
				error: 'EXA_API_KEY is not configured.'
			});
			return {
				sourceUrl: args.normalizedUrl,
				status: 'error'
			};
		}

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), EXA_TIMEOUT_MS);
		try {
			const response = await fetch(EXA_FIND_SIMILAR_ENDPOINT, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'x-api-key': exaApiKey
				},
				body: JSON.stringify({
					url: args.normalizedUrl,
					numResults: EXA_MAX_RESULTS,
					contents: {
						highlights: {
							maxCharacters: EXA_MAX_HIGHLIGHT_CHARACTERS
						}
					}
				}),
				signal: controller.signal
			});

			const payload = (await response.json().catch(() => null)) as {
				error?: unknown;
				results?: Array<unknown>;
			} | null;
			if (!response.ok) {
				await ctx.runMutation((internal as any).similar_links.applyRefreshError, {
					normalizedUrl: args.normalizedUrl,
					sourceHost: args.sourceHost,
					now: Date.now(),
					error: toErrorMessage(response.status, payload)
				});
				return {
					sourceUrl: args.normalizedUrl,
					status: 'error'
				};
			}

			const normalizedResults = normalizeExaResults(args.normalizedUrl, payload?.results ?? []);
			await ctx.runMutation((internal as any).similar_links.applyRefreshSuccess, {
				normalizedUrl: args.normalizedUrl,
				sourceHost: args.sourceHost,
				now: Date.now(),
				results: normalizedResults
			});

			return {
				sourceUrl: args.normalizedUrl,
				status: normalizedResults.length > 0 ? 'ready' : 'empty'
			};
		} catch (error) {
			const message =
				error instanceof Error && error.name === 'AbortError'
					? 'Exa request timed out.'
					: error instanceof Error
						? error.message
						: 'Failed to fetch similar links.';
			await ctx.runMutation((internal as any).similar_links.applyRefreshError, {
				normalizedUrl: args.normalizedUrl,
				sourceHost: args.sourceHost,
				now: Date.now(),
				error: message
			});
			return {
				sourceUrl: args.normalizedUrl,
				status: 'error'
			};
		} finally {
			clearTimeout(timeout);
			try {
				await ctx.runMutation((internal as any).similar_links.releaseRefreshLease, {
					normalizedUrl: args.normalizedUrl,
					now: Date.now()
				});
			} catch {
				// best-effort lease cleanup; refresh logic remains safe due lease expiry fallback
			}
		}
	}
});
