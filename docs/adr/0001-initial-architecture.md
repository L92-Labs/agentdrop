# ADR-0001 — Initial architecture (agentdrop)

Date: 2026-09 · Status: Accepted · Frontend and infrastructure parts superseded by [ADR-0003](0003-open-source-self-hosting.md)

## Context
agentdrop was scaffolded by **cf-bootstrap**. This ADR records the structural
decisions inherited from that scaffold so future changes start from a known baseline.

## Decision
- **Backend**: Hono on Cloudflare Workers (`apps/api`). TypeScript, strict.
- **Frontend**: Next.js (`apps/web`).
- **Shared types**: `packages/shared` (pnpm workspace).
- **State / storage**: R2 (objects), KV (cache/sessions), D1 (relational) — whichever modules were selected; see `infra/main.tf`.
- **Infrastructure**: Terraform via Terragrunt, consuming the shared `cf-tf-modules` repo by git tag. State in R2 (S3-compatible), scoped per project.
- **Secrets**: per-project scoped Cloudflare token + R2 S3 creds in gitignored `.env.infra`; runtime secrets via Wrangler secrets / Secrets Store binding.
- **CI**: typecheck + lint + a Cloudflare-only dependency allowlist on every PR; deploy on push to main.

## Consequences
- Cloudflare-only: no AWS/GCP/Azure services. Adding one requires a new ADR.
- Resource modules are owned centrally (`cf-tf-modules`); this repo references them by tag.
- Deploy = `make apply` (infra) + `make deploy` (Worker). Custom domains require the `workers-domain` module after the Worker exists.

## How to change this
Write `docs/adr/000N-<topic>.md`. Mark superseded ADRs as such; never delete them.
