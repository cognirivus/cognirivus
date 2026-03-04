import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ConvexError } from 'convex/values';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

const NAMED_HTML_ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' '
};

const decodeNumericEntity = (entity: string, radix: number) => {
	const codePoint = Number.parseInt(entity, radix);
	if (!Number.isFinite(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) {
		return null;
	}
	try {
		return String.fromCodePoint(codePoint);
	} catch {
		return null;
	}
};

const isUnsafeControlChar = (codePoint: number) =>
	(codePoint >= 0 && codePoint <= 8) ||
	codePoint === 11 ||
	codePoint === 12 ||
	(codePoint >= 14 && codePoint <= 31) ||
	codePoint === 127;

const isBidiControlChar = (codePoint: number) =>
	(codePoint >= 0x202a && codePoint <= 0x202e) || (codePoint >= 0x2066 && codePoint <= 0x2069);

export const sanitizeDisplayText = (value: string, maxLength = 100_000) => {
	if (!value) {
		return '';
	}
	let withoutControls = '';
	for (const char of value) {
		const codePoint = char.codePointAt(0);
		if (codePoint === undefined) {
			continue;
		}
		if (isUnsafeControlChar(codePoint) || isBidiControlChar(codePoint)) {
			continue;
		}
		withoutControls += char;
	}
	withoutControls = withoutControls.replace(/\r\n?/g, '\n');
	if (withoutControls.length <= maxLength) {
		return withoutControls;
	}
	return withoutControls.slice(0, maxLength);
};

export const decodeHtmlEntities = (value: string) => {
	if (!value) {
		return '';
	}
	if (!value.includes('&')) {
		return sanitizeDisplayText(value);
	}

	return sanitizeDisplayText(
		value
			.replace(/&#x([0-9a-fA-F]+);?/g, (_match, hex) => {
				return decodeNumericEntity(hex, 16) ?? _match;
			})
			.replace(/&#([0-9]+);?/g, (_match, dec) => {
				return decodeNumericEntity(dec, 10) ?? _match;
			})
			.replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (_match, named) => {
				const decoded = NAMED_HTML_ENTITIES[named.toLowerCase()];
				return decoded ?? _match;
			})
	);
};

/**
 * Utility to determine if an error is authentication related.
 * Useful for JWT caching and error boundaries.
 */
export const isAuthError = (error: unknown) => {
	const message =
		(error instanceof ConvexError && error.data) || (error instanceof Error && error.message) || '';
	return /auth/i.test(message);
};

export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
