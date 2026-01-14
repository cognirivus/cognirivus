Directory structure:
└── docs/
    ├── debugging.mdx
    ├── experimental.mdx
    ├── index.mdx
    ├── meta.json
    ├── supported-plugins.mdx
    ├── api/
    │   ├── component-client.mdx
    │   ├── convex-plugin.mdx
    │   ├── meta.json
    │   └── type-utilities.mdx
    ├── basic-usage/
    │   ├── authorization.mdx
    │   ├── index.mdx
    │   └── meta.json
    ├── features/
    │   ├── local-install.mdx
    │   ├── meta.json
    │   └── triggers.mdx
    ├── framework-guides/
    │   ├── expo.mdx
    │   ├── meta.json
    │   ├── next.mdx
    │   ├── react.mdx
    │   ├── sveltekit.mdx
    │   └── tanstack-start.mdx
    ├── integrations/
    │   └── hono.mdx
    └── migrations/
        ├── meta.json
        ├── migrate-to-0-10.mdx
        ├── migrate-to-0-8.mdx
        └── migrate-to-0-9/
            ├── index.mdx
            └── migrate-userid/
                ├── index.mdx
                ├── meta.json
                ├── userid-in-app-table.mdx
                └── userid-in-component-table.mdx


Files Content:

================================================
FILE: docs/content/docs/debugging.mdx
================================================
---
title: Debugging
description: Debugging Convex + Better Auth
---

## Verbose logging

### Backend

Verbose logs from the Better Auth component can be enabled on the component
constructor.

```ts title="convex/auth.ts"
export const authComponent = createClient(
  components.betterAuth,
  // [!code ++:3]
  {
    verbose: true,
  }
);
```

## Client side

Verbose logs in the client can be enabled on the Convex client constructor.

```ts title="src/main.ts"
// Replace this with your framework prefixed environment variable
// for your project's Convex cloud URL
const convexUrl = import.meta.env.PUBLIC_CONVEX_URL as string;
const convex = new ConvexReactClient(convexUrl, {
  verbose: true, // [!code ++]
});
```



================================================
FILE: docs/content/docs/experimental.mdx
================================================
---
title: Experimental
description: Experimental features for Convex + Better Auth
---

<Callout>
  These features are experimental and may be changed or removed in the future.
</Callout>

## JWT Caching

**Faster page loads and navigation by reusing JWT from cookies.**

Authenticated queries in SSR require an additional request for a token. This can
slow down initial page load and navigation for frameworks that server render on
in-app navigation.

JWT caching allows server utilties like `fetchAuthQuery` to utilize the Convex
JWT from request cookies if present and unexpired.

First, create a utility function for determining whether an error is auth
related.

```ts title="lib/utils.ts"
import { ConvexError } from "convex/values";

export const isAuthError = (error: unknown) => {
  // This broadly matches potentially auth related errors, can be rewritten to
  // work with your app's own error handling.
  const message =
    (error instanceof ConvexError && error.data) ||
    (error instanceof Error && error.message) ||
    "";
  return /auth/i.test(message);
};
```

Configure `jwtCache` in server utilities.

<Tabs groupId="framework" items={["next-js", "tanstack-start"]} defaultValue="next-js" persist>

  <Tab value="next-js">

```ts title="lib/auth-server.ts"
import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";
import { isAuthError } from "@/lib/utils";

export const { fetchAuthQuery } = convexBetterAuthNextJs({
  convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL!,
  convexSiteUrl: process.env.NEXT_PUBLIC_CONVEX_SITE_URL!,
  jwtCache: {
    enabled: true,
    isAuthError,
  },
});
```

  </Tab>

  <Tab value="tanstack-start">

```ts title="lib/auth-server.ts"
import { convexBetterAuthReactStart } from "@convex-dev/better-auth/react-start";
import { isAuthError } from "@/lib/utils";

export const { fetchAuthQuery } = convexBetterAuthReactStart({
  convexUrl: process.env.VITE_CONVEX_URL!,
  convexSiteUrl: process.env.VITE_CONVEX_SITE_URL!,
  jwtCache: {
    enabled: true,
    isAuthError,
  },
});
```

  </Tab>

</Tabs>

## Static JWKS

**Faster page loads, navigation, and client readiness by speeding up Convex
backend token validation.**

When a Convex function is called over http (as opposed to the websocket client),
every request must include a token and be validated by the Convex backend. Token
validation is never cached. By default, validation requires the Convex backend
to make two blocking http requests serially: one for OIDC discovery, which
provides the JWKS url, and one for fetching the JWKS from the url. The JWT is
then validated using the JWKS.

By default the Better Auth Component uses Convex's
[`customJwt`](https://docs.convex.dev/auth/advanced/custom-jwt) to avoid the
OIDC request by providing the JWKS url statically in the auth config. Static
JWKS avoids both calls by providing the JWKS itself as a data uri.

First, add an internal mutation to get the latest JWKS. A new key may be
written, so this must be a mutation.

```ts title="convex/auth.ts"
export const getLatestJwks = internalAction({
  args: {},
  handler: async (ctx) => {
    const auth = createAuth(ctx);
    // This method is added by the Convex Better Auth plugin and is
    // available via `auth.api` only, not exposed as a route.
    return await auth.api.getLatestJwks();
  },
});
```

Run the mutation and set the JWKS environment variable from the CLI.

```bash
npx convex run auth:getLatestJwks | npx convex env set JWKS
```

Provide the JWKS environment variable to your auth config and the Convex Better
Auth plugin.

```ts title="convex/auth.config.ts"
export default {
  providers: [getAuthConfigProvider({ jwks: process.env.JWKS })], // [!code ++]
} satisfies AuthConfig;
```

```ts title="convex/auth.ts"
export const createAuthOptions = (ctx: GenericCtx<DataModel>) => {
  return {
    baseURL: siteUrl,
    database: authComponent.adapter(ctx),
    // ... other auth config
    plugins: [
      // ... other plugins
      convex({
        authConfig,
        jwks: process.env.JWKS, // [!code ++]
      }),
    ],
  } satisfies BetterAuthOptions;
};
```

## AuthBoundary

The `AuthBoundary` React component is a wrapper that provides error handling for
auth related errors in the client. It subscribes to a session validated user
query for synced handling of session state changes.

The Convex Component exports a query for use with `AuthBoundary`.

```ts title="convex/auth.ts"
export const { getAuthUser } = authComponent.clientApi(); // [!code ++]
```

Create a utility function for determining whether an error is auth related.

```ts title="lib/utils.ts"
import { ConvexError } from "convex/values";

export const isAuthError = (error: unknown) => {
  // This broadly matches potentially auth related errors, can be rewritten to
  // work with your app's own error handling.
  const message =
    (error instanceof ConvexError && error.data) ||
    (error instanceof Error && error.message) ||
    "";
  return /auth/i.test(message);
};
```

Add a client component to wrap and configure `AuthBoundary`.

<Tabs groupId="framework" items={["next-js", "tanstack-start"]} defaultValue="next-js" persist>
<Tab value="next-js">
```tsx title="lib/auth-client.tsx"
"use client";

import { useRouter } from "next/navigation";
import { AuthBoundary } from "@convex-dev/better-auth/react";
import { api } from "@/convex/_generated/api";
import { isAuthError } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";

export const ClientAuthBoundary = ({ children }: PropsWithChildren) => {
  const router = useRouter();
  return (
    <AuthBoundary
      authClient={authClient}
      // This can do anything you like, a redirect is typical.
      onUnauth={() => router.replace("/sign-in")}
      getAuthUserFn={api.auth.getAuthUser}
      isAuthError={isAuthError}
    >
      {children}
    </AuthBoundary>
  );
};
```
</Tab>
<Tab value="tanstack-start">
```tsx title="lib/auth-client.tsx"
"use client";

import { useNavigate } from "@tanstack/react-router";
import { AuthBoundary } from "@convex-dev/better-auth/react";
import { api } from "@/convex/_generated/api";
import { isAuthError } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";

export const ClientAuthBoundary = ({ children }: PropsWithChildren) => {
  const navigate = useNavigate();
  return (
    <AuthBoundary
      authClient={authClient}
      // This can do anything you like, a redirect is typical.
      onUnauth={() => navigate({ to: "/sign-in" })}
      getAuthUserFn={api.auth.getAuthUser}
      isAuthError={isAuthError}
    >
      {children}
    </AuthBoundary>
  );
};
```
</Tab>
</Tabs>

Wrap authenticated layout, route, etc. with `ClientAuthBoundary`. Most apps can
just use one.

<Tabs groupId="framework" items={["next-js", "tanstack-start"]} defaultValue="next-js" persist>
<Tab value="next-js">

```tsx title="app/(auth)/layout.tsx"
import { isAuthenticated } from "@/lib/auth-server";
import { ClientAuthBoundary } from "@/lib/auth-client";
import { redirect } from "next/navigation";
import { PropsWithChildren } from "react";

export default async function Layout({ children }: PropsWithChildren) {
  if (!(await isAuthenticated())) {
    redirect("/sign-in");
  }
  return <ClientAuthBoundary>{children}</ClientAuthBoundary>;
}
```

</Tab>

<Tab value="tanstack-start">
```tsx title="src/routes/_authed.tsx"
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { ClientAuthBoundary } from '@/lib/auth-client'

export const Route = createFileRoute("/_authed")({
  beforeLoad: ({ context }) => {
    if (!context.isAuthenticated) {
      console.log("redirecting to /sign-in");
      throw redirect({ to: "/sign-in" });
    }
  },
  component: () => {
    return (
      <ClientAuthBoundary>
        <Outlet />
      </ClientAuthBoundary>
    );
  },
});
```

</Tab>
</Tabs>



================================================
FILE: docs/content/docs/index.mdx
================================================
---
title: Getting Started
description: Getting Started with Better Auth and Convex
---

## Introduction

Convex + Better Auth is a [Convex Component](https://www.convex.dev/components)
that provides an integration layer for using [Better
Auth](https://www.better-auth.com) with [Convex](https://www.convex.dev).

## Prerequisites

<div className="fd-steps">

<div className="fd-step">
### Create a Convex project

To use Convex + Better Auth, you'll first need a [Convex](https://www.convex.dev/) project. If you don't have
one, run `npm create convex@latest` to get started, and [check out the
docs](https://docs.convex.dev/home) to learn more about Convex.

</div>

<div className="fd-step">
### Run `convex dev`

Running the cli during setup will initialize your Convex deployment if it
doesn't already exist, and keeps generated types current through the process.
Keep it running.

```npm
npx convex dev
```

</div>
</div>

## Select your framework

Installation steps vary by framework. Select yours to get started.

<Cards>
  <Card
    href="/framework-guides/react"
    className="py-12 flex justify-center"
  >
  <div className="flex flex-col items-center gap-2 text-black dark:text-fd-muted-foreground">
    <svg
      role="img"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className="w-10 h-10"
      fill="currentColor"
    >
      <title>React</title>
      <path d="M14.23 12.004a2.236 2.236 0 0 1-2.235 2.236 2.236 2.236 0 0 1-2.236-2.236 2.236 2.236 0 0 1 2.235-2.236 2.236 2.236 0 0 1 2.236 2.236zm2.648-10.69c-1.346 0-3.107.96-4.888 2.622-1.78-1.653-3.542-2.602-4.887-2.602-.41 0-.783.093-1.106.278-1.375.793-1.683 3.264-.973 6.365C1.98 8.917 0 10.42 0 12.004c0 1.59 1.99 3.097 5.043 4.03-.704 3.113-.39 5.588.988 6.38.32.187.69.275 1.102.275 1.345 0 3.107-.96 4.888-2.624 1.78 1.654 3.542 2.603 4.887 2.603.41 0 .783-.09 1.106-.275 1.374-.792 1.683-3.263.973-6.365C22.02 15.096 24 13.59 24 12.004c0-1.59-1.99-3.097-5.043-4.032.704-3.11.39-5.587-.988-6.38-.318-.184-.688-.277-1.092-.278zm-.005 1.09v.006c.225 0 .406.044.558.127.666.382.955 1.835.73 3.704-.054.46-.142.945-.25 1.44-.96-.236-2.006-.417-3.107-.534-.66-.905-1.345-1.727-2.035-2.447 1.592-1.48 3.087-2.292 4.105-2.295zm-9.77.02c1.012 0 2.514.808 4.11 2.28-.686.72-1.37 1.537-2.02 2.442-1.107.117-2.154.298-3.113.538-.112-.49-.195-.964-.254-1.42-.23-1.868.054-3.32.714-3.707.19-.09.4-.127.563-.132zm4.882 3.05c.455.468.91.992 1.36 1.564-.44-.02-.89-.034-1.345-.034-.46 0-.915.01-1.36.034.44-.572.895-1.096 1.345-1.565zM12 8.1c.74 0 1.477.034 2.202.093.406.582.802 1.203 1.183 1.86.372.64.71 1.29 1.018 1.946-.308.655-.646 1.31-1.013 1.95-.38.66-.773 1.288-1.18 1.87-.728.063-1.466.098-2.21.098-.74 0-1.477-.035-2.202-.093-.406-.582-.802-1.204-1.183-1.86-.372-.64-.71-1.29-1.018-1.946.303-.657.646-1.313 1.013-1.954.38-.66.773-1.286 1.18-1.868.728-.064 1.466-.098 2.21-.098zm-3.635.254c-.24.377-.48.763-.704 1.16-.225.39-.435.782-.635 1.174-.265-.656-.49-1.31-.676-1.947.64-.15 1.315-.283 2.015-.386zm7.26 0c.695.103 1.365.23 2.006.387-.18.632-.405 1.282-.66 1.933-.2-.39-.41-.783-.64-1.174-.225-.392-.465-.774-.705-1.146zm3.063.675c.484.15.944.317 1.375.498 1.732.74 2.852 1.708 2.852 2.476-.005.768-1.125 1.74-2.857 2.475-.42.18-.88.342-1.355.493-.28-.958-.646-1.956-1.1-2.98.45-1.017.81-2.01 1.085-2.964zm-13.395.004c.278.96.645 1.957 1.1 2.98-.45 1.017-.812 2.01-1.086 2.964-.484-.15-.944-.318-1.37-.5-1.732-.737-2.852-1.706-2.852-2.474 0-.768 1.12-1.742 2.852-2.476.42-.18.88-.342 1.356-.494zm11.678 4.28c.265.657.49 1.312.676 1.948-.64.157-1.316.29-2.016.39.24-.375.48-.762.705-1.158.225-.39.435-.788.636-1.18zm-9.945.02c.2.392.41.783.64 1.175.23.39.465.772.705 1.143-.695-.102-1.365-.23-2.006-.386.18-.63.406-1.282.66-1.933zM17.92 16.32c.112.493.2.968.254 1.423.23 1.868-.054 3.32-.714 3.708-.147.09-.338.128-.563.128-1.012 0-2.514-.807-4.11-2.28.686-.72 1.37-1.536 2.02-2.44 1.107-.118 2.154-.3 3.113-.54zm-11.83.01c.96.234 2.006.415 3.107.532.66.905 1.345 1.727 2.035 2.446-1.595 1.483-3.092 2.295-4.11 2.295-.22-.005-.406-.05-.553-.132-.666-.38-.955-1.834-.73-3.703.054-.46.142-.944.25-1.438zm4.56.64c.44.02.89.034 1.345.034.46 0 .915-.01 1.36-.034-.44.572-.895 1.095-1.345 1.565-.455-.47-.91-.993-1.36-1.565z"></path>
    </svg>
    <span className="bg-transparent">React (Vite SPA)</span>
  </div>

  </Card>
  <Card
    href="/framework-guides/expo"
    className="py-12 flex justify-center"
  >
  <div className="flex flex-col items-center gap-2 text-black dark:text-fd-muted-foreground">
    <svg
      role="img"
      viewBox="0 -12.5 256 256"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid"
      className="w-10 h-10"
      fill="currentColor"
    >
      <path d="M121.309004,84.6732585 C123.402504,81.5874152 125.694292,81.1950171 127.553451,81.1950171 C129.41261,81.1950171 132.509843,81.5874152 134.604162,84.6732585 C151.106348,107.339593 178.345607,152.492 198.439108,185.798721 C211.542532,207.519499 221.6069,224.201947 223.671721,226.324944 C231.422996,234.294992 242.053551,229.327949 248.230809,220.287799 C254.312201,211.387762 256.000111,205.138399 256.000111,198.471155 C256.000111,193.930186 167.895315,30.0714244 159.022317,16.4322117 C150.48936,3.31359639 147.710044,0 133.105527,0 L122.176721,0 C107.615631,0 105.511479,3.31359639 96.9777022,16.4322117 C88.1055238,30.0714244 0.0001105152,193.930186 0.0001105152,198.471155 C0.0001105152,205.138399 1.68839227,211.387762 7.76991495,220.287799 C13.9471241,229.327949 24.5775965,234.294992 32.3286259,226.324944 C34.3936934,224.201947 44.4580605,207.519499 57.5616485,185.798721 C77.654822,152.492 104.806818,107.339593 121.309004,84.6732585 Z"/>
      <title>Expo (React Native)</title>
    </svg>
    <span className="bg-transparent">Expo (React Native)</span>
  </div>

  </Card>
  <Card
    href="/framework-guides/tanstack-start"
    className="py-12 flex justify-center"
  >
  <div className="flex flex-col items-center gap-2 text-black dark:text-fd-muted-foreground">
    <svg
      role="img"
      viewBox="0 0 663 660"
      xmlns="http://www.w3.org/2000/svg"
      className="w-10 h-10"
    >
      <title>TanStack Start</title>
      <path d="m305.114318.62443771c8.717817-1.14462121 17.926803-.36545135 26.712694-.36545135 32.548987 0 64.505987 5.05339923 95.64868 14.63098274 39.74418 12.2236582 76.762804 31.7666864 109.435876 57.477568 40.046637 31.5132839 73.228974 72.8472109 94.520714 119.2362609 39.836383 86.790386 39.544267 191.973146-1.268422 278.398081-26.388695 55.880442-68.724007 102.650458-119.964986 136.75724-41.808813 27.828603-90.706831 44.862601-140.45707 50.89341-63.325458 7.677926-131.784923-3.541603-188.712259-32.729444-106.868873-54.795293-179.52309291-165.076271-180.9604082-285.932068-.27660564-23.300971.08616998-46.74071 4.69884909-69.814998 7.51316071-37.57857 20.61272131-73.903917 40.28618971-106.877282 21.2814003-35.670293 48.7704861-67.1473767 81.6882804-92.5255597 38.602429-29.7610135 83.467691-51.1674988 130.978372-62.05777669 11.473831-2.62966514 22.9946-4.0869914 34.57273-5.4964306l3.658171-.44480576c3.050084-.37153079 6.104217-.74794222 9.162589-1.14972654zm-110.555861 549.44131429c-14.716752 1.577863-30.238964 4.25635-42.869928 12.522173 2.84343.683658 6.102369.004954 9.068638 0 7.124652-.011559 14.317732-.279903 21.434964.032202 17.817402.781913 36.381729 3.63214 53.58741 8.350042 22.029372 6.040631 41.432961 17.928687 62.656049 25.945156 22.389644 8.456554 44.67706 11.084675 68.427 11.084675 11.96813 0 23.845573-.035504 35.450133-3.302696-6.056202-3.225083-14.72582-2.619864-21.434964-3.963236-14.556814-2.915455-28.868774-6.474936-42.869928-11.470264-10.304996-3.676672-20.230803-8.214291-30.11097-12.848661l-6.348531-2.985046c-9.1705-4.309263-18.363277-8.560752-27.845391-12.142608-24.932161-9.418465-52.560181-14.071964-79.144482-11.221737zm22.259385-62.614168c-29.163917 0-58.660076 5.137344-84.915434 18.369597-6.361238 3.206092-12.407546 7.02566-18.137277 11.258891-1.746125 1.290529-4.841829 2.948483-5.487351 5.191839-.654591 2.275558 1.685942 4.182039 3.014086 5.637703 6.562396-3.497556 12.797498-7.199878 19.78612-9.855246 45.19892-17.169893 99.992458-13.570779 145.098218 2.172348 22.494346 7.851335 43.219483 19.592421 65.129314 28.800338 24.503461 10.297807 49.53043 16.975034 75.846795 20.399104 31.04195 4.037546 66.433549.7654 94.808495-13.242161 9.970556-4.921843 23.814245-12.422267 28.030337-23.320339-5.207047.454947-9.892236 2.685918-14.83959 4.224149-7.866632 2.445646-15.827248 4.51974-23.908229 6.138887-27.388113 5.486604-56.512458 6.619429-84.091013 1.639788-25.991939-4.693152-50.142596-14.119246-74.179513-24.03502l-3.068058-1.268177c-2.045137-.846788-4.089983-1.695816-6.135603-2.544467l-3.069142-1.272366c-12.279956-5.085721-24.606928-10.110797-37.210937-14.51024-24.485325-8.546552-50.726667-13.784628-76.671218-13.784628zm51.114145-447.9909432c-34.959602 7.7225298-66.276908 22.7605319-96.457338 41.7180089-17.521434 11.0054099-34.281927 22.2799893-49.465301 36.4444283-22.5792616 21.065423-39.8360564 46.668751-54.8866988 73.411509-15.507372 27.55357-25.4498976 59.665686-30.2554517 90.824149-4.7140432 30.568106-5.4906485 62.70747-.0906864 93.301172 6.7503648 38.248526 19.5989769 74.140579 39.8896436 107.337631 6.8187918-3.184625 11.659796-10.445603 17.3128555-15.336896 11.4149428-9.875888 23.3995608-19.029311 36.2745548-26.928535 4.765981-2.923712 9.662222-5.194315 14.83959-7.275014 1.953055-.785216 5.14604-1.502727 6.06527-3.647828 1.460876-3.406732-1.240754-9.335897-1.704904-12.865654-1.324845-10.095517-2.124534-20.362774-1.874735-30.549941.725492-29.668947 6.269727-59.751557 16.825623-87.521453 7.954845-20.924233 20.10682-39.922168 34.502872-56.971512 4.884699-5.785498 10.077731-11.170545 15.437296-16.512656 3.167428-3.157378 7.098271-5.858983 9.068639-9.908915-10.336599.006606-20.674847 2.987289-30.503603 6.013385-21.174447 6.519522-41.801477 16.19312-59.358362 29.841512-8.008432 6.226409-13.873368 14.387371-21.44733 20.939921-2.32322 2.010516-6.484901 4.704691-9.695199 3.187928-4.8500728-2.29042-4.1014979-11.835213-4.6571581-16.222019-2.1369011-16.873476 4.2548401-38.216325 12.3778671-52.843142 13.039878-23.479694 37.150915-43.528712 65.467327-42.82854 12.228647.302197 22.934587 4.551115 34.625711 7.324555-2.964621-4.211764-6.939158-7.28162-10.717482-10.733763-9.257431-8.459031-19.382979-16.184864-30.503603-22.028985-4.474136-2.350694-9.291232-3.77911-14.015169-5.506421-2.375159-.867783-5.36616-2.062533-6.259834-4.702213-1.654614-4.888817 7.148561-9.416813 10.381943-11.478522 12.499882-7.969406 27.826705-14.525258 42.869928-14.894334 23.509209-.577147 46.479246 12.467678 56.162903 34.665926 3.404469 7.803171 4.411273 16.054969 5.079109 24.382907l.121749 1.56229.174325 2.345587c.01913.260708.038244.521433.057403.782164l.11601 1.56437.120128 1.563971c7.38352-6.019164 12.576553-14.876995 19.78612-21.323859 16.861073-15.07846 39.936636-21.7722 61.831627-14.984333 19.786945 6.133107 36.984382 19.788105 47.105807 37.959541 2.648042 4.754231 10.035685 16.373942 4.698379 21.109183-4.177345 3.707277-9.475079.818243-13.880788-.719162-3.33605-1.16376-6.782939-1.90214-10.241828-2.585698l-1.887262-.369639c-.629089-.122886-1.257979-.246187-1.886079-.372129-11.980496-2.401886-25.91652-2.152533-37.923398-.041284-7.762754 1.364839-15.349083 4.127545-23.083807 5.271929v1.651348c21.149714.175043 41.608563 12.240618 52.043268 30.549941 4.323267 7.585468 6.482428 16.267431 8.138691 24.770223 2.047864 10.50918.608423 21.958802-2.263037 32.201289-.962925 3.433979-2.710699 9.255807-6.817143 10.046802-2.902789.558982-5.36781-2.330878-7.024898-4.279468-4.343878-5.10762-8.475879-9.96341-13.573278-14.374161-12.895604-11.157333-26.530715-21.449361-40.396663-31.373138-7.362086-5.269452-15.425755-12.12007-23.908229-15.340199 2.385052 5.745041 4.721463 11.086326 5.532694 17.339156 2.385876 18.392716-5.314223 35.704625-16.87179 49.540445-3.526876 4.222498-7.29943 8.475545-11.744712 11.755948-1.843407 1.360711-4.156734 3.137561-6.595373 2.752797-7.645687-1.207961-8.555849-12.73272-9.728176-18.637115-3.970415-19.998652-2.375984-39.861068 3.132802-59.448534-4.901187 2.485279-8.443727 7.923994-11.521293 12.385111-6.770975 9.816439-12.645804 20.199291-16.858599 31.375615-16.777806 44.519521-16.616219 96.664142 5.118834 139.523233 2.427098 4.786433 6.110614 4.144058 10.894733 4.144058.720854 0 1.44257-.004515 2.164851-.010924l2.168232-.022283c4.338648-.045438 8.686803-.064635 12.979772.508795 2.227588.297243 5.320818.032202 7.084256 1.673642 2.111344 1.966755.986008 5.338808.4996 7.758859-1.358647 6.765574-1.812904 12.914369-1.812904 19.816178 9.02412-1.398692 11.525415-15.866153 14.724172-23.118874 3.624982-8.216283 7.313444-16.440823 10.667192-24.770223 1.648843-4.093692 3.854171-8.671229 3.275427-13.210785-.649644-5.10184-4.335633-10.510831-6.904531-14.862134-4.86244-8.234447-10.389363-16.70834-13.969002-25.595896-2.861567-7.104926-.197036-15.983399 7.871579-18.521521 4.450228-1.400344 9.198073 1.345848 12.094266 4.562675 6.07269 6.74328 9.992815 16.777697 14.401823 24.692609l34.394873 61.925556c2.920926 5.243856 5.848447 10.481933 8.836976 15.687808 1.165732 2.031158 2.352075 5.167068 4.740424 6.0332 2.127008.77118 5.033095-.325315 7.148561-.748886 5.492297-1.099798 10.97635-2.287117 16.488434-3.28288 6.605266-1.193099 16.673928-.969342 21.434964-6.129805-6.963066-2.205375-15.011895-2.074919-22.259386-1.577863-4.352947.298894-9.178287 1.856116-13.178381-.686135-5.953149-3.783239-9.910373-12.522173-13.552668-18.377854-8.980425-14.439388-17.441465-29.095929-26.041008-43.760726l-1.376261-2.335014-2.765943-4.665258c-1.380597-2.334387-2.750786-4.67476-4.079753-7.036188-1.02723-1.826391-2.549937-4.233231-1.078344-6.24705 1.545791-2.114476 4.91472-2.239146 7.956473-2.243117l.603351.000261c1.195428.001526 2.315572.002427 3.222811-.11692 12.27399-1.615019 24.718635-2.952611 37.098976-2.952611-.963749-3.352237-3.719791-7.141255-2.838484-10.73046 1.972017-8.030506 13.526287-10.543033 18.899867-4.780653 3.60767 3.868283 5.704174 9.192229 8.051303 13.859765 3.097352 6.162006 6.624228 12.118418 9.940876 18.16483 5.805578 10.585967 12.146205 20.881297 18.116667 31.375615.49237.865561.999687 1.726685 1.512269 2.587098l.771613 1.290552c2.577138 4.303168 5.164895 8.635123 6.553094 13.461506-20.735854-.9487-36.30176-25.018751-45.343193-41.283704-.721369 2.604176.450959 4.928448 1.388326 7.431066 1.948109 5.197619 4.276275 10.147535 7.20627 14.862134 4.184765 6.732546 8.982075 13.665732 15.313633 18.553722 11.236043 8.673707 26.05255 8.721596 39.572241 7.794364 8.669619-.595311 19.50252-4.542034 28.030338-1.864372 8.513803 2.673532 11.940924 12.063098 6.884745 19.276187-3.787393 5.403211-8.842747 7.443452-15.128962 8.257566 4.445282 9.53571 10.268996 18.385285 14.490036 28.072919 1.758491 4.035895 3.59118 10.22102 7.8048 12.350433 2.805507 1.416857 6.824562.09743 9.85761.034678-3.043765-8.053625-8.742992-14.887729-11.541904-23.118874 8.533589.390544 16.786875 4.843404 24.732651 7.685374 15.630376 5.590144 31.063836 11.701854 46.475333 17.86913l7.112077 2.848685c6.338978 2.538947 12.71588 5.052299 18.961699 7.812528 2.285297 1.009799 5.449427 3.370401 7.975455 1.917215 2.061054-1.186494 3.394144-4.015253 4.665403-5.931643 3.55573-5.361927 6.775921-10.928622 9.965609-16.513481 12.774414-22.36586 22.143967-46.872692 28.402976-71.833646 20.645168-82.323009 2.934117-173.156241-46.677107-241.922507-19.061454-26.420745-43.033164-49.262193-69.46165-68.1783861-66.13923-47.336721-152.911262-66.294198-232.486917-48.7172481zm135.205158 410.5292842c-17.532977 4.570931-35.601827 8.714164-53.58741 11.040088 2.365265 8.052799 8.145286 15.885969 12.376218 23.118874 1.635653 2.796558 3.3859 6.541816 6.618457 7.755557 3.651364 1.370619 8.063669-.853747 11.508927-1.975838-1.595256-4.364513-4.279573-8.292245-6.476657-12.385112-.905215-1.687677-2.305907-3.685809-1.559805-5.68972 1.410585-3.786541 7.266452-3.563609 10.509727-4.221671 8.54678-1.733916 17.004522-3.898008 25.557073-5.611281 3.150939-.631641 7.538512-2.342438 10.705115-1.285575 2.371037.791232 3.800147 2.744743 5.152304 4.781948l.606196.918752c.80912 1.222827 1.637246 2.41754 2.671212 3.351165 3.457625 3.121874 8.628398 3.60159 13.017619 4.453686-2.678546-6.027421-7.130424-11.301001-9.984571-17.339156-1.659561-3.511592-3.023155-8.677834-6.656381-10.707341-5.005064-2.795733-15.341663 2.461334-20.458024 3.795624zm-110.472507-40.151706c-.825246 10.467897-4.036369 18.984725-9.068639 28.072919 5.76683.729896 11.649079.989984 17.312856 2.39363 4.244947 1.051908 8.156828 3.058296 12.366325 4.211763-2.250671-6.157877-6.426367-11.651913-9.661398-17.339156-3.266358-5.740912-6.189758-12.717032-10.949144-17.339156z" fill="currentColor" transform="translate(.9778)"/ >
    </svg>
    <span className="bg-transparent">TanStack Start</span>
    </div>

  </Card>
  <Card
    href="/framework-guides/next"
    className="py-12 flex justify-center"
  >
  <div className="flex flex-col items-center gap-2 text-black dark:text-fd-muted-foreground">
    <svg
      role="img"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className="w-10 h-10"
      fill="currentColor"
    >
      <title>Next.js</title>
      <path d="M11.5725 0c-.1763 0-.3098.0013-.3584.0067-.0516.0053-.2159.021-.3636.0328-3.4088.3073-6.6017 2.1463-8.624 4.9728C1.1004 6.584.3802 8.3666.1082 10.255c-.0962.659-.108.8537-.108 1.7474s.012 1.0884.108 1.7476c.652 4.506 3.8591 8.2919 8.2087 9.6945.7789.2511 1.6.4223 2.5337.5255.3636.04 1.9354.04 2.299 0 1.6117-.1783 2.9772-.577 4.3237-1.2643.2065-.1056.2464-.1337.2183-.1573-.0188-.0139-.8987-1.1938-1.9543-2.62l-1.919-2.592-2.4047-3.5583c-1.3231-1.9564-2.4117-3.556-2.4211-3.556-.0094-.0026-.0187 1.5787-.0235 3.509-.0067 3.3802-.0093 3.5162-.0516 3.596-.061.115-.108.1618-.2064.2134-.075.0374-.1408.0445-.495.0445h-.406l-.1078-.068a.4383.4383 0 01-.1572-.1712l-.0493-.1056.0053-4.703.0067-4.7054.0726-.0915c.0376-.0493.1174-.1125.1736-.143.0962-.047.1338-.0517.5396-.0517.4787 0 .5584.0187.6827.1547.0353.0377 1.3373 1.9987 2.895 4.3608a10760.433 10760.433 0 004.7344 7.1706l1.9002 2.8782.096-.0633c.8518-.5536 1.7525-1.3418 2.4657-2.1627 1.5179-1.7429 2.4963-3.868 2.8247-6.134.0961-.6591.1078-.854.1078-1.7475 0-.8937-.012-1.0884-.1078-1.7476-.6522-4.506-3.8592-8.2919-8.2087-9.6945-.7672-.2487-1.5836-.42-2.4985-.5232-.169-.0176-1.0835-.0366-1.6123-.037zm4.0685 7.217c.3473 0 .4082.0053.4857.047.1127.0562.204.1642.237.2767.0186.061.0234 1.3653.0186 4.3044l-.0067 4.2175-.7436-1.14-.7461-1.14v-3.066c0-1.982.0093-3.0963.0234-3.1502.0375-.1313.1196-.2346.2323-.2955.0961-.0494.1313-.054.4997-.054z" />
    </svg>
    <span className="bg-transparent">Next.js</span>
  </div>
  </Card>
  <Card
    href="/framework-guides/sveltekit"
    className="py-12 flex justify-center"
  >
  <div className="flex flex-col items-center gap-2 text-black dark:text-fd-muted-foreground">
    <svg
      role="img"
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      className="w-10 h-10"
    >
      <title>Svelte</title>
      <defs>
        <mask id="svelte-cutout" maskUnits="userSpaceOnUse">
          <rect x="0" y="0" width="512" height="512" fill="#fff"/>
          <path
            d="M225.6 424.5c-33.3 8.6-68.4-4.4-88-32.6-11.9-16.6-16.5-37.3-13-57.4.6-3.3 1.4-6.5 2.5-9.6l1.9-5.9 5.3 3.9c12.2 9 25.9 15.8 40.4 20.2l3.8 1.2-.4 3.8c-.5 5.4 1 10.9 4.2 15.3 5.9 8.5 16.5 12.4 26.5 9.8 2.2-.6 4.4-1.5 6.3-2.8l103.2-65.8c5.1-3.2 8.6-8.4 9.7-14.4 1.1-6.1-.3-12.3-3.9-17.3-5.9-8.5-16.5-12.4-26.5-9.8-2.2.6-4.4 1.5-6.3 2.8L252 291c-6.5 4.1-13.5 7.2-21 9.2-33.3 8.6-68.4-4.4-88-32.6-11.9-16.6-16.5-37.3-13-57.4 3.5-19.7 15.2-37 32.2-47.7l103.2-65.8c6.5-4.1 13.5-7.2 21-9.2 33.3-8.6 68.4 4.4 88 32.6 11.9 16.6 16.5 37.3 13 57.4-.6 3.3-1.4 6.5-2.5 9.6L383 193l-5.3-3.9c-12.2-9-25.9-15.8-40.4-20.2l-3.8-1.2.4-3.8c.5-5.4-1-10.9-4.2-15.3-5.9-8.5-16.5-12.4-26.5-9.8-2.2.6-4.4 1.5-6.3 2.8l-103.2 65.8c-5.1 3.2-8.6 8.4-9.7 14.4-1.1 6.1.3 12.3 3.9 17.3 5.9 8.5 16.5 12.4 26.5 9.8 2.2-.6 4.4-1.5 6.3-2.8L260 221c6.5-4.1 13.5-7.2 21-9.2 33.3-8.6 68.4 4.4 88 32.6 11.9 16.6 16.5 37.3 13 57.4-3.5 19.7-15.2 37-32.2 47.7l-103.2 65.8c-6.5 4.1-13.6 7.2-21 9.2"
            fill="#000"
          />
        </mask>
      </defs>

      <path
        d="M416.9 93.1c-41.1-58.9-122.4-76.3-181.2-38.9L132.5 120c-28.2 17.7-47.6 46.5-53.5 79.3-4.9 27.3-.6 55.5 12.3 80-8.8 13.4-14.9 28.5-17.7 44.2-5.9 33.4 1.8 67.8 21.6 95.4 41.2 58.9 122.4 76.3 181.2 38.9L379.6 392c28.2-17.7 47.6-46.5 53.5-79.3 4.9-27.3.6-55.5-12.3-80 8.8-13.4 14.9-28.4 17.7-44.2 5.8-33.4-1.9-67.8-21.6-95.4"
        mask="url(#svelte-cutout)"
      />
    </svg>
    <span className="bg-transparent">SvelteKit</span>

  </div>
  </Card>
</Cards>



================================================
FILE: docs/content/docs/meta.json
================================================
{
  "pages": [
    "index",
    "framework-guides",
    "basic-usage",
    "features",
    "supported-plugins",
    "debugging",
    "integrations",
    "experimental",
    "api",
    "migrations"
  ]
}



================================================
FILE: docs/content/docs/supported-plugins.mdx
================================================
---
title: Supported Plugins
description: Supported plugins for Convex + Better Auth
---

## Supported plugins

Any Better Auth plugin may be used with Convex + Better Auth, but only a subset
are considered supported for the integration. Convex + Better Auth works out of
the box for these without any required schema changes.

For plugins that require schema changes and aren't in the list, check out [Local
Install](/local-install).

- [Anonymous](https://www.better-auth.com/docs/plugins/anonymous)
- [Email OTP](https://www.better-auth.com/docs/plugins/email-otp)
- [Generic OAuth](https://www.better-auth.com/docs/plugins/generic-oauth)
- [JWT](https://www.better-auth.com/docs/plugins/jwt)
- [Magic Link](https://www.better-auth.com/docs/plugins/magic-link)
- [One Tap](https://www.better-auth.com/docs/plugins/one-tap)
- [Passkey](https://www.better-auth.com/docs/plugins/passkey)
- [Phone Number](https://www.better-auth.com/docs/plugins/phone-number)
- [Two Factor](https://www.better-auth.com/docs/plugins/2fa)
- [Username](https://www.better-auth.com/docs/plugins/username)

### Incompatible plugins

Official Better Auth plugins that are incompatible with Convex + Better Auth
(even when Local Install is used):

- [SSO](https://www.better-auth.com/docs/plugins/sso) - has direct dependencies on Node.js



================================================
FILE: docs/content/docs/api/component-client.mdx
================================================
---
title: Component Client
description: Component client for Better Auth
---

The component client is returned from the `createClient` function, and provides
helpful methods for using Better Auth in your Convex code.

## `adapter()`

Returns the Convex database adapter for use in Better Auth options.

```ts
import { createClient } from "@convex-dev/better-auth";
import { components } from "./_generated/api";
import { type GenericCtx } from "./_generated/server";
import { DataModel } from "./_generated/dataModel";

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    database: authComponent.adapter(ctx),
  });
});
```

## `getAuth()`

Better Auth [API
endpoints](https://www.better-auth.com/docs/concepts/api)
can be called directly from the server, and many require headers to be passed in
containing a session token for the current user. This method provides both the
auth object and headers for convenience.

```ts
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { createAuth, authComponent } from "./auth";

export const changePassword = mutation({
  args: {
    newPassword: v.string(),
    currentPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
    await auth.api.changePassword({
      body: {
        newPassword: args.newPassword,
        currentPassword: args.currentPassword,
      },
      headers,
    });
  },
});
```

## `getAnyUserById()`

Returns a user by their Better Auth user id.

```ts
import { query } from "./_generated/server";
import { v } from "convex/values";
import { authComponent } from "./auth";

export const getUser = query({
  args: { id: v.id("user") },
  handler: async (ctx, args) => {
    return authComponent.getAnyUserById(ctx, args.id);
  },
});
```



================================================
FILE: docs/content/docs/api/convex-plugin.mdx
================================================
---
title: Convex Plugin
description: Configuration options for the Convex Better Auth plugin
---

The Convex plugin integrates Better Auth with Convex by managing JWT generation,
cookie handling, and JWKS endpoints for token validation.

## Server Plugin

The server plugin is required for Convex + Better Auth integration. Add it to
your Better Auth plugins array.

```ts
import { convex } from "@convex-dev/better-auth/plugins";
import authConfig from "./auth.config";

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    // ...other options
    plugins: [
      convex({
        authConfig,
      }),
    ],
  });
};
```

### Options

#### `authConfig` (required)

The Convex auth config from your project, typically exported from
`convex/auth.config.ts`.

```ts
import { type AuthConfig } from "convex/server";
import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";

export default {
  providers: [getAuthConfigProvider()],
} satisfies AuthConfig;
```

#### `jwt`

Optional JWT configuration options.

| Property            | Type       | Default            | Description                           |
| ------------------- | ---------- | ------------------ | ------------------------------------- |
| `expirationSeconds` | `number`   | `900` (15 minutes) | JWT token expiration in seconds       |
| `definePayload`     | `function` | See below          | Custom function to define JWT payload |

The default `definePayload` function includes all user fields except `id` and
`image`, plus the session ID and issued-at timestamp:

```ts
definePayload: ({ user, session }) => ({
  ...omit(user, ["id", "image"]),
  sessionId: session.id,
  iat: Math.floor(new Date().getTime() / 1000),
});
```

**Example: Custom payload**

```ts
convex({
  authConfig,
  jwt: {
    expirationSeconds: 60 * 30, // 30 minutes
    definePayload: ({ user, session }) => ({
      name: user.name,
      email: user.email,
      role: user.role,
      sessionId: session.id,
    }),
  },
});
```

<Callout>
  The `sessionId` and `iat` (issued-at) fields are always added automatically to
  the JWT payload.
</Callout>

#### `jwks`

Optional static JWKS string for performance optimization. When provided, the
plugin uses the static JWKS instead of fetching from the database, eliminating
network requests during token validation.

See [Static JWKS](/docs/experimental#static-jwks) for setup instructions.

```ts
convex({
  authConfig,
  jwks: process.env.JWKS,
});
```

#### `options`

Optional Better Auth options, primarily used to pass the `basePath` when using a
non-default path.

```ts
convex({
  authConfig,
  options: {
    basePath: "/custom/auth/path",
  },
});
```

<Callout type="warn">
  If your Better Auth configuration uses a custom `basePath`, you must pass the
  same value in `options.basePath` for the JWKS endpoint to be configured
  correctly.
</Callout>

## Client Plugin

The client plugin provides type inference for the Better Auth client. It has no
configuration options.

```ts
import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/plugins";

export const authClient = createAuthClient({
  plugins: [convexClient()],
});
```



================================================
FILE: docs/content/docs/api/meta.json
================================================
{
  "title": "API",
  "pages": ["component-client", "convex-plugin", "type-utilities"],
  "defaultOpen": true
}



================================================
FILE: docs/content/docs/api/type-utilities.mdx
================================================
---
title: Type Utilities
description: Type utilities for Better Auth
---

## `requireRunMutationCtx()`

A type guard to ensure a given context object has a `runMutation` property.
Requires a
[mutation context](https://docs.convex.dev/functions/mutation-functions#mutation-context)
or [action context](https://docs.convex.dev/functions/actions#action-context).
Will error if a
[query context](https://docs.convex.dev/functions/query-functions#query-context)
is provided.

## `requireActionCtx()`

A type guard to ensure the ctx is an action ctx. Will error if the provided ctx
is not an action ctx.

## Example usage

```ts
import { requireActionCtx } from "@convex-dev/better-auth/utils";
import { type GenericCtx } from "@convex-dev/better-auth";
import { Resend } from "@convex-dev/resend";
import { components } from "./_generated/api";
import { type DataModel } from "./_generated/dataModel";

export const resend = new Resend(components.resend);

export const createAuthOptions = (ctx: GenericCtx<DataModel>) => ({
  baseURL: siteUrl,
  sendVerificationEmail: async ({ user, url }) => {
    // This function only requires a `runMutation` property on the ctx object,
    // but we'll make sure we have an action ctx because we know a network
    // request is being made, which requires an action ctx.
    await resend.sendEmail(requireActionCtx(ctx), {
      to: user.email,
      subject: "Verify your email",
      html: `<p>Click <a href="${url}">here</a> to verify your email</p>`,
    });
  },
});
```



================================================
FILE: docs/content/docs/basic-usage/authorization.mdx
================================================
---
title: Authorization
description: Authorization with Better Auth
---

### Showing UI based on authentication state

You can control which UI is shown when the user is signed in or signed out using
Convex's `<Authenticated>`, `<Unauthenticated>` and `<AuthLoading>` helper
components. These components are powered by Convex's `useConvexAuth()` hook,
which provides `isAuthenticated` and `isLoading` flags. This hook can be used
directly if preferred.

It's important to use Convex's authentication state components or the
`useConvexAuth()` hook instead of Better Auth's `getSession()` or `useSession()`
when you need to check whether the user is logged in or not. Better Auth will
reflect an authenticated user before Convex does, as the Convex client must
subsequently validate the token provided by Better Auth. Convex functions that
require authentication can throw if called before Convex has validated the
token.

In the following example, the `<Content />` component is a child of
`<Authenticated>`, so its content and any of its child components are guaranteed
to have an authenticated user, and Convex queries can require authentication.

```tsx title="src/App.tsx"
import {
  Authenticated,
  Unauthenticated,
  AuthLoading,
  useQuery,
} from "convex/react";
import { api } from "../convex/_generated/api";

function App() {
  return (
    <main>
      <Unauthenticated>Logged out</Unauthenticated>
      <Authenticated>Logged in</Authenticated>
      <AuthLoading>Loading...</AuthLoading>
    </main>
  );
}

const Content = () => {
  const messages = useQuery(api.messages.getForCurrentUser);
  return <div>Authenticated content: {messages?.length}</div>;
};

export default App;
```

### Authentication state in Convex functions

If the client is authenticated, you can access the information stored in the JWT
via `ctx.auth.getUserIdentity`.

If the client is **not** authenticated, `ctx.auth.getUserIdentity` will return
null.

Make sure that the component calling this query is a child of `<Authenticated>`
from `convex/react`, or that `isAuthenticated` from `useConvexAuth()` is `true`.
Otherwise, it will throw on page load.

```ts title="convex/messages.ts"
import { query } from "./_generated/server";

// You can get the current user from the auth component with session validation.
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return await authComponent.getAuthUser(ctx);
  },
});

// You can also just get the authenticated user id as you
// normally would from ctx.auth.getUserIdentity. Note that
// this does not validate the session.
export const getForCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }
    return await ctx.db
      .query("messages")
      .filter((q) => q.eq(q.field("author"), identity.email))
      .collect();
  },
});
```



================================================
FILE: docs/content/docs/basic-usage/index.mdx
================================================
---
title: Basic Usage
description: Using Better Auth with Convex
---

## Better Auth guide

Better Auth's [basic usage guide](https://www.better-auth.com/docs/basic-usage)
applies to Convex as well. It covers signing in and out, social providers,
plugins, and more. You will be using Better Auth directly in your project, so
their guides are a primary reference.

### Exceptions

There are a few areas in the Better Auth basic usage guide that work differently
in Convex.

- #### Server side authentication

  Better Auth supports signing users in and out through server side functions.
  Because Convex functions run over websockets and don't return HTTP responses
  or set cookies, signing up/in/out must be done from the client via
  `authClient.signIn.*` methods.

- #### Schemas and migrations

  The basic usage guide includes information on database schema generation and
  migrations via the Better Auth CLI. This only applies for
  [local installs](/local-install), which support generating schemas. For
  projects not using local install, the default schema provided with the Better
  Auth component (preconfigured with the
  [supported plugins](/supported-plugins)) is used, and cannot be altered.

## Using server methods with `auth.api`

Better Auth's server side `auth.api` methods can be used with your `createAuth`
function and the component `headers` method. Here's an example implementing the
[`changePassword` server method](https://www.better-auth.com/docs/concepts/users-accounts#api-method-change-password).

```ts
export const updateUserPassword = mutation({
  args: {
    currentPassword: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    // Many Better Auth server methods require a currently authenticated
    // user, so request headers have to be passed in so session cookies
    // can be parsed and validated. The `getAuth` method provides both the
    // auth object and headers for convenience.
    const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
    await auth.api.changePassword({
      body: {
        currentPassword: args.currentPassword,
        newPassword: args.newPassword,
      },
      headers,
    });
  },
});
```

## Using Convex ctx in Better Auth config

The `ctx` param passed in to the `createAuth` function is the Convex context
object. This can be used to access the Convex database or Convex functions in
your Better Auth config. It can be a
[query](https://docs.convex.dev/functions/query-functions#query-context),
[mutation](https://docs.convex.dev/functions/mutation-functions#mutation-context),
or [action](https://docs.convex.dev/functions/actions#action-context) context.

A common use case is sending emails for verification or password resets with the
[Resend component](https://www.convex.dev/components/resend). `resend.sendEmail`
will produce a type error because the ctx object could be a query ctx. The
component provides type guards for this.

```ts
import { requireActionCtx } from "@convex-dev/better-auth/utils";
import { type GenericCtx } from "@convex-dev/better-auth";
import { Resend } from "@convex-dev/resend";
import { components } from "./_generated/api";
import { type DataModel } from "./_generated/dataModel";

export const resend = new Resend(components.resend);

export const createAuthOptions = (ctx: GenericCtx<DataModel>) => ({
  baseURL: siteUrl,
  sendVerificationEmail: async ({ user, url }) => {
    // This function only requires a `runMutation` property on the ctx object,
    // but we'll make sure we have an action ctx because we know a network
    // request is being made, which requires an action ctx.
    await resend.sendEmail(requireActionCtx(ctx), {
      to: user.email,
      subject: "Verify your email",
      html: `<p>Click <a href="${url}">here</a> to verify your email</p>`,
    });
  },
});
```



================================================
FILE: docs/content/docs/basic-usage/meta.json
================================================
{
  "title": "Basic Usage",
  "pages": ["authorization"],
  "defaultOpen": true
}



================================================
FILE: docs/content/docs/features/local-install.mdx
================================================
---
title: Local Install
description: Own your auth.
---

Local install gives you full control over your Better Auth schema, allows schema
related configuration to work, and makes it possible to use plugins beyond those
[supported](/supported-plugins) for Convex + Better Auth. It also allows you to
write Convex functions that directly access Better Auth component tables.

With this approach, the Better Auth plugin is defined in it's own Convex
subdirectory. Installation is a bit different from the default approach, and
includes a schema generation step via Better Auth CLI, similar to the
installation experience with other providers.

## Installation

<Callout>
  Before you begin, follow the [Getting Started](/) guide to set up Convex +
  Better Auth for your project. Then return here to walk through converting the
  default install to a local install.
</Callout>

<div className="fd-steps">
  <div className="fd-step">

    ### Create the component definition

Create a `convex/betterAuth/convex.config.ts` file to define the component. This
will signal to Convex that the `convex/betterAuth` directory is a locally
installed component.

    ```ts title="convex/betterAuth/convex.config.ts"
    import { defineComponent } from "convex/server";

    const component = defineComponent("betterAuth");

    export default component;
    ```

  </div>

  <div className="fd-step">
    ### Generate the schema

    Add a static `auth` export to the `convex/betterAuth/auth.ts` file.

    <Callout>
      This file should _only_ have your `auth` export for schema generation, and no
      other code. If this file is imported at runtime it will trigger errors due to
      missing environment variables.
    </Callout>

    ```ts title="convex/betterAuth/auth.ts"
    import { createAuth } from '../auth'

    // Export a static instance for Better Auth schema generation
    export const auth = createAuth({} as any)

    ```

    Generate the schema for the component.

    ```bash
    cd convex/betterAuth
    npx @better-auth/cli generate -y
    ```

  </div>

  <div className="fd-step">
    ### Split out `createAuthOptions` function

    Code in your component directory needs access to your Better Auth options,
    but running `createAuth()` inside of your component directory will trigger
    errors from Better Auth due to lack of environment variable access.

    To avoid this, you'll want to have a separate `createAuthOptions` function
    that just returns the typed options object.

    ```ts title="convex/auth.ts"
    import {
      betterAuth,
      type BetterAuthOptions, // [!code ++]
    } from "better-auth/minimal";

    // [!code ++:5]
    export const createAuthOptions = (ctx: GenericCtx<DataModel>) => {
      return {
        // ... auth config
      } satisfies BetterAuthOptions;
    };

    export const createAuth = (ctx: GenericCtx<DataModel>) => {
      // [!code --:3]
      return betterAuth({
        // ... auth config
      });
      return betterAuth(createAuthOptions(ctx)); // [!code ++]
    };
    ```

  </div>

  <div className="fd-step">

    ### Export adapter functions

    Export adapter functions for the component.

    ```ts title="convex/betterAuth/adapter.ts"
    import { createApi } from "@convex-dev/better-auth";
    import schema from "./schema";
    import { createAuthOptions } from "../auth";

    export const {
      create,
      findOne,
      findMany,
      updateOne,
      updateMany,
      deleteOne,
      deleteMany,
    } = createApi(schema, createAuthOptions);
    ```

  </div>

  <div className="fd-step">

    ### Update component registration

    Update component registration to use the locally installed component.

    ```ts title="convex/convex.config.ts"
    import { defineApp } from "convex/server";
    import betterAuth from "@convex-dev/better-auth/convex.config"; // [!code --]
    import betterAuth from "./betterAuth/convex.config"; // [!code ++]

    const app = defineApp();
    app.use(betterAuth);

    export default app;
    ```

  </div>

  <div className="fd-step">
    ### Update component config

    Update the component client config to use the local schema.

    ```ts title="convex/auth.ts"
    import authSchema from "./betterAuth/schema"; // [!code ++]

    // ...

    export const authComponent = createClient<DataModel>(components.betterAuth); // [!code --]
    export const authComponent = createClient<DataModel, typeof authSchema>( // [!code ++]
      components.betterAuth,
      // [!code ++:5]
      {
        local: {
          schema: authSchema,
        },
      }
    );

    // ...
    ```

  </div>

  <div className="fd-step">
    ### You're done!

    The Better Auth component and schema are now locally defined in your Convex project.

  </div>

</div>

## Usage

### Updating the schema

Certain options changes may require schema generation. The Better Auth docs will
often note when this is the case. To regenerate the schema at any time (as it's
generally safe to do), move into the component directory and run the Better Auth
CLI generate command.

```bash
cd convex/betterAuth
npx @better-auth/cli generate -y
```

### Adding custom indexes

Some database interactions through Better Auth may run queries that don't use an
index. The Better Auth component automatically selects a suitable index for a
given query if one exists, and will log a warning indicating what index should
be added.

Custom indexes can be added by generating the schema to a secondary file,
importing it `convex/betterAuth/schema.ts` and adding the indexes. This way
custom indexes aren't overwritten when the schema is regenerated.

<Callout>
  Schema table names and fields should not be customized directly, as any
  customizations won't match your Better Auth configuration, and will be
  overwritten when the schema is regenerated. Instead, Better Auth schema can be
  [customized through
  options](https://www.better-auth.com/docs/concepts/database#core-schema).
</Callout>

<div className="fd-steps">
  <div className="fd-step">

    #### Generate the schema

    Generate the schema to a secondary file.

    ```bash
    cd convex/betterAuth
    npx @better-auth/cli generate -y --output generatedSchema.ts
    ```

  </div>

  <div className="fd-step">
    #### Update the final schema

    Delete the contents of `schema.ts` and replace with table definitions from the
    generated schema.

    ```ts title="convex/betterAuth/schema.ts"
    import { defineSchema } from "convex/server";
    import { tables } from "./generatedSchema";

    const schema = defineSchema({
      ...tables,
      // Spread the generated schema and add a custom index
      user: tables.user.index("custom_index", ["field1", "field2"]),
    });

    export default schema;
    ```

  </div>
</div>

### Accessing component data

Convex functions within your Better Auth component directory can access the
component's tables directly, and can then be run from outside the component via
`ctx.runQuery`, `ctx.runMutation`, or `ctx.runAction`.

Note that if an internal function is defined in a component, it will not be
accessible from outside the component, so functions that need to run outside the
component cannot be internal. While normally public functions are exposed to the
internet, **Convex functions exported by a component are never exposed to the
internet, even if they are public**.

<Callout title="Return validators">
  If a function in a component is called from outside the component, the return
  type won't be inferred unless a return validator is provided.
</Callout>

```ts title="convex/betterAuth/someFile.ts"
import { query, mutation } from "./_generated/server";
import { doc } from "convex-helpers/validators";
import schema from "./schema";
import { v } from "convex/values";

// This is accessible from outside the component
export const someFunction = query({
  args: { sessionId: v.id("session") },
  // Add a return validator so the return value is typed when
  // called from outside the component.
  returns: v.union(v.null(), doc(schema, "session")),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.sessionId);
  },
});

// This is not accessible from outside the component.
export const someInternalFunction = internalQuery({
  args: { sessionId: v.id("session") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.sessionId);
  },
});
```

These functions can now be called from a parent component (or app).

```ts title="convex/someFile.ts"
import { query } from "./_generated/server";
import { components } from "./_generated/api";
import { v } from "convex/values";

export const someFunction = query({
  args: { sessionId: v.id("session") },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.betterAuth.someFile.someFunction, {
      sessionId: args.sessionId,
    });
  },
});
```



================================================
FILE: docs/content/docs/features/meta.json
================================================
{
  "title": "Features",
  "pages": ["local-install", "triggers"],
  "defaultOpen": true
}



================================================
FILE: docs/content/docs/features/triggers.mdx
================================================
---
title: Triggers
description: Run transactional callbacks when auth data changes
---

Triggers are a Convex-first approach to running mutations when your Better Auth
data changes. Better Auth already supports this behavior for some tables through
`databaseHooks` configuration, but database hooks cannot currently run in the
same transaction as the original operation.

Triggers run in the same transaction as the original operation, and work on any
table in your Better Auth schema.

## Configuration

To enable triggers, pass the `triggers` option to the component client config. A
trigger config object has table names as keys, and each table name can be
assigned an object with any of `onCreate`, `onUpdate`, or `onDelete` hooks.
Throwing an error in a trigger will stop the original operation from committing.

<Callout>
  A single Better Auth endpoint or `auth.api` call can perform multiple database
  interactions. Throwing an error in a trigger will only ensure the database
  operation that triggered will fail, but any previous operations will still
  commit.
</Callout>

```ts title="convex/auth.ts"
import { DataModel } from "./_generated/dataModel";
import { components } from "./_generated/api"; // [!code --]
import { components, internal } from "./_generated/api"; // [!code ++]
import { createClient } from "@convex-dev/better-auth"; // [!code --]
import { createClient, type AuthFunctions } from "@convex-dev/better-auth"; // [!code ++]

const authFunctions: AuthFunctions = internal.auth; // [!code ++]

export const authComponent = createClient<DataModel>(components.betterAuth); // [!code --]
// [!code ++:20]
export const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: {
    user: {
      onCreate: async (ctx, doc) => {
        await ctx.db.insert("posts", {
          title: "Hello, world!",
          authId: doc._id,
        });
      },
      onUpdate: async (ctx, newDoc, oldDoc) => {
        // Both old and new documents are available so you can compare and detect
        // changes - you can ignore oldDoc if you don't need it.
      },
      onDelete: async (ctx, doc) => {
        // The entire deleted document is available
      },
    },
  },
});

export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi(); // [!code ++]
```



================================================
FILE: docs/content/docs/framework-guides/expo.mdx
================================================
---
title: Expo (React Native)
description: Install and configure Convex + Better Auth for Expo.
---

## Installation

<div className="fd-steps">

  <div className="fd-step">
    ### Install packages

    Install the component, a pinned version of Better Auth, and ensure the latest version
    of Convex.

    <Callout>This component requires Convex `1.25.0` or later.</Callout>

    ```npm
    npm install convex@latest @convex-dev/better-auth
    npm install better-auth@1.4.9 @better-auth/expo@1.4.9 --save-exact
    ```

  </div>

  <div className="fd-step">

    ### Install additional Expo dependencies

    `expo-secure-store` is used for secure cookie storage.

    ```npm
    npx expo install expo-secure-store
    ```

  </div>

  <div className="fd-step">
    ### Register the component

    Register the Better Auth component in your Convex project.

    ```ts title="convex/convex.config.ts"
    import { defineApp } from "convex/server";
    import betterAuth from "@convex-dev/better-auth/convex.config";

    const app = defineApp();
    app.use(betterAuth);

    export default app;
    ```

  </div>

  <div className="fd-step">
    ### Add Convex auth config

    Add a `convex/auth.config.ts` file to configure Better Auth as an authentication provider.

    ```ts title="convex/auth.config.ts"
    import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";
    import type { AuthConfig } from "convex/server";

    export default {
      providers: [getAuthConfigProvider()],
    } satisfies AuthConfig;
    ```

  </div>

  <div className="fd-step">
    ### Set environment variables

    Generate a secret for encryption and generating hashes. Use the command below if you have openssl installed, or use the button to generate a random value instead. Or generate your own however you like.

    ```shell
    npx convex env set BETTER_AUTH_SECRET=$(openssl rand -base64 32)
    ```

    Add environment variables to the `.env.local` file created by `npx convex dev`. It will be picked up by your framework dev server.

    ```shell title=".env.local" tab="Cloud"
    # Deployment used by \`npx convex dev\`
    CONVEX_DEPLOYMENT=dev:adjective-animal-123 # team: team-name, project: project-name

    EXPO_PUBLIC_CONVEX_URL=https://adjective-animal-123.convex.cloud

    # Same as EXPO_PUBLIC_CONVEX_URL but ends in .site // [!code ++]
    EXPO_PUBLIC_CONVEX_SITE_URL=https://adjective-animal-123.convex.site # [!code ++]
    ```

    ```shell title=".env.local" tab="Self hosted"
    # Deployment used by \`npx convex dev\`
    CONVEX_DEPLOYMENT=dev:adjective-animal-123 # team: team-name, project: project-name

    EXPO_PUBLIC_CONVEX_URL=http://127.0.0.1:3210

    # Will generally be one number higher than EXPO_PUBLIC_CONVEX_URL,
    # so if your convex url is :3212, your site url will be :3213
    EXPO_PUBLIC_CONVEX_SITE_URL=http://127.0.0.1:3211 # [!code ++]
    ```

  </div>

  <div className="fd-step">
    ### Create a Better Auth instance

    Create a Better Auth instance and initialize the component.

    <Callout>Some Typescript errors will show until you save the file.</Callout>

    ```ts title="convex/auth.ts"
    import { createClient, type GenericCtx } from "@convex-dev/better-auth";
    import { convex } from "@convex-dev/better-auth/plugins";
    import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
    import { expo } from '@better-auth/expo'
    import { components } from "./_generated/api";
    import { DataModel } from "./_generated/dataModel";
    import { query } from "./_generated/server";
    import authConfig from "./auth.config";

    // The component client has methods needed for integrating Convex with Better Auth,
    // as well as helper methods for general use.
    export const authComponent = createClient<DataModel>(components.betterAuth);

    export const createAuth = (ctx: GenericCtx<DataModel>) => {
      return betterAuth({
        trustedOrigins: ["your-scheme://"],
        database: authComponent.adapter(ctx),
        // Configure simple, non-verified email/password to get started
        emailAndPassword: {
          enabled: true,
          requireEmailVerification: false,
        },
        plugins: [
          // The Expo and Convex plugins are required
          expo(),
          convex({ authConfig }),
        ],
      })
    }
    // Example function for getting the current user
    // Feel free to edit, omit, etc.
    export const getCurrentUser = query({
      args: {},
      handler: async (ctx) => {
        return authComponent.getAuthUser(ctx);
      },
    });
    ```

  </div>

  <div className="fd-step">
    ### Create a Better Auth client instance

    Create a Better Auth client instance for interacting with the Better Auth server from your client.

    ```ts title="src/lib/auth-client.ts"
    import { createAuthClient } from "better-auth/react";
    import { convexClient } from "@convex-dev/better-auth/client/plugins";
    import { expoClient } from '@better-auth/expo/client'
    import Constants from 'expo-constants'
    import * as SecureStore from 'expo-secure-store'

    export const authClient = createAuthClient({
      baseURL: process.env.EXPO_PUBLIC_CONVEX_SITE_URL,
      plugins: [
        expoClient({
          scheme: Constants.expoConfig?.scheme as string,
          storagePrefix: Constants.expoConfig?.scheme as string,
          storage: SecureStore,
        }),
        convexClient(),
      ],
    });
    ```

  </div>

  <div className="fd-step">
    ### Mount handlers

    Register Better Auth route handlers on your Convex deployment.

    ```ts title="convex/http.ts"
    import { httpRouter } from "convex/server";
    import { authComponent, createAuth } from "./auth";

    const http = httpRouter();

    authComponent.registerRoutes(http, createAuth);

    export default http;
    ```

  </div>

  <div className="fd-step">
    ### Set up Convex client provider

    Wrap your app with the `ConvexBetterAuthProvider` component.

    ```ts title="app/_layout.tsx"
    import { StrictMode } from "react";
    import { Slot } from "expo-router";
    import {
      ConvexReactClient,
      ConvexProvider, // [!code --]
    } from "convex/react";
    import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react"; // [!code ++]
    import { authClient } from "@/lib/auth-client"; // [!code ++]

    const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL as string, {
      // Optionally pause queries until the user is authenticated // [!code ++]
      expectAuth: true, // [!code ++]
      unsavedChangesWarning: false, // [!code ++]
    });

    export default function MyLayout() {
      return (
        <StrictMode>
          <ConvexProvider client={convex}> // [!code --]
          <ConvexBetterAuthProvider client={convex} authClient={authClient}> // [!code ++]
            <Slot />
          </ConvexBetterAuthProvider> // [!code ++]
          </ConvexProvider> // [!code --]
        </StrictMode>
      )
    }
    ```

  </div>

  <div className="fd-step">
    ### Follow steps from the Better Auth Expo guide

    The Expo integration for Better Auth requires a few involved steps that could change over time.
    Follow steps 3, 6, and 7 of their [Expo integration guide](https://www.better-auth.com/docs/integrations/expo).

  </div>

</div>

### You're done!

You're now ready to start using Better Auth with Convex.

## Usage

Check out the [Basic Usage](/basic-usage) guide for more information on general
usage. Below are usage notes specific to Expo.

### Social sign-in

Social sign-in for Expo works the same as with full stack frameworks, but the
authorized origin and redirect URI are based on your Convex site URL instead of
your application domain.

For example, with
[Google sign-in](https://www.better-auth.com/docs/authentication/google), the
authorized origin and redirect URI would look like:

```
// authorized origin
https://adjective-animal-123.convex.site

// authorized redirect URI
https://adjective-animal-123.convex.site/api/auth/callback/google
```

## Expo Web support

To use Expo Web along with Expo/Expo Go, you'll need to follow a few additional
steps.

<div className="fd-steps">

<div className="fd-step">

### Update environment variables

To use Expo Web, follow
[step 4 of the React guide](https://labs.convex.dev/better-auth/framework-guides/react#set-environment-variables)
to add your Expo Web site URL as the `SITE_URL` environment variable.

</div>

<div className="fd-step">

### Update Better Auth instance

Add the site URL and the cross-domain plugin to the Better Auth instance.

```ts title="convex/auth.ts"
import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import {
  convex,
  crossDomain, // [!code ++]
} from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { expo } from "@better-auth/expo";
import { components } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import authConfig from "./auth.config";

// The component client has methods needed for integrating Convex with Better Auth,
// as well as helper methods for general use.
export const authComponent = createClient<DataModel>(components.betterAuth);

const siteUrl = process.env.SITE_URL!; // [!code ++]

export const createAuthOptions = (ctx: GenericCtx<DataModel>) =>
  ({
    trustedOrigins: [siteUrl, "your-scheme://"], // [!code ++]
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    plugins: [
      expo(),
      convex({ authConfig }),
      crossDomain({ siteUrl }), // [!code ++]
    ],
  }) satisfies BetterAuthOptions;
```

</div>

<div className="fd-step">

### Enable CORS

Add `{ cors: true }` to the Better Auth route handlers:

```ts title=convex/http.ts"
import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";

const http = httpRouter();

// CORS handling is required for client side frameworks
authComponent.registerRoutes(http, createAuth, { cors: true }); // [!code ++]

export default http;
```

</div>

<div className="fd-step">

### Update client instance

Finally, add the cross-domain client plugin to the Better Auth client instance.

<Callout>
  Note that the `expoClient` and `crossDomainClient` plugins cannot both be
  included in the client instance at the same time.
</Callout>

```ts title="src/lib/auth-client.ts"
import { expoClient } from "@better-auth/expo/client";
import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export const authClient = createAuthClient({
  baseURL: process.env.EXPO_PUBLIC_CONVEX_SITE_URL,
  plugins: [
    convexClient(),
    ...(Platform.OS === "web"
      ? [crossDomainClient()]
      : [
          expoClient({
            scheme: Constants.expoConfig?.scheme as string,
            storagePrefix: Constants.expoConfig?.scheme as string,
            storage: SecureStore,
          }),
        ]),
  ],
});
```

</div>

</div>



================================================
FILE: docs/content/docs/framework-guides/meta.json
================================================
{
  "title": "Framework Guides",
  "pages": ["react", "expo", "tanstack-start", "next", "sveltekit"],
  "defaultOpen": true
}



================================================
FILE: docs/content/docs/framework-guides/next.mdx
================================================
---
title: Next.js
description: Install and configure Convex + Better Auth for Next.js.
---

<Callout>
  Check out a complete Convex + Better Auth example with Next.js in the [GitHub
  repo](https://github.com/get-convex/better-auth/tree/main/examples/next).
</Callout>

## Installation

<div className="fd-steps">

  <div className="fd-step">
    ### Install packages

    Install the component, a pinned version of Better Auth, and ensure the latest version
    of Convex.

    <Callout>This component requires Convex `1.25.0` or later.</Callout>

    ```npm
    npm install convex@latest @convex-dev/better-auth
    npm install better-auth@1.4.9 --save-exact
    ```

  </div>

  <div className="fd-step">
    ### Register the component

    Register the Better Auth component in your Convex project.

    ```ts title="convex/convex.config.ts"
    import { defineApp } from "convex/server";
    import betterAuth from "@convex-dev/better-auth/convex.config";

    const app = defineApp();
    app.use(betterAuth);

    export default app;
    ```

  </div>

  <div className="fd-step">
    ### Add Convex auth config

    Add a `convex/auth.config.ts` file to configure Better Auth as an authentication provider.

    ```ts title="convex/auth.config.ts"
    import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";
    import type { AuthConfig } from "convex/server";

    export default {
      providers: [getAuthConfigProvider()],
    } satisfies AuthConfig;
    ```

  </div>

  <div className="fd-step">
    ### Set environment variables

    Generate a secret for encryption and generating hashes. Use the command below if you have openssl installed, or generate your own however you like.

    ```shell
    npx convex env set BETTER_AUTH_SECRET=$(openssl rand -base64 32)
    ```

    Add your site URL to your Convex deployment.

    ```shell
    npx convex env set SITE_URL http://localhost:3000
    ```

    Add environment variables to the `.env.local` file created by `npx convex dev`. It will be picked up by your framework dev server.

    ```shell title=".env.local" tab="Cloud"
    # Deployment used by \`npx convex dev\`
    CONVEX_DEPLOYMENT=dev:adjective-animal-123 # team: team-name, project: project-name

    NEXT_PUBLIC_CONVEX_URL=https://adjective-animal-123.convex.cloud

    # Same as NEXT_PUBLIC_CONVEX_URL but ends in .site // [!code ++]
    NEXT_PUBLIC_CONVEX_SITE_URL=https://adjective-animal-123.convex.site # [!code ++]

    # Your local site URL // [!code ++]
    NEXT_PUBLIC_SITE_URL=http://localhost:3000 # [!code ++]
    ```

    ```shell title=".env.local" tab="Self hosted"
    # Deployment used by \`npx convex dev\`
    CONVEX_DEPLOYMENT=dev:adjective-animal-123 # team: team-name, project: project-name

    NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210

    # Will generally be one number higher than NEXT_PUBLIC_CONVEX_URL,
    # so if your convex url is :3212, your site url will be :3213
    NEXT_PUBLIC_CONVEX_SITE_URL=http://127.0.0.1:3211 # [!code ++]

    # Your local site URL // [!code ++]
    NEXT_PUBLIC_SITE_URL=http://localhost:3000 # [!code ++]
    ```

  </div>

  <div className="fd-step">
    ### Create a Better Auth instance

    Create a Better Auth instance and initialize the component.

    <Callout>Some Typescript errors will show until you save the file.</Callout>

    ```ts title="convex/auth.ts"
    import { createClient, type GenericCtx } from "@convex-dev/better-auth";
    import { convex } from "@convex-dev/better-auth/plugins";
    import { components } from "./_generated/api";
    import { DataModel } from "./_generated/dataModel";
    import { query } from "./_generated/server";
    import { betterAuth } from "better-auth/minimal";
    import authConfig from "./auth.config";

    const siteUrl = process.env.SITE_URL!;

    // The component client has methods needed for integrating Convex with Better Auth,
    // as well as helper methods for general use.
    export const authComponent = createClient<DataModel>(components.betterAuth);

    export const createAuth = (ctx: GenericCtx<DataModel>) => {
      return betterAuth({
        baseURL: siteUrl,
        database: authComponent.adapter(ctx),
        // Configure simple, non-verified email/password to get started
        emailAndPassword: {
          enabled: true,
          requireEmailVerification: false,
        },
        plugins: [
          // The Convex plugin is required for Convex compatibility
          convex({ authConfig }),
        ],
      })
    }

    // Example function for getting the current user
    // Feel free to edit, omit, etc.
    export const getCurrentUser = query({
      args: {},
      handler: async (ctx) => {
        return authComponent.getAuthUser(ctx);
      },
    });
    ```

  </div>

  <div className="fd-step">
    ### Create a Better Auth client instance

    Create a Better Auth client instance for interacting with the Better Auth server from your client.

    ```ts title="src/lib/auth-client.ts"
    import { createAuthClient } from "better-auth/react";
    import { convexClient } from "@convex-dev/better-auth/client/plugins";

    export const authClient = createAuthClient({
      plugins: [convexClient()],
    });
    ```

  </div>

  <div className="fd-step">
    ### Configure Next.js server utilities

    Configure a set of helper functions for authenticated SSR, server functions, and route handlers.

    ```ts title="src/lib/auth-server.ts"
    import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";

    export const {
      handler,
      preloadAuthQuery,
      isAuthenticated,
      getToken,
      fetchAuthQuery,
      fetchAuthMutation,
      fetchAuthAction,
    } = convexBetterAuthNextJs({
      convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL!,
      convexSiteUrl: process.env.NEXT_PUBLIC_CONVEX_SITE_URL!,
    });
    ```

  </div>

  <div className="fd-step">
    ### Mount handlers

    Register Better Auth route handlers on your Convex deployment.

    ```ts title="convex/http.ts"
    import { httpRouter } from "convex/server";
    import { authComponent, createAuth } from "./auth";

    const http = httpRouter();

    authComponent.registerRoutes(http, createAuth);

    export default http;
    ```

    Set up route handlers to proxy auth requests from Next.js to your Convex deployment.

    ```ts title="app/api/auth/[...all]/route.ts"
    import { handler } from "@/lib/auth-server";

    export const { GET, POST } = handler;

    ```

  </div>

  <div className="fd-step">
    ### Set up Convex client provider

    Wrap your app with the `ConvexBetterAuthProvider` component. This replaces the `ConvexProvider` component.

    ```ts title="app/ConvexClientProvider.tsx"
    "use client";

    import { ReactNode } from "react";
    import { ConvexReactClient } from "convex/react";
    import { authClient } from "@/lib/auth-client";
    import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";

    const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

    export function ConvexClientProvider({
      children,
      initialToken,
    }: {
      children: ReactNode;
      initialToken?: string | null;
    }) {
      return (
        <ConvexBetterAuthProvider
          client={convex}
          authClient={authClient}
          initialToken={initialToken}
        >
          {children}
        </ConvexBetterAuthProvider>
      );
    }
    ```

  </div>
</div>

### You're done!

You're now ready to start using Better Auth with Convex.

## Usage

Check out the [Basic Usage](/basic-usage) guide for more information on general
usage. Below are usage notes specific to Next.js.

### SSR with server components

Convex queries can be preloaded in server components and rendered in client
components via `preloadAuthQuery` and `usePreloadedAuthQuery`.

Preloading in a server component:

```tsx title="app/(auth)/(dashboard)/page.tsx"
import { preloadAuthQuery } from "@/lib/auth-server";
import { api } from "@/convex/_generated/api";

const Page = async () => {
  const [preloadedUserQuery] = await Promise.all([
    preloadAuthQuery(api.auth.getCurrentUser),
    // Load multiple queries in parallel if needed
  ]);

  return (
    <div>
      <Header preloadedUserQuery={preloadedUserQuery} />
    </div>
  );
};

export default Page;
```

Rendering preloaded data in a client component:

```tsx title="app/(auth)/(dashboard)/header.tsx"
import { usePreloadedAuthQuery } from "@convex-dev/better-auth/nextjs/client";
import { api } from "@/convex/_generated/api";

export const Header = ({
  preloadedUserQuery,
}: {
  preloadedUserQuery: Preloaded<typeof api.auth.getCurrentUser>;
}) => {
  const user = usePreloadedAuthQuery(preloadedUserQuery);
  return (
    <div>
      <h1>{user?.name}</h1>
    </div>
  );
};

export default Header;
```

### Using Better Auth in server code

Better Auth's
[`auth.api` methods](https://www.better-auth.com/docs/concepts/api) would
normally run in your Next.js server code, but with Convex being your backend,
these methods need to run in a Convex function. The Convex function can then be
called from the client via hooks like `useMutation` or in server functions and
other server code using one of the auth-server utilities like
`fetchAuthMutation`. Authentication is handled automatically using session
cookies.

Here's an example using the `changePassword` method. The Better Auth `auth.api`
method is called inside of a Convex mutation, because we know this function
needs write access. For reads a query function can be used.

```ts title="convex/users.ts"
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { createAuth, authComponent } from "./auth";

export const updateUserPassword = mutation({
  args: {
    currentPassword: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
    await auth.api.changePassword({
      body: {
        currentPassword: args.currentPassword,
        newPassword: args.newPassword,
      },
      headers,
    });
  },
});
```

Here we call the mutation from a server action.

```ts title="app/actions.ts"
"use server";

import { fetchAuthMutation } from "@/lib/auth-server";
import { api } from "../convex/_generated/api";

// Authenticated mutation via server function
export async function updatePassword({
  currentPassword,
  newPassword,
}: {
  currentPassword: string;
  newPassword: string;
}) {
  await fetchAuthMutation(api.users.updatePassword, {
    currentPassword,
    newPassword,
  });
}
```



================================================
FILE: docs/content/docs/framework-guides/react.mdx
================================================
---
title: React (Vite SPA)
description: Install and configure Convex + Better Auth for React.
---

<Callout>
  Check out a complete Convex + Better Auth example with React in the [GitHub
  repo](https://github.com/get-convex/better-auth/tree/main/examples/react).
</Callout>

## Installation

<div className="fd-steps">

  <div className="fd-step">
    ### Install packages

    Install the component, a pinned version of Better Auth, and ensure the latest version
    of Convex.

    <Callout>This component requires Convex `1.25.0` or later.</Callout>

    ```npm
    npm install convex@latest @convex-dev/better-auth
    npm install better-auth@1.4.9 --save-exact
    ```

  </div>

  <div className="fd-step">
    ### Register the component

    Register the Better Auth component in your Convex project.

    ```ts title="convex/convex.config.ts"
    import { defineApp } from "convex/server";
    import betterAuth from "@convex-dev/better-auth/convex.config";

    const app = defineApp();
    app.use(betterAuth);

    export default app;
    ```

  </div>

  <div className="fd-step">
    ### Add Convex auth config

    Add a `convex/auth.config.ts` file to configure Better Auth as an authentication provider.

    ```ts title="convex/auth.config.ts"
    import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";
    import type { AuthConfig } from "convex/server";

    export default {
      providers: [getAuthConfigProvider()],
    } satisfies AuthConfig;
    ```

  </div>

  <div className="fd-step">
    ### Set environment variables

    Generate a secret for encryption and generating hashes. Use the command below if you have openssl installed, or use the button to generate a random value instead. Or generate your own however you like.

    ```shell
    npx convex env set BETTER_AUTH_SECRET=$(openssl rand -base64 32)
    ```

    Add your site URL to your Convex deployment.

    ```shell
    npx convex env set SITE_URL http://localhost:5173
    ```

    Add environment variables to the `.env.local` file created by `npx convex dev`. It will be picked up by your framework dev server.

    ```shell title=".env.local" tab="Cloud"
    # Deployment used by \`npx convex dev\`
    CONVEX_DEPLOYMENT=dev:adjective-animal-123 # team: team-name, project: project-name

    VITE_CONVEX_URL=https://adjective-animal-123.convex.cloud

    # Same as VITE_CONVEX_URL but ends in .site // [!code ++]
    VITE_CONVEX_SITE_URL=https://adjective-animal-123.convex.site # [!code ++]

    # Your local site URL // [!code ++]
    VITE_SITE_URL=http://localhost:5173 # [!code ++]
    ```

    ```shell title=".env.local" tab="Self hosted"
    # Deployment used by \`npx convex dev\`
    CONVEX_DEPLOYMENT=dev:adjective-animal-123 # team: team-name, project: project-name

    VITE_CONVEX_URL=http://127.0.0.1:3210

    # Will generally be one number higher than VITE_CONVEX_URL,
    # so if your convex url is :3212, your site url will be :3213
    VITE_CONVEX_SITE_URL=http://127.0.0.1:3211 # [!code ++]

    # Your local site URL // [!code ++]
    VITE_SITE_URL=http://localhost:5173 # [!code ++]
    ```

  </div>

  <div className="fd-step">
    ### Create a Better Auth instance

    Create a Better Auth instance and initialize the component.

    <Callout>Some Typescript errors will show until you save the file.</Callout>

    ```ts title="convex/auth.ts"
    import { createClient, type GenericCtx } from "@convex-dev/better-auth";
    import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
    import { components } from "./_generated/api";
    import { DataModel } from "./_generated/dataModel";
    import { query } from "./_generated/server";
    import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
    import authConfig from "./auth.config";

    const siteUrl = process.env.SITE_URL!;

    // The component client has methods needed for integrating Convex with Better Auth,
    // as well as helper methods for general use.
    export const authComponent = createClient<DataModel>(components.betterAuth);

    export const createAuth = (ctx: GenericCtx<DataModel>) => {
      return betterAuth({
        trustedOrigins: [siteUrl],
        database: authComponent.adapter(ctx),
        // Configure simple, non-verified email/password to get started
        emailAndPassword: {
          enabled: true,
          requireEmailVerification: false,
        },
        plugins: [
          // The cross domain plugin is required for client side frameworks
          crossDomain({ siteUrl }),
          // The Convex plugin is required for Convex compatibility
          convex({ authConfig }),
        ],
      });
    }

    // Example function for getting the current user
    // Feel free to edit, omit, etc.
    export const getCurrentUser = query({
      args: {},
      handler: async (ctx) => {
        return authComponent.getAuthUser(ctx);
      },
    });
    ```

  </div>

  <div className="fd-step">
    ### Create a Better Auth client instance

    Create a Better Auth client instance for interacting with the Better Auth server from your client.

    ```ts title="src/lib/auth-client.ts"
    import { createAuthClient } from "better-auth/react";
    import {
      convexClient,
      crossDomainClient,
    } from "@convex-dev/better-auth/client/plugins";

    export const authClient = createAuthClient({
      baseURL: import.meta.env.VITE_CONVEX_SITE_URL,
      plugins: [convexClient(), crossDomainClient()],
    });
    ```

  </div>

  <div className="fd-step">
    ### Mount handlers

    Register Better Auth route handlers on your Convex deployment.

    ```ts title="convex/http.ts"
    import { httpRouter } from "convex/server";
    import { authComponent, createAuth } from "./auth";

    const http = httpRouter();

    // CORS handling is required for client side frameworks
    authComponent.registerRoutes(http, createAuth, { cors: true });

    export default http;
    ```

  </div>

  <div className="fd-step">
    ### Set up Convex client provider

    Wrap your app with the `ConvexBetterAuthProvider` component.

    ```ts title="src/main.tsx"
    import React from "react";
    import ReactDOM from "react-dom/client";
    import App from "./App";
    import "./index.css";
    import { ConvexReactClient } from "convex/react";
    import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react"; // [!code ++]
    import { authClient } from "@/lib/auth-client"; // [!code ++]

    const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string, {
      // Optionally pause queries until the user is authenticated // [!code ++]
      expectAuth: true, // [!code ++]
    });

    ReactDOM.createRoot(document.getElementById("root")!).render(
      <React.StrictMode>
        <ConvexBetterAuthProvider client={convex} authClient={authClient}> // [!code ++]
          <App />
        </ConvexBetterAuthProvider> // [!code ++]
      </React.StrictMode>
    );
    ```

  </div>
</div>

### You're done!

You're now ready to start using Better Auth with Convex.

## Usage

Check out the [Basic Usage](/basic-usage) guide for more information on general
usage. Below are usage notes specific to React SPAs.

### Social sign-in

Social sign-in for React SPAs works the same as with full stack frameworks, but
the authorized redirect URI is based on your Convex site URL instead of your
application domain.

For example, with
[Google sign-in](https://www.better-auth.com/docs/authentication/google), the
authorized redirect URI would look like:

```
https://adjective-animal-123.convex.site/api/auth/callback/google
```



================================================
FILE: docs/content/docs/framework-guides/sveltekit.mdx
================================================
---
title: SvelteKit
description: Install and configure Convex + Better Auth for SvelteKit.
---

<Callout>
  SvelteKit support is currently community maintained, and relies on the
  [@mmailaender/convex-better-auth-svelte](https://github.com/mmailaender/convex-better-auth-svelte)
  package. A complete working example is provided in the repo, and any issues
  can be reported there as well.
</Callout>

## Prerequisites

You'll first need a project where Convex is already set-up. Ensure that all
steps in prerequisites are completed.

<div className="fd-steps">

<div className="fd-step">

### Install convex

```npm
npm install convex convex-svelte
```

</div>

  <div className="fd-step">
    ### Customize the convex path

    SvelteKit doesn't like referencing code outside of source, so customize the convex functionsDir to be under src/.

    ```json title="convex.json"
    {
      "functions": "src/convex/"
    }
    ```

  </div>

  <div className="fd-step">
    ### Set up a Convex dev deployment

    Next, run `npx convex dev`. This will prompt you to log in with GitHub, create a project, and save your production and deployment URLs.

    It will also create a `src/convex/` folder for you to write your backend API functions in. The dev command will then continue running to sync your functions with your dev deployment in the cloud.

    ```bash
    npx convex dev
    ```

  </div>

  <div className="fd-step">
    ### Add $convex alias

    Add the following to your `svelte.config.js` file:

    ```ts title="svelte.config.js"
    import adapter from '@sveltejs/adapter-auto';
    import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

    /** @type {import('@sveltejs/kit').Config} */
    const config = {
      // Consult https://svelte.dev/docs/kit/integrations
      // for more information about preprocessors
      preprocess: vitePreprocess(),

      kit: {
        // adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
        // If your environment is not supported, or you settled on a specific environment, switch out the adapter.
        // See https://svelte.dev/docs/kit/adapters for more information about adapters.
        adapter: adapter(),
        alias: {
          $convex: './src/convex'
        }
      }
    };

    export default config;
    ```

  </div>
</div>

## Installation

<div className="fd-steps">

  <div className="fd-step">
    ### Install packages

    Install the component, a pinned version of Better Auth, and ensure the latest version
    of Convex.

    <Callout>This component requires Convex `1.25.0` or later.</Callout>

    ```npm
    npm install @convex-dev/better-auth @mmailaender/convex-better-auth-svelte
    npm install better-auth@1.4.9 --save-exact
    ```

  </div>

  <div className="fd-step">
    ### Register the component

    Register the Better Auth component in your Convex project.

    ```ts title="src/convex/convex.config.ts"
    import { defineApp } from "convex/server";
    import betterAuth from "@convex-dev/better-auth/convex.config";

    const app = defineApp();
    app.use(betterAuth);

    export default app;
    ```

  </div>

  <div className="fd-step">
    ### Add Convex auth config

    Add a `src/convex/auth.config.ts` file to configure Better Auth as an authentication provider.

    ```ts title="src/convex/auth.config.ts"
    import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";
    import type { AuthConfig } from "convex/server";

    export default {
      providers: [getAuthConfigProvider()],
    } satisfies AuthConfig;
    ```

  </div>

  <div className="fd-step">
    ### Set environment variables

    Generate a secret for encryption and generating hashes. Use the command below if you have openssl installed, or generate your own however you like.

    ```shell
    npx convex env set BETTER_AUTH_SECRET=$(openssl rand -base64 32)
    ```

    Add your site URL to your Convex deployment.

    ```shell
    npx convex env set SITE_URL http://localhost:5173
    ```

    Add environment variables to the `.env.local` file created by `npx convex dev`. It will be picked up by your framework dev server.

    ```shell title=".env.local" tab="Cloud"
    # Deployment used by \`npx convex dev\`
    CONVEX_DEPLOYMENT=dev:adjective-animal-123 # team: team-name, project: project-name

    PUBLIC_CONVEX_URL=https://adjective-animal-123.convex.cloud

    # Same as PUBLIC_CONVEX_URL but ends in .site // [!code ++]
    PUBLIC_CONVEX_SITE_URL=https://adjective-animal-123.convex.site # [!code ++]

    # Your local site URL // [!code ++]
    PUBLIC_SITE_URL=http://localhost:5173 # [!code ++]
    ```

    ```shell title=".env.local" tab="Self hosted"
    # Deployment used by \`npx convex dev\`
    CONVEX_DEPLOYMENT=dev:adjective-animal-123 # team: team-name, project: project-name

    PUBLIC_CONVEX_URL=http://127.0.0.1:3210

    # Will generally be one number higher than PUBLIC_CONVEX_URL,
    # so if your convex url is :3212, your site url will be :3213
    PUBLIC_CONVEX_SITE_URL=http://127.0.0.1:3211 # [!code ++]

    # Your local site URL // [!code ++]
    PUBLIC_SITE_URL=http://localhost:5173 # [!code ++]
    ```

  </div>

  <div className="fd-step">
    ### Create a Better Auth instance

    Create a Better Auth instance and initialize the component.

    <Callout>Some Typescript errors will show until you save the file.</Callout>

    ```ts title="src/convex/auth.ts"
    import { createClient, type GenericCtx } from "@convex-dev/better-auth";
    import { convex } from "@convex-dev/better-auth/plugins";
    import { components } from "./_generated/api";
    import { type DataModel } from "./_generated/dataModel";
    import { query } from "./_generated/server";
    import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
    import authConfig from "./auth.config";

    const siteUrl = process.env.SITE_URL!;

    // The component client has methods needed for integrating Convex with Better Auth,
    // as well as helper methods for general use.
    export const authComponent = createClient<DataModel>(components.betterAuth);

    export const createAuth = (ctx: GenericCtx<DataModel>) => {
      return betterAuth({
        baseURL: siteUrl,
        database: authComponent.adapter(ctx),
        // Configure simple, non-verified email/password to get started
        emailAndPassword: {
          enabled: true,
          requireEmailVerification: false,
        },
        plugins: [
          // The Convex plugin is required for Convex compatibility
          convex({ authConfig }),
        ],
      })
    }

    // Example function for getting the current user
    // Feel free to edit, omit, etc.
    export const getCurrentUser = query({
      args: {},
      handler: async (ctx) => {
        return authComponent.getAuthUser(ctx);
      },
    });
    ```

  </div>

  <div className="fd-step">
    ### Create a Better Auth client instance

    Create a Better Auth client instance for interacting with the Better Auth server from your client.

    ```ts title="src/lib/auth-client.ts"
    import { createAuthClient } from 'better-auth/svelte';
    import { convexClient } from "@convex-dev/better-auth/client/plugins";

    export const authClient = createAuthClient({
      plugins: [convexClient()],
    });
    ```

  </div>

  <div className="fd-step">
    ### Mount handlers

    Register Better Auth route handlers on your Convex deployment.

    ```ts title="src/convex/http.ts"
    import { httpRouter } from "convex/server";
    import { authComponent, createAuth } from "./auth";

    const http = httpRouter();

    authComponent.registerRoutes(http, createAuth);

    export default http;
    ```

    Set up route handlers to proxy auth requests from your framework server to your Convex deployment.

    ```ts title="src/routes/api/auth/[...all]/+server.ts"
    import { createSvelteKitHandler } from '@mmailaender/convex-better-auth-svelte/sveltekit';

    export const { GET, POST } = createSvelteKitHandler();
    ```

  </div>

  <div className="fd-step">
    ### Set up Convex client provider

    Initialize the Convex client with auth in your app.
    Note: `createSvelteAuthClient` includes already `setupConvex()` from convex-svelte.

    ```ts title="src/routes/+layout.svelte"
    <script lang="ts">
      import '../app.css';
      import favicon from '$lib/assets/favicon.svg';
      import { createSvelteAuthClient } from '@mmailaender/convex-better-auth-svelte/svelte'; // [!code ++]
      import { authClient } from '$lib/auth-client'; // [!code ++]

      createSvelteAuthClient({ authClient }); // [!code ++]

      let { children } = $props();
    </script>

    <svelte:head>
      <link rel="icon" href={favicon} />
    </svelte:head>

    {@render children?.()}
    ```

  </div>

  <div className="fd-step">
    ### Set up authentication token for server-side code

    To use Better Auth in server load functions, form actions, and other server-side code, you need to extract the authentication token from cookies and make it available throughout your server code.

    Set up a SvelteKit hook to automatically extract the auth token on every request. This uses the `getToken` helper which reads the authentication cookie and validates it.

    ```ts title="src/hooks.server.ts"
    import type { Handle } from "@sveltejs/kit";
    import { createAuth } from "$convex/auth.js";
    import { getToken } from '@mmailaender/convex-better-auth-svelte/sveltekit';

    export const handle: Handle = async ({ event, resolve }) => {
      event.locals.token = await getToken(createAuth, event.cookies);

      return resolve(event);
    };
    ```

    Add the token type to your app's type definitions. This enables TypeScript support for `event.locals.token` in your server code.

    ```ts title="src/app.d.ts"
    declare global {
      namespace App {
        interface Locals {
          token: string | undefined; // [!code ++]
        }
      }
    }
    ```

    With this setup, `event.locals.token` is now available in all server load functions (`+page.server.ts`, `+layout.server.ts`) and form actions. This token can be passed to `createConvexHttpClient` to make authenticated requests to your Convex functions. See [Using Better Auth from the server](#using-better-auth-from-the-server) for examples.

  </div>
</div>

### You're done!

You're now ready to start using Better Auth with Convex.

## Usage

Check out the [Basic Usage](/basic-usage) guide for more information on general
usage. Below are usage notes specific to SvelteKit.

### Using Better Auth from the client

```svelte title="src/routes/+page.svelte"
<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { api } from '$convex/_generated/api';
	import { useQuery } from 'convex-svelte';
	import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';

	let { data } = $props();

	// Auth state store
	const auth = useAuth();
	const isLoading = $derived(auth.isLoading);
	const isAuthenticated = $derived(auth.isAuthenticated);

	const currentUserResponse = useQuery(api.auth.getCurrentUser, () => (isAuthenticated ? {} : 'skip'));
	let user = $derived(currentUserResponse.data);

	// Sign in/up form state
	let showSignIn = $state(true);
	let name = $state('');
	let email = $state('');
	let password = $state('');

	// Handle form submission
	async function handlePasswordSubmit(event: Event) {
		event.preventDefault();

		try {
			if (showSignIn) {
				await authClient.signIn.email(
					{ email, password },
					{
						onError: (ctx) => {
							alert(ctx.error.message);
						}
					}
				);
			} else {
				await authClient.signUp.email(
					{ name, email, password },
					{
						onError: (ctx) => {
							alert(ctx.error.message);
						}
					}
				);
			}
		} catch (error) {
			console.error('Authentication error:', error);
		}
	}

	// Sign out function
	async function signOut() {

		const result = await authClient.signOut();
		if(result.error) {
			console.error('Sign out error:', result.error);
		}
	}

	// Toggle between sign in and sign up
	function toggleSignMode() {
		showSignIn = !showSignIn;
		// Clear form fields when toggling
		name = '';
		email = '';
		password = '';
	}

	// Demo: Fetch access token
	let accessToken = $state<string | null>(null);
	let tokenLoading = $state(false);

	async function fetchToken() {
		tokenLoading = true;
		try {
			const token = await auth.fetchAccessToken({ forceRefreshToken: true });
			accessToken = token;
		} catch (error) {
			console.error('Error fetching access token:', error);
			accessToken = 'Error fetching token';
		} finally {
			tokenLoading = false;
		}
	}
</script>

<div class="flex h-screen flex-col items-center justify-center bg-gray-50">
	{#if isLoading}
		<div class="text-lg text-gray-600">Loading...</div>
	{:else if !isAuthenticated}
		<!-- Sign In Component -->
		<div class="flex w-full max-w-md flex-col gap-4 rounded-lg bg-white p-6 shadow-md">
			<h2 class="mb-6 text-center text-2xl font-bold text-gray-800">
				{showSignIn ? 'Sign In' : 'Sign Up'}
			</h2>

			<form onsubmit={handlePasswordSubmit} class="flex flex-col gap-4">
				{#if !showSignIn}
					<input
						bind:value={name}
						placeholder="Name"
						required
						class="rounded-md border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
					/>
				{/if}
				<input
					type="email"
					bind:value={email}
					placeholder="Email"
					required
					class="rounded-md border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
				/>
				<input
					type="password"
					bind:value={password}
					placeholder="Password"
					required
					class="rounded-md border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
				/>
				<button
					type="submit"
					class="cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
				>
					{showSignIn ? 'Sign in' : 'Sign up'}
				</button>
			</form>

			<p class="mt-4 text-center text-gray-600">
				{showSignIn ? "Don't have an account? " : 'Already have an account? '}
				<button
					type="button"
					onclick={toggleSignMode}
					class="cursor-pointer border-none bg-transparent text-blue-600 underline hover:text-blue-800"
				>
					{showSignIn ? 'Sign up' : 'Sign in'}
				</button>
			</p>
		</div>
	{:else if isAuthenticated}
		<!-- Dashboard Component -->
		<div class="w-full max-w-md rounded-lg bg-white p-6 text-center shadow-md">
			<div class="mb-4 text-xl font-semibold text-gray-800">
				Hello {user?.name}!
			</div>

			<!-- Demo: Access Token Section -->
			<div class="mb-4 rounded-md bg-gray-50 p-4">
				<h3 class="mb-2 text-sm font-medium text-gray-700">Access Token Demo</h3>
				<button
					onclick={fetchToken}
					disabled={tokenLoading}
					class="cursor-pointer rounded-md bg-blue-600 px-3 py-1 text-sm text-white transition-colors hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
				>
					{tokenLoading ? 'Fetching...' : 'Fetch Access Token'}
				</button>
				{#if accessToken}
					<div class="mt-2 rounded border bg-white p-2 text-xs break-all text-gray-600">
						{accessToken.length > 50 ? accessToken.substring(0, 50) + '...' : accessToken}
					</div>
				{/if}
			</div>

			<button
				onclick={signOut}
				class="cursor-pointer rounded-md bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:outline-none"
			>
				Sign out
			</button>
		</div>
	{/if}
</div>

```

### Using Better Auth from the server

To use Better Auth's
[server methods](https://www.better-auth.com/docs/concepts/api) in server
rendering, server functions, or any other SvelteKit server code, use Convex
functions and call the function from your server code.

Here's an example server action that calls the Convex function `getCurrentUser`
from `src/convex/auth.ts`.

```ts title="src/routes/+page.server.ts"
import type { PageServerLoad } from "./$types";
import { api } from "$convex/_generated/api";
import { createConvexHttpClient } from "@mmailaender/convex-better-auth-svelte/sveltekit";

export const load: PageServerLoad = async ({ locals }) => {
  const client = createConvexHttpClient({ token: locals.token });

  const currentUser = await client.query(api.auth.getCurrentUser, {});
  return { currentUser };
};
```

### Authenticated requests

There are two common ways to make authenticated Convex requests from Svelte
components.

#### Option 1: Conditionally run queries with `useQuery` and `auth.isAuthenticated`

Use this when your app has a mix of public and members-only content.  
You can read the auth state from `useAuth` and return `"skip"` for queries that
should only run once the user is authenticated.

```ts title="src/routes/+page.svelte"
import { api } from "$convex/_generated/api";
import { useQuery } from "convex-svelte";
import { useAuth } from "@mmailaender/convex-better-auth-svelte/svelte";

const auth = useAuth();

// Only fetch once the user is authenticated
const memberOnlyPosts = useQuery(api.posts.getMemberOnlyPosts, () =>
  auth.isAuthenticated ? {} : "skip"
);

// Always fetched, regardless of auth state
const publicPosts = useQuery(api.posts.getPublicPosts, {});
```

#### Option 2: Make all requests authenticated with `expectAuth`

Use this when your app is essentially “members-only” and almost all data
requires authentication.

By enabling `expectAuth`, all Convex queries and mutations created through
`createSvelteAuthClient` will:

- automatically include the auth token, and
- not run until the user is authenticated.

Unauthenticated users won’t trigger any Convex requests until they sign in.

```ts title="src/routes/+layout.svelte"
import { createSvelteAuthClient } from "@mmailaender/convex-better-auth-svelte/svelte";
import { authClient } from "$lib/auth-client";

createSvelteAuthClient({
  authClient,
  options: {
    expectAuth: true,
  },
});
```

### SSR (Optional)

By default, authentication state is determined on the client, which can cause a
brief loading state flash while the session is validated. SSR authentication
avoids this by providing the auth state from the server during the initial page
load.

**Benefits**

- **No loading state flash** - `isLoading` starts as `false`, and
  `isAuthenticated` is immediately correct
- **Instant content** - Protected content renders on first paint
- **Better UX** - Users see their personalized content without waiting for
  client-side checks.

**Setup**

<div className="fd-steps">
  <div className="fd-step">
    #### Get auth state in your layout server

    Use `getAuthState` to determine authentication status from cookies during SSR.

    ```ts title="src/routes/+layout.server.ts"
    import type { LayoutServerLoad } from "./$types";
    import { createAuth } from "$convex/auth.js";
    import { getAuthState } from "@mmailaender/convex-better-auth-svelte/sveltekit";

    export const load: LayoutServerLoad = async ({ cookies }) => {
      const authState = await getAuthState(createAuth, cookies);
      return { authState };
    };
    ```

  </div>

  <div className="fd-step">
    #### Pass auth state to the client

    Update your layout to pass the server auth state to `createSvelteAuthClient`.

    ```ts title="src/routes/+layout.svelte"
    <script lang="ts">
      import { createSvelteAuthClient } from '@mmailaender/convex-better-auth-svelte/svelte';
      import { authClient } from '$lib/auth-client';

      let { children, data } = $props();

      // Pass server auth state to prevent loading flash
      createSvelteAuthClient({
        authClient,
        getServerState: () => data.authState  // [!code ++]
      });
    </script>

    {@render children()}
    ```

  </div>

  <div className="fd-step">
    #### Prefetch user data

    For the best experience, also prefetch user data on the server to prevent content flash.

    ```ts title="src/routes/+layout.server.ts"
    import type { LayoutServerLoad } from "./$types";
    import { api } from "$convex/_generated/api";
    import { createAuth } from "$convex/auth.js";
    import { createConvexHttpClient, getAuthState } from "@mmailaender/convex-better-auth-svelte/sveltekit";

    export const load: LayoutServerLoad = async ({ locals, cookies }) => {
      const authState = await getAuthState(createAuth, cookies);

      if (!authState.isAuthenticated) {
        return { authState, currentUser: null };
      }

      const client = createConvexHttpClient({ token: locals.token });

      try {
        const currentUser = await client.query(api.auth.getCurrentUser, {});
        return { authState, currentUser };
      } catch {
        return { authState, currentUser: null };
      }
    };
    ```

    Then use `initialData` in your queries to prevent data flash:

    ```ts title="src/routes/+page.svelte"
    <script lang="ts">
      import { api } from '$convex/_generated/api';
      import { useQuery } from 'convex-svelte';
      import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';

      let { data } = $props();
      const auth = useAuth();

      const currentUserResponse = useQuery(
        api.auth.getCurrentUser,
        () => (auth.isAuthenticated ? {} : 'skip'),
        () => ({
          initialData: data.currentUser,
          keepPreviousData: true
        })
      );
    </script>
    ```

  </div>
</div>



================================================
FILE: docs/content/docs/framework-guides/tanstack-start.mdx
================================================
---
title: TanStack Start
description: Install and configure Convex + Better Auth for TanStack Start.
---

<Callout>
  Check out a complete Convex + Better Auth example with TanStack Start in the
  [GitHub
  repo](https://github.com/get-convex/better-auth/tree/main/examples/tanstack).
</Callout>

## Installation

<div className="fd-steps">

  <div className="fd-step">
    ### Install packages

    Install the component, a pinned version of Better Auth, and ensure the latest version
    of Convex.

    <Callout>This component requires Convex `1.25.0` or later.</Callout>

    ```npm
    npm install convex@latest @convex-dev/better-auth
    npm install better-auth@1.4.9 --save-exact
    npm install @types/node --save-dev
    ```

  </div>

  <div className="fd-step">
    ### Configure Vite for SSR

    Configure Vite to bundle `@convex-dev/better-auth` during SSR to avoid module resolution issues.

    ```ts title="vite.config.ts"
    export default defineConfig({
      // ...other config
      ssr: {
        noExternal: ['@convex-dev/better-auth'],
      },
    });
    ```

  </div>

  <div className="fd-step">
    ### Register the component

    Register the Better Auth component in your Convex project.

    ```ts title="convex/convex.config.ts"
    import { defineApp } from "convex/server";
    import betterAuth from "@convex-dev/better-auth/convex.config";

    const app = defineApp();
    app.use(betterAuth);

    export default app;
    ```

  </div>

  <div className="fd-step">
    ### Add Convex auth config

    Add a `convex/auth.config.ts` file to configure Better Auth as an authentication provider.

    ```ts title="convex/auth.config.ts"
    import { getAuthConfigProvider } from '@convex-dev/better-auth/auth-config'
    import type { AuthConfig } from 'convex/server'

    export default {
      providers: [getAuthConfigProvider()],
    } satisfies AuthConfig
    ```

  </div>

  <div className="fd-step">
    ### Set environment variables

    Generate a secret for encryption and generating hashes. Use the command below if you have openssl installed, or use the button to generate a random value instead. Or generate your own however you like.

    ```shell
    npx convex env set BETTER_AUTH_SECRET=$(openssl rand -base64 32)
    ```

    Add your site URL to your Convex deployment.

    ```shell
    npx convex env set SITE_URL http://localhost:3000
    ```

    Add environment variables to the `.env.local` file created by `npx convex dev`. It will be picked up by your framework dev server.

    ```shell title=".env.local" tab="Cloud"
    # Deployment used by \`npx convex dev\`
    CONVEX_DEPLOYMENT=dev:adjective-animal-123 # team: team-name, project: project-name

    VITE_CONVEX_URL=https://adjective-animal-123.convex.cloud

    # Same as VITE_CONVEX_URL but ends in .site // [!code ++]
    VITE_CONVEX_SITE_URL=https://adjective-animal-123.convex.site # [!code ++]

    # Your local site URL // [!code ++]
    VITE_SITE_URL=http://localhost:3000 # [!code ++]
    ```

    ```shell title=".env.local" tab="Self hosted"
    # Deployment used by \`npx convex dev\`
    CONVEX_DEPLOYMENT=dev:adjective-animal-123 # team: team-name, project: project-name

    VITE_CONVEX_URL=http://127.0.0.1:3210

    # Will generally be one number higher than VITE_CONVEX_URL,
    # so if your convex url is :3212, your site url will be :3213
    VITE_CONVEX_SITE_URL=http://127.0.0.1:3211 # [!code ++]

    # Your local site URL // [!code ++]
    VITE_SITE_URL=http://localhost:3000 # [!code ++]
    ```

  </div>

  <div className="fd-step">
    ### Create a Better Auth instance

    Create a Better Auth instance and initialize the component.

    <Callout>Some Typescript errors will show until you save the file.</Callout>

    ```ts title="convex/auth.ts"
    import { betterAuth } from 'better-auth/minimal'
    import { createClient } from '@convex-dev/better-auth'
    import { convex } from '@convex-dev/better-auth/plugins'
    import authConfig from './auth.config'
    import { components } from './_generated/api'
    import { query } from './_generated/server'
    import type { GenericCtx } from '@convex-dev/better-auth'
    import type { DataModel } from './_generated/dataModel'

    const siteUrl = process.env.SITE_URL!

    // The component client has methods needed for integrating Convex with Better Auth,
    // as well as helper methods for general use.
    export const authComponent = createClient<DataModel>(components.betterAuth)

    export const createAuth = (ctx: GenericCtx<DataModel>) => {
      return betterAuth({
        baseURL: siteUrl,
        database: authComponent.adapter(ctx),
        // Configure simple, non-verified email/password to get started
        emailAndPassword: {
          enabled: true,
          requireEmailVerification: false,
        },
        plugins: [
          // The Convex plugin is required for Convex compatibility
          convex({ authConfig }),
        ],
      })
    }

    // Example function for getting the current user
    // Feel free to edit, omit, etc.
    export const getCurrentUser = query({
      args: {},
      handler: async (ctx) => {
        return await authComponent.getAuthUser(ctx)
      },
    })
    ```

  </div>

  <div className="fd-step">
    ### Create a Better Auth client instance

    Create a Better Auth client instance for interacting with the Better Auth server from your client.

    ```ts title="src/lib/auth-client.ts"
    import { createAuthClient } from 'better-auth/react'
    import { convexClient } from '@convex-dev/better-auth/client/plugins'

    export const authClient = createAuthClient({
      plugins: [convexClient()],
    })
    ```

  </div>

  <div className="fd-step">
    ### Configure TanStack server utilities

    Configure a set of helper functions for authenticated SSR, server functions, and route handlers.

    ```ts title="src/lib/auth-server.ts"
    import { convexBetterAuthReactStart } from '@convex-dev/better-auth/react-start'

    export const {
      handler,
      getToken,
      fetchAuthQuery,
      fetchAuthMutation,
      fetchAuthAction,
    } = convexBetterAuthReactStart({
      convexUrl: process.env.VITE_CONVEX_URL!,
      convexSiteUrl: process.env.VITE_CONVEX_SITE_URL!,
    })
    ```

  </div>

  <div className="fd-step">
    ### Mount handlers

    Register Better Auth route handlers on your Convex deployment.

    ```ts title="convex/http.ts"
    import { httpRouter } from "convex/server";
    import { authComponent, createAuth } from "./auth";

    const http = httpRouter();

    authComponent.registerRoutes(http, createAuth);

    export default http;
    ```

    Set up route handlers to proxy auth requests from TanStack Start to your Convex deployment.

    ```ts title="src/routes/api/auth/$.ts"
    import { createFileRoute } from '@tanstack/react-router'
    import { handler } from '~/lib/auth-server'

    export const Route = createFileRoute('/api/auth/$')({
      server: {
        handlers: {
          GET: ({ request }) => handler(request),
          POST: ({ request }) => handler(request),
        },
      },
    })
    ```

  </div>

  <div className="fd-step">
    ### Set up root route

    Wrap your application root with `ConvexBetterAuthProvider` and make auth available in loaders.

    ```tsx title="src/routes/__root.tsx"
    /// <reference types="vite/client" />
    import {
      HeadContent,
      Outlet,
      Scripts,
      createRootRouteWithContext,
      useRouteContext,
    } from '@tanstack/react-router'
    import * as React from 'react'
    // [!code ++:3]
    import { createServerFn } from '@tanstack/react-start'
    import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react'
    import type { ConvexQueryClient } from '@convex-dev/react-query'
    import type { QueryClient } from '@tanstack/react-query'
    import appCss from '~/styles/app.css?url'
    // [!code ++:2]
    import { authClient } from '~/lib/auth-client'
    import { getToken } from '~/lib/auth-server'

    // [!code ++:4]
    // Get auth information for SSR using available cookies
    const getAuth = createServerFn({ method: 'GET' }).handler(async () => {
      return await getToken()
    })

    export const Route = createRootRouteWithContext<{
      queryClient: QueryClient
      convexQueryClient: ConvexQueryClient // [!code ++]
    }>()({
      head: () => ({
        meta: [
          {
            charSet: 'utf-8',
          },
          {
            name: 'viewport',
            content: 'width=device-width, initial-scale=1',
          },
        ],
        links: [
          { rel: 'stylesheet', href: appCss },
          { rel: 'icon', href: '/favicon.ico' },
        ],
      }),
      // [!code ++:16]
      beforeLoad: async (ctx) => {
        const token = await getAuth()

        // all queries, mutations and actions through TanStack Query will be
        // authenticated during SSR if we have a valid token
        if (token) {
          // During SSR only (the only time serverHttpClient exists),
          // set the auth token to make HTTP queries with.
          ctx.context.convexQueryClient.serverHttpClient?.setAuth(token)
        }

        return {
          isAuthenticated: !!token,
          token,
        }
      },
      component: RootComponent,
    })

    function RootComponent() {
      const context = useRouteContext({ from: Route.id }) // [!code ++]
      return (
        // [!code ++:5]
        <ConvexBetterAuthProvider
          client={context.convexQueryClient.convexClient}
          authClient={authClient}
          initialToken={context.token}
        >
          <RootDocument>
            <Outlet />
          </RootDocument>
        {/* [!code ++] */}
        </ConvexBetterAuthProvider>
      )
    }

    function RootDocument({ children }: { children: React.ReactNode }) {
      return (
        <html lang="en" className="dark">
          <head>
            <HeadContent />
          </head>
          <body className="bg-neutral-950 text-neutral-50">
            {children}
            <Scripts />
          </body>
        </html>
      )
    }
    ```

  </div>
  
  <div className="fd-step">
    ### Add route context

    Provide context from Convex to your routes, and ensure correct setup for SSR -
    this may replace some existing router setup in your code.

    ```ts title="src/routes/router.tsx"
    import { createRouter } from '@tanstack/react-router'
    import { QueryClient } from '@tanstack/react-query'
        // [!code ++:2]
        // You may need to install this package if you haven't already
    import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
    import { routerWithQueryClient } from '@tanstack/react-router-with-query' // [!code --]
    import { ConvexQueryClient } from '@convex-dev/react-query'
    import { ConvexProvider } from 'convex/react' // [!code --]
    import { routeTree } from './routeTree.gen'

    export function getRouter() {
      if (typeof document !== 'undefined') {
        notifyManager.setScheduler(window.requestAnimationFrame)
      }

      const convexUrl = (import.meta as any).env.VITE_CONVEX_URL!
      if (!convexUrl) {
        throw new Error('VITE_CONVEX_URL is not set')
      }
      const convexQueryClient = new ConvexQueryClient(convexUrl) // [!code --]
      // [!code ++:3]
      const convexQueryClient = new ConvexQueryClient(convexUrl, {
        expectAuth: true,
      })

      const queryClient: QueryClient = new QueryClient({
        defaultOptions: {
          queries: {
            queryKeyHashFn: convexQueryClient.hashFn(),
            queryFn: convexQueryClient.queryFn(),
          },
        },
      })
      convexQueryClient.connect(queryClient)
      // [!code --:2]
      const router = routerWithQueryClient(
        createRouter({
      // [!code ++]
      const router = createRouter({
        routeTree,
        defaultPreload: 'intent',
        context: { queryClient }, // [!code --]
        context: { queryClient, convexQueryClient }, // [!code ++]
        scrollRestoration: true,
        defaultErrorComponent: (err) => <p>{err.error.stack}</p>,
        defaultNotFoundComponent: () => <p>not found</p>,
        // [!code --:5]
        Wrap: ({ children }) => (
          <ConvexProvider client={convexQueryClient.convexClient}>
            {children}
          </ConvexProvider>
        ),
      })

      // [!code ++:4]
      setupRouterSsrQueryIntegration({
        router,
        queryClient,
      })

      return router
    }
    ```

  </div>
</div>

### You're done!

You're now ready to start using Better Auth with Convex.

## Usage

Check out the [Basic Usage](/basic-usage) guide for more information on general
usage. Below are usage notes specific to TanStack Start.

### SSR with TanStack Query

Use TanStack Query's `ensureQueryData` and `useSuspenseQuery` functions to use
Convex queries in server side rendering.

<Callout>
  A seamless initial render currently requires `expectAuth: true` in the
  ConvexQueryClient constructor. This setting does not allow Convex functions to
  run in the client before authentication.
</Callout>

```tsx title="src/routes/index.tsx"
import { createFileRoute } from "@tanstack/react-router";
import { api } from "~/convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/")({
  component: App,
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(
        convexQuery(api.auth.getCurrentUser, {})
      ),
      // Load multiple queries in parallel if needed
    ]);
  },
});
```

### Signing out with `expectAuth: true`

The `expectAuth: true` setting only has affect before the initial
authentication. If a user signs out and signs back in, authenticated queries
will likely be called before authentication is ready, resulting in an error.

**For this reason, the current recommendation is to reload the page on sign
out.** For apps that redirect based on authentication, signing out is typically
all that's needed as an unauth redirect will occur after reload.

```ts title="src/routes/index.tsx"
import { authClient } from "~/lib/auth-client";

const handleSignOut = async () => {
  await authClient.signOut({
    fetchOptions: {
      onSuccess: () => {
        location.reload();
      },
    },
  },
};
```

### Using Better Auth from the server

Better Auth's
[`auth.api` methods](https://www.better-auth.com/docs/concepts/api) would
normally run in your TanStack Start server code, but with Convex being your
backend, these methods need to run in a Convex function. The Convex function can
then be called from the client via hooks like `useMutation` or in server
functions and other server code using one of the auth-server utilities like
`fetchAuthMutation`. Authentication is handled automatically using session
cookies.

Here's an example using the `changePassword` method. The Better Auth `auth.api`
method is called inside of a Convex mutation, because we know this function
needs write access. For reads a query function can be used.

```ts title="convex/users.ts"
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { createAuth, authComponent } from "./auth";

export const updateUserPassword = mutation({
  args: {
    currentPassword: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
    await auth.api.changePassword({
      body: {
        currentPassword: args.currentPassword,
        newPassword: args.newPassword,
      },
      headers,
    });
  },
});
```

Here we call the mutation from a server action.

```ts title="src/routes/users.ts"
import { createServerFn } from "@tanstack/react-start";
import { fetchAuthMutation } from "@/lib/auth-server";
import { api } from "../../convex/_generated/api";

export const updatePassword = createServerFn({ method: "POST" }).handler(
  async ({ data: { currentPassword, newPassword } }) => {
    await fetchAuthMutation(api.users.updatePassword, {
      currentPassword,
      newPassword,
    });
  }
);
```



================================================
FILE: docs/content/docs/integrations/hono.mdx
================================================
---
title: Hono
description: Using Hono with Convex + Better Auth
---

If you prefer to work with [Hono](https://hono.dev/) instead of the default
HttpRouter, Hono can replace the default `authComponent.registerRoutes()`
method. Check out the [Convex w/ Hono Stack
article](https://stack.convex.dev/hono-with-convex#using-hono-with-convex) and
the [Better Auth Hono docs](https://www.better-auth.com/docs/integrations/hono)
for more details.

<Callout>
  You'll need to install the `convex-helpers` package if you haven't already.
</Callout>

## Configuration

```ts title="convex/http.ts"
import { Hono } from "hono";
import { HonoWithConvex, HttpRouterWithHono } from "convex-helpers/server/hono";
import { ActionCtx } from "./_generated/server";
import { createAuth } from "./auth";

const app: HonoWithConvex<ActionCtx> = new Hono();

// Redirect root well-known to api well-known
app.get("/.well-known/openid-configuration", async (c) => {
  return c.redirect("/api/auth/convex/.well-known/openid-configuration");
});

app.on(["POST", "GET"], "/api/auth/*", async (c) => {
  const auth = createAuth(c.env);
  return auth.handler(c.req.raw);
});

const http = new HttpRouterWithHono(app);

export default http;
```

## Add CORS support

Required for client only / SPA installs like React/Vite.

```ts title="convex/http.ts"
import { Hono } from "hono";
import { HonoWithConvex, HttpRouterWithHono } from "convex-helpers/server/hono";
import { cors } from "hono/cors"; // [!code ++]
import { ActionCtx } from "./_generated/server";
import { createAuth } from "../lib/auth";

const app: HonoWithConvex<ActionCtx> = new Hono();

// [!code ++:11]
app.use(
  "/api/auth/*",
  cors({
    origin: process.env.SITE_URL,
    allowHeaders: ["Content-Type", "Authorization", "Better-Auth-Cookie"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    exposeHeaders: ["Content-Length", "Set-Better-Auth-Cookie"],
    maxAge: 600,
    credentials: true,
  })
);

// ...
```



================================================
FILE: docs/content/docs/migrations/meta.json
================================================
{
  "title": "Migrations",
  "pages": ["migrate-to-0-10", "migrate-to-0-9", "migrate-to-0-8"],
  "defaultOpen": true
}



================================================
FILE: docs/content/docs/migrations/migrate-to-0-10.mdx
================================================
---
title: Migrate to 0.10
description: Migrate to @convex-dev/better-auth@0.10
---

## Upgrade component

<div className="fd-steps">

  <div className="fd-step">
    ### Install dependencies

    Update Better Auth and the component.

    <Callout>
      Be sure to review [breaking changes in Better Auth 1.4](https://www.better-auth.com/blog/1-4#%EF%B8%8F-breaking-changes).
    </Callout>

    <Callout>
      Check your dependencies for Better Auth packages and be sure to pin them all to 1.4.9. For example if you're using @better-auth/expo, it would also need to be upgraded.
    </Callout>

    ```npm
    npm install @convex-dev/better-auth@^0.10.0
    npm install better-auth@1.4.9 --save-exact
    ```

  </div>

</div>

## Update auth config

<div className="fd-steps">

  <div className="fd-step">

### Use `customJwt` auth config

[`customJwt` auth config](https://docs.convex.dev/auth/advanced/custom-jwt) is
now recommended for faster JWT validation. A helper is provided to generate the
config object.

```ts title="convex/auth.config.ts"
import type { AuthConfig } from "convex/server";
import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";

export default {
  providers: [
    getAuthConfigProvider(), // [!code ++]
    // [!code --:4]
    {
      applicationID: "convex",
      domain: process.env.CONVEX_SITE_URL!,
    },
  ],
} satisfies AuthConfig;
```

</div>

  <div className="fd-step">

### Update Convex Better Auth plugin config

The Convex Better Auth plugin now requires the auth config object. This helps
minimize configuration and ensure accuracy.

Additionally, as this new configuration uses RS256 instead of EdDSA (for
compatibility with `customJwt`), you'll want to set
`jwksRotateOnTokenGenerationError` to `true` initially so keys can be rotated
when algorithm mismatch occurs. This can be disabled later if desired.

```ts title="convex/auth.ts"
import authConfig from "./auth.config";

export const createAuthOptions = (ctx: GenericCtx<DataModel>) => {
  return {
    baseURL: siteUrl,
    database: authComponent.adapter(ctx),
    // ... other auth config
    plugins: [
      // ... other plugins
      convex(), // [!code --]
      // [!code ++:4]
      convex({
        authConfig,
        jwksRotateOnTokenGenerationError: true,
      }),
    ],
  } satisfies BetterAuthOptions;
};
```

</div>

<div className="fd-step">

### Drop `optionsOnly` parameter from `createAuth`

The `optionsOnly` parameter is no longer needed.

```ts title="convex/auth.ts"
// [!code --:4]
export const createAuth = (
  ctx: GenericCtx<DataModel>,
  { optionsOnly } = { optionsOnly: false },
) => {
export const createAuth = (ctx: GenericCtx<DataModel>) => { // [!code ++]
  return betterAuth({
    // [!code --:3]
    logger: {
      disabled: optionsOnly,
    },
    // ... auth config
  });
}
```

</div>

</div>

## SSR improvements

The following steps are only necessary for apps using SSR (eg., Next.js,
TanStack Start).

<div className="fd-steps">
<div className="fd-step">

### Update framework server utilities

Server utilities are provided for TanStack Start and Next.js to provide the same
kind of set-it-and-forget-it auth management that you get in the client, on the
server.

The configuration requires explicit URLs for Convex with runtime validation,
which should reduce environment variable confusion.

Replace usage of previous versions of these functions with the new ones, eg.,
`preloadQuery` with `preloadAuthQuery`, `fetchQuery` with `fetchAuthQuery`, etc.
Note that the new functions only accept a function reference and arguments, a
third option with configuration such as a token is not accepted or required.

<Tabs groupId="framework" items={["next-js", "tanstack-start"]} defaultValue="next-js" persist>
<Tab value="next-js">

```ts title="lib/auth-server.ts"
import { createAuth } from "@/convex/auth"; // [!code --]
import { getToken as getTokenNextjs } from "@convex-dev/better-auth/nextjs"; // [!code --]
import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs"; // [!code ++]

// [!code --:3]
export const getToken = () => {
  return getTokenNextjs(createAuth);
};

// [!code ++:12]
export const {
  handler,
  preloadAuthQuery,
  isAuthenticated,
  getToken,
  fetchAuthQuery,
  fetchAuthMutation,
  fetchAuthAction,
} = convexBetterAuthNextJs({
  convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL!,
  convexSiteUrl: process.env.NEXT_PUBLIC_CONVEX_SITE_URL!,
});
```

</Tab>

<Tab value="tanstack-start">

```ts title="src/lib/auth-server.ts"
// [!code --:3]
import { createAuth } from "convex/auth";
import { setupFetchClient } from "@convex-dev/better-auth/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { convexBetterAuthReactStart } from "@convex-dev/better-auth/react-start"; // [!code ++]

// [!code --:2]
export const { fetchQuery, fetchMutation, fetchAction } =
  await setupFetchClient(createAuth, getCookie);

// [!code ++:10]
export const {
  handler,
  getToken,
  fetchAuthQuery,
  fetchAuthMutation,
  fetchAuthAction,
} = convexBetterAuthReactStart({
  convexUrl: process.env.VITE_CONVEX_URL!,
  convexSiteUrl: process.env.VITE_CONVEX_SITE_URL!,
});
```

</Tab>
</Tabs>

</div>

<div className="fd-step">

### Update route handlers

Update your route handlers to use the new handler.

<Tabs groupId="framework" items={["next-js", "tanstack-start"]} defaultValue="next-js" persist>
<Tab value="next-js">
```ts title="app/api/auth/[...all]/route.ts"
import { nextJsHandler } from "@convex-dev/better-auth/nextjs"; // [!code --]
import { handler } from "@/lib/auth-server"; // [!code ++]

export const { GET, POST } = nextJsHandler(); // [!code --]
export const { GET, POST } = handler; // [!code ++]
```
</Tab>

<Tab value="tanstack-start">
```ts title="src/routes/api/auth/$.ts"
import { createFileRoute } from '@tanstack/react-router'
import { reactStartHandler } from '@convex-dev/better-auth/react-start' // [!code --]
import { handler } from '~/lib/auth-server' // [!code ++]

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      // [!code --:2]
      GET: ({ request }) => reactStartHandler(request),
      POST: ({ request }) => reactStartHandler(request),
      // [!code ++:2]
      GET: ({ request }) => handler(request),
      POST: ({ request }) => handler(request),
    },
  },
})
```
</Tab>
</Tabs>
</div>

<div className="fd-step">

### Pass initial token to ConvexBetterAuthProvider

Apps using Next.js or TanStack Start can pass the an initial token to speed up
client authentication.

<Tabs groupId="framework" items={["next-js", "tanstack-start"]} defaultValue="next-js" persist>
<Tab value="next-js">

Update your `ConvexClientProvider` to accept an initial token.

```tsx title="app/ConvexClientProvider.tsx"
export function ConvexClientProvider({
  children,
  initialToken, // [!code ++]
}: {
  children: ReactNode;
  initialToken?: string | null; // [!code ++]
}) {
  return (
    <ConvexBetterAuthProvider
      client={convex}
      authClient={authClient}
      initialToken={initialToken} // [!code ++]
    >
      {children}
    </ConvexBetterAuthProvider>
  );
}
```

Then fetch the initial token on the server from your root layout and pass it to
the `ConvexClientProvider`.

```tsx title="app/layout.tsx"
import { getToken } from "@/lib/auth-server"; // [!code ++]
import { ConvexClientProvider } from "./ConvexClientProvider";
import { PropsWithChildren } from "react";

export default async function RootLayout({ children }: PropsWithChildren) {
  const token = await getToken(); // [!code ++]
  return (
    <html>
      <body>
        {/* [!code --] */}
        <ConvexClientProvider>
        {/* [!code ++] */}
        <ConvexClientProvider initialToken={token}>
          {children}
        </ConvexClientProvider>
      </body>
    </html>
  );
}
```

</Tab>
<Tab value="tanstack-start">
```tsx title="src/routes/__root.tsx"
function RootComponent() {
  const context = useRouteContext({ from: Route.id })
  return (
    <ConvexBetterAuthProvider
      client={context.convexQueryClient.convexClient}
      authClient={authClient}
      initialToken={context.token} // [!code ++]
    >
      <RootDocument>
        <Outlet />
      </RootDocument>
    </ConvexBetterAuthProvider>
  )
}
```
</Tab>
</Tabs>
</div>
</div>

## Next.js changes

<div className="fd-steps">
<div className="fd-step">
#### Use `usePreloadedAuthQuery`

`usePreloadedAuthQuery` replaces `usePreloadedQuery` as a drop-in - it ensures
server rendered data is rendered until authentication is ready.

```tsx title="app/(auth)/(dashboard)/todo-list.tsx"
import { usePreloadedAuthQuery } from "@convex-dev/better-auth/nextjs/client";

export const TodoList = ({ preloadedUserQuery }) => {
  const userQuery = usePreloadedAuthQuery(preloadedUserQuery);
  return (
    <div>
      <h1>{userQuery?.name}</h1>
    </div>
  );
};
```

</div>
</div>

## TanStack Start changes

<div className="fd-steps">

<div className="fd-step">
  ### Update Vite configuration

Update Vite configuration to bundle `@convex-dev/better-auth` during SSR to
avoid module resolution issues.

```ts title="vite.config.ts"
export default defineConfig({
  // ...other config
  ssr: {
    noExternal: ["@convex-dev/better-auth"],
  },
});
```

</div>

<div className="fd-step">
### Update router config

Update the router to set `expectAuth: true` on the ConvexQueryClient - without
this, authenticated data from server render is lost immediately after first
render.

Also drop the unused `Wrap` provider (if you have one).

```tsx title="src/router.tsx"
export function getRouter() {
  const convexUrl = (import.meta as any).env.VITE_CONVEX_URL!;
  if (!convexUrl) {
    throw new Error("VITE_CONVEX_URL is not set");
  }
  const convexQueryClient = new ConvexQueryClient(convexUrl, {
    expectAuth: true, // [!code ++]
  });

  const queryClient: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryKeyHashFn: convexQueryClient.hashFn(),
        queryFn: convexQueryClient.queryFn(),
      },
    },
  });
  convexQueryClient.connect(queryClient);

  const router = createTanStackRouter({
    routeTree,
    defaultPreload: "intent",
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    // [!code --:5]
    Wrap: ({ children }) => (
      <ConvexProvider client={convexQueryClient.convexClient}>
        {children}
      </ConvexProvider>
    ),
    context: { queryClient, convexQueryClient },
    scrollRestoration: true,
  });
  setupRouterSsrQueryIntegration({
    router,
    queryClient,
  });

  return router;
}
```

</div>

<div className="fd-step">

### Update root route

Update the root route to use the new `getAuth()` server function and
`isAuthenticated` context value.

```tsx title="src/routes/__root.tsx"
import { createServerFn } from "@tanstack/react-start";
// [!code --:4]
import {
  fetchSession,
  getCookieName,
} from "@convex-dev/better-auth/react-start";
import { getCookie, getRequest } from "@tanstack/react-start/server"; // [!code --]
import { getToken } from "@/lib/auth-server"; // [!code ++]

// [!code --:10]
const fetchAuth = createServerFn({ method: "GET" }).handler(async () => {
  const { createAuth } = await import("@convex/auth");
  const { session } = await fetchSession(getRequest());
  const sessionCookieName = getCookieName(createAuth);
  const token = getCookie(sessionCookieName);
  return {
    userId: session?.user.id,
    token,
  };
});

// [!code ++:3]
const getAuth = createServerFn({ method: "GET" }).handler(async () => {
  return await getToken();
});

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
  convexQueryClient: ConvexQueryClient;
}>()({
  // ... other config
  beforeLoad: async (ctx) => {
    const token = await getAuth();

    // all queries, mutations and actions through TanStack Query will be
    // authenticated during SSR if we have a valid token
    if (token) {
      // During SSR only (the only time serverHttpClient exists),
      // set the auth token to make HTTP queries with.
      ctx.context.convexQueryClient.serverHttpClient?.setAuth(token);
    }

    return {
      isAuthenticated: !!token,
      token,
    };
  },
  component: RootComponent,
});
```

</div>

<div className="fd-step">

### Reload on sign out

Finally, update your signOut function(s) to reload the page. This allows
`expectAuth` to work correctly for the next sign in. For apps with authenticated
routes, signing out can typically replace a redirect.

```ts title="src/lib/auth-client.ts"
export const handleSignOut = async () => {
  const navigate = useNavigate();
  await authClient.signOut({
    fetchOptions: {
      onSuccess: () => {
        navigate({ to: "/" }); // [!code --]
        location.reload(); // [!code ++]
      },
    },
  });
};
```

</div>

</div>

## Local Install additional steps

The following steps are only necessary for apps using
[Local Install](/local-install).

<div className="fd-steps">

  <div className="fd-step">

### Remove `getStaticAuth`

Remove `getStaticAuth` in `convex/betterAuth/auth.ts` and replace it with a
simple `createAuth`

```ts title="convex/betterAuth/auth.ts"
import { getStaticAuth } from "@convex-dev/better-auth"; // [!code --]
import { v } from "convex/values";
import { createAuth } from "../auth";

// Export a static instance for Better Auth schema generation
export const auth = getStaticAuth(createAuth); // [!code --]
export const auth = createAuth({} as any); // [!code ++]
```

  </div>

  <div className="fd-step">

### Regenerate schema

Whenever updating Better Auth w/ Local Install, regenerate the schema.

```npm
cd convex/betterAuth
npx @better-auth/cli generate -y
```

</div>

<div className="fd-step">

### Split out `createAuthOptions` function

The previous approach of configuring Better Auth options inside of the
`betterAuth()` function call meant we had to run Better Auth to access options
statically. This led to unnecessary logging and inaccurate error messages, and
required workarounds like using `optionsOnly` to disable logging.

To avoid all of this moving forward, you'll want to have a separate
`createAuthOptions` function that just returns the typed options object.

```ts title="convex/auth.ts"
import {
  betterAuth,
  type BetterAuthOptions, // [!code ++]
} from "better-auth/minimal";

// [!code ++:5]
export const createAuthOptions = (ctx: GenericCtx<DataModel>) => {
  return {
    // ... auth config
  } satisfies BetterAuthOptions;
};

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  // [!code --:3]
  return betterAuth({
    // ... auth config
  });
  return betterAuth(createAuthOptions(ctx)); // [!code ++]
};
```

</div>

<div className="fd-step">
### Update adapter

Replace usage of `createAuth` with `createAuthOptions` in `adapter.ts`.

You'll also drop the removed `migrationRemoveUserId` function.

```ts title="convex/betterAuth/adapter.ts"
import { createApi } from "@convex-dev/better-auth";
import {
  createAuth, // [!code --]
  createAuthOptions, // [!code ++]
} from "./auth";
import schema from "./schema";

export const {
  create,
  findOne,
  findMany,
  updateOne,
  updateMany,
  deleteOne,
  deleteMany,
  migrationRemoveUserId, // [!code --]
} = createApi(schema, createAuth); // [!code --]
} = createApi(schema, createAuthOptions); // [!code ++]
```

</div>

</div>



================================================
FILE: docs/content/docs/migrations/migrate-to-0-8.mdx
================================================
---
title: Migrate to 0.8
description: Migrate to @convex-dev/better-auth@0.8
---

<Callout>
  To use Local Install, complete this migration guide first and then follow the
  [Local Install guide](/local-install).
</Callout>

## Upgrade

<div className="fd-steps">

  <div className="fd-step">
    ### Update the component

    Update Better Auth and the component.

    ```npm
    npm install @convex-dev/better-auth@0.8
    npm install better-auth@1.3.8 --save-exact
    ```

  </div>

  <div className="fd-step">

    ### Update component instance

    Replace the component instance with createClient.

    ```ts title="convex/auth.ts"
    import {
      AuthFunctions,
      BetterAuth, // [!code --]
      PublicAuthFunctions, // [!code --]
      createClient, // [!code ++]
    } from "@convex-dev/better-auth";
    import { DataModel } from "./_generated/dataModel";
    import { components } from "./_generated/api";

    const authFunctions: AuthFunctions = internal.auth;
    const publicAuthFunctions: PublicAuthFunctions = api.auth; // [!code --]

    export const betterAuthComponent = new BetterAuth(// [!code --]
    export const authComponent = createClient<DataModel>(// [!code ++]
      components.betterAuth, {
        authFunctions,
        publicAuthFunctions, // [!code --]
      });

    // These will be used in the next step
    export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi() // [!code ++]
    ```

  </div>

  <div className="fd-step">

    ### Convert hooks from `createAuthFunctions` to triggers

    The previously supported `onCreateUser`, `onUpdateUser`, and `onDeleteUser` hooks from
    `betterAuthComponent.createAuthFunctions()` have been replaced by triggers. See the
    [Triggers guide](/triggers) for more information.

    ```ts title="convex/auth.ts"
    // [!code --:14]
    export const {
      createUser,
      deleteUser,
      updateUser,
    } = betterAuthComponent.createAuthFunctions<DataModel>({
      onCreateUser: async (ctx, user) => {
        return ctx.db.insert("users", {
          email: user.email,
        });
      },
      onDeleteUser: async (ctx, userId) => {
        await ctx.db.delete(userId as Id<"users">);
      },
    });

    const authFunctions: AuthFunctions = internal.auth;

    export const authComponent = createClient<DataModel>(
      components.betterAuth,
      // [!code ++:26]
      {
        authFunctions,
        triggers: {
          user: {
            onCreate: async (ctx, authUser) => {
              // Any `onCreateUser` logic should be moved here
              const userId = await ctx.db.insert('users', {
                email: authUser.email,
              })
              // Instead of returning the user id, we set it to the component
              // user table manually. This is no longer required behavior, but
              // is necessary when migrating from previous versions to avoid
              // a required database migration.
              // This helper method exists solely to facilitate this migration.
              await authComponent.setUserId(ctx, authUser._id, userId)
            },
            onUpdate: async (ctx, oldUser, newUser) => {
              // Any `onUpdateUser` logic should be moved here
            },
            onDelete: async (ctx, authUser) => {
              await ctx.db.delete(authUser.userId as Id<'users'>)
            },
          },
        },
      },
    )

    export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi()
    ```

  </div>

  <div className="fd-step">

    ### Move and update Better Auth config

The `createAuth` function should be moved to `convex/auth.ts`. This isn't
required, but better represents where the code actually runs, colocates it
with other related server side auth code, and avoids potentially writing
Convex code outside of the Convex directory for some function based config
properties.

The Convex database adapter is now provided through a method on the auth
component, and a `GenericCtx` type from the component library is now used to
type the `createAuth` ctx arg.

There is also a new `optionsOnly` parameter to the `createAuth` function. This
is used to disable logging when the function is called just to generate options.
This is not required, but helpful for reducing noise in logs.

<Callout>
  Be sure to update any imports of `createAuth` to the new path.
</Callout>

    ```ts title="convex/auth.ts"
    import type { GenericCtx } from './_generated/server'; // [!code --]
    const {
      convexAdapter, // [!code --]
      type GenericCtx, // [!code ++]
      createClient,
    } from "@convex-dev/better-auth";
    import { DataModel } from "./_generated/dataModel";

    export const authComponent = createClient<DataModel>(
      components.betterAuth
      // ...
    )

    export const createAuth = (ctx: GenericCtx) => { // [!code --]
    export const createAuth = (
      ctx: GenericCtx<DataModel>, // [!code ++]
      { optionsOnly } = { optionsOnly: false }, // [!code ++]
    ) => {
      return betterAuth({
        // ...
        database: authComponent.adapter(ctx), // [!code ++]
        database: convexAdapter(ctx, authComponent), // [!code --]
        // [!code ++:5]
        // When createAuth is called just to generate options, we don't want to
        // log anything
        logger: {
          disabled: optionsOnly,
        },
      })
    }
    ```
    </div>

    <div className="fd-step">

    ### Update `ctx.auth.getUserIdentity()` usage

The `subject` property of the id token, as well as the user identity object returned from
`ctx.auth.getUserIdentity()`, was formerly the user id from the application user
table. It is now the user id from the Better Auth user table. Any direct usage
of the `subject` property should be replaced with
`authComponent.getAuthUser(ctx)`, which returns the entire Better Auth user
object (formerly referred to as user metadata).

```ts title="convex/messages.ts"
export const listMessages = query({
  args: {},
  handler: async (ctx) => {
    const userId = (await ctx.auth.getUserIdentity())?.subject; // [!code --]
    const userId = (await authComponent.getAuthUser(ctx))?.userId; // [!code ++]
    return ctx.db
      .query("messages")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
  },
});
```

</div>

<div className="fd-step">
  ### Update `authComponent.getAuthUser()` usage

`authComponent.getAuthUser()` now throws an error if the user is not found. Use
`authComponent.safeGetAuthUser()` to match the previous behavior.

```ts title="convex/auth.ts"
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const  authComponent.getAuthUser(ctx);
    return authComponent.safeGetAuthUser(ctx);
  },
});
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const userMetadata = await betterAuthComponent.getAuthUser(ctx); // [!code --]
    const userMetadata = await authComponent.safeGetAuthUser(ctx); // [!code ++]
    if (!userMetadata) {
      return null;
    }
    const user = await ctx.db.get(userMetadata.userId as Id<"users">);
    return {
      ...user,
      ...userMetadata,
    };
  },
});
```

</div>

<div className="fd-step">
  ### Framework specific changes

If your project uses TanStack Start, follow the [last few
steps](/framework-guides/tanstack-start#mount-handlers)
of the TanStack Start guide and make sure your code aligns.

This migration should not have framework specific impacts for any other
framework.

</div>

<div className="fd-step">

### That's it!

Please report any issues or inaccuracies from this guide via [GitHub
issues](https://github.com/get-convex/better-auth/issues) or in the
[**#better-auth**](https://discord.com/channels/1019350475847499849/1365754331873415440)
channel on Discord.

</div>

</div>

## Other breaking changes

### Convex plugin `options` removed

The named `options` parameter to the Convex plugin that accepted Better Auth
options has been removed. This was necessary because the Convex plugin
previously customized the session, breaking type inference for configuration
that affected the session, so the Better Auth options had to be separated to a
new function and passed in to the Convex plugin.

None of this is necessary anymore, if you were doing this you can go back to
using a single `createAuth` function.

```ts title="convex/auth.ts"
// [!code --:19]
const createOptions = (ctx: GenericCtx) =>
  ({
    baseURL: siteUrl,
    database: convexAdapter(ctx, betterAuthComponent),
    plugins: [
      // ...plugins
    ],
  }) satisfies BetterAuthOptions;

export const createAuth = (ctx: GenericCtx) => {
  const options = createOptions(ctx);
  return betterAuth({
    ...options,
    plugins: [...options.plugins, convex({ options })],
  });
};

// [!code ++:10]
export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    baseURL: siteUrl,
    database: authComponent.adapter(ctx),
    plugins: [
      // ...plugins
      convex(),
    ],
  });
};
```



================================================
FILE: docs/content/docs/migrations/migrate-to-0-9/index.mdx
================================================
---
title: Migrate to 0.9
description: Migrate to @convex-dev/better-auth@0.9
---

<Callout title="Breaking changes" type="error">
  This release includes breaking changes. Not following the migration steps
  correctly can lead to unexpected behavior.
</Callout>

## Upgrade component

<div className="fd-steps">

  <div className="fd-step">
    ### Install dependencies

    Update Better Auth and the component.

    ```npm
    npm install @convex-dev/better-auth@0.9
    npm install better-auth@1.3.34 --save-exact
    ```

  </div>

  <div className="fd-step">

### Regenerate schema (Local Install only)

Whenever updating Better Auth w/ Local Install, regenerate the schema.

```npm
cd convex/betterAuth
npx @better-auth/cli generate -y
```

</div>

  <div className="fd-step">

### Update `onUpdate` triggers

<Callout title="Breaking change!" type="warning" />

Any triggers using the `onUpdate` hook should be updated to expect the new doc
as the second parameter, and the old doc as the third parameter. The old doc
parameter can be left out of the signature if not needed.

```ts title="convex/auth.ts"
export const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: {
    user: {
      onUpdate: async (ctx, oldDoc, newDoc) => { // [!code --]
      onUpdate: async (ctx, newDoc, oldDoc) => { // [!code ++]
        // oldDoc can be left out of the signature if not needed
      },
    },
  },
});
```

  </div>

  <div className="fd-step">

    ### Use `_id` in database adapter

This isn't technically breaking since the database adapter api is not a part of
the documented api surface, but any adapter usage referencing the `id` field
should be updated to use `_id` instead.

<Callout type="warning">
  Using the adapter directly is not unsafe, but it is not recommended. Results
  are not typesafe, and breaking changes may occur.
</Callout>

    ```ts title="convex/auth.ts"
    export const getUserById = query({
      args: { authId: v.string() },
      handler: async (ctx, args) => {
        const user = await ctx.runQuery(components.betterAuth.adapter.findOne, {
          model: "user",
          where: [{ field: "id", value: args.authId }], // [!code --]
          where: [{ field: "_id", value: args.authId }], // [!code ++]
        });
        return user;
      },
    });
    ```

  </div>

<div className="fd-step">

### Migrate away from `user.userId` support

**This step is not required for 0.9, but will be required in a future release.**

Storing your app user id in the Better Auth user table is no longer required,
and built in support for it is deprecated.

<Cards>
  <Card title="Migration guide" href="migrate-to-0-9/migrate-userid">
    Migrate away from `user.userId` support
  </Card>
</Cards>

</div>

</div>



================================================
FILE: docs/content/docs/migrations/migrate-to-0-9/migrate-userid/index.mdx
================================================
---
title: Migrate off of user.userId
description: Migrate away from tracking user.userId in the component user table
---

## tl;dr

The Better Auth component has it's own user table. Your app may have it's own
user table as well. These tables are related via the `userId` field in the
Better Auth user table. The component facilitates this relationship as a special
case, but is going to stop doing that in a future release.

### Why?

Originally the component schema couldn't be configured. This is now possible
through [Local Install](/local-install). Moving forward, keeping two user tables
should be a project decision that is explicitly configured rather than a built
in pattern that often brings confusion.

### Do I need to do anything?

If your app has it's own user table and the `userId` field is populated in any
of your betterAuth user table records, you will need to follow the migration
guide below. Otherwise, you can ignore this guide.

## Migration options

<div className="fd-steps">

<div className="fd-step">

### Keep current behavior

**If avoiding a data migration is the most important thing for you, this is the
way to go.**

If you want to maintain the current approach, you can configure Better Auth to
do that. If you already use Local Install, want to continue keep using two user
tables, and are fine with the app user id being tracked in the component user
table, this will be the simplest approach.

<Cards>
  <Card title="Migration guide" href="migrate-userid/userid-in-component-table">
    Migrate user id reference to component table
  </Card>
</Cards>

</div>

<div className="fd-step">

### Track component user id in app table

**If avoiding using Local Install is the most important thing for you, this is
the way to go.**

This is the generally recommended approach for apps that will continue using two
app tables. It doesn't require Local Install. This approach involves migrating
from tracking the app user id in the component to tracking the component user id
in the app user table via an `authId` field.

A data migration is required to backfill the `authId` field.

<Cards>
  <Card title="Migration guide" href="migrate-userid/userid-in-app-table">
    Migrate user id reference to app table
  </Card>
</Cards>

</div>

</div>



================================================
FILE: docs/content/docs/migrations/migrate-to-0-9/migrate-userid/meta.json
================================================
{
  "pages": ["userid-in-component-table", "userid-in-app-table"]
}



================================================
FILE: docs/content/docs/migrations/migrate-to-0-9/migrate-userid/userid-in-app-table.mdx
================================================
---
title: Component user id in app table
description: Migrate user id reference from component to app table
---

<Callout>
  This guide shows one of two recommended strategies for migrating away from
  maintaining a `user.userId` field in the Better Auth user table. Read [the
  overview](./) for more information.
</Callout>

<Callout type="warning">
  The migration guide covers basic required changes, but your application may
  have additional or altered requirements depending on how the Better Auth
  component is implemented. Be sure to review any auth related code for
  potential impacts. Avoid type assertions and checking for type errors is
  encouraged.
</Callout>

This guide is for migrating from tracking the app user id in the component to
tracking the component user id in the app user table via an `authId` field.

<div className="fd-steps">

<div className="fd-step">

### Run convex dev

Keep the Convex dev server running while following the migration steps.

```npm
npx convex dev
```

</div>

  <div className="fd-step">

### Install migrations component

Install and configure the
[migrations component](https://www.convex.dev/components/migrations).

```npm
npm install @convex-dev/migrations
```

```ts title="convex/convex.config.ts"
import { defineApp } from "convex/server";
import betterAuth from "@convex-dev/better-auth/convex.config";
import migrations from "@convex-dev/migrations/convex.config"; // [!code ++]

const app = defineApp();
app.use(betterAuth);
app.use(migrations); // [!code ++]

export default app;
```

  </div>

  <div className="fd-step">

### Add `authId` field to users table

Add an `authId` field to your app users table. You can use any name you want,
but keep in mind that this guide will refer to it as `authId`. The field should
be optional for now, it can be changed to required later.

```ts title="convex/schema.ts"
export default defineSchema({
  users: defineTable({
    email: v.string(),
    authId: v.optional(v.string()), // [!code ++]
  })
    .index("email", ["email"])
    .index("authId", ["authId"]), // [!code ++]
  // ...
});
```

</div>

  <div className="fd-step">
### Add migration functions

Create a `convex/migrations.ts` file and add migration functions. Two functions
are added - one for adding the `authId` field to the app users table, and one
for removing the `userId` field from the related Better Auth user. We'll run
them in later steps.

```ts title="convex/migrations.ts"
import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { authComponent } from "./auth";

export const migrations = new Migrations<DataModel>(components.migrations);

// Define migration functions
export const migrationAddAuthId = migrations.define({
  table: "users",
  migrateOne: async (ctx, user) => {
    // For each user in the app users table, get the related Better Auth user id
    // and set it to the `authId` field.
    if (user.authId === undefined) {
      const authUser = await authComponent.migrationGetUser(ctx, user._id);
      if (!authUser) {
        throw new Error(`Auth user not found for id ${user._id}`);
      }
      await ctx.db.patch(user._id, { authId: authUser._id });
    }
  },
});

export const migrationRemoveUserId = migrations.define({
  table: "users",
  migrateOne: async (ctx, user) => {
    // For each user in the app users table, remove the `userId` value from the
    // related Better Auth user
    await authComponent.migrationRemoveUserId(ctx, user._id);
  },
});

// Export runnable migration functions
export const addAuthId = migrations.runner(
  internal.migrations.migrationAddAuthId
);

export const removeUserId = migrations.runner(
  internal.migrations.migrationRemoveUserId
);
```

  </div>

  <div className="fd-step">
### Update adapter exports (Local Install only)

If using [Local Install](/local-install), update the adapter exports to include
the `migrationRemoveUserId` function.

```ts title="convex/betterAuth/adapter.ts"
export const {
  create,
  findOne,
  findMany,
  updateOne,
  updateMany,
  deleteOne,
  deleteMany,
  migrationRemoveUserId, // [!code ++]
} = createApi(schema, createAuth);
```

  </div>

<div className="fd-step">
  ### Update user triggers

Update user triggers to set the user `authId` field on creation, and use it to
get the app user on update and delete.

Depending on how you're using Better Auth, you may or may not be using all of
these triggers.

```ts title="convex/auth.ts"
export const authComponent = createClient<DataModel, typeof betterAuthSchema>(
  components.betterAuth,
  {
    authFunctions,
    triggers: {
      user: {
        onCreate: async (ctx, authUser) => {
          const userId = await ctx.db.insert("users", {
            email: authUser.email,
            authId: authUser._id, // [!code ++]
          });
          await authComponent.setUserId(ctx, authUser._id, userId);
        },
      onUpdate: async (ctx, authUser, prevAuthUser) => {
        // Example trigger logic for syncing email address, your logic
        // and details may differ
        if (authUser.email !== prevAuthUser.email) {
          // [!code ++:6]
          const user = await ctx.db.query("users")
            .withIndex("authId", (q) => q.eq("authId", authUser._id))
            .unique();
          if (!user) {
            throw new ConvexError('User not found')
          }
          await ctx.db.patch(authUser.authId as Id<'users'>, { // [!code --]
          await ctx.db.patch(user._id, { // [!code ++]
            email: authUser.email,
          })
        }
      },
      onDelete: async (ctx, authUser) => {
        // Example logic, your logic and details may differ
        await ctx.db.delete(authUser.userId as Id<'users'>) // [!code --]
        // [!code ++:6]
        const user = await ctx.db.query("users")
          .withIndex("authId", (q) => q.eq("authId", authUser._id))
          .unique();
        if (!user) {
          throw new ConvexError('User not found')
        }
        await ctx.db.delete(authUser.userId as Id<'users'>) // [!code --]
        await ctx.db.delete(user._id) // [!code ++]
      },
        // ...
      },
    },
  }
);
```

</div>

<div className="fd-step">
  ### Run `addAuthId` migration

At this point, with the convex dev server running, your code is still
functioning as it did prior to starting this guide, but is now also defining
`authId` on every new user, so all new users moving forward will have an
`authId` value.

**This migration will backfill the `authId` field for previously existing users
in your development deployment.**

```npm
npx convex run migrations:addAuthId
```

</div>

<div className="fd-step">
  ### Deploy to production

<Callout type="warning">
  Before proceeding, make sure the migration was successful in your development
  deployment by running your application locally. Also confirm that the `authId`
  field on all users in your development deployment app user table is set.
</Callout>

The changes made so far, which are strictly additive and not destructive, should
be deployed to production. The first migration will need to run there as well.

Deployment steps depend on how you deploy your app. Most apps deploy through
Netlify or Vercel by merging changes to the main branch of their project repo.

</div>

<div className="fd-step">
  ### Run `addAuthId` migration in production

With production successfully deployed, the migration can be run against the
production deployment. This can happen through the production deployment
dashboard, or through the cli using the `--prod` flag.

```npm
npx convex run migrations:addAuthId --prod
```

</div>

<div className="fd-step">
### Make `authId` required

Now that all `authId` values are set, make the `authId` field required in the
app user table. If the convex dev server errors after this change, you probably
have one or more users in the app user table that don't have an `authId` value.
This should only be possible for users that do not have a related Better Auth
user.

```ts title="convex/schema.ts"
export default defineSchema({
  users: defineTable({
    email: v.string(),
    authId: v.optional(v.string()), // [!code --]
    authId: v.string(), // [!code ++]
  }).index("email", ["email"]),
});
```

</div>

<div className="fd-step">
### Remove `userId` writes

Update the user onCreate trigger to stop setting the `userId` field on the
Better Auth user.

```ts title="convex/auth.ts"
export const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: {
    user: {
      onCreate: async (ctx, authUser) => {
        await ctx.db.insert("users", {
          email: authUser.email,
          authId: authUser._id,
        });
        await authComponent.setUserId(ctx, authUser._id, userId); // [!code --]
      },
    },
  },
});
```

</div>

<div className="fd-step">
  ### Update `userId` references

Any references in your codebase to the `userId` field from the Better Auth user
should be updated to reference the `authId` field in the app user table. Your
app may not have any such references.

```ts title="convex/auth.ts"
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const authUser = await authComponent.safeGetAuthUser(ctx);
    if (!authUser) {
      return;
    }
    const user = await ctx.db.get(authUser.userId as Id<"users">); // [!code --]
    // [!code ++:4]
    const user = await ctx.db
      .query("users")
      .withIndex("authId", (q) => q.eq("authId", authUser._id))
      .unique();
    if (!user) {
      return;
    }
    return { ...user, ...withoutSystemFields(authUser) };
  },
});
```

</div>

<div className="fd-step">
  ### Run `removeUserId` migration

The migration is now functionally complete, all that remains are unused `userId`
values in the Better Auth user table.

Run the `removeUserId` migration to clear the unused values.

```npm
npx convex run migrations:removeUserId
```

</div>

<div className="fd-step">
  ### Deploy to production

After ensuring your application works after these changes, and that the `userId`
field is no longer being set on the Better Auth user table, changes should be
deployed to production.

</div>

<div className="fd-step">
  ### Run `removeUserId` migration in production

Once deployed, as we did previously, the second migration should also be run in
production.

```npm
npx convex run migrations:removeUserId --prod
```

</div>

<div className="fd-step">
  ### Remove migration code

Remove the migration dependencies and code added previously.

<Callout>
  Only remove the migration component if not used elsewhere in your project.
</Callout>

```npm
npm uninstall @convex-dev/migrations
```

```ts title="convex/convex.config.ts"
import { defineApp } from "convex/server";
import betterAuth from "@convex-dev/better-auth/convex.config";
import migrations from "@convex-dev/migrations/convex.config"; // [!code --]

const app = defineApp();
app.use(betterAuth);
app.use(migrations); // [!code --]

export default app;
```

```ts title="convex/migrations.ts"
// [!code --:40]
import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { authComponent } from "./auth";

export const migrations = new Migrations<DataModel>(components.migrations);

// Define migration functions
export const migrationAddAuthId = migrations.define({
  table: "users",
  migrateOne: async (ctx, user) => {
    // For each user in the app users table, get the related Better Auth user id
    // and set it to the `authId` field.
    if (user.authId === undefined) {
      const authUser = await authComponent.migrationGetUser(ctx, user._id);
      if (!authUser) {
        throw new Error(`Auth user not found for id ${user._id}`);
      }
      await ctx.db.patch(user._id, { authId: authUser._id });
    }
  },
});

export const migrationRemoveUserId = migrations.define({
  table: "users",
  migrateOne: async (ctx, user) => {
    // For each user in the app users table, remove the `userId` value from the
    // related Better Auth user
    await authComponent.migrationRemoveUserId(ctx, user._id);
  },
});

// Export runnable migration functions
export const addAuthId = migrations.runner(
  internal.migrations.migrationAddAuthId
);

export const removeUserId = migrations.runner(
  internal.migrations.migrationRemoveUserId
);
```

<Callout>This file only exists if using Local Install.</Callout>

```ts title="convex/betterAuth/adapter.ts"
export const {
  create,
  findOne,
  findMany,
  updateOne,
  updateMany,
  deleteOne,
  deleteMany,
  migrationRemoveUserId, // [!code --]
} = createApi(schema, createAuth);
```

</div>

<div className="fd-step">
  ### Migration complete 🎉

You've successfully migrated your user table foreign key from Better Auth into
your app user table.

</div>

</div>



================================================
FILE: docs/content/docs/migrations/migrate-to-0-9/migrate-userid/userid-in-component-table.mdx
================================================
---
title: App user id in component table
description:
  Configure Better Auth to continue tracking app user id in component table
---

<Callout>
  This guide shows one of two recommended strategies for migrating away from
  maintaining a `user.userId` field in the Better Auth user table. Read [the
  overview](./) for more information.
</Callout>

<Callout type="warning">
  The migration guide covers basic required changes, but your application may
  have additional or altered requirements depending on how the Better Auth
  component is implemented. Be sure to review any auth related code for
  potential impacts. Avoid type assertions and checking for type errors is
  encouraged.
</Callout>

This guide is for configuring Better Auth to continue the existing behavior of
tracking the app user id in the component table.

<div className="fd-steps">

<div className="fd-step">

### Run convex dev

Keep the Convex dev server running while following the migration steps.

```npm
npx convex dev
```

</div>

<div className="fd-step">

### Migrate to Local Install

If you haven't already, follow the guide to migrate to
[Local Install](/local-install).

</div>

<div className="fd-step">
### Add userId field to component schema

Use Better Auth's
[`additionalFields`](https://www.better-auth.com/docs/concepts/database#extending-core-schema)
option to add the `userId` field to the component schema.

```ts title="convex/auth.ts"
export const createAuth = (
  ctx: GenericCtx<DataModel>,
  { optionsOnly } = { optionsOnly: false }
) => {
  return betterAuth({
    // [!code ++:8]
    user: {
      additionalFields: {
        userId: {
          type: "string",
          required: false,
        },
      },
    },
  });
};
```

</div>

<div className="fd-step">

### Regenerate schema

Regenerate the Better Auth schema to include the new `userId` field.

```npm
cd convex/betterAuth && npx @better-auth/cli generate -y
```

</div>

<div className="fd-step">

### Add `setUserId` mutation

The component has a deprecated `setUserId` method, you'll want to create your
own to replace it.

```ts title="convex/betterAuth/auth.ts"
export const setUserId = mutation({
  args: {
    authId: v.id("user"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.authId, {
      userId: args.userId,
    });
  },
});
```

</div>

<div className="fd-step">

### Update user onCreate trigger

Update the user onCreate trigger to set the `userId` field on the Better Auth
user.

```ts title="convex/auth.ts"
export const authComponent = createClient<DataModel, typeof betterAuthSchema>(
  components.betterAuth,
  {
    authFunctions,
    local: {
      schema: betterAuthSchema,
    },
    triggers: {
      user: {
        onCreate: async (ctx, authUser) => {
          const userId = await ctx.db.insert("users", {
            email: authUser.email,
          });
          await authComponent.setUserId(ctx, authUser._id, userId); // [!code --]
          // [!code ++:4]
          await ctx.runMutation(components.betterAuth.auth.setUserId, {
            authId: authUser._id,
            userId,
          });
        },
      },
    },
  }
);
```

</div>

<div className="fd-step">
### All set 🎉

Previous behavior is now configured manually, no changes in behavior should
result.

</div>
</div>


