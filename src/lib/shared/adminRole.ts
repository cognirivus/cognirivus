const ADMIN_ROLE_VALUES = new Set(['admin', 'system-admin', 'superadmin', 'owner']);

export const isAdminRole = (role: unknown): boolean => {
	if (typeof role === 'string') {
		return ADMIN_ROLE_VALUES.has(role.toLowerCase());
	}
	if (Array.isArray(role)) {
		return role.some((entry) => isAdminRole(entry));
	}
	if (role && typeof role === 'object') {
		const roleObject = role as { role?: unknown; name?: unknown };
		return isAdminRole(roleObject.role ?? roleObject.name);
	}
	return false;
};
