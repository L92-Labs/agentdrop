# PRD — agentdrop

Source of truth for *what* we're building. Update this when scope changes; decisions go in `docs/adr/`.

## Vision

Private artifact hosting for coding agents: upload screenshots, HTML, video, Markdown, and binaries from a machine token; share unlisted / secret / password links without standing up a web app.

## Problem

Agents produce files constantly (diffs as screenshots, HTML previews, logs, videos). Pasting into chat burns context; public pastebins are wrong for private work; S3/R2 DIY is too much friction per machine.

## Personas

1. **Human operator** — links machines via Cloudflare Access, reviews the dashboard, shares links with teammates or clients.
2. **Coding agent** — runs `agentdrop upload` / MCP with a device bearer token; must stay out of interactive login.

## Goals

- One bearer token per machine; claim to an Access account for private/secret/password and higher quotas.
- Fast path: CLI upload → viewer URL; Markdown with local images rewritten automatically.
- Share controls: public (unguessable id), secret (`?s=`), password gate, expiry.
- Cost control: per-file, per-owner and instance-wide caps set with env vars.

## Non-goals

- Next.js / public gallery / marketing site beyond server-rendered Worker HTML.
- Teams, folders, versioning, comments.
- Billing or paid plans (this is self-hosted; operators set limits with env vars).
- Arbitrary vanity domains per customer.
- Thumbnail CDN / transcoding.

## Modules / resources

- Cloudflare Worker (Hono) + D1 + R2 + Access + Turnstile
- CLI (`packages/cli`) + hosted skill (`GET /skill.md`) + optional MCP (`POST /mcp`)

## Limits

All limits are optional Worker variables. The defaults and their meaning are
documented in `README.md#configure` and `apps/api/src/limits.ts`. There are no
paid plans. Admins can set a positive integer in `devices.daily_upload_limit`
for a single linked device. Setting it back to NULL restores the default.

## Open questions

- Whether free should allow secret/password or reserve those for claimed-only (today: claimed required for private/secret).

## Milestones

- [x] Device token init, upload, viewer, raw R2
- [x] Access claim, private ACL, secret links, password + expiry
- [x] Dashboard delete / device revoke / rotate / labels
- [x] Multipart up to 1GB (paid); MIME inference; MD + local image rewrite
- [x] Env-var limits (replaced free/paid plans)
- [x] Secret share rotate / revoke (kill leaked `?s=` without deleting)
- [x] Patch expiry after upload (`expires` / expire now)
- [x] Open source + self-hosting (ADR-0003)
- [ ] Production hardening: alerts / on-call beyond Worker observability
