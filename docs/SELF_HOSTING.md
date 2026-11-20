# Self-hosting Agentdrop

Agentdrop runs as a single Cloudflare Worker with one D1 database and one R2
bucket. The Workers free plan is enough to try it.

| Step | Required? | What you get |
|------|-----------|--------------|
| [Deploy](#deploy) | yes | Uploads, the viewer, CLI, MCP, the skill, secret and password links |
| [Custom domain](#custom-domain) | recommended | `https://drop.example.com` |
| [Private instance](#private-instance-enroll-token) | optional | Only people you give the token to can create devices |
| [Cloudflare Access](#cloudflare-access-optional) | optional | Dashboard, accounts, device linking, private files |
| [Turnstile](#turnstile-optional) | optional | A higher upload tier for unlinked devices that prove they're human |
| [Limits](#limits) | optional | File size, storage, file count, retention, upload rate |
| [CI deploys](#deploy-from-github-actions) | optional | Deploy from your own fork on every push |

R2 must be enabled once on the account: go to **Dashboard → R2** and accept
the terms. The R2 free tier covers small instances.

## Deploy

### Option A: Deploy to Cloudflare button

Press the button in the README. Cloudflare:

1. Copies `apps/api` into a new GitHub repository on your account.
2. Creates the D1 database and R2 bucket.
3. Asks for the `TOKEN_PEPPER` secret (paste `openssl rand -hex 32`) and shows
   the variables, which all have working defaults.
4. Builds and deploys. The deploy script applies the D1 migrations.

Every later push to that repository redeploys through Workers Builds. You can
change the variables at any time in **Worker → Settings → Variables**.

### Option B: from a clone

Requires Node 22+ and pnpm 11 (`mise install` pins both).

```bash
pnpm install
cd apps/api
npx wrangler login            # or export CLOUDFLARE_API_TOKEN (+ CLOUDFLARE_ACCOUNT_ID)
openssl rand -hex 32 | npx wrangler secret put TOKEN_PEPPER
pnpm run deploy
```

If your login has access to several accounts, set `CLOUDFLARE_ACCOUNT_ID`
first. Otherwise the piped `secret put` can't prompt you to choose an account.

On the first run Wrangler creates the D1 database (`agentdrop`) and the R2
bucket (`agentdrop-data`), then migrates. On later runs it migrates first,
then deploys. A first interactive deploy may write `database_id` into
`wrangler.jsonc`; keep it in your fork.

**Never change `TOKEN_PEPPER` after launch.** It signs out every device and
breaks every password link.

### Check it

```bash
curl https://<your-host>/readyz           # {"ok":true,"db":true}
agentdrop init https://<your-host>        # from the repo: pnpm cli:link first
agentdrop upload ./README.md
```

## Custom domain

The zone must be on Cloudflare. In `wrangler.jsonc`:

```jsonc
"routes": [{ "pattern": "drop.example.com", "custom_domain": true }],
"workers_dev": false,
"vars": { "PUBLIC_BASE_URL": "https://drop.example.com", ... }
```

Then run `pnpm run deploy`, or add the domain under **Worker → Settings →
Domains & Routes** if you used the button. `PUBLIC_BASE_URL` may stay empty;
links then use whichever hostname the request came in on.

## Private instance (enroll token)

Out of the box anyone who finds your URL can create a device and upload. Your
rate limits and storage limits still apply. To restrict who can create a device:

```bash
openssl rand -hex 24 | npx wrangler secret put ENROLL_TOKEN
```

Give the token to your users. They enroll with
`agentdrop init https://<host> --enroll <token>`, or set
`AGENTDROP_ENROLL_TOKEN`. Devices that already exist keep working.

## Cloudflare Access (optional)

Without Access there are no accounts:

- every device is anonymous
- secret and password links work for everyone
- `/dashboard` and `agentdrop link` report that the feature is off

With Access, people sign in through your identity provider (Google, GitHub,
Okta, one-time PIN and others). Once Access is on:

- **Dashboard** at `/dashboard` lists files and devices, and lets people
  delete, rotate and revoke links and change expiry.
- **Linking**: `agentdrop link` ties a machine to the signed-in account. The
  device gets `UPLOADS_PER_DAY_LINKED`, `RETENTION_DAYS_LINKED`, custom
  expiry, and private files. Only the owning device can fetch a private file,
  through the API or CLI with its token.
- Storage and file-count limits then apply per account rather than per device.

Setup:

1. In **Zero Trust → Settings**, note your team domain, e.g. `https://acme.cloudflareaccess.com`.
2. Go to **Access → Applications → Add → Self-hosted** and create one application:
   - Destination `drop.example.com/dashboard`, plus a second destination `drop.example.com/link`
   - Policy: allow the emails, email domains or IdP groups who should have accounts
3. Copy the application's **Audience (AUD) tag**.
4. Set the variables and redeploy:

   ```jsonc
   "CF_ACCESS_TEAM_DOMAIN": "https://acme.cloudflareaccess.com",
   "CF_ACCESS_AUD": "<aud-tag>"
   ```

The Worker verifies each Access JWT's signature against your team's public
keys, and checks the AUD, issuer and expiry. If either variable is empty,
Access stays off.

Use a custom domain with `workers_dev: false`. Access protects hostnames, so a
`*.workers.dev` URL would otherwise stay reachable without it. The signature
check still blocks forged logins there.

## Turnstile (optional)

Turnstile gives a higher upload tier to unlinked devices that prove a human is
behind them.

1. Go to **Dashboard → Turnstile → Add widget**, add your hostname, and choose mode *Managed*.
2. Set `TURNSTILE_SITE_KEY`, and set the secret with `npx wrangler secret put TURNSTILE_SECRET_KEY`.
3. Rate-limited uploads now return a `verify_url`. After the challenge, the
   device gets `UPLOADS_PER_DAY_VERIFIED` uploads per day.

## Limits

Every limit is a Worker variable; the table in the [README](../README.md#configure)
lists them all. Some examples:

```jsonc
// Small team instance: 50 MB files, 500 MB and 200 files per person, 3-day expiry
"MAX_FILE_MB": "50", "MAX_STORAGE_MB": "500", "MAX_ARTIFACTS": "200", "RETENTION_DAYS": "3"

// Cap the whole bucket at 20 GB (uploads then get 507 instance_storage_full)
"MAX_TOTAL_STORAGE_MB": "20480"

// Only linked or verified devices may upload
"UPLOADS_PER_HOUR": "0"
```

Changes made in the dashboard take effect immediately. Changes in
`wrangler.jsonc` take effect on the next deploy. To raise the daily upload
limit of one linked device:
`npx wrangler d1 execute DB --remote --command "UPDATE devices SET daily_upload_limit = 1000 WHERE id = 'dvc_…'"`.

## Deploy from GitHub Actions

`.github/workflows/ci.yml` runs the checks on every push and pull request. On
`main` it also deploys, but only after the checks pass and only once the
repository has these secrets:

| Secret | Value |
|--------|-------|
| `CLOUDFLARE_API_TOKEN` | Token with *Workers Scripts: Edit*, *D1: Edit* and *Workers R2 Storage: Edit*. Add *Zone → Workers Routes: Edit* for a custom domain. |
| `CLOUDFLARE_ACCOUNT_ID` | Your account ID |
| `WRANGLER_CONFIG` *(optional)* | Full `wrangler.jsonc` for your instance, to keep hostnames and Access IDs out of a public fork |

Optionally, set the repository variable `E2E_BASE_URL` to run a live smoke
test after each deploy. `TOKEN_PEPPER` is a Worker secret, not a CI secret:
set it once with `wrangler secret put`. Until you do, the Worker answers 503.

To keep a private config while tracking the public repository, put it in
`apps/api/wrangler.<name>.local.jsonc` (gitignored) and deploy with
`WRANGLER_CONFIG=wrangler.<name>.local.jsonc pnpm run deploy`.

## Operations

- **Health:** `/healthz` shows the Worker is up. Point uptime monitors at `/readyz`, which also checks D1.
- **Logs:** Workers observability is on. Each request logs a structured line with a `requestId`.
- **Cleanup:** a cron job deletes expired files from R2 and D1 every day at 04:00 UTC.
- **Rollback:** run `npx wrangler rollback`. Migrations only add tables and columns.
- **Upgrade:** pull upstream (or sync your button-created repo), run `pnpm install`, then `pnpm run deploy`.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `503 Server misconfigured: set TOKEN_PEPPER` | Run `wrangler secret put TOKEN_PEPPER` |
| `401 enroll_token_required` | The instance has `ENROLL_TOKEN` set. Run `agentdrop init <url> --enroll <token>` |
| Dashboard says "not enabled" | Set both `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` |
| Dashboard returns `401` | `CF_ACCESS_AUD` doesn't match the Access application's AUD tag, or the path isn't behind that application |
| Links point at the wrong host | Set `PUBLIC_BASE_URL` |
| `deploy: could not check the D1 database` | Check the API token's D1 permissions and `CLOUDFLARE_ACCOUNT_ID` |
| R2 errors on first deploy | Enable R2 once in the dashboard |
