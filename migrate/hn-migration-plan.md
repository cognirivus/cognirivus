# CogniRivus Rebuild Plan

## Greenfield HN-style Knowledge Social Network

Date: 2026-02-22
Owner: Product + Engineering
Status: Draft v2 (rewritten from confirmed decisions)

## 1. Product Direction

CogniRivus will be rebuilt as a general knowledge social network with HN-like foundations and expanded features.

Core product shape:

- Fast global feed for high-density knowledge content
- Community-centric discussion model (HN + subreddit style)
- Canonical post pages with threaded comments
- Like/dislike reactions (not upvote-only)
- AI features as power tools, not forced defaults
- Personalized discovery with FYP

## 2. Confirmed Decisions

These are locked from your comments and should drive implementation:

- Database is clean/truncated, so no migration or backfill work is needed.
- We can break old models and redesign schema/routes freely.
- `groups` concept is replaced by `communities` (public and private).
- Feed includes both standard ranking views and FYP.
- Keep both `like` and `dislike`.
- No moderation workflow for MVP.
- AI summaries are on-demand, not default.

## 3. MVP Information Architecture

Primary routes:

- `/feed` -> global feed tabs (`new`, `top`, `discussed`, `fyp`)
- `/submit` -> create post
- `/post/[id]` -> post detail + comments
- `/c/[slug]` -> community feed
- `/u/[username]` -> user profile

Secondary routes:

- `/settings`
- `/notifications` (optional MVP+)

Removed as primary navigation:

- `/groups/*`
- `/blog/*`
- `/content/*`
- `/news/*`

## 4. Feed Model

Feed views:

- `new`: latest posts
- `top`: highest score in selected window
- `discussed`: most active comment threads
- `fyp`: personalized mix

FYP candidate sources:

- Posts from followed users
- Posts from followed communities
- Posts from 2nd-degree graph (followed-by-followed)
- Similar posts based on vector similarity
- Recency/quality blend

FYP scoring inputs (initial):

- Relationship score (follow, 2nd-degree)
- Similarity score (embedding distance)
- Engagement score (likes, dislikes, comments, dwell proxy)
- Freshness decay

## 5. Community Model

Community types:

- Public: discoverable and readable by all
- Private: restricted visibility and access rules

Community surface:

- `/c/[slug]` with filters (`hot`, `new`, `top`)
- Community metadata (name, description, rules, visibility)
- Membership/follow states

## 6. Social Data Model (Greenfield)

New canonical entities (Convex):

- `users_profile`
- `communities`
- `community_memberships`
- `posts`
- `post_votes`
- `post_comments`
- `post_comment_votes`
- `follows_users`
- `follows_communities`
- `post_embeddings` (or embedding fields attached as needed)
- `notifications` (optional MVP+)

Post types:

- `text`
- `link`
- `media` (future-ready)

Storage rules:

- Long body content in R2
- Convex stores metadata, counters, snippet, and R2 key

## 7. API and Service Plan

Convex modules to introduce:

- `communities.ts`
- `posts.ts`
- `feed.ts`
- `social_graph.ts`
- `personalization.ts`

Core operations:

- Create/edit/delete post
- Vote like/dislike on post/comment
- Create/reply/delete comment
- Follow/unfollow users/communities
- Read global/community/profile feeds
- Generate on-demand AI summary for post/thread

## 8. Phased Build Plan

### Phase 0: Foundation

- Define new schema in `src/convex/schema.ts`
- Create base Convex modules with validators and auth checks
- Add seed helpers for local testing

Deliverables:

- New canonical schema committed
- Basic CRUD function skeletons

### Phase 1: Core Social Loop

- Implement `/submit`, `/post/[id]`, base `/feed` (`new`)
- Implement like/dislike and threaded comments
- Implement `/c/[slug]` community posting flow

Deliverables:

- End-to-end post/comment/vote loop working

### Phase 2: Discovery and Ranking

- Add `top` and `discussed` feed sorts
- Add follow graph (users + communities)
- Add profile feeds (`posts`, `comments`, `liked`)

Deliverables:

- Multi-sort feed and follow graph integrated

### Phase 3: FYP Personalization

- Add embedding generation pipeline for posts
- Build candidate retrieval (graph + similarity)
- Add FYP scoring and `/feed?tab=fyp`

Deliverables:

- Working personalized feed

### Phase 4: AI Knowledge Layer

- Add on-demand summary endpoint for post/thread
- Add related-post suggestions from similarity index
- Add optional highlight/personalized knowledge extraction

Deliverables:

- AI enhancements available without cluttering default UX

### Phase 5: Cleanup and Hardening

- Remove or archive obsolete route surfaces
- Tighten rate limits for post/comment/vote/follow
- Final pass on performance, indexes, and UX polish

Deliverables:

- Stable social-first product baseline

## 9. Rate Limits and Abuse Controls (MVP Reality)

MVP policy:

- No moderation queue in v1
- Keep technical anti-spam controls via rate limits only

Minimum protection:

- Post creation throttle
- Comment creation throttle
- Vote toggle throttle
- Follow/unfollow throttle

## 10. Success Metrics

Primary:

- DAU
- Posts/day
- Comments/post
- Vote participation rate
- FYP clickthrough and session depth
- D1 and D7 retention

Secondary:

- Follow actions/day
- Community creation/day
- AI summary usage rate

## 11. Immediate Implementation Backlog

1. Finalize and implement new schema for communities/posts/social graph.
2. Build `/submit`, `/post/[id]`, `/feed` (`new`) with like/dislike and comments.
3. Replace `groups` route strategy with `communities` route strategy.
4. Add `top` and `discussed` ranking queries.
5. Add follow graph + profile feed.
6. Implement FYP candidate retrieval and scoring.
7. Add on-demand AI summary endpoint and UI action.

## 12. Remaining Product Decisions

- FYP weighting defaults (graph vs similarity vs engagement)
- Private community join policy (invite only vs request approval)
- Whether downvotes impact visibility linearly or with caps
- Notification scope for MVP vs MVP+
