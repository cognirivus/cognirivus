# Knowledge System Architecture Plan

**Date**: 2026-06-21  
**Status**: Final - Ready for Implementation  
**Rating**: 9.7/10 (Final Architecture Review)

> **UPDATE (2026-06-23)**: Flue Cloudflare Worker has been removed. All AI synthesis now runs
> directly in Convex `internalAction` functions using the OpenRouter API (`@openrouter/ai-sdk-provider`
> + Vercel AI SDK `generateObject`). The `flue/` directory no longer exists. Environment variables
> `FLUE_KNOWLEDGE_SYNTHESIS_URL`, `FLUE_KNOWLEDGE_EXTRACT_URL`, and `FLUE_WEBHOOK_SECRET` have been
> removed. The synthesis agent prompt and output schema are now inline in `src/convex/knowledgeNotes.ts`.

---

## Executive Summary

Replace the OKF (Obsidian Knowledge Framework) system with a comprehensive Knowledge Operating System (KOS). The system features:

- **36 tables** across 8 layers
- **Claim-centric modeling** with competing truths
- **Source versioning** for temporal correctness
- **Knowledge domains** for high-level organization
- **Bloom-style mastery** for educational depth
- **Knowledge paths** for learning sequences
- **Contradiction resolution** for trust modeling
- **Agent workflows** for multi-agent orchestration
- **Knowledge decay tracking** with verification scheduling
- **Perspective-aware views** for different audiences
- **Confidence intervals** with evidence counts
- **Computed metrics** as materialized views

---

## Architecture Overview

### Table Layers (36 Total)

#### Layer 1: Information Sources (5 tables)
| Table | Purpose |
|-------|---------|
| `information_sources` | Document metadata (URLs, uploads, text) |
| `source_versions` | Temporal snapshots of source content |
| `source_items` | Individual chunks (paragraphs, sections) |
| `source_item_embeddings` | Vector embeddings for semantic search |
| `source_quality_assessments` | Factual reliability, bias, expertise scores |

#### Layer 2: Extraction (6 tables)
| Table | Purpose |
|-------|---------|
| `knowledge_extraction_jobs` | Track extraction requests |
| `knowledge_extracted_candidates` | LLM-extracted candidates |
| `knowledge_candidate_citations` | Source item references for candidates |
| `knowledge_candidate_relationships` | Links between candidates |
| `knowledge_candidate_versions` | Extraction audit trail (model, prompt, timestamp) |
| `knowledge_candidate_votes` | Multi-model consensus (GPT/Claude/Gemini agreement) |

#### Layer 3: Knowledge Graph (10 tables)
| Table | Purpose |
|-------|---------|
| `knowledge_domains` | High-level domains (Physics, Economics, History) |
| `domain_topics` | Domain→topic junction table |
| `knowledge_cells` | Global canonical cells (concepts, entities) |
| `knowledge_cell_versions` | Temporal validity with full metadata |
| `knowledge_claims` | Competing truths about cells |
| `claim_evidence` | Source items supporting claims |
| `claim_assessments` | LLM/human/community consensus scores |
| `knowledge_cell_citations` | Source items supporting cells |
| `knowledge_cell_relationships` | prerequisite_for, contradicts, supports, etc. |
| `knowledge_cell_topics` | Hierarchical topic classification |

#### Layer 4: Personal Knowledge (6 tables)
| Table | Purpose |
|-------|---------|
| `user_knowledge_cells` | User's relationship to cells |
| `user_cell_mastery` | Bloom's taxonomy mastery levels |
| `knowledge_cell_assessments` | LLM/human/community confidence scores |
| `knowledge_cell_embeddings` | Model-agnostic vector storage |
| `knowledge_cell_events` | User interactions (read, practice, review, forget) |
| `knowledge_cell_reminders` | Spaced repetition scheduling |

#### Layer 5: Synthesis (3 tables)
| Table | Purpose |
|-------|---------|
| `knowledge_notes` | Synthesized notes from cells |
| `knowledge_note_contributions` | Cell→note relationships |
| `knowledge_note_blocks` | Block-based content (paragraph, list, quote, diagram, question) |

#### Layer 6: Learning & Education (7 tables)
| Table | Purpose |
|-------|---------|
| `learning_goals` | User's learning objectives (courses, curricula) |
| `learning_goal_topics` | Topic→goal junction table |
| `learning_goal_cells` | Cell→goal junction table |
| `knowledge_paths` | Ordered learning sequences |
| `path_steps` | Path→cell junction with order |
| `knowledge_recommendations` | Personalized learning paths with explanations |
| `conflict_cases` | Contradiction resolution tracking |

#### Layer 7: Agent Orchestration (5 tables)
| Table | Purpose |
|-------|---------|
| `agent_runs` | Universal Flue agent history |
| `agent_memories` | Persistent agent knowledge and preferences |
| `agent_workflows` | Multi-agent pipeline definitions |
| `workflow_steps` | Agent→workflow junction with order |

---

## Key Design Decisions

### 1. Source Quality Assessments (Added)

**Missing table identified in review**. Add to Layer 1:

```ts
source_quality_assessments {
    sourceId,
    assessorType, // llm, human, community
    factualReliability, // 0-1
    biasScore, // -1 to 1
    expertiseScore, // 0-1
    rationale,
    createdAt
}
```

### 2. Remove Duplicate Quality Score

**Problem**: `knowledge_cells.qualityScore` duplicates `knowledge_cell_quality.score`

**Solution**: Remove `qualityScore` from `knowledge_cells`. Use `knowledge_cell_quality` as materialized view.

### 3. Enhanced Cell Versioning

**Problem**: Current versioning only tracks content changes

**Solution**: Expand `knowledge_cell_versions` to include:
- `title`
- `summary`
- `content`
- `metadata` (JSON for additional fields)
- `validFrom`
- `validUntil`

### 4. Entity Uniqueness Constraints

**Problem**: "Einstein", "Albert Einstein", "Albert Einstein (physicist)" become different entities

**Solution**: Add fields to `knowledge_entities`:
- `canonicalName` (normalized)
- `aliases[]` (alternative names)
- `externalIds[]` (Wikipedia ID, etc.)

### 5. Agent Run Output Safety

**Problem**: `agent_runs.output: any` can store arbitrary LLM output

**Solution**: Replace with structured fields:
- `outputSummary` (≤1000 chars)
- `outputR2Key` (full output in R2)
- `tokenUsage` (input/output tokens)
- `cost` (estimated cost)

---

## Implementation Phases

### Phase 1: Core KOS (~15 tables)
**Objective**: Get the basic pipeline working

**Tables**:
- `information_sources`
- `source_items`
- `knowledge_extraction_jobs`
- `knowledge_extracted_candidates`
- `knowledge_candidate_citations`
- `knowledge_candidate_relationships`
- `knowledge_cells`
- `knowledge_cell_citations`
- `knowledge_cell_relationships`
- `knowledge_cell_topics`
- `user_knowledge_cells`
- `knowledge_notes`
- `knowledge_note_contributions`
- `agent_runs`

**Flow**:
```
Document
  ↓
Extraction
  ↓
Knowledge Cells
  ↓
Personal Model
  ↓
AI Notes
```

### Phase 2: Quality & Education (~10 tables)
**Objective**: Add quality scoring and learning features

**Tables**:
- `source_quality_assessments`
- `knowledge_cell_quality`
- `knowledge_cell_assessments`
- `knowledge_recommendations`
- `knowledge_cell_reminders`
- `learning_goals`
- `learning_goal_topics`
- `learning_goal_cells`
- `knowledge_entities`
- `knowledge_entity_relationships`

### Phase 3: Advanced Features (~10 tables)
**Objective**: Multi-model consensus, agent memory, advanced metrics

**Tables**:
- `knowledge_candidate_versions`
- `knowledge_candidate_votes`
- `knowledge_cell_versions`
- `knowledge_cell_events`
- `knowledge_cell_embeddings`
- `agent_memories`
- `agent_workflows`
- `workflow_steps`
- `knowledge_paths`
- `path_steps`

---

## File Changes Summary

### Files to DELETE
- `flue/agents/note-synthesis.ts` (replaced by knowledge-synthesis.ts)

### Files to CREATE
| File | Lines | Purpose |
|------|-------|---------|
| `src/convex/knowledge.ts` | ~1400 | All new table operations |
| `flue/agents/knowledge-cell-extractor.ts` | ~140 | Cell extraction agent |
| `flue/agents/knowledge-verifier.ts` | ~100 | Verification and entity linking |
| `flue/agents/knowledge-auditor.ts` | ~80 | Nightly knowledge decay checks |
| `flue/agents/knowledge-view-generator.ts` | ~80 | Perspective-aware representations |
| `src/convex/lib/rag.ts` | ~100 | RAG helper |

### Files to MODIFY
| File | Changes |
|------|---------|
| `src/convex/schema.ts` | Delete 5 tables, add 36 tables |
| `src/convex/okf.ts` | Rename to knowledgeNotes.ts, update ~110 refs |
| `src/convex/convex.config.ts` | Add rag component |
| `flue/agents/note-synthesis.ts` | Rename to knowledge-synthesis.ts |
| `src/routes/knowledge/+page.svelte` | Update 14 OKF refs |
| `src/routes/source/[sourceItemId]/+page.svelte` | Update 5 OKF refs |
| `src/lib/components/app-sidebar.svelte` | Update 1 OKF ref |
| `.env.example` | Rename FLUE_NOTE_SYNTHESIS_URL, add FLUE_KNOWLEDGE_EXTRACT_URL |
| `flue/README.md` | Update docs for all agents |
| `docs/roadmap.md` | Update OKF references |

---

## Environment Variables

### Rename
```bash
FLUE_NOTE_SYNTHESIS_URL → FLUE_KNOWLEDGE_SYNTHESIS_URL
```

### Add
```bash
FLUE_KNOWLEDGE_EXTRACT_URL=https://your-flue-worker.com/knowledge/extract
FLUE_KNOWLEDGE_VERIFY_URL=https://your-flue-worker.com/knowledge/verify
FLUE_KNOWLEDGE_AUDIT_URL=https://your-flue-worker.com/knowledge/audit
FLUE_KNOWLEDGE_VIEW_URL=https://your-flue-worker.com/knowledge/view
```

---

## Convex Components

Already registered in `convex.config.ts`:
- rateLimiter, r2, presence, actionRetrier, aggregate, crons, migrations, workflow, workpool

**Add**: `rag` component for semantic search

---

## Dependencies

Already installed:
- `@openrouter/ai-sdk-provider@1.5.4`
- `ai@6.0.71`
- `zod@4.3.6` (Flue uses valibot, not Zod)

---

## Risk Mitigation

### 1. OKF Phase 1-6 Preservation
- All existing functionality remains intact
- Modifications are surgical and targeted
- No breaking changes to working code

### 2. Auto-Generated Files
- `_generated/api.d.ts` regenerates automatically
- No manual changes needed
- Run `npx convex dev` to regenerate

### 3. R2 Storage
- Key prefix changes: `okf-notes/` → `knowledge-notes/`
- Existing notes remain accessible
- New notes use new prefix

### 4. Database Migration
- Option A: Fresh tables (no migration)
- Delete old tables, create new ones
- Clean break, no legacy data

---

## Testing Strategy

### Unit Tests
- Knowledge module CRUD operations
- Cell extraction agent
- Assessment aggregation logic
- Quality score computation
- Entity linking
- Claim management
- Contradiction resolution

### Integration Tests
- Extraction → synthesis flow
- Candidate → canonical pipeline
- Source quality tracking
- Multi-model consensus
- Block-based note generation
- Knowledge decay tracking
- Agent workflow execution

### E2E Tests
- Full extraction workflow
- Note creation with cells
- Knowledge gap analysis
- Learning goal tracking
- Entity graph visualization
- Bloom mastery progression
- Knowledge path completion

---

## Success Criteria

1. ✅ 36 tables created and functional
2. ✅ Flue agents deployed and working
3. ✅ Cell extraction produces quality candidates
4. ✅ Deduplication prevents duplicate cells
5. ✅ Candidate lineage fully traced
6. ✅ Multi-model consensus working
7. ✅ Quality scores computed and displayed
8. ✅ Knowledge decay tracked
9. ✅ Entity graph populated
10. ✅ Block-based notes with provenance
11. ✅ Learning goals trackable
12. ✅ Knowledge paths functional
13. ✅ Bloom mastery dimensions working
14. ✅ Contradiction resolution operational
15. ✅ Agent workflows orchestrating
16. ✅ Agent memories persistent
17. ✅ Synthesis uses cells as context
18. ✅ UI displays extraction status and cells
19. ✅ Source quality tracked and displayed
20. ✅ Knowledge gaps identified with explanations
21. ✅ Agent runs logged for all operations
22. ✅ All OKF references renamed to Knowledge

---

## Next Steps

1. **Exit plan mode** ← Current
2. Write plan to `docs/plans/2026-06-21-knowledge-system-architecture.md`
3. Phase A: Schema + Rename
4. Phase B: Knowledge Cells
5. Phase C: Integration
6. Phase D: UI
7. Deploy Flue workers
8. End-to-end testing

---

## Appendix A: Table Definitions

### Layer 1: Information Sources

#### information_sources
```typescript
{
  _id: Id<"information_sources">,
  userId: string,
  sourceType: "url" | "upload" | "text",
  title: string,
  url?: string,
  r2Key?: string,
  rawText?: string, // ≤1000 chars snippet
  status: "pending" | "processing" | "ready" | "failed",
  currentVersionId?: Id<"source_versions">,
  createdAt: number,
  updatedAt: number,
}
```

#### source_versions
```typescript
{
  _id: Id<"source_versions">,
  sourceId: Id<"information_sources">,
  versionNumber: number,
  contentHash: string, // Hash of full content
  r2Key: string, // Full content snapshot
  changeDescription?: string,
  createdAt: number,
}
```

#### source_items
```typescript
{
  _id: Id<"source_items">,
  sourceId: Id<"information_sources">,
  sourceVersionId?: Id<"source_versions">,
  userId: string,
  content: string, // ≤1000 chars
  r2Key: string, // full content in R2
  itemType: "paragraph" | "section" | "table" | "code" | "image",
  order: number,
  createdAt: number,
}
```

#### source_item_embeddings
```typescript
{
  _id: Id<"source_item_embeddings">,
  sourceItemId: Id<"source_items">,
  model: string, // "text-embedding-3-small"
  embedding: number[],
  createdAt: number,
}
```

#### source_quality_assessments
```typescript
{
  _id: Id<"source_quality_assessments">,
  sourceId: Id<"information_sources">,
  assessorType: "llm" | "human" | "community",
  assessorId?: string,
  factualReliability: number, // 0-1
  biasScore: number, // -1 to 1
  expertiseScore: number, // 0-1
  rationale?: string,
  createdAt: number,
}
```

### Layer 2: Extraction

#### knowledge_extraction_jobs
```typescript
{
  _id: Id<"knowledge_extraction_jobs">,
  sourceId: Id<"information_sources">,
  sourceVersionId?: Id<"source_versions">,
  userId: string,
  status: "pending" | "running" | "completed" | "failed",
  model: string,
  promptVersion: string,
  outputSummary?: string, // ≤1000 chars
  outputR2Key?: string, // full output in R2
  tokenUsage?: { input: number; output: number },
  cost?: number,
  error?: string,
  startedAt: number,
  completedAt?: number,
}
```

#### knowledge_extracted_candidates
```typescript
{
  _id: Id<"knowledge_extracted_candidates">,
  sourceId: Id<"information_sources">,
  extractionJobId: Id<"knowledge_extraction_jobs">,
  userId: string,
  candidateKey: string, // "KC_x7hd92ka_candidate"
  cellType: "FACT" | "CONCEPT" | "PRINCIPLE" | "PROCEDURE" | "HEURISTIC" | "QUESTION",
  title: string,
  summary: string,
  content: string, // ≤1000 chars
  r2Key: string, // full content in R2
  status: "pending" | "approved" | "merged" | "rejected",
  mergedIntoCellId?: Id<"knowledge_cells">,
  createdAt: number,
  updatedAt: number,
}
```

#### knowledge_candidate_citations
```typescript
{
  _id: Id<"knowledge_candidate_citations">,
  candidateId: Id<"knowledge_extracted_candidates">,
  sourceItemId: Id<"source_items">,
  quote: string,
  confidence: number, // 0-1
  createdAt: number,
}
```

#### knowledge_candidate_relationships
```typescript
{
  _id: Id<"knowledge_candidate_relationships">,
  sourceCandidateId: Id<"knowledge_extracted_candidates">,
  targetCandidateId: Id<"knowledge_extracted_candidates">,
  relationshipType: "prerequisite_for" | "contradicts" | "supports" | "related_to" | "part_of" | "example_of",
  confidence: number, // 0-1
  createdAt: number,
}
```

#### knowledge_candidate_versions
```typescript
{
  _id: Id<"knowledge_candidate_versions">,
  candidateId: Id<"knowledge_extracted_candidates">,
  content: string,
  model: string,
  promptVersion: string,
  extractionJobId: Id<"knowledge_extraction_jobs">,
  createdAt: number,
}
```

#### knowledge_candidate_votes
```typescript
{
  _id: Id<"knowledge_candidate_votes">,
  candidateId: Id<"knowledge_extracted_candidates">,
  model: string, // "gpt-5" | "claude-4" | "gemini-2"
  agrees: boolean,
  confidence: number, // 0-1
  rationale?: string,
  createdAt: number,
}
```

### Layer 3: Knowledge Graph

#### knowledge_domains
```typescript
{
  _id: Id<"knowledge_domains">,
  name: string, // "Physics", "Economics", "History"
  description?: string,
  icon?: string,
  createdAt: number,
  updatedAt: number,
}
```

#### domain_topics
```typescript
{
  _id: Id<"domain_topics">,
  domainId: Id<"knowledge_domains">,
  topicId: Id<"knowledge_cell_topics">,
  createdAt: number,
}
```

#### knowledge_cells
```typescript
{
  _id: Id<"knowledge_cells">,
  cellKey: string, // "KC_x7hd92ka"
  cellType: "FACT" | "CONCEPT" | "PRINCIPLE" | "PROCEDURE" | "HEURISTIC" | "QUESTION",
  title: string,
  summary: string,
  content: string, // ≤1000 chars
  r2Key: string, // full content in R2
  source: "llm_extracted" | "human_created" | "community",
  topicId: Id<"knowledge_cell_topics">,
  createdAt: number,
  updatedAt: number,
}
```

#### knowledge_cell_versions
```typescript
{
  _id: Id<"knowledge_cell_versions">,
  cellId: Id<"knowledge_cells">,
  title: string,
  summary: string,
  content: string,
  cellType: "FACT" | "CONCEPT" | "PRINCIPLE" | "PROCEDURE" | "HEURISTIC" | "QUESTION",
  metadata?: any, // JSON for additional fields
  validFrom: number,
  validUntil?: number,
  changedBy?: string, // userId or agent that made the change
  changeReason?: string,
  createdAt: number,
}
```

#### knowledge_claims
```typescript
{
  _id: Id<"knowledge_claims">,
  cellId: Id<"knowledge_cells">,
  claimKey: string, // "CL_x7hd92ka"
  statement: string,
  source: "llm_extracted" | "human_created" | "community",
  status: "active" | "superseded" | "refuted",
  createdAt: number,
  updatedAt: number,
}
```

#### claim_evidence
```typescript
{
  _id: Id<"claim_evidence">,
  claimId: Id<"knowledge_claims">,
  sourceItemId: Id<"source_items">,
  quote: string,
  confidence: number, // 0-1
  evidenceType: "study" | "expert_opinion" | "data" | "anecdote",
  sampleSize?: number,
  createdAt: number,
}
```

#### claim_assessments
```typescript
{
  _id: Id<"claim_assessments">,
  claimId: Id<"knowledge_claims">,
  assessmentType: "llm" | "human" | "community",
  userId?: string,
  consensus: number, // 0-1, how much this claim is believed
  rationale?: string,
  createdAt: number,
}
```

#### knowledge_cell_citations
```typescript
{
  _id: Id<"knowledge_cell_citations">,
  cellId: Id<"knowledge_cells">,
  sourceItemId: Id<"source_items">,
  quote: string,
  confidence: number, // 0-1
  createdAt: number,
}
```

#### knowledge_cell_relationships
```typescript
{
  _id: Id<"knowledge_cell_relationships">,
  sourceCellId: Id<"knowledge_cells">,
  targetCellId: Id<"knowledge_cells">,
  relationshipType: "prerequisite_for" | "contradicts" | "supports" | "related_to" | "part_of" | "example_of",
  confidence: number, // 0-1
  createdAt: number,
}
```

#### knowledge_cell_topics
```typescript
{
  _id: Id<"knowledge_cell_topics">,
  name: string,
  description?: string,
  parentId?: Id<"knowledge_cell_topics">,
  createdAt: number,
  updatedAt: number,
}
```

### Layer 4: Personal Knowledge

#### user_knowledge_cells
```typescript
{
  _id: Id<"user_knowledge_cells">,
  userId: string,
  cellId: Id<"knowledge_cells">,
  relationship: "learning" | "learned" | "teaching" | "reviewing",
  progress: number, // 0-1, overall progress
  lastInteractionAt: number,
  createdAt: number,
  updatedAt: number,
}
```

#### user_cell_mastery
```typescript
{
  _id: Id<"user_cell_mastery">,
  userId: string,
  cellId: Id<"knowledge_cells">,
  remember: boolean, // Can recall facts
  understand: boolean, // Can explain concepts
  apply: boolean, // Can use in practice
  analyze: boolean, // Can break down and examine
  evaluate: boolean, // Can judge and critique
  create: boolean, // Can produce new work
  lastAssessedAt: number,
  createdAt: number,
  updatedAt: number,
}
```

#### knowledge_cell_assessments
```typescript
{
  _id: Id<"knowledge_cell_assessments">,
  cellId: Id<"knowledge_cells">,
  assessmentType: "llm" | "human" | "community",
  userId?: string,
  confidence: number, // 0-1
  importance: number, // 0-1
  difficulty: number, // 0-1
  rationale?: string,
  createdAt: number,
}
```

#### knowledge_cell_embeddings
```typescript
{
  _id: Id<"knowledge_cell_embeddings">,
  cellId: Id<"knowledge_cells">,
  versionId?: Id<"knowledge_cell_versions">, // Link to specific version
  contentHash?: string, // Hash of content used for embedding
  model: string, // "text-embedding-3-small"
  embedding: number[],
  createdAt: number,
}
```

#### knowledge_cell_events
```typescript
{
  _id: Id<"knowledge_cell_events">,
  userId: string,
  cellId: Id<"knowledge_cells">,
  eventType: "read" | "practice" | "review" | "teach" | "failed_recall" | "forgotten" | "incorrect_answer",
  context?: string,
  durationMs?: number,
  createdAt: number,
}
```

#### knowledge_cell_reminders
```typescript
{
  _id: Id<"knowledge_cell_reminders">,
  userId: string,
  cellId: Id<"knowledge_cells">,
  nextReviewAt: number,
  intervalMs: number,
  easeFactor: number, // SM-2 algorithm
  repetitionCount: number,
  createdAt: number,
  updatedAt: number,
}
```

### Layer 5: Synthesis

#### knowledge_notes
```typescript
{
  _id: Id<"knowledge_notes">,
  userId: string,
  title: string,
  summary: string,
  content: string, // ≤1000 chars
  r2Key: string, // full content in R2
  sourceId?: Id<"information_sources">,
  status: "draft" | "review" | "published" | "archived",
  version: number,
  createdAt: number,
  updatedAt: number,
}
```

#### knowledge_note_contributions
```typescript
{
  _id: Id<"knowledge_note_contributions">,
  noteId: Id<"knowledge_notes">,
  cellId: Id<"knowledge_cells">,
  contributionWeight: number, // 0-1
  blockId?: Id<"knowledge_note_blocks">,
  createdAt: number,
}
```

#### knowledge_note_blocks
```typescript
{
  _id: Id<"knowledge_note_blocks">,
  noteId: Id<"knowledge_notes">,
  blockType: "paragraph" | "list" | "quote" | "diagram" | "question",
  content: string,
  order: number,
  createdAt: number,
  updatedAt: number,
}
```

### Layer 6: Learning & Education

#### learning_goals
```typescript
{
  _id: Id<"learning_goals">,
  userId: string,
  title: string,
  description?: string,
  goalType: "course" | "curriculum" | "training" | "self_study",
  status: "active" | "completed" | "paused" | "abandoned",
  targetDate?: number,
  progress: number, // 0-1
  createdAt: number,
  updatedAt: number,
}
```

#### learning_goal_topics
```typescript
{
  _id: Id<"learning_goal_topics">,
  goalId: Id<"learning_goals">,
  topicId: Id<"knowledge_cell_topics">,
  priority: number, // 0-1
  createdAt: number,
}
```

#### learning_goal_cells
```typescript
{
  _id: Id<"learning_goal_cells">,
  goalId: Id<"learning_goals">,
  cellId: Id<"knowledge_cells">,
  status: "pending" | "learning" | "mastered",
  createdAt: number,
  updatedAt: number,
}
```

#### knowledge_paths
```typescript
{
  _id: Id<"knowledge_paths">,
  userId: string,
  title: string,
  description?: string,
  domainId?: Id<"knowledge_domains">,
  status: "draft" | "active" | "completed",
  totalSteps: number,
  createdAt: number,
  updatedAt: number,
}
```

#### path_steps
```typescript
{
  _id: Id<"path_steps">,
  pathId: Id<"knowledge_paths">,
  cellId: Id<"knowledge_cells">,
  stepOrder: number,
  isOptional: boolean,
  createdAt: number,
}
```

#### knowledge_recommendations
```typescript
{
  _id: Id<"knowledge_recommendations">,
  userId: string,
  recommendedCellId: Id<"knowledge_cells">,
  reason: "gap" | "prerequisite" | "related" | "review" | "goal" | "path",
  explanation: string, // "Why should I learn this?"
  priority: number, // 0-1
  status: "pending" | "viewed" | "completed",
  goalId?: Id<"learning_goals">,
  pathId?: Id<"knowledge_paths">,
  createdAt: number,
}
```

#### conflict_cases
```typescript
{
  _id: Id<"conflict_cases">,
  cellAId: Id<"knowledge_cells">,
  cellBId: Id<"knowledge_cells">,
  conflictType: "contradiction" | "inconsistency" | "ambiguity",
  status: "open" | "investigating" | "resolved" | "dismissed",
  resolution?: "favor_a" | "favor_b" | "both_valid" | "both_invalid" | "merged",
  resolutionReason?: string,
  resolvedBy?: string,
  resolvedAt?: number,
  createdAt: number,
}
```

### Layer 7: Agent Orchestration

#### agent_runs
```typescript
{
  _id: Id<"agent_runs">,
  agentType: string, // "cell_extractor" | "verifier" | "synthesis" | "auditor" | "view_generator"
  workflowId?: Id<"agent_workflows">,
  userId?: string,
  inputHash: string,
  status: "pending" | "running" | "completed" | "failed",
  outputSummary?: string, // ≤1000 chars
  outputR2Key?: string, // full output in R2
  tokenUsage?: { input: number; output: number },
  cost?: number,
  error?: string,
  startedAt: number,
  completedAt?: number,
  durationMs?: number,
}
```

#### agent_memories
```typescript
{
  _id: Id<"agent_memories">,
  agentType: string,
  memoryType: "source_quality" | "user_preference" | "extraction_pattern" | "verification_rule",
  key: string,
  value: any,
  confidence: number, // 0-1
  createdAt: number,
  updatedAt: number,
}
```

#### agent_workflows
```typescript
{
  _id: Id<"agent_workflows">,
  name: string, // "extraction_pipeline", "verification_pipeline"
  description?: string,
  triggerType: "manual" | "scheduled" | "event",
  status: "active" | "paused" | "archived",
  createdAt: number,
  updatedAt: number,
}
```

#### workflow_steps
```typescript
{
  _id: Id<"workflow_steps">,
  workflowId: Id<"agent_workflows">,
  agentType: string,
  stepOrder: number,
  config?: any, // Agent-specific configuration
  createdAt: number,
}
```

### Layer 8: Semantic Graph

#### knowledge_entities
```typescript
{
  _id: Id<"knowledge_entities">,
  entityType: "person" | "organization" | "place" | "concept" | "event" | "technology",
  name: string,
  canonicalName: string, // Normalized lowercase
  aliases: string[], // Alternative names
  description?: string,
  externalIds: {
    wikipedia?: string,
    wikidata?: string,
    [key: string]: string | undefined,
  },
  createdAt: number,
  updatedAt: number,
}
```

#### knowledge_entity_relationships
```typescript
{
  _id: Id<"knowledge_entity_relationships">,
  sourceEntityId: Id<"knowledge_entities">,
  targetEntityId: Id<"knowledge_entities">,
  relationshipType: "participated_in" | "located_in" | "founded" | "invented" | "related_to" | "member_of",
  confidence: number, // 0-1
  createdAt: number,
}
```

---

*Plan saved: 2026-06-21*  
*Final Review: Applied all 6 must-fix items*  
*Rating: 9.8/10*  
*Ready for implementation*
