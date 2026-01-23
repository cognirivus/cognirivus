# AGENTS.md - Cognirivus Chat

This file contains essential information for AI coding agents (like yourself) to operate effectively and safely within the Cognirivus Chat repository.

## Commands

### Development & Build

- **Dev server:** `pnpm dev` (Vite + SvelteKit)
- **Build:** `pnpm build` (NEVER run without explicit user permission)
- **Type check:** `pnpm check` (Runs `svelte-check` for runes and types)
- **Linting:** `pnpm lint` (Prettier check + ESLint)

### Backend (Convex)

- **Convex dev:** `npx convex dev` (Runs backend in watch mode. NEVER run without explicit user permission).
- **Convex Dashboard:** `npx convex dashboard`
- **Auth Schema Gen:** `npx @better-auth/cli generate --output src/convex/betterAuth/schema.ts -y` (NEVER run without explicit user permission)

### Testing (Vitest)

- **Run all tests:** `npx vitest run`
- **Run in watch mode:** `npx vitest`
- **Run single file:** `npx vitest run path/to/file.test.ts`
- **Run single test:** `npx vitest run -t "test name pattern"`

## Architecture & Tech Stack

- **Frontend:** SvelteKit 2 + Svelte 5 (runes: `$state`, `$derived`, `$effect`, `$props`).
- **Styling:** TailwindCSS 4.
- **Components:** shadcn-svelte (based on `bits-ui`) in `src/lib/components/ui/`.
- **Backend:** Convex (serverless DB + functions) in `src/convex/`.
- **Large Text Storage:** Cloudflare R2 for full text content (news, syllabus, blogs). Convex stores metadata and `r2Key`. See `docs/R2_STORAGE.md`.
- **Auth:** better-auth with Convex adapter (`src/convex/auth.ts`, `src/lib/auth-client.ts`).
- **AI Integration:** Direct OpenRouter API and Vercel AI SDK (`ai` package) with `@openrouter/ai-sdk-provider`.
- **Schema:** Defined in `src/convex/schema.ts`. Key tables: `messages`, `threads`, `usage_logs`, `content`, `subjects`, `entities`.

## Code Style & Conventions

### Formatting (Prettier)

- **Tabs:** Use tabs for indentation.
- **Quotes:** Single quotes.
- **Trailing Commas:** None.
- **Line Width:** 100 characters.
- **Svelte:** Components use Svelte 5 syntax.

### TypeScript & Types

- **Strict Mode:** `strict: true` is enforced. No `any` unless absolutely necessary (e.g., in generic wrappers).
- **Validation:** Use `zod` for all frontend and Convex Action input validation.
- **Naming:**
  - **Svelte Components:** `PascalCase.svelte` (e.g., `MessageItem.svelte`).
  - **Functions/Variables:** `camelCase`.
  - **Constants:** `SCREAMING_SNAKE_CASE`.
  - **DB Indexes:** `by_field_name` (e.g., `by_thread`, `by_user_updated_at`).

### Svelte 5 (Runes) Patterns

- Use `$state` for reactive state, `$derived` for computed values, and `$effect` for side effects.
- Reactive modules (shared state) should use `.svelte.ts` extension.
- Prefer event handlers as props (e.g., `onclick={() => ...}`) over deprecated `createEventDispatcher`.
- Use `$props()` for component properties.

### Convex Backend Patterns

- **Function Types:**
  - `query`/`mutation`: Publicly accessible (with auth checks).
  - `internalQuery`/`internalMutation`: Backend-only (use via `internal.path.to.func`).
  - `action`: For network requests (AI, R2), cannot directly modify DB; must call mutations.
- **Validation:** Every Convex function MUST have an `args` object using `v` validators from `convex/values`.
- **Auth:** Use `authComponent.getAuthUser(ctx)` in Convex functions to verify user session.
- **Indexing:** Always define indexes for fields used in `.filter()` or `.eq()` queries. Prefer `.withIndex()` over full table scans.

### Large Content Management (R2)

- Never store full article/news text (> 1000 chars) directly in Convex.
- **Upload Flow:**
  1. Action generates R2 key.
  2. Action uploads to R2.
  3. Action calls `internalMutation` to save metadata + `r2Key` + `snippet` (max 500 chars) to Convex.
- **Read Flow:** UI fetches `bodyUrl` (signed) from Convex and performs a client-side `fetch(url).text()`.

### AI & Agent Patterns

- Use the `Agent` class from `@convex-dev/agent` for complex workflows.
- **Idempotency:** Save the user prompt in a mutation first, then trigger an async action for response generation using `promptMessageId`.
- **Reasoning:** Handle reasoning/thinking tokens separately from the message body.

### Error Handling

- **Backend:** Throw `Error` with descriptive messages. Use `ConvexError` for client-visible structured errors if needed.
- **Frontend:** Use `svelte-sonner` (toast) for all non-modal error notifications.

### Imports

- **Alias:** Use `$lib/` for project library code.
- **Environment:** Use `$env/dynamic/private` or `$env/static/private` for sensitive vars.
- **Convex:** Import `api` and `internal` from `./_generated/api`.

## Development Workflow

1.  **Understand:** Search for existing patterns using `grep` or `glob`.
2.  **Schema First:** If adding data, update `src/convex/schema.ts` and run `npx convex dev`. (NEVER run without explicit user permission)
3.  **UI:** Implement Svelte 5 components with runes.
4.  **Verification:** Run `pnpm check` and `pnpm lint` before submitting changes.
5.  **No Secret Commits:** Never include `.env` or credentials in changes.

## Documentation References

- **R2 Pattern:** `docs/R2_STORAGE.md`
- **Agent Usage:** `docs/convex-agents.md`
- **OpenRouter SDK:** `docs/openrouter-aisdk.md`
- **Streaming:** `docs/svelte-streamdown.md`
- **RAG:** `docs/convex-rag.md`
