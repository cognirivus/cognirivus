import {
	canonicalWebsiteRootUrl,
	normalizeHttpUrl,
	rssNormalizedKeyFromUrl,
	websiteNormalizedKeyFromUrl
} from './sourceUrls';

const tryNormalizeUrl = (inputUrl?: string | null) => {
	if (!inputUrl || !inputUrl.trim()) {
		return null;
	}
	try {
		return normalizeHttpUrl(inputUrl).toString();
	} catch {
		return null;
	}
};

export const resolveSourceIdentityFromRss = (args: {
	feedUrl: string;
	feedSiteUrl?: string | null;
	itemUrls?: Array<string | null | undefined>;
}) => {
	const canonicalFeedUrl = normalizeHttpUrl(args.feedUrl).toString();
	const normalizedFeedSiteUrl = tryNormalizeUrl(args.feedSiteUrl);
	const normalizedItemUrl =
		args.itemUrls?.map((itemUrl) => tryNormalizeUrl(itemUrl)).find((value) => !!value) ?? null;
	const inferredWebsiteUrl = normalizedFeedSiteUrl ?? normalizedItemUrl;

	if (inferredWebsiteUrl) {
		const canonicalUrl = canonicalWebsiteRootUrl(inferredWebsiteUrl);
		return {
			sourceType: 'website' as const,
			canonicalUrl,
			normalizedKey: websiteNormalizedKeyFromUrl(canonicalUrl),
			rssFeedUrl: canonicalFeedUrl,
			rssFeedNormalizedKey: rssNormalizedKeyFromUrl(canonicalFeedUrl)
		};
	}

	return {
		sourceType: 'rss' as const,
		canonicalUrl: canonicalFeedUrl,
		normalizedKey: rssNormalizedKeyFromUrl(canonicalFeedUrl),
		rssFeedUrl: canonicalFeedUrl,
		rssFeedNormalizedKey: rssNormalizedKeyFromUrl(canonicalFeedUrl)
	};
};
