import { page } from '$app/state';

export const useAppAuth = () => ({
	get isAuthenticated() {
		return !!(page.data.authUser ?? page.data.currentUser);
	},
	get isAdmin() {
		return !!page.data.isAdmin;
	},
	get currentUser() {
		return page.data.currentUser ?? null;
	}
});
