export const ADMIN_ACCESS_PERMISSION = 'admin:access';

const ADMIN_ROLE_VALUES = new Set(['admin', 'system-admin', 'superadmin', 'owner']);

const normalizePermissions = (permissions: unknown): Array<string> => {
	if (!Array.isArray(permissions)) {
		return [];
	}
	return permissions.filter((entry): entry is string => typeof entry === 'string');
};

export const hasAdminPermission = (
	permissions: unknown,
	organizationId: unknown,
	adminOrganizationId: string | null | undefined
): boolean => {
	if (!adminOrganizationId || typeof organizationId !== 'string') {
		return false;
	}

	return (
		organizationId === adminOrganizationId &&
		normalizePermissions(permissions).includes(ADMIN_ACCESS_PERMISSION)
	);
};

export const getAppRole = (
	permissions: unknown,
	organizationId: unknown,
	adminOrganizationId: string | null | undefined
): 'admin' | 'regular' =>
	hasAdminPermission(permissions, organizationId, adminOrganizationId) ? 'admin' : 'regular';

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
