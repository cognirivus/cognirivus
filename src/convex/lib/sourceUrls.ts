export const SOURCE_URL_LIMIT = 2048;

const hasCredentialsInAuthority = (inputUrl: string) => {
	const match = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\/([^/?#]+)/.exec(inputUrl);
	if (!match) {
		return false;
	}
	const authority = match[1] ?? '';
	const atIndex = authority.lastIndexOf('@');
	if (atIndex === -1) {
		return false;
	}
	return authority.slice(atIndex + 1).length > 0;
};

const stripLeadingWww = (hostname: string) => hostname.replace(/^www\./i, '');

export const normalizeHttpUrl = (
	inputUrl: string,
	options?: {
		preserveTrailingSlash?: boolean;
	}
) => {
	const trimmed = inputUrl.trim();
	if (!trimmed) {
		throw new Error('Source URL is required.');
	}

	let withProtocol = trimmed;
	if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(withProtocol)) {
		withProtocol = `https://${withProtocol}`;
	}

	let parsed: URL;
	try {
		parsed = new URL(withProtocol);
	} catch {
		throw new Error('Invalid source URL.');
	}

	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new Error('Only http/https source URLs are supported.');
	}
	if (hasCredentialsInAuthority(withProtocol)) {
		throw new Error('Source URLs with credentials are not supported.');
	}
	if (parsed.toString().length > SOURCE_URL_LIMIT) {
		throw new Error(`Source URL exceeds ${SOURCE_URL_LIMIT} characters.`);
	}

	parsed.hash = '';
	parsed.searchParams.sort();
	if (!options?.preserveTrailingSlash) {
		parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
	}

	return parsed;
};

export const canonicalWebsiteRootUrl = (inputUrl: string) => {
	const parsed = normalizeHttpUrl(inputUrl);
	const root = new URL(parsed.toString());
	root.pathname = '/';
	root.search = '';
	root.hash = '';
	return root.toString();
};

export const websiteNormalizedKeyFromUrl = (inputUrl: string) => {
	const rootUrl = canonicalWebsiteRootUrl(inputUrl);
	const parsed = new URL(rootUrl);
	return `website:${parsed.host.toLowerCase()}/`;
};

export const sourceHostForDisplay = (inputUrl: string) => {
	const parsed = normalizeHttpUrl(inputUrl);
	return stripLeadingWww(parsed.host.toLowerCase());
};

export const deriveSavedWebsiteMetadata = (inputUrl: string) => {
	const normalizedUrl = normalizeHttpUrl(inputUrl).toString();
	const originSiteUrl = canonicalWebsiteRootUrl(normalizedUrl);
	return {
		normalizedUrl,
		originHost: sourceHostForDisplay(originSiteUrl),
		originSiteUrl,
		suggestedSourceType: 'website' as const,
		suggestedSourceNormalizedKey: websiteNormalizedKeyFromUrl(originSiteUrl),
		suggestedSourceCanonicalUrl: originSiteUrl
	};
};

export const deriveWebsiteSourceInput = (inputUrl: string) => {
	const normalizedUrl = normalizeHttpUrl(inputUrl).toString();
	const canonicalUrl = canonicalWebsiteRootUrl(normalizedUrl);
	return {
		originalUrl: normalizedUrl,
		canonicalUrl,
		normalizedKey: websiteNormalizedKeyFromUrl(canonicalUrl),
		originHost: sourceHostForDisplay(canonicalUrl),
		shouldSaveOriginal: normalizedUrl !== canonicalUrl
	};
};
