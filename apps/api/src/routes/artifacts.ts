import { UPLOAD } from "../shared";
import { Hono } from "hono";
import { artifactUrls, sanitizeMime } from "../lib/device";
import { formatExpiresIn, resolvePatchExpires } from "../lib/expiry";
import { iso } from "../lib/ids";
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

export const artifactRoutes = new Hono<AppContext>();

artifactRoutes.post("/api/v1/artifacts", async (c) => {
  const device = c.get("device");
  if (!device) {
    return c.json({ error: "missing_device_token", hint: "POST /api/v1/device/init first" }, 401);
  }

  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return c.json({ error: "file_required" }, 400);
  }

  const gate = await assertUploadAllowed(c.env.DB, device, file.size, c.get("config").limits);
  if (!gate.ok) {
    const body = { ...gate.body };
    if (gate.status === 429) {
      const base = c.get("config").publicBaseUrl;
      body.verify_url = `${base}/verify/${device.id}`;
      body.message = "Open verify_url on another device to complete Turnstile.";
    }
    return c.json(body, gate.status);
  }

  if (file.size > UPLOAD.maxBytesDirectUpload) {
    return c.json(
      {
        error: "use_multipart",
        max_bytes_direct: UPLOAD.maxBytesDirectUpload,
        max_bytes: c.get("config").limits.maxFileBytes,
        hint: "POST /api/v1/artifacts/multipart then PUT parts (CLI does this automatically)",
      },
      413,
    );
  }

  const filename = (form.get("filename") as string) || file.name || "upload.bin";
  const mime = sanitizeMime(file.type, filename);
  if (!mime) {
    return c.json({ error: "mime_not_allowed" }, 415);
  }

  const vis = normalizeVisibility(
    form.get("visibility") as string | null,
    Boolean(device.account_id),
    c.get("config").accessEnabled,
  );
  if (!vis.ok) {
    return c.json({ error: vis.error, hint: vis.hint }, 403);
  }

  let passwordHash: string | null = null;
  try {
    passwordHash = await optionalPasswordHash(
      form.get("password") as string | null,
      c.env.TOKEN_PEPPER,
    );
  } catch {
    return c.json({ error: "password_too_long" }, 400);
  }

  const id = newArtifactId();
  const shareToken = mintShareToken(vis.visibility);
  const r2Key = artifactR2Key(device.id, id, filename);
  await c.env.DATA.put(r2Key, file.stream(), {
    httpMetadata: { contentType: mime },
  });

  const retentionDays = deviceRetentionDays(
    device,
    c.get("config").limits,
    form.get("expires") as string | null,
    form.get("retention_days") as string | null,
  );
  const exp = expiresAt(retentionDays);
  const title = (form.get("title") as string) || null;

  await insertArtifact(c.env.DB, {
    id,
    deviceId: device.id,
    accountId: device.account_id,
    title,
    filename,
    mime,
    sizeBytes: file.size,
    r2Key,
    visibility: vis.visibility,
    shareToken,
    expiresAt: exp,
    passwordHash,
  });

  await consumeRateLimit(c.env.DB, gate.rate.key);

  return c.json(
    toUploadResponse(
      c.get("config").publicBaseUrl,
      {
        id,
        filename,
        visibility: vis.visibility,
        shareToken,
        expiresAt: exp,
        passwordHash,
        mime,
        sizeBytes: file.size,
        accountId: device.account_id,
      },
      { tier: gate.rate.tier, uploadsRemaining: gate.rate.remaining - 1 },
    ),
  );
});

artifactRoutes.get("/api/v1/artifacts", async (c) => {
  const device = c.get("device");
  if (!device) return c.json({ error: "missing_device_token" }, 401);

  const rows = await c.env.DB.prepare(
    `SELECT id, title, filename, mime, size_bytes, visibility, share_token, expires_at, created_at
     FROM artifacts WHERE device_id = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 100`,
  )
    .bind(device.id, Date.now())
    .all();

  const base = c.get("config").publicBaseUrl;
  const artifacts = (rows.results ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const shareToken = r.share_token ? String(r.share_token) : null;
    const urls = artifactUrls(base, String(r.id), String(r.filename), { shareToken });
    return { ...r, ...urls, expires_at: iso(Number(r.expires_at)) };
  });

  return c.json({ artifacts });
});

artifactRoutes.delete("/api/v1/artifacts/:id", async (c) => {
  const device = c.get("device");
  const account = c.get("accessAccount");
  if (!device && !account) {
    return c.json({ error: "unauthorized", hint: "device token or Access login required" }, 401);
  }

  const id = c.req.param("id");
  const row = await c.env.DB.prepare(
    "SELECT r2_key, device_id, account_id FROM artifacts WHERE id = ?",
  )
    .bind(id)
    .first<{ r2_key: string; device_id: string; account_id: string | null }>();

  if (!row) return c.json({ error: "not_found" }, 404);

  const allowedByDevice = Boolean(device && row.device_id === device.id);
  const allowedByAccount = Boolean(account && row.account_id && row.account_id === account.id);
  if (!allowedByDevice && !allowedByAccount) {
    return c.json({ error: "not_found" }, 404);
  }

  await c.env.DATA.delete(row.r2_key);
  await c.env.DB.prepare("DELETE FROM artifacts WHERE id = ?").bind(id).run();
  return c.json({ ok: true, id });
});

type OwnedArtifact = {
  id: string;
  filename: string;
  visibility: string;
  share_token: string | null;
  device_id: string;
  account_id: string | null;
};

async function loadOwnedArtifact(
  c: {
    env: { DB: D1Database };
    get: (k: "device" | "accessAccount") =>
      | { id: string }
      | ({ id: string } & { token: string })
      | null;
  },
  id: string,
): Promise<
  | { ok: true; art: OwnedArtifact }
  | { ok: false; status: 401 | 404; body: Record<string, unknown> }
> {
  const device = c.get("device");
  const account = c.get("accessAccount");
  if (!device && !account) {
    return {
      ok: false,
      status: 401,
      body: { error: "unauthorized", hint: "device token or Access login required" },
    };
  }

  const art = await c.env.DB.prepare(
    "SELECT id, filename, visibility, share_token, device_id, account_id FROM artifacts WHERE id = ?",
  )
    .bind(id)
    .first<OwnedArtifact>();

  if (!art) return { ok: false, status: 404, body: { error: "not_found" } };

  const allowedByDevice = Boolean(device && art.device_id === device.id);
  const allowedByAccount = Boolean(account && art.account_id && art.account_id === account.id);
  if (!allowedByDevice && !allowedByAccount) {
    return { ok: false, status: 404, body: { error: "not_found" } };
  }
  return { ok: true, art };
}

function sharePayload(
  base: string,
  art: { id: string; filename: string; visibility: string; share_token: string | null },
) {
  const shareToken = art.visibility === "secret" ? art.share_token : null;
  const urls = artifactUrls(base, art.id, art.filename, { shareToken });
  return {
    ok: true,
    id: art.id,
    visibility: art.visibility,
    share_token: shareToken,
    ...urls,
  };
}

/** Mint a new secret share token; old ?s= links stop working. */
artifactRoutes.post("/api/v1/artifacts/:id/share/rotate", async (c) => {
  const loaded = await loadOwnedArtifact(c, c.req.param("id"));
  if (!loaded.ok) return c.json(loaded.body, loaded.status);

  const { art } = loaded;
  if (art.visibility !== "secret") {
    return c.json({ error: "not_secret", hint: "Only secret artifacts have share tokens to rotate" }, 400);
  }

  const shareToken = mintShareToken("secret");
  await c.env.DB.prepare("UPDATE artifacts SET share_token = ? WHERE id = ?")
    .bind(shareToken, art.id)
    .run();

  return c.json(
    sharePayload(c.get("config").publicBaseUrl, {
      ...art,
      share_token: shareToken,
    }),
  );
});

/** Clear secret link and demote to private (file kept). */
artifactRoutes.post("/api/v1/artifacts/:id/share/revoke", async (c) => {
  const loaded = await loadOwnedArtifact(c, c.req.param("id"));
  if (!loaded.ok) return c.json(loaded.body, loaded.status);

  const { art } = loaded;
  if (art.visibility === "private" && !art.share_token) {
    return c.json(sharePayload(c.get("config").publicBaseUrl, { ...art, visibility: "private", share_token: null }));
  }

  await c.env.DB.prepare(
    "UPDATE artifacts SET visibility = 'private', share_token = NULL WHERE id = ?",
  )
    .bind(art.id)
    .run();

  return c.json(
    sharePayload(c.get("config").publicBaseUrl, {
      ...art,
      visibility: "private",
      share_token: null,
    }),
  );
});

/** Extend, shorten, or immediately expire an owned artifact. */
artifactRoutes.patch("/api/v1/artifacts/:id", async (c) => {
  const loaded = await loadOwnedArtifact(c, c.req.param("id"));
  if (!loaded.ok) return c.json(loaded.body, loaded.status);

  const body = (await c.req.json().catch(() => null)) as { expires?: string } | null;
  const resolved = resolvePatchExpires(body?.expires, Date.now(), c.get("config").limits.maxRetentionDays);
  if (!resolved.ok) {
    return c.json(
      {
        error: resolved.error,
        hint: 'Pass expires as "24h", "7d", "30d", or "now"',
      },
      400,
    );
  }

  await c.env.DB.prepare("UPDATE artifacts SET expires_at = ? WHERE id = ?")
    .bind(resolved.expiresAt, loaded.art.id)
    .run();

  const shareToken =
    loaded.art.visibility === "secret" ? loaded.art.share_token : null;
  const urls = artifactUrls(
    c.get("config").publicBaseUrl,
    loaded.art.id,
    loaded.art.filename,
    { shareToken },
  );
  return c.json({
    ok: true,
    id: loaded.art.id,
    expires_at: iso(resolved.expiresAt),
    expires_in: formatExpiresIn(resolved.expiresAt),
    ...urls,
  });
});
