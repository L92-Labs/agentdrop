# API reference

Base URL: your instance, for example `https://drop.example.com`. Each instance
also renders a short version of this page at `/api`. The agent-facing skill at
`/skill.md` includes the limits that instance is running with.

## Authentication

| Who | How |
|-----|-----|
| Machines and agents | `Authorization: Bearer dev_…` (the device token from `POST /api/v1/device/init`) |
| People, optional | Cloudflare Access on `/dashboard/*` and `/link/*`. The Worker verifies the `Cf-Access-Jwt-Assertion` header. |

Errors are JSON in the form `{ "error": "<code>", … }`, sometimes with a `hint`.

## Devices

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/api/v1/device/init` | Creates a device and returns `device_token` and `device_id`. If `ENROLL_TOKEN` is set, send `X-Enroll-Token: <token>`; otherwise the response is `401 enroll_token_required`. |
| `GET` | `/api/v1/device/status` | Returns `tier`, `rate_limit`, `limits` (file, storage and count caps) and `storage` (current usage), plus `claimed` and `verify_url`. |
| `POST` | `/api/v1/device/label` | JSON `{ "label": "ci-runner-3" }`. |
| `POST` | `/api/v1/device/rotate` | Returns a new `device_token`. The old token stops working immediately. |
| `POST` | `/api/v1/device/revoke` | Revokes this token permanently. |

Tiers:

| Tier | Who | Rate limit |
|------|-----|------------|
| `cold` | New device | `UPLOADS_PER_HOUR` per hour |
| `verified` | Passed Turnstile at `/verify/:deviceId` | `UPLOADS_PER_DAY_VERIFIED` per day |
| `claimed` | Linked to an Access account | `UPLOADS_PER_DAY_LINKED` per day |

## Artifacts

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/api/v1/artifacts` | Multipart form, see below. |
| `GET` | `/api/v1/artifacts` | Lists this device's artifacts with their URLs. |
| `PATCH` | `/api/v1/artifacts/:id` | JSON `{ "expires": "24h" \| "7d" \| "30d" \| "now" }`. |
| `DELETE` | `/api/v1/artifacts/:id` | Deletes the file and its record. |
| `POST` | `/api/v1/artifacts/:id/share/rotate` | Issues a new `?s=` token for a secret artifact. Old links stop working. |
| `POST` | `/api/v1/artifacts/:id/share/revoke` | Makes a secret artifact private. The file is kept. |

Fields for `POST /api/v1/artifacts`:

| Field | Required | Meaning |
|-------|----------|---------|
| `file` | yes | The file to upload |
| `filename`, `title` | no | Display name and title |
| `visibility` | no | `public` (default), `secret` or `private`, see below |
| `password` | no | Viewers must enter this password |
| `expires` | no | Linked devices only. For example `24h`, `7d`, up to `MAX_RETENTION_DAYS` |
| `retention_days` | no | Linked devices only. Expiry as a number of days |

Visibility:

- **Secret** needs a linked device, except when the instance has Access turned off.
- **Private** needs a linked device. Only the owning device token can fetch it.

The response includes `id`, `url` (the viewer), `raw_url`, `visibility`,
`share_token`, `expires_at`, `size_bytes`, `tier` and `uploads_remaining`.

### Large files (multipart)

Files over 95 MB, up to `MAX_FILE_MB`, are uploaded in parts. The CLI does this
automatically.

1. `POST /api/v1/artifacts/multipart` with JSON `{ filename, size_bytes, mime?, title?, visibility?, password?, expires? }`.
   The response contains `upload_id`, `part_size` and `parts_expected`.
2. `PUT /api/v1/artifacts/multipart/:uploadId/parts/:partNumber` with the raw
   bytes of each part. Every part except the last must be at least 5 MB.
3. `POST /api/v1/artifacts/multipart/:uploadId/complete`. The response is the
   same as a normal upload.

To abort an upload, send `DELETE /api/v1/artifacts/multipart/:uploadId`.

### Limit errors

| Status | `error` | Cause |
|--------|---------|-------|
| 429 | `rate_limit_exceeded` | The tier's rate limit was hit. The response includes `verify_url` when Turnstile is on. |
| 413 | `file_too_large` | Over `MAX_FILE_MB` |
| 413 | `storage_quota_exceeded` | Over `MAX_STORAGE_MB` for this owner |
| 413 | `artifact_limit_exceeded` | Over `MAX_ARTIFACTS` for this owner |
| 413 | `use_multipart` | Over 95 MB on the single-request endpoint |
| 507 | `instance_storage_full` | Over `MAX_TOTAL_STORAGE_MB` |
| 403 | `private_requires_claimed_device` / `private_requires_access` | The visibility isn't allowed for this device or instance |

## Viewing

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/a/:id[?s=token]` | Viewer page (HTML). Use `/r/…` or `GET /api/v1/artifacts` for machine access. |
| `GET` | `/a/:id/render[?s=token]` | HTML artifacts, served in a sandboxed iframe |
| `GET` | `/r/:id/:filename[?s=token]` | Raw bytes from R2 |
| `POST` | `/a/:id/unlock` | Form field `password`. Sets an unlock cookie. |

## Linking (Access only)

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/api/v1/link/start` | Returns `link_code` and `verify_url`. Open `verify_url` in a browser to approve. Returns 404 `access_not_configured` when Access is off. |
| `GET` | `/api/v1/link/status` | Shows whether this device is linked |
| `GET`/`POST` | `/link/:code` | Approval page, behind Access |
| `GET` | `/api/v1/account` | Devices, artifacts, limits and usage for the signed-in account |
| `GET` | `/dashboard` | Dashboard. Under `/dashboard/…`: artifact delete, share rotate/revoke, expiry `PATCH`, and device revoke. |

## MCP

`POST /mcp` speaks JSON-RPC (MCP `initialize`, `tools/list`, `tools/call`)
with the same device bearer token.

| Tool | Purpose |
|------|---------|
| `upload_artifact` | Upload `content_base64` (keep it small), with optional `filename`, `mime`, `visibility`, `password` and `expires`. Without content, it returns a curl command. |
| `list_artifacts` | List this device's artifacts |
| `delete_artifact` | Delete an artifact by `id` |
| `set_expiry` | Set an artifact's expiry: `id` plus `expires` (`24h`, `7d` or `now`) |
| `rotate_share` / `revoke_share` | Rotate or revoke secret links |
| `device_status` | Tier, limits and usage |
| `link_device` | Start the Access linking flow |

## Health

- `GET /healthz` checks that the Worker is up. It never touches D1.
- `GET /readyz` also checks D1. It returns 503 when D1 is down.
