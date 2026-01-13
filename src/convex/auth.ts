import { convexAuth } from '@convex-dev/auth/server';
import { Password } from '@convex-dev/auth/providers/Password';

/**
 * Configuration for Convex Auth.
 *
 * Defines the authentication providers (currently Password) and exports
 * standard auth utilities for use in other functions.
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
	providers: [Password]
});
