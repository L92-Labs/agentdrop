import type { Config } from "../config";
import { UPLOAD, type DeviceRecord } from "../shared";
import { Hono } from "hono";
import { artifactUrls, sanitizeMime } from "../lib/device";
import { formatExpiresIn, resolvePatchExpires } from "../lib/expiry";
import { iso, linkCode, randomId } from "../lib/ids";
import {
  assertUploadAllowed,
  artifactR2Key,
  consumeRateLimit,
  deviceRetentionDays,
  expiresAt,
  insertArtifact,
  mintShareToken,
  newArtifactId,
  normalizeVisibility,
  optionalPasswordHash,
  toUploadResponse,
} from "../lib/upload";
import type { AppContext } from "../middleware";

const MAX_BYTES = UPLOAD.maxBytesDirectUpload;

const TOOLS = [
  {
    name: "upload_artifact",
    description:
      "Upload an artifact. Prefer content_base64 (file bytes) so upload happens server-side. If only path is given, returns a local curl command for the agent to run. visibility: public | private | secret.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Local file path (for curl fallback)" },
        filename: { type: "string", description: "Filename when using content_base64" },
        content_base64: {
          type: "string",
          description: "Base64-encoded file bytes (uploads immediately; keep small)",
        },
        mime: { type: "string", description: "MIME type (default application/octet-stream)" },
        title: { type: "string" },
        visibility: { type: "string", enum: ["public", "private", "secret"] },
        password: { type: "string", description: "Optional share password" },
        expires: {
          type: "string",
          description: "TTL for claimed devices, e.g. 24h or 7d",
        },
      },
    },
  },
  {
    name: "list_artifacts",
    description: "List artifacts for this device token with viewer URLs.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "delete_artifact",
    description: "Delete an artifact owned by this device token.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Artifact id (art_…)" } },
      required: ["id"],
    },
  },
  {
    name: "rotate_share",
    description:
      "Rotate the secret share token for an artifact. Old ?s= links stop working. Artifact must be visibility=secret.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Artifact id (art_…)" } },
      required: ["id"],
    },
  },
  {
    name: "revoke_share",
    description:
      "Revoke the secret share link and set visibility to private (file kept). Owners can still view.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Artifact id (art_…)" } },
      required: ["id"],
    },
  },
  {
    name: "set_expiry",
    description:
      'Set artifact expiry relative to now. expires: "24h", "7d", "30d", or "now" (expire immediately).',
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Artifact id (art_…)" },
        expires: { type: "string", description: 'TTL e.g. "7d" or "now"' },
      },
      required: ["id", "expires"],
    },
  },
  {
    name: "device_status",
    description: "Check device claim and rate-limit tier.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "link_device",
    description: "Start device link flow; user approves in browser via Access.",
    inputSchema: { type: "object", properties: {} },
  },
];

export const mcpRoutes = new Hono<AppContext>();

mcpRoutes.post("/mcp", async (c) => {
  const body = (await c.req.json()) as {
    jsonrpc?: string;
    id?: number | string;
    method?: string;
    params?: { name?: string; arguments?: Record<string, unknown> };
  };

  const id = body.id ?? null;

  if (body.method === "initialize") {
    return c.json({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "agentdrop", version: "0.3.0" },
      },
    });
  }

  if (body.method === "tools/list") {
    return c.json({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
  }

  if (body.method === "tools/call") {
    const name = body.params?.name;
    const args = body.params?.arguments ?? {};
    const device = c.get("device");
    const base = c.get("config").publicBaseUrl;
    const token = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "<device_token>";

    if (name === "upload_artifact") {
      const contentB64 = args.content_base64 ? String(args.content_base64) : "";
      if (contentB64) {
        if (!device) return mcpError(c, id, "missing device token in Authorization header");
        try {
          const result = await uploadBytes(c.env, c.get("config"), device, args, contentB64);
          return c.json({
            jsonrpc: "2.0",
            id,
            result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] },
          });
        } catch (err) {
          return mcpError(c, id, err instanceof Error ? err.message : "upload_failed");
        }
      }

      const path = String(args.path ?? "");
      if (!path) return mcpError(c, id, "path or content_base64 required");
      const title = args.title ? `-F "title=${args.title}"` : "";
      const vis = args.visibility ? `-F "visibility=${args.visibility}"` : "";
      const cmd =
        `curl -s -X POST "${base}/api/v1/artifacts" -H "Authorization: Bearer ${token}" -F "file=@${path}" ${title} ${vis}`.trim();
      return c.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: `Run locally (keeps bytes out of model context):\n${cmd}\n\nOr call upload_artifact with content_base64 for small files.`,
            },
          ],
        },
      });
    }

    if (name === "list_artifacts") {
      if (!device) return mcpError(c, id, "missing device token in Authorization header");
      const res = await c.env.DB.prepare(
        "SELECT id, title, filename, mime, visibility, share_token, expires_at, size_bytes FROM artifacts WHERE device_id = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 50",
      )
        .bind(device.id, Date.now())
        .all();
      const artifacts = (res.results ?? []).map((row) => {
        const r = row as Record<string, unknown>;
        const shareToken = r.share_token ? String(r.share_token) : null;
        const urls = artifactUrls(base, String(r.id), String(r.filename), { shareToken });
        return { ...r, ...urls, expires_at: iso(Number(r.expires_at)) };
      });
      return c.json({
        jsonrpc: "2.0",
        id,
        result: { content: [{ type: "text", text: JSON.stringify({ artifacts }, null, 2) }] },
      });
    }

    if (name === "delete_artifact") {
      if (!device) return mcpError(c, id, "missing device token");
      const artId = String(args.id ?? "");
      if (!artId) return mcpError(c, id, "id required");
      const row = await c.env.DB.prepare(
        "SELECT r2_key, device_id FROM artifacts WHERE id = ?",
      )
        .bind(artId)
        .first<{ r2_key: string; device_id: string }>();
      if (!row || row.device_id !== device.id) return mcpError(c, id, "not_found");
      await c.env.DATA.delete(row.r2_key);
      await c.env.DB.prepare("DELETE FROM artifacts WHERE id = ?").bind(artId).run();
      return c.json({
        jsonrpc: "2.0",
        id,
        result: { content: [{ type: "text", text: JSON.stringify({ ok: true, id: artId }) }] },
      });
    }

    if (name === "rotate_share" || name === "revoke_share") {
      if (!device) return mcpError(c, id, "missing device token");
      const artId = String(args.id ?? "");
      if (!artId) return mcpError(c, id, "id required");
      const art = await c.env.DB.prepare(
        "SELECT id, filename, visibility, share_token, device_id FROM artifacts WHERE id = ?",
      )
        .bind(artId)
        .first<{
          id: string;
          filename: string;
          visibility: string;
          share_token: string | null;
          device_id: string;
        }>();
      if (!art || art.device_id !== device.id) return mcpError(c, id, "not_found");

      if (name === "rotate_share") {
        if (art.visibility !== "secret") return mcpError(c, id, "not_secret");
        const shareToken = mintShareToken("secret");
        await c.env.DB.prepare("UPDATE artifacts SET share_token = ? WHERE id = ?")
          .bind(shareToken, art.id)
          .run();
        const urls = artifactUrls(base, art.id, art.filename, { shareToken });
        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  { ok: true, id: art.id, visibility: "secret", share_token: shareToken, ...urls },
                  null,
                  2,
                ),
              },
            ],
          },
        });
      }

      await c.env.DB.prepare(
        "UPDATE artifacts SET visibility = 'private', share_token = NULL WHERE id = ?",
      )
        .bind(art.id)
        .run();
      const urls = artifactUrls(base, art.id, art.filename, { shareToken: null });
      return c.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { ok: true, id: art.id, visibility: "private", share_token: null, ...urls },
                null,
                2,
              ),
            },
          ],
        },
      });
    }

    if (name === "set_expiry") {
      if (!device) return mcpError(c, id, "missing device token");
      const artId = String(args.id ?? "");
      const expiresRaw = args.expires != null ? String(args.expires) : "";
      if (!artId) return mcpError(c, id, "id required");
      const art = await c.env.DB.prepare(
        "SELECT id, filename, visibility, share_token, device_id FROM artifacts WHERE id = ?",
      )
        .bind(artId)
        .first<{
          id: string;
          filename: string;
          visibility: string;
          share_token: string | null;
          device_id: string;
        }>();
      if (!art || art.device_id !== device.id) return mcpError(c, id, "not_found");
      const resolved = resolvePatchExpires(expiresRaw, Date.now(), c.get("config").limits.maxRetentionDays);
      if (!resolved.ok) return mcpError(c, id, resolved.error);
      await c.env.DB.prepare("UPDATE artifacts SET expires_at = ? WHERE id = ?")
        .bind(resolved.expiresAt, art.id)
        .run();
      const shareToken = art.visibility === "secret" ? art.share_token : null;
      const urls = artifactUrls(base, art.id, art.filename, { shareToken });
      return c.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  ok: true,
                  id: art.id,
                  expires_at: iso(resolved.expiresAt),
                  expires_in: formatExpiresIn(resolved.expiresAt),
                  ...urls,
                },
                null,
                2,
              ),
            },
          ],
        },
      });
    }

    if (name === "device_status") {
      if (!device) return mcpError(c, id, "missing device token");
      return c.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  device_id: device.id,
                  claimed: Boolean(device.account_id),
                  tier: c.get("rateTier"),
                  verify_url: `${base}/verify/${device.id}`,
                },
                null,
                2,
              ),
            },
          ],
        },
      });
    }

    if (name === "link_device") {
      if (!device) return mcpError(c, id, "missing device token");
      if (device.account_id) {
        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({ claimed: true, account_id: device.account_id }, null, 2),
              },
            ],
          },
        });
      }
      const code = linkCode();
      const exp = Date.now() + 15 * 60_000;
      await c.env.DB.prepare(
        "INSERT INTO link_requests (code, device_id, expires_at) VALUES (?, ?, ?)",
      )
        .bind(code, device.id, exp)
        .run();
      return c.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  link_code: code,
                  verify_url: `${base}/link/${code}`,
                  expires_in: 900,
                  hint: "Open verify_url in a browser and approve via Cloudflare Access",
                },
                null,
                2,
              ),
            },
          ],
        },
      });
    }

    return mcpError(c, id, `unknown tool: ${name}`);
  }

  if (body.method === "ping") {
    return c.json({ jsonrpc: "2.0", id, result: {} });
  }

  return c.json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
});

async function uploadBytes(
  env: { DB: D1Database; DATA: R2Bucket; TOKEN_PEPPER: string },
  config: Config,
  device: DeviceRecord & { token: string },
  args: Record<string, unknown>,
  contentB64: string,
) {
  let bytes: Uint8Array;
  try {
    const bin = atob(contentB64.replace(/\s/g, ""));
    bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  } catch {
    throw new Error("invalid_base64");
  }
  if (bytes.byteLength > MAX_BYTES) throw new Error("file_too_large");
  if (bytes.byteLength === 0) throw new Error("empty_file");

  const filename =
    String(args.filename ?? args.path ?? "upload.bin").split("/").pop() || "upload.bin";
  const mime = sanitizeMime(String(args.mime ?? "application/octet-stream"), filename);
  if (!mime) throw new Error("mime_not_allowed");

  const vis = normalizeVisibility(
    String(args.visibility ?? "public"),
    Boolean(device.account_id),
    config.accessEnabled,
  );
  if (!vis.ok) throw new Error(vis.error);

  const gate = await assertUploadAllowed(env.DB, device, bytes.byteLength, config.limits);
  if (!gate.ok) {
    const err = String(gate.body.error ?? "upload_denied");
    if (err === "rate_limit_exceeded") throw new Error(`rate_limit_exceeded:${gate.body.tier}`);
    if (err === "file_too_large") {
      throw new Error(`file_too_large:${gate.body.max_bytes}`);
    }
    if (err === "storage_quota_exceeded") {
      throw new Error(`storage_quota_exceeded:${gate.body.used_bytes}/${gate.body.max_bytes}`);
    }
    throw new Error(err);
  }

  let passwordHash: string | null = null;
  try {
    passwordHash = await optionalPasswordHash(
      args.password != null ? String(args.password) : null,
      env.TOKEN_PEPPER,
    );
  } catch {
    throw new Error("password_too_long");
  }

  const artId = newArtifactId();
  const shareToken = mintShareToken(vis.visibility);
  const r2Key = artifactR2Key(device.id, artId, filename);
  await env.DATA.put(r2Key, new Blob([bytes], { type: mime }), {
    httpMetadata: { contentType: mime },
  });

  const retentionDays = deviceRetentionDays(
    device,
    config.limits,
    args.expires ? String(args.expires) : null,
    args.retention_days as string | number | null | undefined,
  );
  const exp = expiresAt(retentionDays);
  const title = args.title ? String(args.title) : null;

  await insertArtifact(env.DB, {
    id: artId,
    deviceId: device.id,
    accountId: device.account_id,
    title,
    filename,
    mime,
    sizeBytes: bytes.byteLength,
    r2Key,
    visibility: vis.visibility,
    shareToken,
    expiresAt: exp,
    passwordHash,
  });

  await consumeRateLimit(env.DB, gate.rate.key);

  return toUploadResponse(
    config.publicBaseUrl,
    {
      id: artId,
      filename,
      visibility: vis.visibility,
      shareToken,
      expiresAt: exp,
      passwordHash,
      mime,
      sizeBytes: bytes.byteLength,
      accountId: device.account_id,
    },
    { tier: gate.rate.tier, uploadsRemaining: gate.rate.remaining - 1 },
  );
}

function mcpError(c: { json: (data: unknown, status?: number) => Response }, id: unknown, message: string) {
  return c.json({ jsonrpc: "2.0", id, error: { code: -32000, message } }, 400);
}
