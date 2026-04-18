# Cognirivus

Cognirivus is a high-density knowledge network for people who want more than an endless generic feed. It combines source following, curated collections, communities, discussion, and chat so users can build a reading graph around what they actually trust and care about.

## The project

Cognirivus treats knowledge discovery as something people actively shape. Instead of only posting links into a public stream, users can follow sources directly, save items into collections, share them back into communities, and discuss them in context. The goal is to make reading, curation, and conversation part of the same system.

## Core experience

### Feed-first reading

The feed is the main entry point. Users can move between personal, public, and community scopes, rank by `new`, `top`, or `discussed`, search across content, filter by source type and tags, and switch between dense bento and list layouts.

### Sources, not just posts

The project is source-first. Users can follow websites, RSS feeds, and related sources directly, read ingested source items, share those items back into the network as posts, and manage which domains influence similar-link discovery.

### Collections and communities

Collections let users build reusable reading lists around trusted sources or specific source items. Communities add the social layer on top with shared feeds, membership workflows, shared collections, and dedicated spaces for discussion.

### Real-time interaction

Direct messages, community chat, reactions, unread counts, and presence tracking are all part of the core product instead of an afterthought.

## What makes it distinct

- It keeps the underlying source graph visible instead of flattening everything into standalone posts.
- It supports personal, public, and community contexts in the same product.
- It lets users save, reshare, and discuss source items without losing the connection to where they came from.
- It uses trusted source domains to separate "similar links from your world" from "similar links from the web."
- It combines async reading workflows with realtime social features like community chat and DMs.

## Current product surface

- Feed browsing with public, private, and community-aware visibility.
- Post creation for text, link, and media content.
- Threaded comments and like/dislike voting.
- User profiles with follower and following pages.
- Community creation, membership management, community feeds, and community chat.
- Personal and community collections with public/private visibility.
- Source management with ingestion jobs, backfills, and similar-search domain controls.
- Source item pages with share-to-post and save-to-collection flows.
- Direct messaging with replies, reactions, unread state, and presence.
- Admin console and operational support tables for jobs, locks, audit logs, and retries.

## How the product is organized

- `feed`: browse what matters now across personal, public, and community scopes.
- `sources`: follow websites and feeds, ingest source items, and manage discovery settings.
- `collections`: turn saved sources and items into reusable reading lists.
- `communities`: gather people around a topic with membership, collections, feed, and chat.
- `posts and comments`: turn source items or original writing into discussion.
- `chat`: handle direct and community conversation in realtime.

## Built with

- SvelteKit runs on Cloudflare Workers via `@sveltejs/adapter-cloudflare`
- Convex owns the application data model, realtime queries, mutations, actions, and background jobs
- Cloudflare R2 stores large text bodies referenced from Convex metadata
