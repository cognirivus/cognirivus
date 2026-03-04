# 2026-03-03 Source Reliability Single-Cutover Runbook

## Scope
- Staged R2 delete pipeline (`object_delete` -> `metadata_delete`)
- Validator-safe job status responses
- RSS redirect/error taxonomy improvements
- Better Auth/session signal compatibility
- Presence room contract lock

## Preconditions
- Deployment includes schema changes for `r2_retry_jobs` stage/timestamps.
- Admin account available.

## Deploy Order (Single Cutover)
1. Deploy application code and Convex functions together.
2. Verify admin dashboard debug row:
   - retry backlog loads
   - invalid retry row count is stable at zero for fresh environments

## Post-Deploy Smoke Checks
1. Add source:
   - create a new source and confirm `sync_source` job is created.
2. Sync source:
   - confirm source status updates (`active` on success, classified error on failure).
3. Delete source item with R2 body:
   - confirm staged retry job transitions:
     - `object_delete` stage
     - `metadata_delete` stage
     - `done`
4. Verify status endpoints:
   - `sources:getJobStatus`
   - `admin:getR2RetryJob`
   - confirm no `ReturnsValidationError` in logs.
5. Verify admin debug rows:
   - backlog counts render
   - invalid retry rows render
   - nightly/sweeper rows render.

## Monitoring Window (30-60 min)
- `r2_retry_jobs`:
  - queued/running should drain
  - failed should not spike continuously
- `deletion_jobs` failed count
- `source_jobs` failed count
- source sync error ratio (watch for redirect/parser regressions)

## Rollback Triggers
- repeated `ReturnsValidationError` on status endpoints
- staged delete jobs stuck in failure loop
- severe source sync failure regression

## Rollback Steps
1. Roll back to previous release.
2. Leave retry jobs intact (do not purge production operational data).
3. Re-run staged deletion and status smoke checks after forward-fixing.

## Notes
- Destructive operational-table reset tooling is intentionally not part of runtime.
