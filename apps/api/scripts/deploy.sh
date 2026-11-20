#!/usr/bin/env bash
# Apply D1 migrations and deploy the Worker.
#   usage: npm run deploy  |  pnpm run deploy   [extra wrangler deploy args]
#   env:   WRANGLER_CONFIG  config file in apps/api (default wrangler.jsonc)
#
# On the very first deploy the D1 database does not exist yet: Wrangler
# creates it (and the R2 bucket) during `wrangler deploy`, so we migrate after.
# Any other error from `d1 info` aborts — never ship code ahead of migrations.
set -euo pipefail
cd "$(dirname "$0")/.."
CONFIG="${WRANGLER_CONFIG:-wrangler.jsonc}"
wr() { wrangler "$@" --config "$CONFIG"; }   # node_modules/.bin is on PATH under npm/pnpm run

if info_err=$(wr d1 info DB 2>&1 >/dev/null); then
  wr d1 migrations apply DB --remote
  wr deploy "$@"
elif grep -q "Couldn't find" <<<"$info_err"; then
  echo "D1 database not found — first deploy: deploying (creates D1 + R2), then migrating."
  wr deploy "$@"
  wr d1 migrations apply DB --remote
else
  echo "$info_err" >&2
  echo "deploy: could not check the D1 database (see above); aborting." >&2
  exit 1
fi
