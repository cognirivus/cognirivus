export const GROUP_POST_LIMITS = {
	TITLE_MAX: 120,
	BODY_MAX: 32768,
	TAGS_MAX: 10,
	TAG_MAX_LENGTH: 30
} as const;

const TAG_ALLOWED_REGEX = /^[a-z0-9\s-]+$/;

type GroupPostFieldErrors = {
	title?: string;
	body?: string;
	tags?: string;
};

export type GroupPostValidationResult = {
	title: string;
	body: string;
	tags: Array<string>;
	fieldErrors: GroupPostFieldErrors;
	isValid: boolean;
};

function normalizeTag(input: string) {
	const trimmedInput = input.trim().toLowerCase();
	if (!trimmedInput) return null;
	if (!TAG_ALLOWED_REGEX.test(trimmedInput)) {
		throw new Error('Tags can only include letters, numbers, spaces, and hyphens');
	}

	const normalizedTag = trimmedInput
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
	if (!normalizedTag) {
		throw new Error('Each tag must include at least one letter or number');
	}
	if (normalizedTag.length > GROUP_POST_LIMITS.TAG_MAX_LENGTH) {
		throw new Error(`Each tag must be ${GROUP_POST_LIMITS.TAG_MAX_LENGTH} characters or fewer`);
	}
	return normalizedTag;
}

export function parseAndValidateTags(input: string) {
	const uniqueTags = new Set<string>();
	const rawTags = input.split(',');

	for (const rawTag of rawTags) {
		const normalizedTag = normalizeTag(rawTag);
		if (!normalizedTag) continue;
		if (uniqueTags.has(normalizedTag)) continue;
		if (uniqueTags.size >= GROUP_POST_LIMITS.TAGS_MAX) {
			throw new Error(`You can add up to ${GROUP_POST_LIMITS.TAGS_MAX} tags`);
		}
		uniqueTags.add(normalizedTag);
	}

	return Array.from(uniqueTags);
}

export function validateGroupPostInput(input: {
	title: string;
	body: string;
	tagsInput: string;
}): GroupPostValidationResult {
	const fieldErrors: GroupPostFieldErrors = {};
	const normalizedTitle = input.title.trim();
	const normalizedBody = input.body.trim();

	if (!normalizedTitle) {
		fieldErrors.title = 'Title is required';
	} else if (normalizedTitle.length > GROUP_POST_LIMITS.TITLE_MAX) {
		fieldErrors.title = `Title must be ${GROUP_POST_LIMITS.TITLE_MAX} characters or fewer`;
	}

	if (!normalizedBody) {
		fieldErrors.body = 'Body is required';
	} else if (normalizedBody.length > GROUP_POST_LIMITS.BODY_MAX) {
		fieldErrors.body = `Body must be ${GROUP_POST_LIMITS.BODY_MAX} characters or fewer`;
	}

	let tags: Array<string> = [];
	try {
		tags = parseAndValidateTags(input.tagsInput);
	} catch (e) {
		fieldErrors.tags = e instanceof Error ? e.message : 'Invalid tags';
	}

	return {
		title: normalizedTitle,
		body: normalizedBody,
		tags,
		fieldErrors,
		isValid: !fieldErrors.title && !fieldErrors.body && !fieldErrors.tags
	};
}
