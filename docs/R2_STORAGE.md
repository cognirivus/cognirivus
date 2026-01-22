# Large Text Storage with Cloudflare R2

To avoid Convex memory limits (16MB per execution) and minimize database size, Cognirivus uses **Cloudflare R2** to store the full text of source items (news, syllabus, blogs, content).

## Architecture Overview

1.  **Convex Database**: Stores metadata only (title, date, subject, snippet) and an `r2Key`.
2.  **Cloudflare R2**: Stores the full text content as `.txt` files.
3.  **Signed URLs**: Convex generates short-lived signed URLs for the frontend or AI actions to read the content.

## Schema Changes

Tables like `news`, `syllabus`, `blogs`, and `content` no longer have a `body` field. Instead, they have:

- `snippet`: A 500-character truncated version of the text for fast listing.
- `r2Key`: A unique path (e.g., `news/1737555.txt`) to the full file in R2.

## Developer Usage

### 1. Inserting/Updating Data

Because R2 interaction requires a network request, storage logic must happen inside a **Convex Action**.

```typescript
// Example: Creating a news item
const newsId = await ctx.runAction(api.news.insert, {
	date: '2026-01-22',
	body: 'Full large text content...'
});
```

The action handles:

1.  Generating a unique R2 key.
2.  Uploading the text to Cloudflare R2.
3.  Saving the metadata (including the `r2Key`) to the Convex DB via an internal mutation.

### 2. Reading Data in the UI

Queries like `getById` return a `bodyUrl`.

```typescript
// Svelte Component
const news = useQuery(api.news.getById, { id });

// Fetch full text on demand
async function loadFullContent() {
	if (news.bodyUrl) {
		const res = await fetch(news.bodyUrl);
		const fullText = await res.text();
	}
}
```

### 3. AI Extraction Workflow

The extraction system fetches the full text directly in the action context:

```typescript
// extraction.ts
const url = await r2.getUrl(item.r2Key);
const fullText = await (await fetch(url)).text();
// Pass fullText to AI...
```

## Setup & Environment

Ensure the following environment variables are set in the Convex Dashboard:

| Variable               | Description                                       |
| :--------------------- | :------------------------------------------------ |
| `R2_BUCKET`            | The name of your bucket (e.g., `cognirivus-data`) |
| `R2_ENDPOINT`          | The S3 API endpoint from Cloudflare               |
| `R2_ACCESS_KEY_ID`     | Cloudflare R2 Access Key                          |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 Secret Key                          |
| `R2_TOKEN`             | API Token Value                                   |

## CORS Policy

The R2 bucket **must** have a CORS policy to allow the frontend to fetch content directly.

```json
[
	{
		"AllowedOrigins": [
			"http://localhost:5173",
			"https://your-domain.com",
			"https://your-convex-app.convex.site"
		],
		"AllowedMethods": ["GET", "PUT", "HEAD"],
		"AllowedHeaders": ["Content-Type", "x-id"],
		"ExposeHeaders": ["Content-Length", "Content-Type"]
	}
]
```
