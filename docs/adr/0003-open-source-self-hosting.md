# ADR-0003: Open source and self-hosting

Date: 2026-11-20 · Status: Accepted · Supersedes parts of ADR-0001 (frontend, infrastructure)

## Context

Agentdrop is published as open source so clients can run their own branded
instance. The repository held one operator's instance details, including
account and D1 IDs, Access team and AUD tags, and personal emails. It also
contained an unused cf-bootstrap/Terragrunt scaffold (`infra/`, Next.js
leftovers). Customizing it meant editing code in several places.

## Decision

- **Wrangler is the only deploy tool.** `apps/api/wrangler.jsonc` is a generic
  template with no IDs. Wrangler finds or creates the D1 database and R2 bucket
  by name. `apps/api/scripts/deploy.sh` migrates and deploys, and handles the
  first deploy. The `infra/` Terragrunt tree is removed.
- **Instance config can stay private.** `WRANGLER_CONFIG` points the deploy
  script at a gitignored `wrangler.*.local.jsonc`. CI can write that file from a
  secret of the same name.
- **One branding file.** `apps/api/src/brand.ts` holds the name, copy, colors
  and fonts.
- **No plans; limits are env vars.** The free/paid split and `PAID_EMAILS` are
  removed. All limits are optional Worker variables (`src/limits.ts`). Storage
  and file-count limits apply per owner, meaning a linked account or an
  unlinked device. There is also an optional instance-wide storage cap.
- **Access and Turnstile are optional.** Without Access there are no accounts,
  and secret and password links are open to every device. The optional
  `ENROLL_TOKEN` makes device creation private.
- **Deploy to Cloudflare button.** `packages/shared` is inlined so `apps/api`
  deploys on its own. `PUBLIC_BASE_URL` falls back to the request origin.
- **Fail closed.** Access login needs both the team domain and AUD, and the JWT
  signature is verified against the team's certs. The Worker returns 503
  without `TOKEN_PEPPER`. `exp` is required, and certs fetches are rate-limited.
- **The CLI has no default server.** `agentdrop init <url>` records it.

## Consequences

- A client deploys with `wrangler login`, one secret and `pnpm run deploy`.
- Access apps, the custom domain and Turnstile are set up in the dashboard
  (documented in `docs/SELF_HOSTING.md`) instead of in Terraform.
- Existing instances keep their real config in a `wrangler.*.local.jsonc` or in
  the `WRANGLER_CONFIG` CI secret. The `accounts.plan` column stays in the
  schema, but nothing reads it any more.
