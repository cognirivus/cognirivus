declare global {
	namespace App {
		interface Locals {
			token: string | undefined;
		}
		interface PageData {
			currentUser?: {
				id: string;
				email: string;
				name: string;
				image?: string | null;
				role?: unknown;
				username: string | null;
				hasUsername: boolean;
			} | null;
			authState?: import('@mmailaender/convex-better-auth-svelte/sveltekit').AuthState;
		}
	}
}

export {};
