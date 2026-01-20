# AGENTS.md - Cognirivus Chat

## Commands

- **Dev server:** `pnpm dev`
- **Build:** `pnpm build`
- **Type check:** `pnpm check`
- **Lint:** `pnpm lint`
- **Format:** `pnpm format`
- **Convex dev:** `npx convex dev` (runs backend in watch mode)

## Architecture

- **Frontend:** SvelteKit 2 + Svelte 5 (runes) with TailwindCSS 4, svelte-shadcn bits-ui components
- **Backend:** Convex (serverless DB + functions) in `src/convex/`
- **Auth:** better-auth with Convex adapter (`src/convex/auth.ts`, `src/lib/auth-client.ts`)
- **AI:** OpenRouter direct API and via Vercel AI SDK (`@openrouter/ai-sdk-provider`, `ai` package)
- **Schema:** `src/convex/schema.ts` defines tables: messages, threads, usage_logs, generated_images, user_memories, models, blogs, news, content, subjects, entities

## Code Style

- **Formatting:** Prettier with tabs, single quotes, no trailing commas, 100 char width
- **Types:** Strict TypeScript (`strict: true`), use Zod for validation
- **Imports:** Use `$lib/` alias for lib imports, `$env/` for env vars
- **Components:** Svelte 5 runes (`$state`, `$derived`, `$effect`), `.svelte.ts` for reactive modules
- **Convex:** Use `v` validators from `convex/values`, define indexes on tables, mutations/queries in `src/convex/*.ts`
