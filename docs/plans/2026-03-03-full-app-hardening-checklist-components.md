# 2026-03-03 Full App Hardening Checklist (Component-First)

## Summary
This is the implementation-ready hardening checklist for Cognirivus, ordered for a 4-6 week delivery window and prioritized by exploitability and blast radius. It is component-first: use existing or official Convex components before custom infrastructure, and allow vetted third-party components only behind an approval gate.

## Deliverable and Format
- Path: `docs/plans/2026-03-03-full-app-hardening-checklist-components.md`
- Single checklist row format for all implementation items:
  - `ID`, `Risk`, `Component`, `App Surface`, `Files`, `Change`, `Test`, `Monitor`, `Rollback`, `Status`, `Priority`

## Verified Component Package IDs
Verified from local references in `d:/docs`:

| Component Label | NPM Package | Verification Source |
| --- | --- | --- |
| Aggregate | `@convex-dev/aggregate` | `d:/docs/aggregate/package.json` |
| Migrations | `@convex-dev/migrations` | `d:/docs/migrations/package.json` |
| Workflow | `@convex-dev/workflow` | `d:/docs/workflow/package.json` |
| Workpool | `@convex-dev/workpool` | `d:/docs/workpool/package.json` |
| Retrier (Action Retrier) | `@convex-dev/action-retrier` | `d:/docs/action-retrier/package.json`, `d:/docs/action-retrier/README.md` |
| Crons | `@convex-dev/crons` | `d:/docs/crons/package.json`, `d:/docs/crons/README.md` |

Already installed and kept in app:
- `@convex-dev/rate-limiter`
- `@convex-dev/r2`
- `@convex-dev/presence`
- better-auth Convex component

## Component Strategy (Locked)
1. Reuse installed components where applicable.
2. Add official Convex components above before custom queue/retry/scheduler frameworks.
3. Third-party components require a vetting checklist and feature-flagged rollout.
4. No custom queue/retry framework unless a component gap is proven with documented constraints.

## Research Workflow (Execution Rule)
1. First source of truth: `docs/convex/*` in repo and `d:/docs/convex-docs`.
2. If ambiguity remains, inspect component repos in `d:/docs/<component>`.
3. If still unresolved, clone official repo into `d:/docs` and extract API contracts from:
   - `README.md`
   - `package.json`
   - `convex.config` and example files
4. Record unresolved details only in the `Assumptions and Defaults` section (none open for this checklist).

## Hardening Workstream Mapping
1. Abuse and quota controls -> `rate-limiter`
2. Durable jobs and retries -> `workflow` + `workpool`
3. External reliability retries -> `action-retrier`
4. Scheduled maintenance visibility -> `crons`
5. Count/scaling hotspots -> `aggregate`
6. Backfills/repair -> `migrations`
7. Storage lifecycle -> `r2` + retry/orphan-repair workflows

## Implementation-Ordered Checklist

| ID | Risk | Component | App Surface | Files | Change | Test | Monitor | Rollback | Status | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HC-001 | SSRF via source fetch and redirect chaining | Custom hardening + `workflow` guardrail integration | Source ingest fetch path | `src/convex/sources.ts`, `src/convex/sources_node.ts` | Enforce final target validation (protocol, DNS resolution, IPv4/IPv6 private ranges, redirect target checks, blocked ports) before fetch execution | Unit tests for CIDR/host parsing and redirect cases; integration tests for blocked/allowed URLs | `security_events` count by reason, blocked-host metrics | Feature flag to warning-only mode for 48h, then enforce | Planned | P0 |
| HC-002 | XSS from source item rendering | Custom sanitizer policy (component-neutral) | Feed/source item display | `src/routes/feed/+page.svelte`, `src/routes/source/[sourceItemId]/+page.svelte`, shared render utils | Sanitize all rich content before render; strict allowlist; plain-text fallback | Payload suite with script/event-handler/html-entity bypass cases | Sanitizer strip count, client error logs | Toggle to plain-text-only render mode | Planned | P0 |
| HC-003 | Unauthorized admin destructive access | Existing better-auth + shared auth helper | Admin actions/queries/routes | `src/convex/admin.ts`, `src/routes/admin/+page.server.ts`, `src/routes/+layout.server.ts` | Unify admin-role checker and enforce deny-by-default for admin operations | Authz integration tests with non-admin direct function calls | Unauthorized attempt counters | Revert to previous guard helper (single commit rollback) | Planned | P0 |
| HC-004 | Non-idempotent permanent delete behavior | `workflow` + `workpool` | Admin delete source/item/post | `src/convex/admin.ts`, new `src/convex/admin_workflows.ts` | Convert immediate cascade deletes into idempotent deletion jobs with deterministic idempotency key | Re-run same delete request N times; assert one terminal result | Deletion job state transitions, duplicate request counts | Disable workflow path and route to legacy action temporarily | Planned | P0 |
| HC-005 | R2 deletion failures leave orphan objects | `@convex-dev/action-retrier` + `r2` | Delete flows and cleanup | `src/convex/admin.ts`, new retry module | Route R2 delete calls through retrier with bounded backoff and failure ledger (`r2_retry_jobs`) | Inject transient/permanent R2 failures and assert retry outcomes | Retry queue depth, retry success %, terminal failures | Pause retrier and keep failed keys queued for manual re-run | Completed | P0 |
| HC-006 | Missing security/audit traceability | `workflow` (for async writes) + app tables | Security, admin, sync events | new `src/convex/security.ts`, `src/convex/schema.ts` | Add `security_events` and `admin_audit_logs` write path for critical operations | Query consistency tests and auth visibility tests | Event volume and missing-event alarms | Fallback to direct log statements while tables are retained | Completed | P0 |
| HC-007 | Nightly cron duplicate execution | `@convex-dev/crons` + lock table | Nightly source refresh | `src/convex/crons.ts`, `src/convex/sources.ts`, `src/convex/schema.ts` | Add lock/lease (`scheduler_locks`) per UTC run key; no-op duplicates | Simulate concurrent triggers and confirm single effective run | Lock contention and duplicate-skip counters | Disable lock enforcement via flag if deadlock bug appears | Completed | P1 |
| HC-008 | Sync/unsubscribe race causes inconsistent state | `workflow` + `workpool` | Source sync and unsubscribe jobs | `src/convex/sources.ts` + new workflow file | Move long-running cleanup/sync orchestration to workflow steps with explicit entity-state checks (`deleting`, `paused`) | Race test: enqueue sync + delete concurrently | Failed-step reason taxonomy, workflow retry counts | Revert only orchestration path to existing scheduler loop | In Progress | P1 |
| HC-009 | Collect-based counts degrade at scale | `@convex-dev/aggregate` | Manage Sources/Admin dashboard counts | `src/convex/admin.ts`, `src/convex/sources.ts`, new aggregate wiring | Replace `collect().length` counters with aggregate-backed counters for item/shared post counts | Load test counts at high row cardinality | Query latency p95/p99 for dashboard and manage pages | Fall back to legacy reads behind flag if mismatch appears | Completed | P1 |
| HC-010 | Aggregate drift from source-of-truth tables | `aggregate` + `migrations` | Count correctness | aggregate module + migration file | Add trigger/transaction updates and repair migration for backfill/reconciliation | Drift detection test and migration idempotency test | Drift detector count, repair run duration | Disable aggregate reads and keep writes while repairing | Completed | P1 |
| HC-011 | Inconsistent job failure semantics | `workflow` + app taxonomy constants | Jobs and error states | `src/convex/sources.ts`, `src/convex/admin.ts` | Add structured failure taxonomy and standard status transitions | Transition-state tests for queued/running/done/failed | Job terminal failure ratio by reason | Revert to previous status map if clients break | Completed | P1 |
| HC-012 | Missing observability for cron/workflow runs | `crons` + `workflow` + audit tables | Ops/debug surfaces | `src/convex/admin.ts`, `src/routes/admin/+page.svelte` | Add debug rows for lock state, retry backlog, failed jobs, last sweeper success | UI query tests and role access tests | Dashboard stale-data and null-state alarms | Hide debug rows if query errors increase | Completed | P1 |
| HC-013 | Fanout overload and queue starvation | `workpool` + `workflow` | Source delivery fanout | `src/convex/sources.ts` | Add bounded chunk fanout policy, per-batch retry budget, dead-letter queue | High-volume fanout stress test with partial failure injection | Queue depth, batch latency, dead-letter volume | Temporarily reduce concurrency and batch size via config | In Progress | P2 |
| HC-014 | Abuse bypass via multi-account/session patterns | `rate-limiter` (sharded limits) + custom heuristics | Add source/manual refresh/ingest | `src/convex/lib/rateLimits.ts`, `src/convex/sources.ts` | Add multi-dimensional limits (user + session/IP) and adaptive penalties | Simulation tests for burst and distributed abuse patterns | Rate-limit rejects and false-positive review sample | Feature-flag heuristic layer independently from base limit | In Progress | P2 |
| HC-015 | DB-R2 integrity drift over time | `workflow` + `crons` + `migrations` | Storage lifecycle maintenance | new sweeper modules + schema additions | Add orphan sweeper for DB->R2 and R2->DB mismatches with repair/quarantine paths | Seed intentional orphan data and validate repair actions | Orphan counts, sweep duration, unresolved orphan backlog | Disable auto-repair and keep detect-only mode | In Progress | P2 |
| HC-016 | Third-party ingestion fallback introduces hidden risk | Component vetting gate (policy) | Alternative ingestion path | policy doc + feature flag config | Add formal vetting checklist and mandatory fallback path to core fetch pipeline | Policy enforcement test in PR checklist | Third-party feature usage and failure telemetry | Disable feature flag immediately | Completed | P2 |
| HC-017 | Breaking changes during component adoption | `migrations` + staged rollout | Schema/API compatibility | `src/convex/schema.ts`, migration files | Use additive schema rollout, backfill, then read-path cutover; no destructive schema cut in same deploy | Integration tests for backward-compatible reads during migration | Migration progress and read-path mismatch alarms | Keep dual-read mode until parity verified | In Progress | P1 |
| HC-018 | Missing incident recovery procedures | Workflow runbooks | Operational readiness | `docs/plans/*`, `docs/convex/*` | Add runbooks for retry storms, lock stuck states, and failed cleanup backlog | Tabletop simulation for each incident class | MTTR per incident class | Revert to known-safe mode documented per runbook | Completed | P1 |

## Public APIs / Interfaces / Type Changes
1. Add tables:
- `security_events`
- `admin_audit_logs`
- `deletion_jobs`
- `r2_retry_jobs`
- `scheduler_locks`

2. Extend statuses:
- `sources.status`: add `deleting`
- tighten `source_jobs` status transition rules (enforced in mutations/workflow handlers)

3. Add internal APIs:
- `security.logEvent`
- `admin.enqueueDeleteJob`
- `sources.acquireNightlyLock`
- `sources.releaseNightlyLock`
- `sources.retryExternalCall`

4. UI additions:
- Admin debug rows: lock status, retry backlog, failure counts, sweeper health.

## Test Cases and Scenarios
### Security
1. SSRF attempts via redirects and private ranges are blocked.
2. Malicious HTML/RSS payloads cannot execute client-side.
3. Non-admin direct API access to admin actions is denied.

### Reliability
1. External fetch and R2 transient failures are retried and either succeed or end in quarantine.
2. Duplicate nightly triggers result in one effective run.
3. Delete-vs-sync races preserve consistency.

### Scale
1. Admin/manage pages avoid full-collect count bottlenecks.
2. Fanout stays within SLO under stress.

### Recovery
1. Backfills/repairs are idempotent and resumable.
2. Rollback path is test-covered for each P0/P1 component adoption.

## Acceptance Criteria
1. Every checklist item maps to existing component, official new component, or justified fallback.
2. P0 controls are production-enforced with monitor + rollback path.
3. Source/admin critical paths are idempotent, auditable, and retry-safe.
4. High-cost count queries are replaced with aggregate-backed reads.
5. Checklist is implementation-ready with no unresolved design decisions.

## Assumptions and Defaults
1. Scope is full-app hardening.
2. Priority is exploitability + blast radius.
3. Delivery horizon is 4-6 weeks.
4. Third-party components remain opt-in behind vetting + feature flag.
5. "Retrier" in this plan refers to package `@convex-dev/action-retrier`.
