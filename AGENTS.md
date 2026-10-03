# Repository Guidelines

## Project Structure & Module Organization

Instant artifact hosting for AI agents (`share.huyab.click`): React 19 + Vite +
Tailwind v4 dashboard plus a Hono Cloudflare Worker (D1 + storage) that serves
uploaded HTML/SVG artifacts. Login via shared SSO; CLI/agents use a master
password.

```text
src/                     # Dashboard frontend
  main.tsx  App.tsx      #   Entry + single-file app UI
  index.css              #   Tailwind entry, imports styles/tokens.css
  styles/tokens.css      #   --ui-* design tokens (copied from ../ui-kit)
worker/src/              # Hono Worker: index.ts (API + artifact serving),
                         #   session.ts, sso-verifier.ts, crypto.ts
mcp/index.mjs            # MCP server exposing upload tools to agents
skills/share-artifact/   # Agent skill (SKILL.md)
scripts/                 # share.sh (CLI upload), install-skill.sh
schema.sql               # D1 schema
wrangler.jsonc           # Worker bindings
```

## Build, Test, and Development Commands

- `pnpm install`: install dependencies.
- `pnpm dev`: start the Vite dev server on `127.0.0.1` (proxies `/api` to wrangler).
- `pnpm dev:api`: run the Worker locally with `wrangler dev`.
- `pnpm check`: TypeScript project build check (`tsc -b`).
- `pnpm lint`: Biome lint + format check (`biome check .`).
- `pnpm format`: apply Biome formatting.
- `pnpm build`: typecheck then Vite production build.
- `pnpm preview`: preview the production build on `127.0.0.1`.
- `pnpm db:migrate:local` / `pnpm db:migrate:remote`: apply `schema.sql` to D1.
- `pnpm deploy`: build then `wrangler deploy`.

## Coding Style & Naming Conventions

TypeScript with strict compiler settings; formatting/linting via Biome
(`biome.json`: two-space indentation, double quotes). Prefer named exports and
`import type`. React components use PascalCase file and component names. Avoid
magic strings/numbers; extract named constants. Keep functions small with one
clear responsibility.

## Testing Guidelines

There is no automated test suite yet; `pnpm check` and `pnpm build` are the
gate (also run in CI). Verify UI changes manually in the browser. If tests are
added, use Vitest with colocated `*.test.ts` files and add a `test` script.

## Commit & Pull Request Guidelines

Use concise Conventional Commits with an emoji prefix, for example
`✨ feat: add tag filter` or `🐛 fix: keep caption on media edit`. Pull
requests should include a short summary, check/build results, linked issue if
available, and screenshots for visible UI changes. CI (`.github/workflows/ci.yml`)
must be green before merging.

## Agent-Specific Instructions

Keep responses short and focused. If a requirement is unclear, ask before making
assumptions. Use `pnpm` only. Colors come from the `--ui-*` design tokens in
`src/styles/tokens.css` (structure shared with `../ui-kit`); do not hardcode
new colors.
Design UI/UX to fit inside a single viewport by default. Avoid page-level
scrolling; use compact layouts, tabs, panes, or contained internal lists when
content can overflow.
