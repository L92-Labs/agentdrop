/** Agent skill markdown served at GET /skill.md */
import { BRAND } from "../brand";
import type { Config } from "../config";

function mb(bytes: number): string {
  const v = bytes / (1024 * 1024);
  return v >= 1024 ? `${+(v / 1024).toFixed(1)}GB` : `${+v.toFixed(1)}MB`;
}

function limitsSection(config: Config): string {
  const l = config.limits;
  const lines = [
    `- Max file: **${mb(l.maxFileBytes)}**. Storage per owner: **${l.maxStorageBytes ? mb(l.maxStorageBytes) : "unlimited"}**. Artifacts per owner: **${l.maxArtifacts || "unlimited"}**`,
    `- Default expiry: ${l.retentionDays} days (unlinked device), ${l.retentionDaysLinked} days (linked device, may set up to ${l.maxRetentionDays}d)`,
    `- Uploads: ${l.uploadsPerHour}/hour for a new device` +
      (config.turnstileEnabled ? ` → complete Turnstile at \`{base}/verify/{device_id}\` → ${l.uploadsPerDayVerified}/day` : "") +
      (config.accessEnabled ? ` → linked device: ${l.uploadsPerDayLinked}/day` : ""),
    config.accessEnabled
      ? "- Private and secret links need a linked device (`agentdrop link`)"
      : "- No account login on this instance: secret (`?s=`) and password links work for every device; private links are unavailable",
    "- `agentdrop status` returns the effective `rate_limit`, `limits` and `storage`",
  ];
  return lines.join("\n");
}

export function skillMarkdown(config: Config): string {
  const baseUrl = config.publicBaseUrl;
  return `---
name: agentdrop
description: Upload and share agent artifacts (images, video, HTML, PDF, Markdown, files) via ${BRAND.name}. Use when uploading screenshots, mockups, or files, or when you need a shareable link for an artifact.
---

# ${BRAND.name}

**Base URL:** ${baseUrl}

## Credentials

Read \`~/.agentdrop/token.json\`:

\`\`\`json
{ "device_token": "dev_…", "base_url": "${baseUrl}", "device_id": "dvc_…" }
\`\`\`

If missing:

\`\`\`bash
agentdrop init ${baseUrl}
# or:
mkdir -p ~/.agentdrop && chmod 700 ~/.agentdrop
curl -sX POST "${baseUrl}/api/v1/device/init" \\
  | jq --arg base "${baseUrl}" '{device_token: .device_token, device_id: .device_id, base_url: $base}' \\
  > ~/.agentdrop/token.json
chmod 600 ~/.agentdrop/token.json
\`\`\`

CLI install (once per machine): symlink \`packages/cli/bin/agentdrop.js\` to \`~/.local/bin/agentdrop\`, or from the repo run \`pnpm cli:link\`.

## Upload (prefer CLI — keeps bytes out of context)

\`\`\`bash
agentdrop upload /path/to/file.png --title "optional"
agentdrop upload /path/to/file.png --private
agentdrop upload /path/to/file.png --secret
agentdrop upload /path/to/notes.md --password "share-secret" --expires 24h
\`\`\`

Or curl:

\`\`\`bash
TOKEN=$(jq -r .device_token ~/.agentdrop/token.json)
curl -sX POST "${baseUrl}/api/v1/artifacts" \\
  -H "Authorization: Bearer $TOKEN" \\
  -F "file=@/path/to/file.png"
\`\`\`

Response includes \`url\` (viewer) and \`raw_url\`.

### Markdown + local images (important)

Do **not** hand-edit image paths before upload. Prefer:

\`\`\`bash
agentdrop upload ./report.md
\`\`\`

The CLI:

1. Finds \`![alt](./shot.png)\` / relative image paths that exist on disk next to the \`.md\`
2. Uploads each image (same visibility / expiry; **not** the markdown password — so images load in the viewer after unlock)
3. Rewrites those refs to hosted \`raw_url\` values
4. Uploads the rewritten markdown

Then share the markdown \`url\`. The viewer renders Markdown (headings, lists, code, links, images).

If you must use curl/MCP for markdown: upload images first, put their \`raw_url\` into the markdown, then upload the \`.md\`.

## Password + expiry

- \`--password\` / form field \`password\`: gate on \`/a/:id\` (owners skip; unlock cookie lasts 24h)
- \`--expires 24h|7d\` (claimed devices): shorter TTL than the default 30d

## Secret links

\`\`\`bash
agentdrop upload ./shot.png --secret
agentdrop share rotate art_…
agentdrop share revoke art_…   # becomes private; file kept
\`\`\`

Rotate mints a new \`?s=\` token (old links die). Revoke clears the secret link.

## Change expiry after upload

\`\`\`bash
agentdrop expires art_… 7d
agentdrop expires art_… now
\`\`\`

## Limits on this instance

${limitsSection(config)}

## Link device to account

\`\`\`bash
agentdrop link
\`\`\`

Open \`verify_url\` in a browser (Cloudflare Access) and approve. Dashboard includes **Log out** (Access logout).

## MCP (optional)

\`POST ${baseUrl}/mcp\` with header \`Authorization: Bearer dev_…\`

Tools: \`upload_artifact\` (\`content_base64\`, optional \`password\` / \`expires\`), \`list_artifacts\`, \`delete_artifact\`, \`rotate_share\`, \`revoke_share\`, \`set_expiry\`, \`device_status\`, \`link_device\`.

For markdown with local images, use the **CLI** (\`agentdrop upload report.md\`) so assets are rewritten automatically.
`;
}

export function setupPrompt(baseUrl: string): string {
  return `Set up ${BRAND.name} on this machine so you can upload and share files (screenshots, HTML, PDFs, Markdown, etc.).

Do all of the following:

1. **Initialize device token**
   - Prefer \`agentdrop init ${baseUrl}\` if the CLI is on PATH
   - Else: \`mkdir -p ~/.agentdrop && chmod 700 ~/.agentdrop\` then \`curl -sX POST "${baseUrl}/api/v1/device/init" | jq --arg base "${baseUrl}" '{device_token: .device_token, device_id: .device_id, base_url: $base}' > ~/.agentdrop/token.json && chmod 600 ~/.agentdrop/token.json\`

2. **Install the ${BRAND.name} skill** (required)
   - Fetch ${baseUrl}/skill.md
   - Write it to \`~/.agents/skills/agentdrop/SKILL.md\` (preferred shared location)
   - Symlink into agent dirs: \`~/.cursor/skills/agentdrop\`, \`~/.claude/skills/agentdrop\`, \`~/.codex/skills/agentdrop\` → that shared folder

3. **Optional — install CLI**
   - If this repo is present: \`pnpm cli:link\` from the agentdrop repo root
   - Else download/write \`agentdrop\` script that wraps the HTTP API into \`~/.local/bin/agentdrop\`

4. **Verify**
   - \`agentdrop status\` or \`curl -s "${baseUrl}/api/v1/device/status" -H "Authorization: Bearer $(jq -r .device_token ~/.agentdrop/token.json)"\`

5. **Optional — MCP**
   - Add remote MCP server URL \`${baseUrl}/mcp\` with header \`Authorization: Bearer <device_token from token.json>\`

When done, confirm the device_id and tier. Upload with \`agentdrop upload path\` (for \`.md\` with local images, the CLI rewrites paths automatically) and share the \`/a/:id\` link.`;
}
