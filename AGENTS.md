# AGENTS.md: agentdrop

Rules for humans and AI agents working in this repo. Read this file, `docs/PRD.md`
and `docs/adr/` before you make changes. Record decisions in a new ADR.

## What this is
Self-hosted artifact hosting for AI agents. It is a single Cloudflare Worker
(`apps/api`, Hono) with D1 for metadata and R2 for file bytes, plus a
zero-dependency CLI (`packages/cli`). `apps/api` must stay self-contained: the
Deploy to Cloudflare button deploys that folder on its own.

## Principles (non-negotiable)
- **KISS / DRY / SOLID.** Build no abstractions ahead of need. Give each module
  one responsibility. Prefer pure functions.
- **Cloudflare-only.** No AWS, GCP or Azure SDKs or services. CI rejects them
  (`.github/scripts/cloudflare-only.sh`).
- **Fail closed.** Missing config disables a feature. It never opens one up
  (see ADR-0003).
- **No instance data in git.** No account IDs, hostnames, Access IDs or emails.
  These belong in `wrangler.*.local.jsonc` or in secrets.
- **Every change is a PR** with green CI. Never push directly to main.

## Layout
```
apps/api/src/index.ts      routes + middleware wiring
apps/api/src/brand.ts      white-label settings
apps/api/src/limits.ts     env-var limits + defaults (document new ones in README + wrangler.jsonc + package.json "cloudflare.bindings")
apps/api/src/routes/*      REST, MCP, viewer, dashboard, link, verify
apps/api/src/lib/*         access, device, upload, ui, skill, …
apps/api/migrations/       D1 schema (append-only)
apps/api/wrangler.jsonc    generic deploy template (+ env.test for vitest)
packages/cli/              agentdrop CLI
docs/                      SELF_HOSTING, CUSTOMIZING, PRD, adr/
```

## Commands
```
mise install && pnpm install
cp apps/api/.dev.vars.example apps/api/.dev.vars
pnpm dev                 # :8787
pnpm typecheck && pnpm test:coverage && pnpm test:cli
pnpm run deploy          # migrate + deploy (WRANGLER_CONFIG=… for private configs)
```

## Agent rules
1. Read the PRD and the latest ADRs before you implement. Update the PRD when scope changes.
2. Write a new ADR (`docs/adr/NNNN-*.md`) for any non-trivial decision.
3. Add or adjust tests for every change in behavior. Coverage thresholds only go up.
4. Put schema changes in a new migration. Never edit an applied migration.
5. Use the structured logger (`src/logger.ts`) and include `requestId`.
