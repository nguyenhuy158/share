# Share (share.huyab.click)

> Instant preview & artifact hosting for AI Agents (Claude Code, Cursor, Codex, MCP tools) and local terminal sessions.

---

## The Problem & The Solution

- **Problem:** AI agents (Claude, Cursor, Codex) generate beautiful HTML mockups, dashboards, or SVGs in 15 seconds, but sharing them with collaborators or viewing on mobile requires setting up a git repository, pushing code, and configuring hosting platforms.
- **Solution:** AI agents push artifacts directly to `share.huyab.click` in 1 command. You get an instant public URL (`https://share.huyab.click/artifact/<uuid>`) with `noindex` headers and zero repository clutter.

---

## Features

- **Zero-Friction Publishing:** Upload via cURL, shell script, or AI agent tool call.
- **SSO Authentication:** Sign in once via Google SSO (`auth.huyab.click`).
- **Master Password for CLI/Agents:** Set a master password on the web dashboard to authenticate local terminal sessions.
- **Direct Rendering:** Files are served with correct MIME types (`text/html`, `image/svg+xml`, etc.) so JavaScript, Tailwind CDN, and CSS execute seamlessly.
- **Privacy by Default:** Responses include `X-Robots-Tag: noindex, nofollow` to prevent search engine indexing.
- **Dashboard Management:** View your history of published artifacts, view counts, copy links, or delete old prototypes.
- **Agent Skill Included:** Ready-to-use skill definition in `skills/share-artifact/SKILL.md`.

---

## Quickstart

### 1. Set up your Master Password
1. Visit [share.huyab.click](https://share.huyab.click).
2. Click **Sign in with SSO**.
3. In the **Master Password** box, choose a password (at least 6 characters) and click **Save Master Password**.

### 2. Upload an Artifact from Terminal
Set environment variables:
```bash
export SHARE_EMAIL="your-email@example.com"
export SHARE_PASSWORD="your-master-password"
```

Then run:
```bash
./scripts/share.sh ./index.html "Dashboard Prototype"
```

Or using `curl`:
```bash
curl -X POST "https://share.huyab.click/api/upload" \
  -F "email=${SHARE_EMAIL}" \
  -F "password=${SHARE_PASSWORD}" \
  -F "file=@./index.html" \
  -F "title=Dashboard Prototype"
```

Response:
```json
{
  "success": true,
  "id": "e4f8b2c1-9a7d-4b8a-9f5e-123456789abc",
  "url": "https://share.huyab.click/artifact/e4f8b2c1-9a7d-4b8a-9f5e-123456789abc",
  "rawUrl": "https://share.huyab.click/artifact/e4f8b2c1-9a7d-4b8a-9f5e-123456789abc/raw",
  "title": "Dashboard Prototype",
  "filename": "index.html",
  "contentType": "text/html; charset=utf-8",
  "size": 15420,
  "createdAt": "2026-09-08T09:00:00.000Z"
}
```

---

## AI Agent Integration (Claude Code, Cursor, Codex)

Copy `skills/share-artifact/SKILL.md` into your agent skills directory, or simply add this to your project prompt or `.cursorrules`:

```markdown
When generating an HTML mockup or visual artifact that the user wants to preview:
Upload the file via curl:
curl -s -X POST "https://share.huyab.click/api/upload" \
  -F "email=${SHARE_EMAIL}" \
  -F "password=${SHARE_PASSWORD}" \
  -F "file=@<path-to-file>" \
  -F "title=<title>"
Then share the resulting public URL with the user.
```

---

## Tech Stack & Deployment

- **Runtime:** Cloudflare Workers (Hono backend + Vite SPA assets)
- **Database:** Cloudflare D1 (`db` instance, tables prefixed with `share_`)
- **Frontend:** React 19, TypeScript, Tailwind CSS 4, Lucide React
- **Custom Domain:** `share.huyab.click`

### Local Development
```bash
pnpm install
pnpm dev        # Vite dev server
pnpm dev:api    # Wrangler worker dev
```

### Database Migration
```bash
pnpm run db:migrate:local
pnpm run db:migrate:remote
```

### Deploy to Cloudflare
```bash
pnpm run deploy
```
