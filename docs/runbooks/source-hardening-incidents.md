# Source Hardening Incident Runbook

## Incident Class A: Retry Storm (R2 retry or fanout retries spike)

### Signals
- `r2_retry_jobs` queued/running backlog rising continuously.
- repeated `SOURCE_FANOUT_FAILED` or `R2_DELETE_FAILED` events.
- admin debug retry backlog trending up.

### Immediate Actions
1. Reduce retry pressure:
   - Disable non-critical admin bulk deletions temporarily.
2. Pause high-volume sources if needed (`sources.status='paused'` for top offenders).
3. Trigger manual sweeper only after backlog stabilizes.

### Recovery
1. Drain retrier backlog to steady state.
2. Re-enable paused operations gradually.
3. Record root cause and failed key groups.

## Incident Class B: Nightly Lock Stuck

### Signals
- admin debug shows lock active long past expected lease.
- no new `source_nightly_runs` progress.

### Immediate Actions
1. Verify active owner process is still running.
2. If owner is dead, wait for lease expiry; do not force-delete first.
3. After expiry, trigger a fresh nightly run manually.

### Recovery
1. Confirm single run proceeds and lock rotates correctly.
2. Check for duplicate queued sync jobs.
3. Document lock owner and timestamps for postmortem.

## Incident Class C: Cleanup Backlog (unsubscribe/delete jobs not draining)

### Signals
- `source_jobs` failed/running accumulate for `bulk_unsubscribe`.
- `deletion_jobs` failed count increasing.

### Immediate Actions
1. Stop creating new destructive bulk jobs temporarily.
2. Prioritize retriable failures by most recent user impact.
3. Re-run idempotent jobs in bounded batches.

### Recovery
1. Validate posts remain intact and source links are correctly unlinked.
2. Validate R2 retry failures are quarantined and visible.
3. Re-enable bulk operations with reduced concurrency.

## Safe Mode Toggles
1. Disable third-party ingestion fallback:
   - `ENABLE_THIRD_PARTY_INGESTION_FALLBACK=false`
2. Keep manual source refresh limits enabled for non-admin.
3. Keep cron jobs on unless explicitly causing outage.

## Post-Incident Checklist
1. Capture timeline with exact UTC timestamps.
2. Save impacted job IDs and source IDs.
3. Add follow-up checklist items in hardening plan.
