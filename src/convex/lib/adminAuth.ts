import { getAuthUser } from '../auth';
import { getAppRole } from '../../lib/shared/adminRole';

type IdentityRecord = Record<string, unknown> & {
	subject?: string;
	email?: string;
	givenName?: string;
	familyName?: string;
	name?: string;
	pictureUrl?: string;
};

const ADMIN_ORG_ID = process.env.WORKOS_ADMIN_ORG_ID ?? null;

const normalizePermissions = (permissions: unknown): Array<string> => {
	if (!Array.isArray(permissions)) {
		return [];
	}

	return permissions.filter((entry): entry is string => typeof entry === 'string');
};

const getIdentityOrganizationId = (identity: IdentityRecord): string | null => {
	const value = identity.org_id ?? identity.organizationId;
	return typeof value === 'string' ? value : null;
};

const getIdentityName = (identity: IdentityRecord): string => {
	const givenName = typeof identity.givenName === 'string' ? identity.givenName.trim() : '';
	const familyName = typeof identity.familyName === 'string' ? identity.familyName.trim() : '';
	const fullName = `${givenName} ${familyName}`.trim();
	if (fullName) {
		return fullName;
	}
	if (typeof identity.name === 'string' && identity.name.trim()) {
		return identity.name.trim();
	}
	if (typeof identity.email === 'string' && identity.email.trim()) {
		return identity.email.trim();
	}
	return typeof identity.subject === 'string' ? identity.subject : '';
};

const getIdentityEmail = (identity: IdentityRecord): string => {
	if (typeof identity.email === 'string' && identity.email.trim()) {
		return identity.email.trim();
	}
	return '';
};

const getIdentityImage = (identity: IdentityRecord): string | null => {
	const value = identity.pictureUrl ?? identity.picture;
	return typeof value === 'string' && value.trim() ? value : null;
};

export const requireAdminUser = async (ctx: any) => {
	if (ctx.db) {
		const authUser = await getAuthUser(ctx);
		if (authUser.role !== 'admin') {
			throw new Error('Admin access required.');
		}
		return authUser;
	}

	const identity = (await ctx.auth.getUserIdentity()) as IdentityRecord | null;
	if (!identity || typeof identity.subject !== 'string') {
		throw new Error('Not authenticated');
	}

	const permissions = normalizePermissions(identity.permissions);
	const organizationId = getIdentityOrganizationId(identity);
	const role = getAppRole(permissions, organizationId, ADMIN_ORG_ID);
	if (role !== 'admin') {
		throw new Error('Admin access required.');
	}

	return {
		_id: identity.subject,
		email: getIdentityEmail(identity),
		name: getIdentityName(identity),
		image: getIdentityImage(identity),
		role,
		organizationId,
		permissions
	};
};
