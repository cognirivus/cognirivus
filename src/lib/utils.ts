import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ConvexError } from 'convex/values';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

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
