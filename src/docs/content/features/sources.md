---
title: Sources & Ingestion
description: Follow websites, RSS feeds, and channels. Understand how Cognirivus ingests content and manages your personal web graph.
category: Features
order: 2
icon: Globe
---

# Sources & Ingestion

Cognirivus is source-first. Unlike traditional social media where you only see links shared by users, Cognirivus pulls content directly from the original publications you follow.

---

## Supported Source Types

You can follow three primary kinds of sources:

1. **Websites**: General web URLs. Cognirivus will attempt to locate articles and feed formats automatically.
2. **RSS/Atom Feeds**: Direct feed URLs. This provides the most reliable and immediate ingestion.
3. **YouTube Channels**: Channel URLs. New video uploads will appear in your feed as video/media items.

---

## Adding a Source

To follow a new publication:

1. Click **Sources** in the left sidebar.
2. Click **Follow Source** in the top-right corner.
3. Paste the canonical URL of the site, feed, or channel.
4. The system will create a new source record (if it doesn't already exist globally) and queue a background sync job.

---

## How Content Ingestion Works

Once you follow a source, Cognirivus automatically checks it for updates:

1. **Fetch**: The system regularly retrieves new articles, posts, or videos from the sources you follow.
2. **Format**: The main content is extracted and cleaned to provide a readable, clutter-free reading layout.
3. **Deliver**: New items are added to your personal feed in real-time, ready for you to read, collect, or share.

---

## Similar Link Discovery

Every source you follow helps train your personal **discovery graph**. Cognirivus uses your list of followed domains to find similar or related content:

- **Your World**: Similar links that come from the set of domains you follow.
- **The Web**: Related links from the broader internet.

You can manage which of your followed sources influence this discovery by toggling **Include in Similar Links** on each source's settings page.
