import { authComponent } from '../auth';
import { isAdminRole } from '../../lib/shared/adminRole';

export const requireAdminUser = async (ctx: any) => {
	const authUser = await authComponent.getAuthUser(ctx);
	if (!authUser || !isAdminRole(authUser.role)) {
		throw new Error('Admin access required.');
	}
	return authUser;
};
