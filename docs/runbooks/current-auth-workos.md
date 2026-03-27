# Current Auth State

This repository now uses WorkOS AuthKit for application authentication and WorkOS-issued JWTs for Convex authentication.

## Current Stack
- SvelteKit session/auth: `@workos/authkit-sveltekit`
- Convex auth validation: WorkOS `customJwt` providers in `src/convex/auth.config.ts`
- Admin authorization: WorkOS-native RBAC via `WORKOS_ADMIN_ORG_ID` + `admin:access`

## Current Runtime Entry Points
- Sign in: `/signin`
- Sign up: `/signup`
- Callback: `/callback`
- Logout: `/logout`
- Convex token bridge: `/api/auth/convex-token`
- Admin sign in: `/admin/signin`

## Current Source Of Truth Files
- `src/hooks.server.ts`
- `src/routes/+layout.server.ts`
- `src/routes/+layout.svelte`
- `src/convex/auth.config.ts`
- `src/convex/auth.ts`
- `src/convex/lib/adminAuth.ts`
- `src/lib/shared/adminRole.ts`

## Important Notes
- Do not use Better Auth guidance in this repository for new implementation work.
- Historical Better Auth docs under `docs/convex/convex-betterauth.md` are retained as external reference material only.
- Current admin access is granted only when the WorkOS session is in `WORKOS_ADMIN_ORG_ID` and includes `admin:access`.
