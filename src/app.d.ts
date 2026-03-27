declare global {
	namespace App {
		interface Locals {
			auth: import('@workos/authkit-sveltekit').AuthKitAuth;
		}
		interface PageData {
			currentUser?: {
				id: string;
				email: string;
				name: string;
				image?: string | null;
				role?: string;
				username: string | null;
				hasUsername: boolean;
			} | null;
			isAdmin?: boolean;
			authUser?: {
				id: string;
				email: string;
				firstName: string | null;
				lastName: string | null;
				profilePictureUrl: string | null;
			} | null;
		}
	}
}

export {};
