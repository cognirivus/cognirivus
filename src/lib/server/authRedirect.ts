const isSafeReturnPath = (value: string) => value.startsWith('/') && !value.startsWith('//');

export const normalizeReturnTo = (value: string | null, fallback = '/') => {
	if (!value) {
		return fallback;
	}

	return isSafeReturnPath(value) ? value : fallback;
};

export const normalizeAdminReturnTo = (value: string | null) => {
	const returnTo = normalizeReturnTo(value, '/admin');
	return returnTo === '/admin' || returnTo.startsWith('/admin/') ? returnTo : '/admin';
};
