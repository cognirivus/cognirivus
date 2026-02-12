# Rate Limiting

Application-layer rate limiting using [`@convex-dev/rate-limiter`](https://github.com/get-convex/rate-limiter).

All limits are **per-user** (keyed by `userId`). Every call uses `throws: true`, which auto-throws a `ConvexError` with `{ kind, name, retryAfter }` when exceeded.

**Config file:** `src/convex/lib/rateLimits.ts`

---

## Algorithms

| Algorithm | Behaviour |
|---|---|
| **Token bucket** | Tokens refill at a steady `rate` per `period`. Unused tokens accumulate up to `capacity`, allowing short bursts. |
| **Fixed window** | All tokens granted at the start of each `period`. No burst beyond the `rate`. |

---

## Rate Limits

### Chat / AI

| Name | Algorithm | Rate | Period | Burst | Used In | Functions |
|---|---|---|---|---|---|---|
| `sendMessage` | Token bucket | 20/min | 1 min | 5 | `messages.ts` | `send` |
| `aiGenerate` | Token bucket | 10/min | 1 min | 3 | `chat.ts` | `generate` |

### Threads

| Name | Algorithm | Rate | Period | Burst | Used In | Functions |
|---|---|---|---|---|---|---|
| `createThread` | Token bucket | 10/min | 1 min | 3 | `threads.ts` | `create` |
| `deleteAllThreads` | Fixed window | 1/hr | 1 hr | — | `threads.ts` | `deleteAll` |

### Blogs

| Name | Algorithm | Rate | Period | Burst | Used In | Functions |
|---|---|---|---|---|---|---|
| `createBlog` | Fixed window | 5/hr | 1 hr | — | `blogs.ts` | `insertMetadata` |
| `blogReaction` | Token bucket | 30/min | 1 min | 5 | `blogs.ts` | `toggleLike`, `toggleDislike`, `toggleCommentLike`, `toggleCommentDislike` |
| `blogComment` | Token bucket | 10/min | 1 min | 3 | `blogs.ts` | `addComment` |

### Content (Knowledge Base)

| Name | Algorithm | Rate | Period | Burst | Used In | Functions |
|---|---|---|---|---|---|---|
| `contentReaction` | Token bucket | 30/min | 1 min | 5 | `content.ts`, `highlights.ts` | `toggleLike`, `toggleDislike`, `toggleCommentLike`, `toggleCommentDislike`, `toggleInlineCommentReaction` |
| `contentComment` | Token bucket | 10/min | 1 min | 3 | `content.ts` | `addComment` |

### Groups

| Name | Algorithm | Rate | Period | Burst | Used In | Functions |
|---|---|---|---|---|---|---|
| `createGroup` | Fixed window | 3/hr | 1 hr | — | `groups.ts` | `create` |
| `joinGroup` | Fixed window | 10/hr | 1 hr | — | `groups.ts` | `join` |
| `groupChatMessage` | Token bucket | 20/min | 1 min | 5 | `group_chat.ts` | `sendMessage` |
| `groupChatReaction` | Token bucket | 30/min | 1 min | 5 | `group_chat.ts` | `toggleReaction` |
| `shareContent` | Token bucket | 20/min | 1 min | 5 | `groups.ts` | `shareContent` |

### Highlights

| Name | Algorithm | Rate | Period | Burst | Used In | Functions |
|---|---|---|---|---|---|---|
| `createHighlight` | Token bucket | 20/min | 1 min | 5 | `highlights.ts` | `createHighlight` |
| `inlineComment` | Token bucket | 10/min | 1 min | 3 | `highlights.ts` | `addInlineComment` |

### Flashcards

| Name | Algorithm | Rate | Period | Burst | Used In | Functions |
|---|---|---|---|---|---|---|
| `flashcardReview` | Token bucket | 60/min | 1 min | 10 | `flashcards.ts` | `review` |
| `flashcardGenerate` | Fixed window | 5/hr | 1 hr | — | `flashcards.ts` | `generateFromContent` |

---

## Not Rate Limited

| Area | Reason |
|---|---|
| **Auth (sign-up / sign-in / name update)** | Better Auth hooks run outside Convex context — no access to `MutationCtx`. Name validation (length, pattern, control chars) is still enforced in `auth.ts`. |
| **Internal mutations/queries** | Backend-only functions called by other Convex functions; not exposed to clients. |
| **Read-only queries** | Queries don't mutate state; Convex handles read scaling natively. |

---

## Error Handling

When a rate limit is exceeded, a `ConvexError` is thrown with:

```ts
{
  kind: "RateLimited",
  name: "sendMessage",    // the rate limit name
  retryAfter: 2345        // ms until the request would succeed
}
```

The frontend should catch this and show a toast via `svelte-sonner`.

---

## Tuning

To adjust limits, edit `src/convex/lib/rateLimits.ts`. Changes take effect on next deploy — no schema migration needed. For high-throughput limits, add `shards` to reduce OCC conflicts:

```ts
aiGenerate: { kind: 'token bucket', rate: 10, period: MINUTE, capacity: 3, shards: 5 }
```
