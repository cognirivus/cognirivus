# OKF + Flue Implementation Plan

**Status**: SUPERSEDED  
**Date**: 2026-06-18  
**Decision**: Build OKF-light as the durable Cognirivus knowledge layer, and use Flue on
Cloudflare Workers as the background agent runtime that produces structured note suggestions.

> **SUPERSEDED (2026-06-23)**: This plan has been superseded. Flue Cloudflare Worker was removed.
> AI synthesis now runs directly in Convex `internalAction` using OpenRouter API. See
> `src/convex/knowledgeNotes.ts` for the current implementation. The architecture plan
> (`2026-06-21-knowledge-system-architecture.md`) remains the authoritative reference for the
> knowledge system schema and design.

---

## Summary

Cognirivus should not replace OKF with Flue. Flue solves a different problem: it runs complex
agentic processes in the background and returns structured outputs. OKF is still needed as the
product data model for user-owned notes, pending review, citations, versions, visibility, search,
sharing, and knowledge graph features.

The first implementation should be narrower than the earlier OKF plan:

- Keep existing `source_items` as the raw content layer for now.
- Add OKF-light tables for notes, pending changes, versions, source links, and synthesis jobs.
- Deploy a Flue agent as a separate Cloudflare Worker.
- Call Flue from Convex background workflows/actions.
- Store Flue output as human-reviewable pending changes.
- Show real-time background processing state in the UI.

---

## Responsibility Boundary

| Layer | Owns | Does Not Own |
| --- | --- | --- |
| Convex | Auth, source of truth, job state, R2 metadata, OKF tables, user review, realtime UI | Long-form agent reasoning |
| Flue Worker | Agent orchestration, topic matching, synthesis, structured suggestions | Direct DB writes, auth decisions, permanent note updates |
| R2 | Large source bodies and note/version bodies | Queryable metadata |
| SvelteKit UI | Review workflow, job visibility, note browsing | Background execution |

This boundary keeps Flue swappable. If Flue fails or changes, Cognirivus still has durable job rows,
pending changes, and review history.

---

## Core Product Flow

1. A user consumes a `source_items` row through an explicit signal.
2. Convex records a synthesis job with an idempotency key.
3. The UI immediately shows that note analysis is queued.
4. A Convex workflow/workpool process prepares context.
5. Convex fetches the source body from inline text or R2.
6. Convex gathers candidate OKF notes for that user.
7. Convex calls the Flue Cloudflare Worker webhook.
8. Flue returns a typed suggestion.
9. Convex validates the response and stores an `okf_note_pending_changes` row.
10. The UI shows the suggestion as ready for human review.
11. The user approves, edits, or rejects.
12. Approval writes a note version and updates the current note body.

No Flue output should directly update a committed note in the first release.

---

## Consumption Signals

Start with high-intent events only:

- User saves a source item to a collection.
- User upvotes a source item or its shared post.
- User clicks a manual `Mark as read` / `Use for knowledge` action.
- User opens a source item and confirms it should feed notes.

Avoid automatic processing from page view alone in the first release. Page views are noisy and can
create low-quality suggestions.

Later signals:

- Reading dwell time.
- Scroll completion.
- Repeated topic interaction.
- Batch processing of recent reads.

---

## Data Model

### `okf_notes`

Personal, user-owned knowledge notes. One note can grow from many consumed source items.

Important fields:

- `userAuthId`
- `topic`
- `title`
- `description`
- `body`
- `r2Key`
- `snippet`
- `tags`
- `visibility`
- `status`
- `currentVersion`
- `sourceCount`
- `linkCount`
- `lastConsumedAt`
- `createdAt`
- `updatedAt`

Indexes:

- `by_userAuthId`
- `by_userAuthId_and_topic`
- `by_userAuthId_and_updatedAt`
- `by_visibility`
- `by_lastConsumedAt`

### `okf_note_pending_changes`

Human-review queue for Flue output.

Important fields:

- `userAuthId`
- `noteId`
- `sourceItemId`
- `jobId`
- `changeType`: `append | rewrite | link | create_note`
- `sectionTarget`
- `suggestedTitle`
- `suggestedTopic`
- `suggestedContent`
- `changeSummary`
- `aiReasoning`
- `citations`
- `confidence`
- `status`: `pending | approved | rejected | applied`
- `createdAt`
- `reviewedAt`
- `reviewedByAuthId`

Indexes:

- `by_userAuthId_and_status_and_createdAt`
- `by_noteId_and_status`
- `by_sourceItemId`
- `by_jobId`

### `okf_note_versions`

Version metadata. Full bodies go to R2 when larger than the Convex inline limit.

Important fields:

- `noteId`
- `versionNumber`
- `body`
- `r2Key`
- `snippet`
- `changeSummary`
- `citations`
- `createdBy`
- `createdAt`

Indexes:

- `by_noteId_and_versionNumber`
- `by_noteId_and_createdAt`

### `okf_note_sources`

Provenance link between notes and consumed source items.

Important fields:

- `noteId`
- `sourceItemId`
- `contributionType`: `read | saved | upvoted | manual`
- `addedInVersion`
- `createdAt`

Indexes:

- `by_noteId`
- `by_sourceItemId`
- `by_noteId_and_sourceItemId`

### `okf_synthesis_jobs`

Realtime background-processing state.

Important fields:

- `userAuthId`
- `sourceItemId`
- `idempotencyKey`
- `agentName`
- `agentVersion`
- `status`
- `stage`
- `progressMessage`
- `attemptCount`
- `flueRunId`
- `pendingChangeId`
- `errorCode`
- `errorMessage`
- `createdAt`
- `startedAt`
- `updatedAt`
- `finishedAt`

Status values:

- `queued`
- `running`
- `ready_for_review`
- `skipped`
- `failed`
- `cancelled`

Stage values:

- `queued`
- `preparing_context`
- `loading_source_body`
- `matching_notes`
- `calling_flue`
- `analyzing`
- `validating_output`
- `saving_suggestion`
- `ready_for_review`
- `failed`

Indexes:

- `by_userAuthId_and_createdAt`
- `by_userAuthId_and_status_and_updatedAt`
- `by_sourceItemId`
- `by_idempotencyKey`

---

## Flue Worker

Deploy Flue separately on Cloudflare Workers.

Initial agent:

- Name: `note-synthesis`
- Trigger: webhook
- Runtime: Cloudflare Worker
- Output: typed JSON validated by `valibot`
- Auth: shared secret or HMAC from Convex action to Worker

Input shape:

```typescript
type NoteSynthesisInput = {
  jobId: string;
  userAuthId: string;
  sourceItem: {
    id: string;
    title: string;
    url: string;
    snippet: string;
    body: string;
    publishedAt: number;
    sourceTitle?: string;
    sourceType?: string;
  };
  candidateNotes: Array<{
    id: string;
    topic: string;
    title: string;
    snippet: string;
    body: string;
    updatedAt: number;
  }>;
  constraints: {
    maxSuggestedContentChars: number;
    requireCitations: true;
    outputMode: 'pending_change_only';
  };
};
```

Output shape:

```typescript
type NoteSynthesisOutput = {
  action: 'update_existing_note' | 'create_new_note' | 'skip';
  matchedNoteId?: string;
  proposedTopic?: string;
  proposedTitle?: string;
  changeType?: 'append' | 'rewrite' | 'link' | 'create_note';
  sectionTarget?: string;
  suggestedContent?: string;
  changeSummary: string;
  aiReasoning: string;
  citations: Array<{
    sourceItemId: string;
    title: string;
    url: string;
  }>;
  confidence: 'low' | 'medium' | 'high';
  skipReason?: string;
};
```

The Worker should not know Convex secrets beyond the webhook auth mechanism. It should not write to
Convex directly in the first version.

---

## Convex Background Orchestration

Use Convex as the durable coordinator.

Functions to add:

- `okf.markSourceItemConsumed`
- `okf.listSynthesisJobs`
- `okf.listPendingChanges`
- `okf.approvePendingChange`
- `okf.rejectPendingChange`
- `okf.retrySynthesisJob`
- `okf.cancelSynthesisJob`

Internal functions/actions:

- `okf_internal.createSynthesisJob`
- `okf_internal.updateSynthesisJobStage`
- `okf_internal.loadSynthesisContext`
- `okf_internal.savePendingChange`
- `okf_actions.runSynthesisJob`
- `okf_actions.callFlueNoteSynthesis`

Workflow steps:

1. Claim queued job.
2. Mark `preparing_context`.
3. Load source item and verify user access through `user_source_items`.
4. Fetch full body from R2 if `r2Key` exists.
5. Load candidate notes.
6. Call Flue Worker.
7. Validate response shape and size limits.
8. Store pending change or mark skipped.
9. Mark job terminal.

Each step must be idempotent. Re-running the same `idempotencyKey` must not create duplicate pending
changes.

---

## UI Updates

### Source Item Surfaces

On `/source/[sourceItemId]` and feed item actions:

- Add `Use for knowledge` / `Mark as read` action.
- Show job status when processing exists for the current user.
- Show `Suggestion ready` with link to `/knowledge` when complete.
- Show retry affordance for failed jobs.

### Knowledge Feed

Create `/knowledge`.

Sections:

- `Processing`: active synthesis jobs.
- `Ready for review`: pending changes grouped by note/topic.
- `Recently handled`: approved/rejected/skipped suggestions.

Actions:

- Approve.
- Edit then approve.
- Reject.
- Retry failed job.
- Open source.
- Open note.

### Sidebar/Nav

Add a compact indicator:

- Pending review count.
- Optional active processing count.

This should come from Convex subscriptions to `okf_note_pending_changes` and `okf_synthesis_jobs`.

### Status Copy

Use direct, observable messages:

- `Queued for note analysis`
- `Loading source content`
- `Finding related notes`
- `Flue is synthesizing a suggestion`
- `Validating suggestion`
- `Ready for review`
- `Skipped: no useful note update found`
- `Failed: retry available`

---

## Implementation Phases

### Phase 1: OKF-Light Backend

- Add OKF-light schema.
- Add public queries for notes, pending changes, and synthesis jobs.
- Add mutations for review actions.
- Add internal helpers for note body storage and version creation.
- Keep source content in `source_items`; do not create `okf_concepts` yet.

### Phase 2: Consumption and Jobs

- Add `markSourceItemConsumed`.
- Add idempotent job creation.
- Add access checks against `user_source_items` and owned shares.
- Add job listing for realtime UI.

### Phase 3: Flue Cloudflare Worker

- Create Flue Worker project.
- Add `note-synthesis` webhook agent.
- Add structured input/output schemas.
- Add webhook auth.
- Add local test payloads.
- Deploy to Cloudflare Workers.

### Phase 4: Convex to Flue Integration

- Add action to call Flue Worker.
- Add workflow/workpool orchestration.
- Add stage updates before and after each long-running step.
- Add retries for transient Worker/model failures.
- Add terminal failure taxonomy.

### Phase 5: Review UI

- Add `/knowledge`.
- Add processing and pending-change panels.
- Add approve/edit/reject/retry flows.
- Add source item status badges.
- Add sidebar counts.

### Phase 6: Approval and Versioning

- Apply approved changes to notes.
- Store large note bodies in R2.
- Create version rows.
- Create provenance rows in `okf_note_sources`.
- Enforce plan-based version retention later, not in the first cut.

### Phase 7: Intelligence Improvements

- Add embeddings/RAG note matching.
- Add topic clustering.
- Add link suggestions between notes.
- Add batch synthesis for multiple consumed items.
- Add notification integration for ready suggestions.

---

## Error Handling

Failure classes:

- `access_denied`
- `source_missing`
- `source_body_unavailable`
- `flue_auth_failed`
- `flue_timeout`
- `flue_invalid_output`
- `model_refusal`
- `no_useful_update`
- `storage_failed`
- `unknown`

Rules:

- User-visible failures should be short and actionable.
- Raw provider errors should stay internal.
- Failed jobs should be retryable unless access or source state makes retry impossible.
- Invalid Flue output should never create a pending change.

---

## Security and Privacy

- Convex must verify the user can access the source item before processing.
- Flue payloads should include only the source body and candidate notes needed for the job.
- Flue should not receive WorkOS identity details beyond `userAuthId`.
- Flue webhook calls must be authenticated.
- Do not send secrets through prompts.
- Do not store source or note bodies directly in job rows.
- Keep large text in R2 and pass it transiently to Flue during processing.

---

## Testing Plan

Backend tests:

- Creating a job is idempotent.
- Unauthorized users cannot process inaccessible source items.
- Job stage transitions are valid.
- Duplicate Flue callbacks/responses do not create duplicate pending changes.
- Invalid Flue output marks job failed.
- Approval creates exactly one note version.
- Rejection does not mutate note body.

UI tests:

- Source item shows queued/running/ready/failed states.
- Knowledge feed updates from Convex subscriptions.
- Approve/edit/reject actions update the UI.
- Long titles and error messages do not overflow.

Manual verification:

- Run `pnpm check`.
- Run `pnpm lint`.
- Do not run `pnpm build` without explicit permission.
- Do not run `npx convex dev` without explicit permission.

---

## Open Questions

1. Should the first consumption trigger be only `Use for knowledge`, or should save/upvote trigger
   automatically?
2. Should Flue run one source item at a time first, or should the first useful version batch several
   recent reads together?
3. Should low-confidence suggestions appear in the review feed, or be marked skipped by default?
4. Should approved note updates be append-only in v1, with rewrite suggestions enabled later?
5. Should users be able to disable background note synthesis globally?

---

## Initial Recommendation

Ship the smallest trustworthy loop first:

1. Manual `Use for knowledge` action.
2. One Flue Cloudflare Worker agent.
3. One source item in, one pending OKF change out.
4. Realtime processing state in `/knowledge`.
5. Human approval before any note body changes.

This validates the product promise without overbuilding the full OKF graph, migration, embeddings,
or automation stack upfront.
