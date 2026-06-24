# Cognirivus Product Roadmap

**Date**: 2026-06-17
**Status**: Draft
**Purpose**: Track missing features, deferred items, and optimization opportunities outside the OKF plan.

---

## Priority Matrix

| Priority | Area | Status |
|----------|------|--------|
| Critical | Notifications | Missing |
| Critical | Onboarding | Missing |
| High | AI Features | Deferred |
| High | Testing | Minimal |
| High | Post Editing | Missing |
| Medium | Search Upgrade | substring only |
| Medium | Data Export/Import | Missing |
| Medium | Public API | Empty |
| Medium | PWA / Mobile | No service worker |
| Medium | Moderation | Missing |
| Medium | Rich Text Editing | Plain textarea |
| Low | User Analytics | Internal only |
| Low | Trending / Explore | Missing |
| Low | Community Governance | Missing |
| Low | Accessibility Gaps | Partial |

---

## Critical (Must Ship Before or With OKF)

### 1. Notifications

No notification system exists. No table, no UI, no push.

**What to build:**
- `notifications` table in Convex (type, actor, entity, read status, timestamp)
- Real-time notification delivery via Convex subscriptions
- Notification bell in navbar with unread count
- Notification preferences (per type: replies, mentions, follows, note suggestions)
- Push notifications via Web Push API (requires service worker — see PWA)
- Email notification digest (daily/weekly summary)

**Files to create:**
- `src/convex/notifications.ts` — CRUD + real-time queries
- `src/lib/components/NotificationBell.svelte` — dropdown with feed
- `src/lib/components/NotificationItem.svelte` — single notification
- `src/routes/settings/notifications/+page.svelte` — preferences

**Dependencies**: PWA (for push), Auth (for email)

---

### 2. Onboarding

No first-time user experience. Users hit a username gate with no guidance.

**What to build:**
- Welcome flow after first sign-up (3-5 steps)
  1. Set username (currently a blocking gate, make it friendly)
  2. Pick topics of interest (from predefined list)
  3. Add first source (guided — show popular sources per topic)
  4. Follow suggested users (based on selected topics)
  5. See first feed (personalized from selections)
- "Getting started" checklist on home page (add source, follow user, create first note)
- Tooltips/spotlights for key features (feed tabs, collections, knowledge feed)
- Popular/featured sources for new users to browse

**Files to create:**
- `src/lib/components/onboarding/OnboardingWizard.svelte`
- `src/lib/components/onboarding/TopicPicker.svelte`
- `src/lib/components/onboarding/SourceSuggester.svelte`
- `src/lib/components/onboarding/UserSuggester.svelte`
- `src/routes/onboarding/+page.svelte`
- `src/lib/components/GettingStartedChecklist.svelte`

**Dependencies**: Topics/tags taxonomy, Featured sources list

---

## High Priority (Ship With OKF Layer)

### 3. AI Features

Schema exists (`post_embeddings`, `ai_summary_cache`), dependencies installed (`@convex-dev/rag`, `@openrouter/ai-sdk-provider`), but all code is placeholder.

**What to build:**

**Phase A: Embeddings + Semantic Search**
- Generate embeddings for source items on ingestion
- Store in `post_embeddings` (rename to `content_embeddings`)
- Semantic similarity search for "find related content"
- Powers note suggestions (find sources related to user's topics)

**Phase B: AI Summarization**
- Summarize source items on ingestion (store in `ai_summary_cache`)
- Summarize notes for snippet generation
- Power the knowledge feed suggestions

**Phase C: Topic Detection (OKF dependency)**
- Classify source items into topics
- Match topics to user's existing notes
- Generate pending change suggestions for notes

**Phase D: Personalization (FYP)**
- Personalized feed ranking based on reading history
- "For You" tab in feed
- Topic affinity scoring

**Files to create/modify:**
- `src/convex/ai/embeddings.ts` — embedding generation pipeline
- `src/convex/ai/summaries.ts` — summarization pipeline
- `src/convex/ai/topics.ts` — topic classification
- `src/convex/ai/personalization.ts` — feed personalization
- Modify `sources.ts` to trigger embedding + summary on ingestion

**Dependencies**: OpenRouter API key, RAG component configuration

---

### 4. Testing

Only 7 test files, all utility helpers. Zero component/E2E/Convex function tests.

**What to build:**

**Unit Tests (Convex):**
- Test all CRUD operations (posts, comments, votes, collections, communities)
- Test feed queries (ranking, filtering, pagination)
- Test source ingestion (upsert, dedup, fanout)
- Test auth flows (getAuthUser, username gate, community membership)

**Component Tests (Svelte):**
- Test key components: FeedItem, PostCreator, CommentSection, CollectionForm
- Use Vitest + svelte-testing-library

**E2E Tests (Playwright):**
- Critical user flows: sign up → onboarding → add source → read → create note
- Community flow: create → invite → post → discuss
- Settings flow: change username, manage sources

**Files to create:**
- `src/convex/__tests__/` — Convex function tests
- `src/lib/components/__tests__/` — Component tests
- `tests/e2e/` — Playwright E2E tests
- `playwright.config.ts`

**Dependencies**: None (can start immediately)

---

### 5. Post Editing

Posts can't be edited after creation. Tags can't be added/removed.

**What to build:**
- `updatePost` mutation (title, body, tags — same validation as create)
- Re-upload to R2 if body changes and exceeds limit
- Edit history (optional — could defer)
- UI: Edit button on own posts → inline edit mode
- Tag editing: add/remove tags after creation
- Community moderators can edit posts (with audit trail)

**Files to modify:**
- `src/convex/posts.ts` — add `update` mutation
- `src/routes/post/[id]/[[slug]]/+page.svelte` — edit UI
- `src/lib/components/PostEditor.svelte` — inline edit component

**Dependencies**: None

---

## Medium Priority (Ship After OKF Layer)

### 6. Search Upgrade

Current: `title.toLowerCase().includes(search)` on 2000 candidates.

**What to build:**
- Convex FTS1 (full-text search) index on `okf_concepts` and `okf_notes`
- Search across entities: notes, concepts, users, communities, bundles
- Search result ranking (relevance + recency + engagement)
- Search suggestions/autocomplete
- Recent searches history
- Saved searches (alert when new content matches)

**Files to create/modify:**
- Add FTS1 indexes to schema
- `src/convex/search.ts` — unified search queries
- `src/lib/components/SearchBar.svelte` — enhanced search UI
- `src/routes/search/+page.svelte` — search results page

**Dependencies**: OKF schema (new tables need FTS indexes)

---

### 7. Data Export/Import

No way to export data. No OPML import. No GDPR compliance.

**What to build:**

**Export:**
- Export all user data as JSON (profile, notes, concepts, subscriptions)
- Export notes as OKF bundle (markdown files with frontmatter) — OKF plan dependency
- Export sources as OPML (for migrating to other RSS readers)
- Export reading history

**Import:**
- Import sources from OPML (from Pocket, Feedly, Inoreader)
- Import bookmarks from HTML (from Pocket, Raindrop.io)
- Import from Reddit (saved posts)
- Import from Twitter (bookmarks/likes)

**Files to create:**
- `src/convex/export.ts` — export queries + actions
- `src/convex/import.ts` — import mutations
- `src/routes/settings/export/+page.svelte` — export UI
- `src/routes/settings/import/+page.svelte` — import UI

**Dependencies**: OKF bundles (for OKF export)

---

### 8. Public API

`http.ts` is empty. No REST/GraphQL API.

**What to build:**
- REST API for core entities (notes, concepts, sources, bundles)
- API key management (generate, revoke, rate limit)
- API documentation (OpenAPI/Swagger)
- Webhooks for events (new source item, note updated, etc.)
- Rate limiting per API key

**Files to create/modify:**
- `src/convex/http.ts` — route handlers
- `src/convex/apiKeys.ts` — API key CRUD
- `docs/api/` — API documentation
- `src/routes/api/v1/` — API versioning

**Dependencies**: None (can use Convex HTTP router)

---

### 9. PWA / Mobile

No manifest, no service worker, no offline support.

**What to build:**
- `static/manifest.json` — PWA manifest
- Service worker for offline caching (static assets + cached pages)
- Push notification support (Web Push API)
- App-like install prompt
- Offline reading (cache recent feed items)
- Background sync for pending actions

**Files to create:**
- `static/manifest.json`
- `src/service-worker.ts`
- `src/routes/+layout.webmanifest.ts`
- `src/lib/stores/offline.ts` — offline state management

**Dependencies**: Notifications (for push)

---

### 10. Moderation

No moderation tools at all.

**What to build:**
- Report system (post, comment, user — with reason categories)
- Moderation queue (admin/community admin view)
- Ban/mute users
- Community rules (structured rules displayed on community page)
- Auto-moderation (flag content with specific keywords/patterns)
- Audit trail for moderation actions

**Files to create:**
- `src/convex/moderation.ts` — report + moderation CRUD
- `src/lib/components/ReportDialog.svelte`
- `src/routes/admin/moderation/+page.svelte`
- `src/lib/components/CommunityRules.svelte`

**Dependencies**: Communities, Admin console

---

### 11. Rich Text Editing

Plain textarea for post/note creation.

**What to build:**
- Markdown editor with live preview (use `svelte-streamdown`)
- Toolbar: bold, italic, heading, link, code, image, list
- Image upload to R2 (for inline images in notes/posts)
- Link preview/OG extraction (auto-fetch title, description, image for link posts)
- Draft auto-save (localStorage + optional Convex persistence)

**Files to create:**
- `src/lib/components/MarkdownEditor.svelte`
- `src/lib/components/ImageUploader.svelte`
- `src/lib/components/LinkPreview.svelte`
- Modify submit page to use new editor

**Dependencies**: R2 upload (already exists)

---

## Low Priority (Ship When Ready)

### 12. User-Facing Analytics

Admin has dashboards but users don't.

**What to build:**
- Reading stats (articles read, time spent, topics covered)
- Note growth over time
- Source diversity metrics
- Knowledge graph visualization stats
- Weekly/monthly reading digest

---

### 13. Trending / Explore

No discovery surface for new content.

**What to build:**
- Trending topics (by note creation velocity)
- Trending sources (by subscription growth)
- "Explore" page with topic browsing
- Recommended sources (collaborative filtering)
- Suggested users to follow

---

### 14. Community Governance

No polls, no pinned posts, no invites.

**What to build:**
- Pinned posts in communities
- Community polls/voting
- Invite links/codes
- Community analytics (member growth, engagement)
- Community description/tags for discoverability

---

### 15. Accessibility Gaps

Good foundation but missing pieces.

**What to build:**
- Skip-to-content link
- `aria-live` regions for dynamic content (feed updates, chat messages)
- `prefers-reduced-motion` support
- Alt text management for images
- Keyboard navigation audit + fixes

---

## OKF Dependencies

These roadmap items directly affect the OKF plan:

| OKF Feature | Depends On | Roadmap Item |
|-------------|-----------|--------------|
| AI synthesis engine | AI Features | #3 |
| Knowledge feed notifications | Notifications | #1 |
| OKF export to bundle | Data Export | #7 |
| Search notes | Search Upgrade | #6 |
| Onboarding to notes | Onboarding | #2 |
| Version history editing | Post Editing | #5 |
| Note image uploads | Rich Text Editing | #11 |
| Note recommendations | Trending/Explore | #13 |

---

## Execution Order

```
Phase 1 (Parallel with OKF):
  → #1 Notifications (critical for re-engagement)
  → #2 Onboarding (critical for retention)
  → #5 Post Editing (quick win, users expect it)

Phase 2 (OKF Launch):
  → #3 AI Features Phase A+B (embeddings + summaries)
  → #4 Testing (protect against regressions)
  → #6 Search Upgrade (needed for notes)

Phase 3 (Post-OKF):
  → #3 AI Features Phase C+D (topics + personalization)
  → #7 Data Export/Import (OKF export)
  → #11 Rich Text Editing (note editor)

Phase 4 (Growth):
  → #8 Public API (ecosystem)
  → #9 PWA (mobile experience)
  → #10 Moderation (community health)
  → #13 Trending/Explore (discovery)
```
