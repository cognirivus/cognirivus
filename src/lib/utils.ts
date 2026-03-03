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

export const decodeHtmlEntities = (value: string) => {
	if (!value || !value.includes('&')) {
		return value;
	}

	return value
		.replace(/&#x([0-9a-fA-F]+);?/g, (_match, hex) => {
			return decodeNumericEntity(hex, 16) ?? _match;
		})
		.replace(/&#([0-9]+);?/g, (_match, dec) => {
			return decodeNumericEntity(dec, 10) ?? _match;
		})
		.replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (_match, named) => {
			const decoded = NAMED_HTML_ENTITIES[named.toLowerCase()];
			return decoded ?? _match;
		});
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
