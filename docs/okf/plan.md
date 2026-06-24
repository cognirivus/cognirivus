# OKF as Core Content Unit — Architectural Plan

**Status**: Draft
**Date**: 2026-06-17
**Decision**: Personal OKF notes are the core unit. Source items feed into notes. AI suggests enrichments, user curates. Versioned with plan-based limits.

---

## Overview

Cognirivus shifts from a "read + discuss" feed platform to a **knowledge graph platform**. Users consume content from multiple sources (Twitter, RSS, Reddit, YouTube). That content feeds into personal OKF notes — one per topic. AI synthesizes. User curates. Over time, notes become a personal wiki. The wiki drives recommendations for content and people.

### Two-Layer Model

```
┌─────────────────────────────────────────────────────┐
│  KNOWLEDGE LAYER                                    │
│                                                     │
│  Personal OKF Notes ← grow with consumption        │
│  Notes link to each other → knowledge graph         │
│  Notes link to source concepts → provenance         │
│  AI suggests enrichments → user curates             │
│  Private by default → share when ready              │
│  Versioned with plan-based limits                   │
└────────────────────────┬────────────────────────────┘
                         │ reads / consumes
┌────────────────────────┴────────────────────────────┐
│  CONTENT LAYER                                      │
│                                                     │
│  Sources → okf_concepts (raw ingested content)      │
│  Auto-created as OKF concepts (public)              │
│  Same ingestion pipeline as today                   │
└─────────────────────────────────────────────────────┘
```

---

## Decisions

| Decision | Choice |
|----------|--------|
| Core unit | Personal OKF notes (one per topic per user) |
| Content layer | Source items stored as `okf_concepts` (raw ingested content) |
| Note creation | Both auto (on first read) and manual |
| Note enrichment | AI suggests + user curates (like IDE unsaved edits) |
| Synthesis | Append AND rewrite, whatever is necessary |
| Versioning | Full body in R2, metadata in Convex DB |
| Version limits | Plan-based (free: 3, paid: more) |
| Visibility | Notes private by default |
| Graph building | Shared sources (weak connections) + following (strong connections) |
| Frontmatter storage | Structured columns + JSON extensions blob |

---

## Data Model

### `okf_notes` — Personal knowledge notes (one per topic per user)

The core unit. Each note is a wiki page that grows with consumption.

```typescript
okf_notes: defineTable({
  userAuthId: v.string(),
  topic: v.string(),              // "Convex", "React", "AI Safety"
  title: v.string(),              // "Convex DB"
  description: v.optional(v.string()),
  body: v.optional(v.string()),   // Current committed body (inline if <= 1000 chars)
  r2Key: v.optional(v.string()),  // R2 key for large bodies
  snippet: v.string(),            // <= 500 char preview
  tags: v.array(v.string()),
  okf_version: v.optional(v.string()),
  extensions: v.optional(v.record(v.string(), v.any())),
  visibility: v.union(v.literal('private'), v.literal('public')),
  status: v.union(v.literal('auto'), v.literal('user-created')),
  currentVersion: v.number(),
  sourceCount: v.number(),
  linkCount: v.number(),
  lastConsumedAt: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index('by_userAuthId', ['userAuthId'])
.index('by_userAuthId_and_topic', ['userAuthId', 'topic'])
.index('by_userAuthId_and_updatedAt', ['userAuthId', 'updatedAt'])
.index('by_topic', ['topic'])
.index('by_visibility', ['visibility'])
.index('by_lastConsumedAt', ['lastConsumedAt'])
```

### `okf_note_pending_changes` — AI suggestions awaiting user approval

Like unsaved edits in an IDE. Always present, never auto-applied.

```typescript
okf_note_pending_changes: defineTable({
  noteId: v.id('okf_notes'),
  conceptId: v.id('okf_concepts'),
  changeType: v.union(
    v.literal('append'),
    v.literal('rewrite'),
    v.literal('link')
  ),
  sectionTarget: v.optional(v.string()),
  suggestedContent: v.string(),
  aiReasoning: v.string(),
  status: v.union(
    v.literal('pending'),
    v.literal('approved'),
    v.literal('rejected'),
    v.literal('applied')
  ),
  createdAt: v.number(),
  reviewedAt: v.optional(v.number()),
})
.index('by_noteId_and_status', ['noteId', 'status'])
.index('by_conceptId', ['conceptId'])
```

### `okf_note_versions` — Version history (metadata only, bodies in R2)

Every committed change creates a version. Body stored in R2, not in DB.

```typescript
okf_note_versions: defineTable({
  noteId: v.id('okf_notes'),
  versionNumber: v.number(),
  r2Key: v.string(),              // "notes/{noteId}/v{versionNumber}.md"
  changeSummary: v.string(),
  citations: v.array(v.object({
    conceptId: v.id('okf_concepts'),
    conceptTitle: v.optional(v.string()),
    sourceUrl: v.string(),
  })),
  createdBy: v.string(),         // "ai" or userAuthId
  createdAt: v.number(),
})
.index('by_noteId_and_versionNumber', ['noteId', 'versionNumber'])
```

### `okf_note_sources` — Consumption record

Links notes to the source concepts that fed them.

```typescript
okf_note_sources: defineTable({
  noteId: v.id('okf_notes'),
  conceptId: v.id('okf_concepts'),
  contributionType: v.union(
    v.literal('read'),
    v.literal('saved'),
    v.literal('upvoted')
  ),
  addedInVersion: v.number(),
  createdAt: v.number(),
})
.index('by_noteId', ['noteId'])
.index('by_conceptId', ['conceptId'])
```

### `okf_concepts` — Raw source items (input material)

Source-derived content. Public by default. Created by ingestion pipeline.

```typescript
okf_concepts: defineTable({
  type: v.string(),              // "RSS Entry", "Tweet", "Reddit Post", "YouTube Video"
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  resource: v.optional(v.string()),
  tags: v.array(v.string()),
  timestamp: v.optional(v.string()),
  body: v.optional(v.string()),
  r2Key: v.optional(v.string()),
  snippet: v.string(),
  sourceId: v.optional(v.id('sources')),
  sourceType: v.optional(v.string()),
  sourceUrl: v.optional(v.string()),
  contentHash: v.optional(v.string()),
  score: v.number(),
  likes: v.number(),
  dislikes: v.number(),
  commentCount: v.number(),
  status: v.union(v.literal('published'), v.literal('archived')),
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index('by_sourceId_and_createdAt', ['sourceId', 'createdAt'])
.index('by_type', ['type'])
.index('by_createdAt', ['createdAt'])
.index('by_contentHash', ['contentHash'])
```

### `okf_note_links` — Knowledge graph edges

```typescript
okf_note_links: defineTable({
  sourceNoteId: v.id('okf_notes'),
  targetNoteId: v.id('okf_notes'),
  linkText: v.optional(v.string()),
  createdAt: v.number(),
})
.index('by_source', ['sourceNoteId'])
.index('by_target', ['targetNoteId'])
```

### `okf_note_embeddings` — Semantic search

```typescript
okf_note_embeddings: defineTable({
  noteId: v.id('okf_notes'),
  model: v.string(),
  embedding: v.array(v.number()),
})
.index('by_noteId', ['noteId'])
```

### `okf_bundles` — Public shared collections

```typescript
okf_bundles: defineTable({
  slug: v.string(),
  title: v.string(),
  description: v.optional(v.string()),
  visibility: v.union(v.literal('public'), v.literal('private')),
  tags: v.array(v.string()),
  ownerKind: v.union(v.literal('user'), v.literal('community')),
  ownerAuthId: v.optional(v.string()),
  ownerCommunityId: v.optional(v.id('communities')),
  okf_version: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
.index('by_slug', ['slug'])
.index('by_ownerAuthId', ['ownerAuthId'])
.index('by_ownerCommunityId', ['ownerCommunityId'])
.index('by_visibility_and_createdAt', ['visibility', 'createdAt'])
```

### `okf_bundle_items` — Items in bundles

```typescript
okf_bundle_items: defineTable({
  bundleId: v.id('okf_bundles'),
  noteId: v.optional(v.id('okf_notes')),
  conceptId: v.optional(v.id('okf_concepts')),
  note: v.optional(v.string()),
  position: v.number(),
  addedByAuthId: v.string(),
  createdAt: v.number(),
})
.index('by_bundleId_and_position', ['bundleId', 'position'])
```

---

## Versioning Strategy

### Storage Model

- **Current body**: Stored on `okf_notes` row (inline if <= 1000 chars, R2 if larger)
- **Version bodies**: Each version is a separate R2 object at `notes/{noteId}/v{versionNumber}.md`
- **Version metadata**: Stored in `okf_note_versions` (no body — just version number, change summary, citations, timestamps)
- **Read current**: Fetch from `okf_notes.r2Key` (one R2 fetch)
- **Read version N**: Fetch from `okf_note_versions.r2Key` (one R2 fetch)

### Plan-Based Version Limits

| Plan | Version History | Storage |
|------|----------------|---------|
| Free | 3 versions | 3 × ~5KB = 15KB per note |
| Pro | 50 versions | 50 × ~5KB = 250KB per note |
| Team | Unlimited | Unlimited |

When a user on the free plan creates version 4, version 1 is pruned (oldest first). The version metadata stays (for citation history) but the R2 body is deleted.

```typescript
// Version pruning check (in approvePendingChange)
const maxVersions = planLimits[authUser.plan].maxVersions;
const currentVersions = await ctx.db
  .query('okf_note_versions')
  .withIndex('by_noteId_and_versionNumber', q => q.eq('noteId', noteId))
  .collect();

if (currentVersions.length >= maxVersions) {
  // Prune oldest version body from R2 (keep metadata)
  const oldest = currentVersions[0];
  await r2.delete(ctx, oldest.r2Key);
  // Keep the version row for citation history, but mark body as pruned
  await ctx.db.patch(oldest._id, { r2Key: null });
}
```

### Cost Estimate

```
Free plan: 3 versions × 5KB = 15KB per note
1000 free users × 50 notes × 15KB = 750MB in R2
R2 cost: ~$0.01/month (negligible)

Pro plan: 50 versions × 5KB = 250KB per note
100 pro users × 50 notes × 250KB = 1.25GB in R2
R2 cost: ~$0.02/month (negligible)
```

---

## The Flow: How Notes Grow

```
1. USER FOLLOWS SOURCES (Twitter, RSS, Reddit, YouTube)
         ↓
2. CONTENT ARRIVES (okf_concepts — raw source items)
         ↓
3. USER READS A SOURCE ITEM
   "Interesting article about Convex Auth"
         ↓
4. SYSTEM DETECTS TOPIC
   - AI classifies content into topic
   - Matches against user's existing notes
   - If no match: "Create a [topic] note?"
         ↓
5. USER APPROVES NOTE CREATION (or uses existing note)
         ↓
6. AI READS THE SOURCE + EXISTING NOTE
   - Source says: "Convex Auth uses WorkOS + JWT"
   - Existing note already has: "Convex uses WorkOS"
   - AI suggests: merge into "Convex Auth" section, add JWT detail
         ↓
7. PENDING CHANGE CREATED (okf_note_pending_changes)
   - suggestedContent = proposed markdown
   - aiReasoning = explanation
   - status = "pending"
         ↓
8. USER REVIEWS IN KNOWLEDGE FEED
   - APPROVE → apply change, create new version
   - REJECT → discard
   - EDIT → modify suggestion, then approve
         ↓
9. ON APPROVAL
   a. Apply change to note body
   b. Upload new body to R2 → "notes/{noteId}/v{N}.md"
   c. Create version record (okf_note_versions)
   d. Add citation to version's citations array
   e. Link source to note (okf_note_sources)
   f. Update note metadata (sourceCount, currentVersion, updatedAt)
   g. Prune old versions if over plan limit
   h. Check for cross-link suggestions to other notes
         ↓
10. KNOWLEDGE GRAPH EXPANDS
    - Note grows richer with each approved change
    - Cross-links to other notes suggested by AI
    - Public notes visible to followers
    - Recommendations improve with more data
```

---

## AI Synthesis Model

When a new source is consumed:

1. **Topic detection**: AI classifies the source into a topic (or uses user's tags)
2. **Note matching**: Find user's note on that topic
3. **Section mapping**: AI identifies which section of the note the source relates to
4. **Synthesis suggestion**: AI proposes how to integrate the new insight
   - Append: "Add new section: 'Convex Auth JWT Flow'"
   - Rewrite: "Update 'Convex Auth' section to include JWT detail"
   - Link: "Your Convex note could link to your WorkOS note"
5. **User review**: User sees the suggestion, approves/edits/rejects
6. **Body update**: Accepted suggestion modifies the note body
7. **Citation**: Source added to the version's citations array

### Note Body Structure (After Multiple Reads)

```markdown
# Convex

## What is Convex?
A backend platform combining database, functions, and real-time...
[Cited: 3 articles, 1 tweet, 1 docs page]

## Convex vs Firebase
Key differences: real-time by default, no cold starts...
[Cited: 2 comparison articles, 1 Reddit thread]

## Convex Auth
Uses WorkOS + JWT. Supports custom providers...
[Cited: 1 docs page, 1 blog post, 1 tweet]

## My Experience
Set up Convex in my SvelteKit project...
[User's own notes — no citations]

## Sources
1. [Article: Convex Launch](url) — added in v1
2. [Tweet: @user](url) — added in v2
3. [Reddit: r/programming](url) — added in v3
4. [Docs: Convex Auth](url) — added in v5
5. [Blog: My setup](url) — added in v7
```

---

## Feed Structure

### Content Feed (what's new)

Source items from followed sources. Same ranking as today.

| Tab | Sort |
|-----|------|
| `new` | `createdAt` desc |
| `top` | `score` desc, then `createdAt` desc |
| `discussed` | `commentCount` desc, then `createdAt` desc |

### Knowledge Feed (what to learn)

```
┌─────────────────────────────────────────────────┐
│  PENDING UPDATES                                │
│                                                 │
│  Convex note — 2 pending changes                │
│  • +1 section from "Convex Auth Deep Dive"      │
│  • +1 rewrite from "Convex vs Firebase"         │
│                                                 │
│  React note — 1 pending change                  │
│  • +1 citation from "React 19 Changes"          │
│                                                 │
│  SUGGEST NEW NOTES                              │
│  • "tRPC" — based on 3 sources you read         │
│  • "Svelte 5" — based on your reading           │
│                                                 │
│  PEOPLE TO FOLLOW                               │
│  • User X — has 5 notes matching your interests │
│  • User Y — reads the same sources as you       │
└─────────────────────────────────────────────────┘
```

---

## Social Layer

| Feature | How It Works |
|---------|-------------|
| Follow users | See their public notes in your feed |
| Public notes | Visible to followers, can be bundled |
| Bundles | Curated collections of public notes |
| Content recs | "Users with similar notes also read..." |
| People recs | "User X has 5 notes matching your interests" |
| Topic recs | "Your Convex note could link to your React note" |

---

## Frontend Routes

| Route | Purpose |
|-------|---------|
| `/feed` | Content feed — source items |
| `/knowledge` | Knowledge feed — pending changes, suggestions |
| `/note/[id]` | Note detail page |
| `/note/[id]/history` | Version history |
| `/note/[id]/history/[version]` | Specific version view |
| `/bundles` | Browse all bundles |
| `/bundles/[slug]` | Bundle detail |
| `/bundles/new` | Create new bundle |
| `/submit` | Create new note |
| `/topic/[topic]` | Browse notes by topic |
| `/graph/[id]` | Knowledge graph visualization |

---

## New Components

- **`NoteCard.svelte`** — note preview in feed (topic, snippet, source count, version)
- **`PendingChangeCard.svelte`** — AI suggestion with approve/reject/edit
- **`NoteEditor.svelte`** — markdown editor with frontmatter fields
- **`VersionHistory.svelte`** — version timeline with diff view
- **`VersionDiff.svelte`** — shows changes between two versions
- **`KnowledgeFeed.svelte`** — pending changes + suggestions + recommendations
- **`NoteGraph.svelte`** — knowledge graph visualization (incoming/outgoing links)
- **`TopicBadge.svelte`** — colored badge for note topic
- **`CitationList.svelte`** — sources that contributed to a version
- **`AddToBundleDialog.svelte`** — save note/concept to bundle

---

## What Stays from Current Platform

- Source ingestion pipeline (adds Twitter, Reddit source types)
- Communities, chat, DMs
- Auth (WorkOS)
- Rate limiting, security, admin
- R2 storage for large content

## What Gets Replaced

| Old | New |
|-----|-----|
| `posts` table | `okf_notes` + `okf_note_versions` |
| `post_comments` | Comments on notes |
| `post_votes` | Votes on notes |
| `source_items` | `okf_concepts` (raw content) |
| `source_collections` | `okf_bundles` (hold notes or concepts) |
| Feed (mixed posts + source items) | Content feed + Knowledge feed |

---

## Implementation Phases

| Phase | Scope | Complexity |
|-------|-------|------------|
| 1. Schema | Create all new tables | Medium |
| 2. Notes CRUD | Create, read, update notes with versioning | High |
| 3. Pending changes | AI suggestion → pending → approve/reject → commit | High |
| 4. Versioning | R2 storage, plan limits, pruning | Medium |
| 5. Source ingestion | Add Twitter/Reddit types, store as `okf_concepts` | Medium |
| 6. Topic detection | AI classifies sources into topics | Medium |
| 7. Synthesis engine | AI reads source + note, generates pending change | High |
| 8. Content feed | Feed queries `okf_concepts` | Medium |
| 9. Knowledge feed | Pending changes, suggestions, recommendations | High |
| 10. Social features | Follow users, public notes, bundles | Medium |
| 11. Graph features | Cross-links, semantic similarity | Medium |
| 12. Migration | Migrate existing posts/source_items | High |
| 13. Cleanup | Remove old tables, update components | Low |

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Migration data loss | High | Dual-write period, backup, idempotent migration |
| AI synthesis quality | Medium | User always approves, version history for rollback |
| Version storage cost | Low | R2 is cheap, plan limits control growth |
| Feed query performance | Medium | Same indexes as current, pagination unchanged |
| Frontend regression | Medium | Feature flag, gradual rollout |
