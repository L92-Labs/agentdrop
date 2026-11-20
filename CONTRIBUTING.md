# Contributing

Thanks for helping. Issues and pull requests are welcome.

## Setup

```bash
mise install          # Node 22 + pnpm (or install them yourself)
pnpm install
cp apps/api/.dev.vars.example apps/api/.dev.vars
pnpm dev              # http://localhost:8787
```

## Before opening a PR

```bash
pnpm typecheck
pnpm test:coverage    # thresholds only go up
pnpm test:cli
bash .github/scripts/cloudflare-only.sh
```

- Keep changes small and focused. One PR should do one thing.
- Add or adjust tests for any change in behavior. Integration tests run the
  real Worker in Miniflare (`apps/api/test/integration`).
- Schema changes go in a new migration file. Never edit an applied migration.
- Write an ADR in `docs/adr/` for a non-trivial design decision, and update
  `docs/PRD.md` when scope changes.
- Update `docs/API.md` for API changes, and add a line under "Unreleased" in
  `CHANGELOG.md` for anything users will notice.
- Cloudflare-only: no AWS, GCP or Azure SDKs. CI rejects them.
- Never commit secrets, `.dev.vars` or `wrangler.*.local.jsonc`.

## Commit and PR style

Use an imperative subject line ("Add expiry to MCP upload"). The body explains
why. In the PR description, say what changed, how you tested it, and what could
break.

## Security

Do not open public issues for vulnerabilities. See [SECURITY.md](SECURITY.md).
