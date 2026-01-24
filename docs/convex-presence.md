# Presence
Presence

[](https://www.convex.dev/)

[](/)

Product

[RealtimeKeep your app up to date](https://www.convex.dev/realtime)
[AuthenticationOver 80+ OAuth integrations](https://www.convex.dev/auth)
[![Convex Components](https://www.convex.dev/_next/image?url=%2F_next%2Fstatic%2Fmedia%2FcomponentsIcon.88c73aa0.svg&w=48&q=75)

ComponentsIndependent, modular, TypeScript building blocks for your backend.

](/components)
[Open sourceSelf host and develop locally](https://www.convex.dev/open-source)
[![](https://www.convex.dev/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Fsparkle.b34d0032.svg&w=48&q=75)

AI CodingGenerate high quality Convex code with AI

](/ai)

Compare

[Convex vs. Firebase](https://www.convex.dev/compare/firebase)
[Convex vs. Supabase](https://www.convex.dev/compare/supabase)
[Convex vs. SQL](https://www.convex.dev/compare/sql)

Developers

[DocumentationGet started with your favorite frameworks](https://docs.convex.dev)
[SearchSearch across Docs, Stack, and Discord](https://search.convex.dev)
[Convex for StartupsStart and scale your company with Convex](https://www.convex.dev/startups)
[Convex for Open SourceSupport for open source projects](https://www.convex.dev/open-source-program)
[TemplatesUse a recipe to get started quickly](https://www.convex.dev/templates)
[Convex ChampionsAmbassadors that support our thriving community](https://www.convex.dev/champions)
[Convex CommunityShare ideas and ask for help in our community Discord](https://www.convex.dev/community)

[![Stack](https://www.convex.dev/_next/image?url=%2F_next%2Fstatic%2Fmedia%2FstackColor.52088746.svg&w=32&q=75)

Stack

Stack is the Convex developer portal and blog, sharing bright ideas and techniques for building with Convex.

Explore Stack

](https://stack.convex.dev/)

[Blog](https://stack.convex.dev)
[Docs](https://docs.convex.dev)
[Pricing](https://www.convex.dev/pricing)

[GitHub](https://github.com/get-convex/convex-backend)
[Log in](https://www.convex.dev/login)
[Start building](https://www.convex.dev/start)

[Back to Components](https://www.convex.dev/components)

Presence
========

[![get-convex's avatar](https://www.convex.dev/_next/image?url=https%3A%2F%2Favatars.githubusercontent.com%2Fu%2F81530787%3Fv%3D4&w=96&q=75)

get-convex/presence

View repo



](https://github.com/get-convex/presence)
[![GitHub logo](https://www.convex.dev/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Fnpm.bd053a67.svg&w=48&q=75)View package](https://www.npmjs.com/package/@convex-dev/presence)

### Category

[Backend](https://www.convex.dev/components#backend "Show all components in \"Backend\" category")

![Presence hero image](https://www.convex.dev/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Fpresence.63ef8f4a.png&w=1536&q=75)

```
npm install @convex-dev/presence
```


Presence Convex Component
=========================

[![npm version](https://badge.fury.io/js/@convex-dev%2Fpresence.svg)](https://badge.fury.io/js/@convex-dev%2Fpresence)

A Convex component for managing presence functionality, i.e., a live-updating list of users in a "room" including their status for when they were last online.

![Demo of presence component](https://raw.githubusercontent.com/get-convex/presence/main/presence.gif)

It can be tricky to implement presence efficiently, without any polling and without re-running queries every time a user sends a heartbeat message. This component implements presence via Convex scheduled functions such that clients only receive updates when a user joins or leaves the room.

The most common use case for this component is via the usePresence hook, which takes care of sending heartbeart messages to the server and gracefully disconnecting a user when the tab is closed.

[![The Presence Component Video](https://img.youtube.com/vi/ZZTm_NtWJrs/0.jpg)](https://www.youtube.com/watch?v=ZZTm_NtWJrs)

Installation[#](#installation)
------------------------------

```
npm install @convex-dev/presence
```


Examples[#](#examples)
----------------------

See the `example` directory for a simple example of how to use this component. The `example-with-auth` directory shows how to use the component with authentication.

There's a hosted version of `example-with-auth` at [https://presence.previews.convex.dev](https://presence.previews.convex.dev).

Usage[#](#usage)
----------------

First, add the component to your Convex app:

`convex/convex.config.ts`

```
import { defineApp } from "convex/server";
import presence from "@convex-dev/presence/convex.config.js";

const app = defineApp();
app.use(presence);
export default app;
```


`convex/presence.ts`

```
import { mutation, query } from "./_generated/server";
import { components } from "./_generated/api";
import { v } from "convex/values";
import { Presence } from "@convex-dev/presence";

export const presence = new Presence(components.presence);

export const heartbeat = mutation({
  args: {
    roomId: v.string(),
    userId: v.string(),
    sessionId: v.string(),
    interval: v.number(),
  },
  handler: async (ctx, { roomId, userId, sessionId, interval }) => {
    // TODO: Add your auth checks here.
    return await presence.heartbeat(ctx, roomId, userId, sessionId, interval);
  },
});

export const list = query({
  args: { roomToken: v.string() },
  handler: async (ctx, { roomToken }) => {
    // Avoid adding per-user reads so all subscriptions can share same cache.
    return await presence.list(ctx, roomToken);
  },
});

export const disconnect = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    // Can't check auth here because it's called over http from sendBeacon.
    return await presence.disconnect(ctx, sessionToken);
  },
});
```


A `Presence` React component can be instantiated from your client code like this:

`src/App.tsx`

```
import { api } from "../convex/_generated/api";
import usePresence from "@convex-dev/presence/react";
import FacePile from "@convex-dev/presence/facepile";

export default function App(): React.ReactElement {
  const [name] = useState(() => "User " + Math.floor(Math.random() * 10000));
  const presenceState = usePresence(api.presence, "my-chat-room", name);

  return (
    <main>
      <FacePile presenceState={presenceState ?? []} />
    </main>
  );
}
```


This uses the basic `FacePile` component included with this package but you can easily copy this code and use the `usePresence` hook directly to implement your own styling.

### React Native support[#](#react-native-support)

If you're using React Native, install these optional dependencies:

```
npx expo install react-native expo-crypto
```


and then import the `usePresence` hook from `@convex-dev/presence/react-native`:

```
import { usePresence } from "@convex-dev/presence/react-native";
```


_Note: The component currently doesn't have a React Native equivalent, but you can easily create your own._

Additional functionality[#](#additional-functionality)
------------------------------------------------------

The component interface for the `Presence` class is defined in `src/client/index.ts`. It includes additional functions for maintaining presence state and for querying presence for a given user or room.

e.g., you can use the `listUser` function to check if a user is online in any room.

Reach out or join the [Convex Discord Community](https://convex.dev/community) if you have any questions or feedback!

Get your app up and running in minutes

[Start building](https://www.convex.dev/start)