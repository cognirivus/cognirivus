# Third-Party Ingestion Vetting Policy

## Scope
This policy applies to any non-core ingestion provider used for source fetching/parsing
(anti-bot bypass providers, hosted scrapers, external parsing APIs, proxy fetchers).

## Default Stance
- Default: disabled.
- Core pipeline (`fetch + parser + internal guards`) remains the primary path.
- Third-party path is opt-in only through:
  - Env flag: `ENABLE_THIRD_PARTY_INGESTION_FALLBACK=true`
  - Explicit PR approval against this checklist.

## Approval Checklist (All Required)
1. Security review complete.
2. Data handling review complete (PII, retention, regional controls).
3. Legal/ToS review complete for target-source compatibility.
4. Reliability test run completed with fallback behavior verified.
5. Cost cap and rate-limit guardrails configured.
6. Incident rollback tested (flag off returns to core-only path).
7. Observability added:
   - request count
   - success/failure count
   - latency percentile
   - fallback activation count

## Runtime Requirements
1. Fallback only:
   - Third-party provider must run only after core ingestion path fails.
2. Hard timeout:
   - Third-party calls must be bounded and retriable with max-attempt caps.
3. Circuit-breaker:
   - Repeated provider failures disable provider path via flag-off.
4. No silent takeover:
   - Provider must never replace core as default path.

## Rollback
1. Set `ENABLE_THIRD_PARTY_INGESTION_FALLBACK=false`.
2. Confirm all ingestion traffic returns to core path.
3. Monitor `source_sync_failed` and provider-specific failure telemetry for 24h.

## PR Gate Template
Every PR enabling or changing a third-party ingestion integration must include:
- Checklist completion evidence.
- Failure mode matrix.
- Fallback and rollback proof.
