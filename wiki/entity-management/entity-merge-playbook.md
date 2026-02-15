# Entity Merge Playbook

This document describes the canonical entity merge flow and safeguards.

## Why this exists

AI-generated entities can create duplicates (same concept, different rows). This causes:

- fragmented content timelines
- fragmented article history
- duplicate group shares
- fragile slug lookups

## Data model involved

Primary tables:

- `entities`
- `content_entities`
- `article_archive`
- `group_shared_content`
- `entity_aliases` (added for merge-safe slug redirects)

## New backend functions

In `src/convex/content.ts`:

- `previewEntityMerge` (query)
- `mergeEntities` (mutation)

### `previewEntityMerge`

Input:

- `canonicalEntityId`
- `sourceEntityIds[]`

Output includes:

- canonical and source summaries
- type mismatches
- estimated relink/delete counts for:
  - content links
  - group shares
  - article archives
  - source current articles to archive

### `mergeEntities`

Input:

- `canonicalEntityId`
- `sourceEntityIds[]`
- `allowCrossType` (optional, default false)

Execution behavior:

1. Validates admin and entity existence.
2. Relinks `content_entities` from source -> canonical.
3. Deduplicates colliding `content_entities` links.
4. Relinks `group_shared_content.entityId` source -> canonical.
5. Deduplicates colliding group shares.
6. Relinks `article_archive.entityId` source -> canonical.
7. Archives each source entity's current `article` into canonical archive.
8. If canonical has no article, fills it from best source article.
9. Upserts slug/type aliases into `entity_aliases`.
10. Deletes source entity rows.

Return value includes merge stats.

## Slug safety after merge

`getEntityBySlug` now resolves in this order:

1. direct lookup in `entities` by `(slug, type)`
2. fallback lookup in `entity_aliases` by `(slug, type)` and resolves canonical entity

This preserves older slug URLs after source entity deletion.

## Duplicate prevention in ingestion

Entity writes in both content extraction paths now:

- normalize `name -> slug`
- look up entity by `(slug, type)`
- fallback through alias mapping
- create only if no match found

Files:

- `src/convex/content.ts` (`saveFactLogic`)
- `src/convex/extraction.ts` (`saveExtractedContent`)

## Operational workflow for admins

1. Pick canonical entity.
2. Run `previewEntityMerge` with candidate source IDs.
3. Review type mismatches and estimated deletes.
4. Run `mergeEntities`.
5. Re-open entity pages to confirm:

- linked content count
- group shared visibility
- article and archive presence

## Notes

- `removeEntitiesBulk` now also cleans:
  - `group_shared_content` refs by entity
  - `entity_aliases` refs by source and canonical ids
- For safety, cross-type merges are blocked unless `allowCrossType = true`.
