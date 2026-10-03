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
                         #   session.ts (SSO cookie via @huyab/sso + users), crypto.ts
mcp/index.mjs            # MCP server exposing upload tools to agents
skills/share-artifact/   # Agent skill (SKILL.md)
scripts/                 # share.sh (CLI upload), install-skill.sh
e2e/                     # playwright-core smoke on @huyab/e2e: run.mjs, readonly-smoke, ui-smoke
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
- `pnpm e2e`: build, fresh local D1 (`.wrangler/e2e-state`), mock SSO issuer,
  `wrangler dev --local`, then `e2e/readonly-smoke.mjs` + `e2e/ui-smoke.mjs`.
- `pnpm e2e:prod`: read-only smoke (GET only, logged out) against `share.huyab.click`.

## Coding Style & Naming Conventions

TypeScript with strict compiler settings; formatting/linting via Biome
(`biome.json`: two-space indentation, double quotes). Prefer named exports and
`import type`. React components use PascalCase file and component names. Avoid
magic strings/numbers; extract named constants. Keep functions small with one
clear responsibility.

## Testing Guidelines

No unit test suite yet; `pnpm check`, `pnpm build` and `pnpm e2e` are the gate
(all run in CI). E2E uses `playwright-core` with a system/CI Chromium
(`findChromium` from `@huyab/e2e`). `startSsoMock` (`@huyab/e2e`) signs a real
`huyab_sso` JWT and serves its JWKS, so the worker's SSO verifier runs unmodified. `ui-smoke.mjs`
writes data and refuses non-localhost URLs; `readonly-smoke.mjs` must stay
GET-only (and never open a real artifact: each view bumps `views`) because it
also runs against production.

## Commit & Pull Request Guidelines

Use concise Conventional Commits with an emoji prefix, for example
`✨ feat: add tag filter` or `🐛 fix: keep caption on media edit`. Pull
requests should include a short summary, check/build results, linked issue if
available, and screenshots for visible UI changes. CI (`.github/workflows/ci.yml`)
must be green before merging.

## Ecosystem

See the [huyab.click ecosystem map](https://github.com/nguyenhuy158/kit/blob/main/docs/ECOSYSTEM.md) for how all personal repos connect.

- Kit packages: `@huyab/sso` (`verifySsoToken` on the `huyab_sso` cookie only;
  `Authorization: Bearer` is the master password), `@huyab/e2e` (`startServer`,
  `run`, `freePort`, `startSsoMock`, `findChromium`, `BASE`, `assertLocalOnly`
  in `e2e/`), `@huyab/config` (Biome + tsconfig base), reusable CI
  `nguyenhuy158/kit/.github/workflows/check.yml@v0.1.0`.
- Talks to: sso (JWKS at `auth.huyab.click`, login/logout redirects), shared D1
  `db` (`share_` prefix). Called by AI agents through `mcp/index.mjs`,
  `scripts/share.sh` and `skills/share-artifact` (all target
  `https://share.huyab.click`); mytools pings it for uptime.

## Agent-Specific Instructions

Keep responses short and focused. If a requirement is unclear, ask before making
assumptions. Use `pnpm` only. Colors come from the `--ui-*` design tokens in
`src/styles/tokens.css` (structure shared with `../ui-kit`); do not hardcode
new colors.
Design UI/UX to fit inside a single viewport by default. Avoid page-level
scrolling; use compact layouts, tabs, panes, or contained internal lists when
content can overflow.
