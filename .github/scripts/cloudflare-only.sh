#!/usr/bin/env bash
# Enforce Cloudflare-only dependencies: reject AWS/GCP/Azure/other-cloud SDKs.
# Runs in CI (`.github/workflows/check.yml`). Exit non-zero on a violation.
set -euo pipefail
shopt -s globstar nullglob

deny='^(@aws-sdk/|aws-sdk$|@google-cloud/|firebase-admin$|@azure/|azure-|aliyun|mongodb$|@elastic/|datadog|dd-trace$|@sentry/|@?stripe)'
violations=()
for f in **/package.json; do
  case "$f" in *node_modules*) continue ;; esac
  while IFS= read -r dep; do
    [ -n "$dep" ] || continue
    if printf '%s\n' "$dep" | grep -Eq "$deny"; then
      violations+=("$f -> $dep")
    fi
  done < <(jq -r '((.dependencies // {}) + (.devDependencies // {})) | keys[]' "$f")
done

if [ ${#violations[@]} -gt 0 ]; then
  echo "Cloudflare-only violation(s) — off-platform dependency found:" >&2
  printf '  %s\n' "${violations[@]}" >&2
  echo "This project runs on Cloudflare Workers. Use R2/KV/D1/Queues/AI instead." >&2
  exit 1
fi
echo "Cloudflare-only: OK"
