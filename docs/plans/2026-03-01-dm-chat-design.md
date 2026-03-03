# Direct Message Chat — Design Document

## Overview

Add one-to-one direct messaging between any users. DMs live at `/chat` with a two-panel layout (conversation list + active chat). Full feature parity with community chat: replies, reactions, edit, delete.

## Schema

### `dm_conversations`

| Field             | Type                  | Notes                          |
| ----------------- | --------------------- | ------------------------------ |
| participant1      | string                | Lower sorted authId            |
| participant2      | string                | Higher sorted authId           |
| lastMessageAt     | number                | Updated on each new message    |
| createdAt         | number                |                                |

**Indexes:** `by_participant1` (`participant1`), `by_participant2` (`participant2`), `by_pair` (`participant1`, `participant2`)

### `dm_messages`

| Field          | Type                      | Notes              |
| -------------- | ------------------------- | ------------------- |
| conversationId | Id\<dm_conversations\>    |                     |
| senderAuthId   | string                    |                     |
| senderName     | string                    |                     |
| senderImage    | string (optional)         |                     |
| body           | string                    |                     |
| replyTo        | Id\<dm_messages\> (opt)   |                     |
| editedAt       | number (optional)         |                     |
| isDeleted      | boolean                   |                     |
| createdAt      | number                    |                     |

**Index:** `by_conversationId_and_createdAt` (`conversationId`, `createdAt`)

### `dm_reactions`

| Field      | Type                  | Notes |
| ---------- | --------------------- | ----- |
| messageId  | Id\<dm_messages\>     |       |
| userAuthId | string                |       |
| emoji      | string                |       |
| createdAt  | number                |       |

**Indexes:** `by_messageId` (`messageId`), `by_messageId_and_userAuthId` (`messageId`, `userAuthId`)

### `dm_read_cursors`

| Field          | Type                      | Notes                     |
| -------------- | ------------------------- | ------------------------- |
| conversationId | Id\<dm_conversations\>    |                           |
| userAuthId     | string                    |                           |
| lastReadAt     | number                    | Timestamp of last read    |

**Indexes:** `by_conversationId_and_userAuthId` (`conversationId`, `userAuthId`), `by_userAuthId` (`userAuthId`)

### `user_presence`

| Field      | Type   | Notes                        |
| ---------- | ------ | ---------------------------- |
| userAuthId | string |                              |
| expiresAt  | number | now + 30s, refreshed by heartbeat |

**Index:** `by_userAuthId` (`userAuthId`)

## Routes

| Route              | Description                                |
| ------------------ | ------------------------------------------ |
| `/chat`            | DM hub — two-panel layout                  |
| `/chat/[username]` | Opens or creates DM with that user         |

## UI Layout

### Two-Panel Layout

- **Left panel** (~300px): Conversation list sorted by `lastMessageAt`. Each item shows avatar, username, last message preview, relative timestamp, unread badge.
- **Right panel**: Active chat view with message bubbles, reactions, replies, edit/delete — same patterns as community chat.
- **Empty state**: "Select a conversation or start a new one"

### Mobile

- Left panel fills screen. Selecting a conversation navigates to the chat view with a back button.

### New Chat Flow

1. "New chat" button at top of conversation list → dialog with user search → creates/finds conversation
2. "Message" button on `/u/[username]` → navigates to `/chat/[username]`

### Sidebar

- New "Chat" nav item with `MessageSquare` icon
- Unread count badge on the nav item

## Backend Functions (`convex/dm.ts`)

### Queries

- `listConversations` — all DMs for current user, sorted by `lastMessageAt`
- `getMessages` — messages for a conversationId (limit 100)
- `getConversationByUsername` — find existing DM with a username
- `getUnreadCount` — total unread across all DMs (for sidebar badge)

### Mutations

- `createOrGetConversation` — find or create DM between two users
- `sendMessage` — send message + update `lastMessageAt`
- `editMessage` — edit own message
- `deleteMessage` — soft-delete own message
- `toggleReaction` — add/remove emoji reaction
- `markAsRead` — update read cursor to current time

## Presence (`convex/presence.ts`)

- `heartbeat` (mutation) — upsert `user_presence` with `expiresAt = now + 30s`
- `getOnlineUsers` (query) — return users where `expiresAt > now`
- Client sends heartbeat every 20s via `setInterval`

## Real-Time Indicators

- **Online status**: Green dot on avatars in conversation list
- **Unread count**: Badge on sidebar nav item + per-conversation badge in list

## Entry Points

- Sidebar "Chat" nav item → `/chat`
- User profile "Message" button → `/chat/[username]`
- "New chat" button inside `/chat` → user search dialog
