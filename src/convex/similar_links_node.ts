'use node';

import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { internal } from './_generated/api';
import {
	EXA_FIND_SIMILAR_ENDPOINT,
	EXA_MAX_HIGHLIGHT_CHARACTERS,
	EXA_MAX_RESULTS,
	EXA_TIMEOUT_MS,
	buildExaDomainFilters,
	filterResultsByScopeDomains,
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
	scope: 'sources' | 'web';
	status: 'ready' | 'empty' | 'error';
};

export const refreshFromExa = internalAction({
	args: {
		viewerKey: v.string(),
		normalizedUrl: v.string(),
		scope: v.union(v.literal('sources'), v.literal('web')),
		sourceHost: v.string(),
		domains: v.array(v.string()),
		sourceDomainFingerprint: v.string()
	},
	returns: v.object({
		sourceUrl: v.string(),
		scope: v.union(v.literal('sources'), v.literal('web')),
		status: v.union(v.literal('ready'), v.literal('empty'), v.literal('error'))
	}),
	handler: async (ctx, args): Promise<ExaRefreshResponse> => {
		const now = Date.now();
		if (args.scope === 'sources' && args.domains.length === 0) {
			await ctx.runMutation((internal as any).similar_links.applyRefreshSuccess, {
				viewerKey: args.viewerKey,
				normalizedUrl: args.normalizedUrl,
				scope: args.scope,
				sourceHost: args.sourceHost,
				sourceDomainFingerprint: args.sourceDomainFingerprint,
				sourceDomainsSnapshot: args.domains,
				now,
				results: []
			});
			return {
				sourceUrl: args.normalizedUrl,
				scope: args.scope,
				status: 'empty'
			};
		}

		const exaApiKey = process.env.EXA_API_KEY?.trim();
		if (!exaApiKey) {
			await ctx.runMutation((internal as any).similar_links.applyRefreshError, {
				viewerKey: args.viewerKey,
				normalizedUrl: args.normalizedUrl,
				scope: args.scope,
				sourceHost: args.sourceHost,
				sourceDomainFingerprint: args.sourceDomainFingerprint,
				sourceDomainsSnapshot: args.domains,
				now,
				error: 'EXA_API_KEY is not configured.'
			});
			return {
				sourceUrl: args.normalizedUrl,
				scope: args.scope,
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
					...buildExaDomainFilters(args.scope, args.domains),
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
					viewerKey: args.viewerKey,
					normalizedUrl: args.normalizedUrl,
					scope: args.scope,
					sourceHost: args.sourceHost,
					sourceDomainFingerprint: args.sourceDomainFingerprint,
					sourceDomainsSnapshot: args.domains,
					now: Date.now(),
					error: toErrorMessage(response.status, payload)
				});
				return {
					sourceUrl: args.normalizedUrl,
					scope: args.scope,
					status: 'error'
				};
			}

			const normalizedResults = filterResultsByScopeDomains(
				normalizeExaResults(args.normalizedUrl, payload?.results ?? []),
				args.scope,
				args.domains
			);
			await ctx.runMutation((internal as any).similar_links.applyRefreshSuccess, {
				viewerKey: args.viewerKey,
				normalizedUrl: args.normalizedUrl,
				scope: args.scope,
				sourceHost: args.sourceHost,
				sourceDomainFingerprint: args.sourceDomainFingerprint,
				sourceDomainsSnapshot: args.domains,
				now: Date.now(),
				results: normalizedResults
			});

			return {
				sourceUrl: args.normalizedUrl,
				scope: args.scope,
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
				viewerKey: args.viewerKey,
				normalizedUrl: args.normalizedUrl,
				scope: args.scope,
				sourceHost: args.sourceHost,
				sourceDomainFingerprint: args.sourceDomainFingerprint,
				sourceDomainsSnapshot: args.domains,
				now: Date.now(),
				error: message
			});
			return {
				sourceUrl: args.normalizedUrl,
				scope: args.scope,
				status: 'error'
			};
		} finally {
			clearTimeout(timeout);
			try {
				await ctx.runMutation((internal as any).similar_links.releaseRefreshLease, {
					viewerKey: args.viewerKey,
					normalizedUrl: args.normalizedUrl,
					scope: args.scope,
					now: Date.now()
				});
			} catch {
				// best-effort lease cleanup; refresh logic remains safe due lease expiry fallback
			}
		}
	}
});
