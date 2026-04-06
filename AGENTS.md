# AGENTS.md - Cognirivus Chat

Essential guidance for AI coding agents operating in this repository.

---

## Tech Stack

| Layer      | Technology                                                     |
| ---------- | -------------------------------------------------------------- |
| Frontend   | SvelteKit 2 + Svelte 5 (runes)                                 |
| Styling    | TailwindCSS 4                                                  |
| Components | shadcn-svelte (`bits-ui`) → `src/lib/components/ui/`           |
| Backend    | Convex → `src/convex/`                                         |
| Auth       | WorkOS AuthKit + Convex JWT auth                               |
| AI         | OpenRouter API + Vercel AI SDK (`@openrouter/ai-sdk-provider`) |
| Storage    | Cloudflare R2 (large text content)                             |
| Schema     | `src/convex/schema.ts`                                         |

---

## Critical Rules

1. **Convex code**: Always read `convex_rules.txt` before writing Convex functions.
2. **Never run** `pnpm build` or `npx convex dev` without explicit user permission.
3. **No secrets**: Never commit `.env` or credentials.
4. **Large content**: Never store text >1000 chars directly in Convex—use R2.

---

## Naming Conventions

| Type                | Convention             | Example                           |
| ------------------- | ---------------------- | --------------------------------- |
| Svelte Components   | `PascalCase.svelte`    | `MessageItem.svelte`              |
| Functions/Variables | `camelCase`            | `getUserData`                     |
| Constants           | `SCREAMING_SNAKE_CASE` | `MAX_RETRIES`                     |
| DB Indexes          | `by_field_name`        | `by_thread`, `by_user_updated_at` |

---

## Svelte 5 Patterns

- Use `$state` for reactive state, `$derived` for computed, `$effect` for side effects.
- Use `$props()` for component properties.
- Reactive modules → `.svelte.ts` extension.
- Event handlers as props: `onclick={() => ...}` (not `createEventDispatcher`).
- **Always** check svelte MCP server for docs before writing Svelte code.

---

## Convex Patterns

| Function Type                        | Use Case                                             |
| ------------------------------------ | ---------------------------------------------------- |
| `query` / `mutation`                 | Public (with auth checks)                            |
| `internalQuery` / `internalMutation` | Backend-only via `internal.path.func`                |
| `action`                             | Network requests (AI, R2); cannot modify DB directly |

- Every function **must** have `args` with `v` validators.
- Auth: use WorkOS-backed helpers from `src/convex/auth.ts` / `src/convex/lib/adminAuth.ts`.
- Always use `.withIndex()` over `.filter()` for queries.
- **Always** check `convex_rules.txt` for reference before writing Convex code.

---

## R2 Storage Flow

**Upload:**

1. Action generates R2 key
2. Action uploads to R2
3. Call `internalMutation` to save metadata + `r2Key` + snippet (≤500 chars)

**Read:** Fetch signed `bodyUrl` from Convex, then `fetch(url).text()` client-side.

---

## Imports

```typescript
// Project code
import { ... } from '$lib/...'

// Environment
import { ... } from '$env/dynamic/private'

// Convex
import { api, internal } from './_generated/api'

// Icons
import { Icon } from '@lucide/svelte'
```

---

## Formatting (Prettier)

- Tabs for indentation
- Single quotes
- No trailing commas
- 100 char line width

---

## Error Handling

| Context  | Approach                                                        |
| -------- | --------------------------------------------------------------- |
| Backend  | `throw Error('message')` or `ConvexError` for structured errors |
| Frontend | `svelte-sonner` toast for notifications                         |

---

## Development Workflow

1. **Check docs** first—use MCP servers for relevant documentation
2. **Load skills**—load relevant skills (e.g., `svelte-code-writer`, `frontend-design`) before starting work
3. **Search** existing patterns with `grep` / `glob`
4. **Schema first** if adding data → update `src/convex/schema.ts`
5. **Implement** Svelte 5 components with runes
6. **Verify** with `pnpm check` and `pnpm lint`

---

## Commands

```bash
# Development
pnpm dev              # Start dev server
pnpm check            # Type check (svelte-check)
pnpm lint             # Prettier + ESLint

# Testing
npx vitest run                          # All tests
npx vitest run path/to/file.test.ts     # Single file
npx vitest run -t "pattern"             # Single test

# Build (requires permission)
pnpm build
npx convex dev
```

---

## Documentation

- [R2 Storage](docs/R2_STORAGE.md)
- [Convex Agents](docs/convex-agents.md)
- [OpenRouter SDK](docs/openrouter-aisdk.md)
- [Streaming](docs/svelte-streamdown.md)
- [RAG](docs/convex-rag.md)

<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `src\convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->
